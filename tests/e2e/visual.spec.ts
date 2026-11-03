import { expect, type Page, test } from '@playwright/test';

const STORY = '/stories/ant-colony-optimization';

/**
 * ACO visual baselines for Step 3.7 / FR-QA-04.
 *
 * Time freeze
 * -----------
 * Every ACO baseline uses the same deterministic recipe:
 *
 * 1. `?lenis=off` removes smooth-scroll interpolation, and the test context
 *    requests `prefers-reduced-motion: reduce`. Under reduced motion the story
 *    starts paused, disables Lenis, ignores scroll progress for scene
 *    composition, and settles each chapter on its final discrete keyframe.
 * 2. The test scrolls to an explicit chapter (or the lab panel) and waits for
 *    the controller to report that chapter active.
 * 3. Simulation state is advanced with
 *    `window.__storyRuntimeDebug.advanceFixedSteps(n)`. That acceptance-only
 *    hook pauses the reader clock and runs exactly `n` fixed 1/60 s steps on
 *    the seeded engine, then repaints and samples once. It is documented in
 *    `story-runtime-debug.ts`; it is not part of the reader UI and exposes no
 *    engine internals.
 * 4. `document.fonts.ready` is awaited, the network is idle, and Playwright's
 *    `animations: 'disabled'` assertion option freezes CSS animation and
 *    transitions. No wall-clock time, network font, or real-time rAF drives
 *    the captured pixels.
 *
 * The same number of fixed steps always yields the same seeded state, so the
 * emergence baseline is the documented seed-42 run after 50 iterations
 * (best length 4.907).
 */

async function waitForRuntime(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    return (
      controller?.dataset.storyController === 'ready' &&
      controller.dataset.motion === 'reduced' &&
      controller.dataset.paused === 'true' &&
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0
    );
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

async function scrollToTop(page: Page, selector: string, offset = 96): Promise<void> {
  const target = await page.evaluate(
    ({ selector: query, offset: delta }) => {
      const element = document.querySelector<HTMLElement>(query);
      if (!element) throw new Error(`Missing ${query}`);
      const top = Math.max(
        0,
        Math.min(
          element.getBoundingClientRect().top + window.scrollY - delta,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      );
      const html = document.documentElement;
      const previous = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, top);
      html.style.scrollBehavior = previous;
      return top;
    },
    { selector, offset },
  );
  await page.waitForFunction((top) => Math.abs(window.scrollY - top) <= 2, target);
}

async function scrollToChapter(page: Page, id: string, offset = 96): Promise<void> {
  await scrollToTop(page, `#${id}`, offset);
  await page.waitForFunction(
    (chapterId) =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
      chapterId,
    id,
  );
}

/** Pause the clock, run an exact number of fixed steps, and wait for layout. */
async function advanceFixedSteps(page: Page, steps: number): Promise<void> {
  await page.evaluate((count) => {
    const runtime = window.__storyRuntimeDebug;
    if (!runtime) throw new Error('Missing story runtime debug hook');
    runtime.advanceFixedSteps(count);
  }, steps);
  await page.waitForFunction((expected) => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    return (
      Number(controller?.dataset.simSteps ?? '0') === expected &&
      controller?.dataset.paused === 'true'
    );
  }, steps);
  // Let Svelte flush the metric rows and the SVG chart path, then settle two
  // frames so the canvas has painted the frozen snapshot.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  // Two frames let Svelte flush; the short wall-clock settle covers a busy
  // worker where the canvas paint lands just after the RAF pair.
  await page.waitForTimeout(150);
}

/** Wait until chapter entry events have stopped (fonts and sticky layout settle). */
async function waitForEntrySettle(page: Page): Promise<number> {
  let previous = -1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const count = await page.evaluate(() =>
      Number(
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.entryCount ?? '0',
      ),
    );
    if (count === previous) return count;
    previous = count;
    await page.waitForTimeout(150);
  }
  throw new Error('Chapter entry events did not settle');
}

test('home page matches the visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});

test.describe('ACO story visual baselines', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  test('guided five-city opening at a fixed keyframe', async ({ page }) => {
    await page.goto(`${STORY}?seed=42&lenis=off`);
    await waitForRuntime(page);
    await scrollToChapter(page, 'the-problem');

    await expect(page.locator('[data-story-controller]')).toHaveAttribute(
      'data-active-scene',
      'five-cities',
    );
    await expect(page.locator('[data-lesson-overlay]')).toBeVisible();
    await expect(page).toHaveScreenshot('aco-five-cities-1440.png');
  });

  test('tuning on the thirty-city map after 50 frozen iterations', async ({ page }) => {
    await page.goto(`${STORY}?seed=42&lenis=off`);
    await waitForRuntime(page);
    await scrollToChapter(page, 'tuning-the-colony');
    await advanceFixedSteps(page, 3_000);

    await expect(page.locator('[data-story-controller]')).toHaveAttribute(
      'data-active-scene',
      'tuning',
    );
    await expect(page.locator('[data-metric="iteration"]')).toHaveText('50');
    await expect(page.locator('[data-metric="best-length"]')).toHaveText('4.907');
    await expect(page).toHaveScreenshot('aco-tuning-1440.png');
  });

  test('lab with frozen metrics, chart, and controls', async ({ page }) => {
    await page.goto(`${STORY}?seed=42&lenis=off#the-lab`);
    await waitForRuntime(page);

    // The browser applies the deep-link hash before the sticky stage has
    // settled, so the initial scroll can land in the previous chapter and the
    // lab panel is never mounted. Drive the chapter activation explicitly;
    // this is the same path a reader takes by scrolling or using the rail.
    await scrollToChapter(page, 'the-lab');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.labActive ===
        'true',
    );

    // The lab panel sits after the last chapter. Scrolling to it can settle the
    // final chapter trigger twice while the sticky stage changes the document
    // height, so freeze only after chapter entry has stopped; otherwise a late
    // chapter reset would erase the advanced run.
    await scrollToTop(page, '[data-aco-lab]', 96);
    await waitForEntrySettle(page);
    await advanceFixedSteps(page, 3_000);

    await expect(page.locator('[data-aco-lab]')).toBeVisible();
    await expect(page.locator('[data-metric="iteration"]')).toHaveText('50');
    await expect(page.locator('[data-metric="best-length"]')).toHaveText('4.907');
    await expect(page.getByTestId('aco-lab-convergence')).toBeVisible();
    await expect(page).toHaveScreenshot('aco-lab-1440.png');
  });
});

test.describe('ACO mobile visual baseline', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });

  test('the frozen lab stage at 390 px', async ({ page }) => {
    await page.goto(`${STORY}?seed=42&lenis=off#the-lab`);
    await waitForRuntime(page);

    // The lab is the one mobile chapter whose stage stays pinned, so its stage
    // is a stable element screenshot instead of a page-coordinate clip.
    await scrollToChapter(page, 'the-lab');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.labActive ===
        'true',
    );
    await scrollToTop(page, '[data-aco-lab]', 96);
    await waitForEntrySettle(page);
    await advanceFixedSteps(page, 3_000);

    await expect(page.locator('[data-metric="iteration"]')).toHaveText('50');
    await expect(page.locator('[data-metric="best-length"]')).toHaveText('4.907');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('[data-story-stage]')).toHaveScreenshot('aco-lab-390.png');
  });
});
