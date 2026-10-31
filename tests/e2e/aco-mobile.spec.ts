import { expect, type Page, test } from '@playwright/test';

/**
 * Focused mobile gate for Step 3.7 / FR-ACO-18 and FR-QA-02.
 *
 * This file runs only in the `mobile` Playwright project (Pixel 7, Chromium),
 * which also executes `aco-story.spec.ts`, `aco-lab.spec.ts`, and
 * `a11y.spec.ts`. It adds the cross-cutting mobile assertions those desktop
 * specs do not own: the viewport itself, the sticky stage and chrome, touch
 * chapter navigation and playback, the lab surface, and overflow.
 *
 * City dragging on a coarse pointer is covered by the dedicated block in
 * `aco-lab.spec.ts`, which runs in this project as well; it is not duplicated
 * here.
 */

const STORY = '/stories/ant-colony-optimization';
const LAB = `${STORY}?lenis=off#the-lab`;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function waitForRuntime(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    return (
      controller?.dataset.storyController === 'ready' &&
      controller.dataset.activeChapter !== undefined &&
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0 &&
      window.__storyRuntimeDebug?.debugState().ready === true
    );
  });
}

async function waitForLab(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    return (
      controller?.dataset.activeChapter === 'the-lab' &&
      controller.dataset.labActive === 'true' &&
      Number(controller.dataset.mapCities) >= 2
    );
  });
}

async function scrollToChapter(page: Page, id: string): Promise<void> {
  const target = await page.evaluate((chapterId) => {
    const element = document.getElementById(chapterId);
    if (!element) throw new Error(`Missing chapter ${chapterId}`);
    const top = element.getBoundingClientRect().top + window.scrollY - 96;
    const clamped = Math.max(
      0,
      Math.min(top, document.documentElement.scrollHeight - window.innerHeight),
    );
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, clamped);
    html.style.scrollBehavior = previous;
    return clamped;
  }, id);

  await page.waitForFunction((top) => Math.abs(window.scrollY - top) <= 2, target);
  await page.waitForFunction(
    (chapterId) =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
      chapterId,
    id,
  );
}

async function overflow(page: Page): Promise<{ document: number; body: number }> {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

test.describe('ACO on the mobile project', () => {
  test('keeps the stage, chrome, rail, and ten chapters inside the viewport', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY}?lenis=off`);
    await waitForRuntime(page);

    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('Missing mobile viewport');
    // Pixel 7 is 412 × 915 CSS pixels in Playwright; guard the range rather
    // than a single number so a device update does not silently change scope.
    expect(viewport.width).toBeGreaterThanOrEqual(390);
    expect(viewport.width).toBeLessThanOrEqual(430);

    expect(await overflow(page)).toEqual({ document: 0, body: 0 });
    await expect(page.locator('[data-story-stage]')).toBeVisible();
    await expect(page.locator('canvas[data-stage-canvas]')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Chapters' }).getByRole('link')).toHaveCount(
      10,
    );
    await expect(page.locator('[data-story-chapter]')).toHaveCount(10);

    // Scroll just the stage into view. On the narrative chapters the one-column
    // layout deliberately leaves the stage in normal flow so the pseudocode
    // panel is reachable; only the lab pins it.
    await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      if (!stage) throw new Error('Missing stage');
      const html = document.documentElement;
      const previous = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, stage.getBoundingClientRect().top + window.scrollY - 8);
      html.style.scrollBehavior = previous;
    });
    await page.waitForTimeout(150);

    const stage = await page.locator('[data-story-stage]').boundingBox();
    if (stage === null) throw new Error('Missing stage box');
    expect(stage.x).toBeGreaterThanOrEqual(0);
    expect(stage.x + stage.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(stage.y).toBeGreaterThanOrEqual(0);
    expect(stage.y).toBeLessThan(viewport.height);
    // The mobile layout caps the stage at 55dvh so prose remains visible.
    expect(stage.height).toBeLessThanOrEqual(viewport.height * 0.62);
    expect(stage.height).toBeGreaterThan(180);
    await expect(page.getByTestId('stage-play-pause')).toBeVisible();
    await expect(page.getByTestId('stage-replay')).toBeVisible();
    await expect(page.getByTestId('stage-speed')).toBeVisible();
    await expect(page.getByTestId('article-mode-toggle')).toBeVisible();

    // Scrolling into the story keeps one stage and never widens the page.
    await scrollToChapter(page, 'emergence');
    expect(await overflow(page)).toEqual({ document: 0, body: 0 });
    await expect(page.locator('[data-story-stage]')).toHaveCount(1);
    await expect(page.locator('canvas[data-stage-canvas]')).toHaveCount(1);
    await expect(page.locator('[data-story-controller]')).toHaveAttribute(
      'data-active-chapter',
      'emergence',
    );

    expect(errors).toEqual([]);
  });

  test('navigates with a tap and toggles playback from the stage chrome', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY}?lenis=off`);
    await waitForRuntime(page);

    const rail = page.getByRole('navigation', { name: 'Chapters' });
    await rail.getByRole('link', { name: /Emergence/ }).tap();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
        'emergence',
    );
    await expect(page.locator('[data-story-controller]')).toHaveAttribute(
      'data-active-scene',
      'emergence',
    );

    const playPause = page.getByTestId('stage-play-pause');
    await playPause.tap();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
    );
    await expect(playPause).toHaveAttribute('aria-label', 'Play simulation');

    await playPause.tap();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'false',
    );
    await page.waitForFunction(
      () =>
        Number(document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simTime) > 0,
    );
    await expect(playPause).toHaveAttribute('aria-label', 'Pause simulation');

    expect(await overflow(page)).toEqual({ document: 0, body: 0 });
    expect(errors).toEqual([]);
  });

  test('reaches the lab controls and its chart without horizontal overflow', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForRuntime(page);
    await waitForLab(page);

    await expect(page.locator('[data-aco-lab]')).toBeVisible();
    await expect(page.getByTestId('aco-lab-play')).toBeVisible();
    await expect(page.getByTestId('aco-map-add')).toBeVisible();
    await expect(page.getByTestId('aco-camera-overview')).toBeVisible();
    await expect(page.getByTestId('aco-lab-convergence')).toBeVisible();
    await expect(page.getByTestId('aco-lab-probability-fan')).toBeVisible();

    await page.locator('[data-aco-lab]').scrollIntoViewIfNeeded();
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('Missing mobile viewport');
    const lab = await page.locator('[data-aco-lab]').boundingBox();
    if (lab === null) throw new Error('Missing lab box');
    expect(lab.x).toBeGreaterThanOrEqual(0);
    expect(lab.x + lab.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await overflow(page)).toEqual({ document: 0, body: 0 });

    expect(errors).toEqual([]);
  });
});
