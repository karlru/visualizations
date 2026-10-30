import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const HARNESS = '/dev/story-smoke';

interface ControllerSnapshot {
  readonly ready: boolean;
  readonly enhanced: boolean;
  readonly articleMode: boolean;
  readonly motion: string;
  readonly systemReduced: boolean;
  readonly manualReduced: boolean;
  readonly persisted: string;
  readonly paused: boolean;
  readonly simTime: number;
  readonly frames: number;
  readonly reveal: number;
  readonly zoom: number;
  readonly step: number;
  readonly stepCount: number;
  readonly stageCount: number;
  readonly canvasCount: number;
  readonly controlsCount: number;
  readonly metricsCount: number;
  readonly lenis: string | null;
  readonly lenisReason: string | null;
  readonly lenisClass: boolean;
  readonly reducedMotionRoot: string | null;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function waitForStage(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    return (
      controller?.dataset.storyController === 'ready' &&
      controller.dataset.storyEnhanced === 'true' &&
      stage?.dataset.stageStatus === 'ready'
    );
  });
}

async function waitForEnhancedArticle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    return (
      controller?.dataset.storyController === 'ready' && controller.dataset.storyEnhanced === 'true'
    );
  });
}

async function readController(page: Page): Promise<ControllerSnapshot> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    if (!controller) throw new Error('Missing story controller');
    const root = document.documentElement;
    return {
      ready: controller.dataset.storyController === 'ready',
      enhanced: controller.dataset.storyEnhanced === 'true',
      articleMode: controller.dataset.articleMode === 'true',
      motion: controller.dataset.motion ?? '',
      systemReduced: controller.dataset.systemReducedMotion === 'true',
      manualReduced: controller.dataset.manualReducedMotion === 'true',
      persisted: controller.dataset.persistence ?? '',
      paused: controller.dataset.paused === 'true',
      simTime: Number(controller.dataset.simTime ?? 'NaN'),
      frames: Number(stage?.dataset.frames ?? '0'),
      reveal: Number(controller.dataset.sceneReveal ?? 'NaN'),
      zoom: Number(controller.dataset.sceneZoom ?? 'NaN'),
      step: Number(controller.dataset.sceneStep ?? 'NaN'),
      stepCount: Number(controller.dataset.sceneStepCount ?? 'NaN'),
      stageCount: document.querySelectorAll('[data-story-stage]').length,
      canvasCount: document.querySelectorAll('canvas[data-stage-canvas]').length,
      controlsCount: document.querySelectorAll('[data-controls-panel]').length,
      metricsCount: document.querySelectorAll('[data-metrics]').length,
      lenis: root.dataset.lenis ?? null,
      lenisReason: root.dataset.lenisReason ?? null,
      lenisClass: root.classList.contains('lenis'),
      reducedMotionRoot: root.dataset.reducedMotion ?? null,
    };
  });
}

async function scrollToChapter(page: Page, id: string): Promise<void> {
  const target = await page.evaluate((chapterId) => {
    const element = document.getElementById(chapterId);
    if (!element) throw new Error(`Missing chapter ${chapterId}`);
    const top = element.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + 40;
    const clamped = Math.max(0, top);
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

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('starts paused, does not scrub, keeps motion reduced, and disables Lenis', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    // Let hydration-time effects (font measurement, one presentation repaint)
    // settle before measuring the frame counter.
    await page.waitForTimeout(350);
    const initial = await readController(page);
    expect(initial.motion).toBe('reduced');
    expect(initial.systemReduced).toBe(true);
    expect(initial.paused).toBe(true);
    expect(initial.lenis).toBe('off');
    expect(initial.lenisReason).toBe('reduced-motion');
    expect(initial.lenisClass).toBe(false);
    expect(initial.reducedMotionRoot).toBe('true');
    expect(initial.stageCount).toBe(1);

    const toggle = page.getByTestId('motion-toggle');
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();
    await expect(page.locator('[data-motion-note]')).toBeVisible();
    await expect(page.locator('[data-motion-note]')).toContainText('can only reduce motion');

    // No autoplay: neither the clock nor the render frame counter advances.
    await page.waitForTimeout(500);
    const settled = await readController(page);
    expect(settled.simTime).toBeCloseTo(initial.simTime, 3);
    expect(settled.frames).toBe(initial.frames);

    // Scrolling inside the active chapter updates the rail but never scrubs the
    // camera or reveal.
    await page.evaluate(() => window.scrollBy(0, 220));
    await page.waitForTimeout(250);
    const afterScroll = await readController(page);
    expect(afterScroll.reveal).toBeCloseTo(initial.reveal, 3);
    expect(afterScroll.zoom).toBeCloseTo(initial.zoom, 3);
    expect(afterScroll.step).toBe(initial.step);

    // The manual control is locked and cannot re-enable motion.
    await toggle.dispatchEvent('click');
    const afterForcedClick = await readController(page);
    expect(afterForcedClick.motion).toBe('reduced');
    expect(afterForcedClick.manualReduced).toBe(false);
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();

    // Chapter changes settle on the final keyframe immediately: no scrubbing.
    await scrollToChapter(page, 'a-closer-look');
    const closer = await readController(page);
    expect(closer.step).toBe(closer.stepCount - 1);
    expect(closer.stepCount).toBe(2);
    expect(closer.reveal).toBeCloseTo(0.75, 3);
    expect(closer.paused).toBe(true);

    expect(errors).toEqual([]);
  });

  test('scene step controls advance and reverse the keyframes', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    const controller = page.locator('[data-story-controller]');
    const initial = await readController(page);
    expect(initial.step).toBe(2);
    expect(initial.stepCount).toBe(3);
    const finalReveal = initial.reveal;

    await page.getByTestId('stage-step-back').click();
    await expect(controller).toHaveAttribute('data-scene-step', '1');
    const oneBack = await readController(page);
    expect(oneBack.paused).toBe(true);
    expect(oneBack.reveal).toBeLessThan(finalReveal);

    await page.getByTestId('stage-step-back').click();
    await expect(controller).toHaveAttribute('data-scene-step', '0');
    const twoBack = await readController(page);
    expect(twoBack.reveal).toBeLessThan(oneBack.reveal);
    await expect(page.getByTestId('stage-step-back')).toBeDisabled();

    await page.getByTestId('stage-step-forward').click();
    await expect(controller).toHaveAttribute('data-scene-step', '1');
    const forward = await readController(page);
    expect(forward.reveal).toBeGreaterThan(twoBack.reveal);
    expect(forward.reveal).toBeCloseTo(oneBack.reveal, 3);

    expect(errors).toEqual([]);
  });

  test('has no serious or critical axe violations', async ({ page }) => {
    await page.goto(HARNESS);
    await waitForStage(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    expect(results.passes.length).toBeGreaterThan(0);
  });
});

test.describe('manual motion preference', () => {
  test('reduces motion, pauses at once, persists, and can be released', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    const controller = page.locator('[data-story-controller]');
    await expect(controller).toHaveAttribute('data-motion', 'full');
    await expect(controller).toHaveAttribute('data-paused', 'false');

    const toggle = page.getByTestId('motion-toggle');
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeEnabled();
    await toggle.click();

    await expect(controller).toHaveAttribute('data-motion', 'reduced');
    await expect(controller).toHaveAttribute('data-paused', 'true');
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.dataset.reducedMotion)).toBe('true');
    expect(await page.evaluate(() => document.documentElement.dataset.lenisReason)).toBe(
      'reduced-motion',
    );

    const reducedStart = await readController(page);
    await page.waitForTimeout(350);
    expect((await readController(page)).simTime).toBeCloseTo(reducedStart.simTime, 3);

    await page.reload();
    await waitForStage(page);
    const restored = await readController(page);
    expect(restored.manualReduced).toBe(true);
    expect(restored.motion).toBe('reduced');
    expect(restored.paused).toBe(true);
    await expect(page.getByTestId('motion-toggle')).toBeChecked();

    // Releasing the manual preference restores full motion but never autoplays
    // behind the reader's back.
    await page.getByTestId('motion-toggle').click();
    await expect(controller).toHaveAttribute('data-motion', 'full');
    await expect(controller).toHaveAttribute('data-paused', 'true');
    expect(await page.evaluate(() => document.documentElement.dataset.lenis)).toBe('on');

    expect(errors).toEqual([]);
  });
});

test.describe('runtime motion changes', () => {
  test('reacts to the OS preference changing without re-enabling motion later', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    const controller = page.locator('[data-story-controller]');
    await expect(controller).toHaveAttribute('data-motion', 'full');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(controller).toHaveAttribute('data-motion', 'reduced');
    await expect(controller).toHaveAttribute('data-system-reduced-motion', 'true');
    await expect(controller).toHaveAttribute('data-paused', 'true');
    await expect(page.getByTestId('motion-toggle')).toBeChecked();
    await expect(page.getByTestId('motion-toggle')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.dataset.lenis)).toBe('off');
    expect(await page.evaluate(() => document.documentElement.dataset.lenisReason)).toBe(
      'reduced-motion',
    );

    // Releasing the OS preference restores full motion but keeps the reader's
    // pause: nothing autoplays when the constraint disappears.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(controller).toHaveAttribute('data-motion', 'full');
    await expect(controller).toHaveAttribute('data-paused', 'true');
    await expect(page.getByTestId('motion-toggle')).toBeEnabled();
    await expect(page.getByTestId('motion-toggle')).not.toBeChecked();

    expect(errors).toEqual([]);
  });
});

test.describe('article mode', () => {
  test('removes the stage, keeps every chapter readable, persists, and restores', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    const toggle = page.getByTestId('article-mode-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();

    await waitForEnhancedArticle(page);
    const controller = page.locator('[data-story-controller]');
    await expect(controller).toHaveAttribute('data-article-mode', 'true');

    const article = await readController(page);
    expect(article.stageCount).toBe(0);
    expect(article.canvasCount).toBe(0);
    expect(article.controlsCount).toBe(0);
    expect(article.metricsCount).toBe(0);

    // Every chapter heading and its prose is visible.
    const chapters = page.locator('[data-story-chapter]');
    await expect(chapters).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(chapters.nth(index)).toBeVisible();
      await expect(chapters.nth(index).locator('.story-chapter__title')).toBeVisible();
      await expect(chapters.nth(index).locator('.story-chapter__prose p').first()).toBeVisible();
    }
    await expect(page.getByTestId('story-formula')).toBeVisible();
    await expect(page.getByTestId('story-figure')).toBeVisible();
    await expect(page.getByTestId('story-citation')).toBeVisible();

    // The stage is not merely hidden: it is gone from the DOM and tab order.
    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await toggle.focus();
    await page.keyboard.press('Tab');
    const focusedAfterTab = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        tag: active?.tagName ?? null,
        inStage: active?.closest('[data-story-stage]') !== null,
        href: active instanceof HTMLAnchorElement ? active.getAttribute('href') : null,
      };
    });
    expect(focusedAfterTab.inStage).toBe(false);

    // The choice survives a reload; the article layout is the only layout then.
    await page.reload();
    await waitForEnhancedArticle(page);
    const reloaded = await readController(page);
    expect(reloaded.articleMode).toBe(true);
    expect(reloaded.stageCount).toBe(0);
    await expect(page.getByTestId('article-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Restoring the stage rehydrates exactly one canvas and keeps the prose.
    await page.getByTestId('article-mode-toggle').click();
    await waitForStage(page);
    const restored = await readController(page);
    expect(restored.articleMode).toBe(false);
    expect(restored.stageCount).toBe(1);
    expect(restored.canvasCount).toBe(1);
    await expect(chapters).toHaveCount(4);
    await expect(chapters.nth(2)).toBeVisible();

    // The stage choice persists too.
    await page.reload();
    await waitForStage(page);
    expect((await readController(page)).articleMode).toBe(false);

    expect(errors).toEqual([]);
  });

  test('storage failures do not break rendering or the toggle', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('storage disabled for test');
        },
      });
    });

    await page.goto(HARNESS);
    await waitForStage(page);

    const controller = page.locator('[data-story-controller]');
    await expect(controller).toHaveAttribute('data-persistence', 'unavailable');
    await expect(page.locator('[data-story-stage]')).toHaveCount(1);

    await page.getByTestId('article-mode-toggle').click();
    await waitForEnhancedArticle(page);
    await expect(controller).toHaveAttribute('data-article-mode', 'true');
    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await expect(page.locator('[data-story-chapter]').first()).toBeVisible();

    // Without storage the preference is simply not remembered.
    await page.reload();
    await waitForStage(page);
    await expect(controller).toHaveAttribute('data-article-mode', 'false');
    expect(errors).toEqual([]);
  });

  test('article mode has no serious or critical axe violations', async ({ page }) => {
    await page.goto(HARNESS);
    await waitForStage(page);
    await page.getByTestId('article-mode-toggle').click();
    await waitForEnhancedArticle(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    expect(results.passes.length).toBeGreaterThan(0);
  });
});
