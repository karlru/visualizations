import { expect, type Page, test } from '@playwright/test';

/**
 * Cross-cutting ACO acceptance tests for Step 3.7.
 *
 * The chapter/navigation matrix, play/pause/replay, speed, presets, city
 * editing, lab controls, share, article mode, math/pseudocode, responsive
 * widths, performance, the edge cases (2 cities, 1 ant, α = 0, β = 0, ρ = 1),
 * and the no-JS article already live in `aco-story.spec.ts`, `aco-lab.spec.ts`,
 * `aco-renderer.spec.ts`, `aco-responsive.spec.ts`, `aco-performance.spec.ts`,
 * and the no-JS block of `aco-story.spec.ts`. This file adds only the
 * cross-cutting cases those suites do not own: reduced motion and lifecycle on
 * the real ACO route.
 */

const STORY = '/stories/ant-colony-optimization';

interface RuntimeSnapshot {
  readonly chapter: string | null;
  readonly scene: string | null;
  readonly paused: boolean;
  readonly motion: string | null;
  readonly systemReduced: boolean;
  readonly simTime: number;
  readonly simSteps: number;
  readonly frames: number;
  readonly reveal: number;
  readonly step: number;
  readonly stepCount: number;
  readonly stageCount: number;
  readonly canvasCount: number;
  readonly lenis: string | null;
  readonly lenisReason: string | null;
  readonly rootReduced: string | null;
  readonly stageMounts: number;
  readonly stageLive: number;
  readonly runtimeMounts: number;
  readonly triggerCount: number;
}

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
      window.__storyRuntimeDebug?.debugState().ready === true &&
      window.__scrollDirector?.debugState().triggerCount === 13
    );
  });
}

/**
 * Reduced motion starts paused, but mount-time layout, font, and intersection
 * events can still schedule one presentation-only repaint. Wait for the frame
 * counter to settle before treating it as the "no autoplay" baseline; the
 * assertions afterwards still prove it does not advance on its own.
 */
async function waitForStableFrames(page: Page): Promise<number> {
  let previous = -1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const frames = await page.evaluate(() =>
      Number(document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.frames ?? '0'),
    );
    if (frames === previous) return frames;
    previous = frames;
    await page.waitForTimeout(150);
  }
  throw new Error('Stage frame counter did not settle');
}

async function readRuntime(page: Page): Promise<RuntimeSnapshot> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const debug = window.__storyRuntimeDebug?.debugState();
    const director = window.__scrollDirector?.debugState();
    if (!controller || !stage) throw new Error('Missing story runtime');
    const stageWindow = window as Window & { __storyStageMounts?: number };
    return {
      chapter: controller.dataset.activeChapter ?? null,
      scene: controller.dataset.activeScene ?? null,
      paused: controller.dataset.paused === 'true',
      motion: controller.dataset.motion ?? null,
      systemReduced: controller.dataset.systemReducedMotion === 'true',
      simTime: Number(controller.dataset.simTime ?? 'NaN'),
      simSteps: Number(controller.dataset.simSteps ?? 'NaN'),
      frames: Number(stage.dataset.frames ?? '0'),
      reveal: Number(controller.dataset.sceneReveal ?? 'NaN'),
      step: Number(controller.dataset.sceneStep ?? 'NaN'),
      stepCount: Number(controller.dataset.sceneStepCount ?? 'NaN'),
      stageCount: document.querySelectorAll('[data-story-stage]').length,
      canvasCount: document.querySelectorAll('canvas[data-stage-canvas]').length,
      lenis: document.documentElement.dataset.lenis ?? null,
      lenisReason: document.documentElement.dataset.lenisReason ?? null,
      rootReduced: document.documentElement.dataset.reducedMotion ?? null,
      stageMounts: stageWindow.__storyStageMounts ?? 0,
      stageLive: debug?.stageLive ?? 0,
      runtimeMounts: debug?.mounts ?? 0,
      triggerCount: director?.triggerCount ?? 0,
    };
  });
}

async function scrollToChapter(page: Page, id: string): Promise<void> {
  await page.evaluate((chapterId) => {
    const element = document.getElementById(chapterId);
    if (!element) throw new Error(`Missing chapter ${chapterId}`);
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    html.style.scrollBehavior = previous;
  }, id);

  await page.waitForFunction(
    (chapterId) =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
      chapterId,
    id,
  );
}

test.describe('ACO reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('starts paused, never scrubs or autoplays, and still steps keyframes', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY}?lenis=off`);
    await waitForRuntime(page);
    await waitForStableFrames(page);

    const initial = await readRuntime(page);
    expect(initial.motion).toBe('reduced');
    expect(initial.systemReduced).toBe(true);
    expect(initial.paused).toBe(true);
    expect(initial.lenis).toBe('off');
    // `?lenis=off` is the explicit test switch and wins the reason label; the
    // reduced-motion policy still independently disables Lenis and CSS smoothing.
    expect(initial.lenisReason).toBe('test-mode');
    expect(initial.rootReduced).toBe('true');
    expect(initial.stageCount).toBe(1);
    expect(initial.canvasCount).toBe(1);
    expect(initial.chapter).toBe('the-problem');
    // Entry settles on the chapter's final discrete keyframe.
    expect(initial.step).toBe(initial.stepCount - 1);

    // No autoplay and no stage animation: both the clock and the render frame
    // counter stay put while the page is left alone.
    await page.waitForTimeout(500);
    const settled = await readRuntime(page);
    expect(settled.simTime).toBeCloseTo(initial.simTime, 3);
    expect(settled.simSteps).toBe(initial.simSteps);
    expect(settled.frames).toBe(initial.frames);

    // Scrolling inside the active chapter updates the rail but never scrubs the
    // camera, reveal, keyframe, clock, or canvas.
    await page.evaluate(() => window.scrollBy(0, 220));
    await page.waitForTimeout(250);
    const afterScroll = await readRuntime(page);
    expect(afterScroll.chapter).toBe(initial.chapter);
    expect(afterScroll.reveal).toBeCloseTo(initial.reveal, 3);
    expect(afterScroll.step).toBe(initial.step);
    expect(afterScroll.simTime).toBeCloseTo(initial.simTime, 3);
    expect(afterScroll.frames).toBe(initial.frames);

    // The discrete keyframe controls work, pause the clock, and reverse.
    const finalStep = initial.step;
    await page.getByTestId('stage-step-back').click();
    await page.waitForFunction(
      (step) =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.sceneStep ===
        String(step),
      finalStep - 1,
    );
    const oneBack = await readRuntime(page);
    expect(oneBack.paused).toBe(true);
    expect(oneBack.step).toBe(finalStep - 1);
    expect(oneBack.reveal).toBeLessThan(initial.reveal);
    expect(oneBack.simTime).toBeCloseTo(initial.simTime, 3);

    await page.getByTestId('stage-step-forward').click();
    await page.waitForFunction(
      (step) =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.sceneStep ===
        String(step),
      finalStep,
    );
    const forward = await readRuntime(page);
    expect(forward.step).toBe(finalStep);
    expect(forward.reveal).toBeCloseTo(initial.reveal, 3);

    // Chapter changes settle on their final keyframe without scrolling the
    // scene; the run restarts at step 0 and stays paused.
    await scrollToChapter(page, 'emergence');
    const emergence = await readRuntime(page);
    expect(emergence.chapter).toBe('emergence');
    expect(emergence.scene).toBe('colony');
    expect(emergence.paused).toBe(true);
    expect(emergence.step).toBe(emergence.stepCount - 1);
    expect(emergence.simSteps).toBe(0);
    expect(emergence.simTime).toBe(0);

    // Replay remains paused under reduced motion.
    await page.getByTestId('stage-replay').click();
    const replayed = await readRuntime(page);
    expect(replayed.paused).toBe(true);
    expect(replayed.simSteps).toBe(0);

    // Article mode still carries the whole explanation and removes the stage.
    await page.getByTestId('article-mode-toggle').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
        'true',
    );
    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('[data-story-chapter]')).toHaveCount(13);
    await expect(page.locator('.katex-display')).toHaveCount(3);
    await expect(page.locator('figure[data-figure="aco-best-tour"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'References and further reading' }),
    ).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('ACO route lifecycle', () => {
  test('article/stage toggles and leaving/returning leave one live stage and one trigger set', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY}?lenis=off`);
    await waitForRuntime(page);

    const initial = await readRuntime(page);
    expect(initial.stageCount).toBe(1);
    expect(initial.canvasCount).toBe(1);
    expect(initial.triggerCount).toBe(13);
    expect(initial.stageMounts).toBe(1);
    expect(initial.stageLive).toBe(1);
    expect(initial.runtimeMounts).toBe(1);

    // In-page article mode removes the stage without rebuilding the runtime or
    // its chapter triggers.
    await page.getByTestId('article-mode-toggle').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
        'true',
    );
    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    const article = await page.evaluate(() => ({
      stages: document.querySelectorAll('[data-story-stage]').length,
      canvases: document.querySelectorAll('canvas[data-stage-canvas]').length,
      triggers: window.__scrollDirector?.debugState().triggerCount,
      mounts: window.__storyRuntimeDebug?.debugState().mounts,
      chapters: document.querySelectorAll('[data-story-chapter]').length,
    }));
    expect(article.stages).toBe(0);
    expect(article.canvases).toBe(0);
    expect(article.triggers).toBe(13);
    expect(article.mounts).toBe(1);
    expect(article.chapters).toBe(13);

    // Returning to the stage remounts exactly one canvas; the chapter trigger
    // set is still one per chapter, not duplicated.
    await page.getByTestId('article-mode-toggle').click();
    await waitForRuntime(page);
    const restored = await readRuntime(page);
    expect(restored.stageCount).toBe(1);
    expect(restored.canvasCount).toBe(1);
    expect(restored.triggerCount).toBe(13);
    expect(restored.stageMounts).toBe(2);
    expect(restored.stageLive).toBe(1);
    expect(restored.runtimeMounts).toBe(1);

    // Leave the ACO route and return through history. A restored or reloaded
    // document must still expose one stage, one canvas, and one trigger set.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goBack();
    await waitForRuntime(page);
    const returned = await readRuntime(page);
    expect(returned.stageCount).toBe(1);
    expect(returned.canvasCount).toBe(1);
    expect(returned.triggerCount).toBe(13);
    expect(returned.stageLive).toBe(1);
    expect(returned.runtimeMounts).toBe(1);

    // The controller's in-page teardown clears its timer, listeners, stages,
    // canvas, and triggers (the same Astro swap event the dev fixture uses).
    await page.evaluate(() => document.dispatchEvent(new Event('astro:before-swap')));
    await page.waitForFunction(
      () => window.__storyRuntimeDebug?.debugState().status === 'destroyed',
    );
    const cleaned = await page.evaluate(() => {
      const debug = window.__storyRuntimeDebug?.debugState();
      return {
        status: debug?.status,
        metricTimerActive: debug?.metricTimerActive,
        listenersActive: debug?.listenersActive,
        stageLive: debug?.stageLive,
        triggerCount: document.documentElement.dataset.scrollTriggers,
        hasDirector: window.__scrollDirector !== undefined,
        canvases: document.querySelectorAll('canvas[data-stage-canvas]').length,
      };
    });
    expect(cleaned.status).toBe('destroyed');
    expect(cleaned.metricTimerActive).toBe(false);
    expect(cleaned.listenersActive).toBe(false);
    expect(cleaned.stageLive).toBe(0);
    expect(cleaned.triggerCount).toBe('0');
    expect(cleaned.hasDirector).toBe(false);
    expect(cleaned.canvases).toBe(0);

    expect(errors).toEqual([]);
  });
});
