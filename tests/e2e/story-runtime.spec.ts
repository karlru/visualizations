import { expect, type Page, test } from '@playwright/test';

const HARNESS = '/dev/story-smoke';

const CHAPTERS = [
  { id: 'the-moving-point', scene: 'overview' },
  { id: 'a-closer-look', scene: 'closeup' },
  { id: 'the-turn', scene: 'drift' },
  { id: 'pulling-back', scene: 'wide' },
] as const;

interface RuntimeSnapshot {
  readonly controllerStatus: string | null;
  readonly stageStatus: string | null;
  readonly activeChapter: string | null;
  readonly activeScene: string | null;
  readonly progress: number;
  readonly chapterCount: number;
  readonly stageCount: number;
  readonly canvasCount: number;
  readonly simTime: number;
  readonly paused: boolean;
  readonly speed: number;
  readonly sceneZoom: number;
  readonly sceneReveal: number;
  readonly sceneLayers: string;
  readonly stageTop: number;
  readonly stageHeight: number;
  readonly railActive: string | null;
  readonly railValues: string[];
  readonly frames: number;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

async function waitForRuntime(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    const director = window.__scrollDirector;
    return (
      controller?.dataset.storyController === 'ready' &&
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0 &&
      director !== undefined &&
      director.debugState().triggerCount === 4
    );
  });
}

async function readRuntime(page: Page): Promise<RuntimeSnapshot> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const rail = document.querySelector<HTMLElement>('[data-progress-rail]');
    if (!controller || !stage || !rail) throw new Error('Missing story runtime elements');
    const stageRect = stage.getBoundingClientRect();
    return {
      controllerStatus: controller.dataset.storyController ?? null,
      stageStatus: stage.dataset.stageStatus ?? null,
      activeChapter: controller.dataset.activeChapter ?? null,
      activeScene: controller.dataset.activeScene ?? null,
      progress: Number.parseFloat(controller.dataset.scrollProgress ?? 'NaN'),
      chapterCount: Number(controller.dataset.chapterCount ?? 0),
      stageCount: document.querySelectorAll('[data-story-stage]').length,
      canvasCount: document.querySelectorAll('canvas[data-stage-canvas]').length,
      simTime: Number(controller.dataset.simTime ?? 'NaN'),
      paused: controller.dataset.paused === 'true',
      speed: Number(controller.dataset.speed ?? 'NaN'),
      sceneZoom: Number(controller.dataset.sceneZoom ?? 'NaN'),
      sceneReveal: Number(controller.dataset.sceneReveal ?? 'NaN'),
      sceneLayers: controller.dataset.sceneLayers ?? '',
      stageTop: stageRect.top,
      stageHeight: stageRect.height,
      railActive: rail.querySelector<HTMLElement>('[aria-current]')?.dataset.chapterLink ?? null,
      railValues: Array.from(
        rail.querySelectorAll<HTMLElement>('[role="progressbar"]'),
        (element) => element.getAttribute('aria-valuenow') ?? '',
      ),
      frames: Number(stage.dataset.frames ?? 0),
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

async function waitForSimTime(page: Page, minimum: number): Promise<number> {
  await page.waitForFunction(
    (value) => {
      const controller = document.querySelector<HTMLElement>('[data-story-controller]');
      return Number(controller?.dataset.simTime ?? 0) >= value;
    },
    minimum,
    { timeout: 5_000 },
  );
  return readRuntime(page).then((state) => state.simTime);
}

test.describe('story runtime', () => {
  test('four chapters scroll and each activates its scene', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const chapterIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-story-chapter]'), (element) => ({
        id: element.id,
        scene: element.dataset.scene ?? null,
      })),
    );
    expect(chapterIds).toEqual(CHAPTERS.map(({ id, scene }) => ({ id, scene })));

    const initial = await readRuntime(page);
    expect(initial.activeChapter).toBe('the-moving-point');
    expect(initial.activeScene).toBe('overview');
    expect(initial.chapterCount).toBe(4);
    expect(initial.stageCount).toBe(1);
    expect(initial.canvasCount).toBe(1);
    expect(initial.sceneZoom).toBeGreaterThan(0);
    expect(initial.sceneReveal).toBeGreaterThan(0);
    expect(initial.sceneLayers).toContain('ants');

    const zooms: number[] = [];
    for (const chapter of CHAPTERS) {
      await scrollToChapter(page, chapter.id);

      const state = await readRuntime(page);
      expect(state.activeChapter, `active chapter ${chapter.id}`).toBe(chapter.id);
      expect(state.activeScene, `active scene ${chapter.id}`).toBe(chapter.scene);
      expect(state.progress).toBeGreaterThanOrEqual(0);
      expect(state.progress).toBeLessThanOrEqual(1);
      expect(state.sceneZoom).toBeGreaterThan(0);
      expect(state.sceneReveal).toBeGreaterThan(0);
      expect(state.sceneReveal).toBeLessThanOrEqual(1);
      expect(state.stageCount).toBe(1);
      expect(state.canvasCount).toBe(1);
      zooms.push(state.sceneZoom);
    }

    // Camera framing really changes between chapters; the active scene is not
    // merely a label.
    expect(new Set(zooms.map((zoom) => zoom.toFixed(1))).size).toBeGreaterThan(1);

    expect(errors).toEqual([]);
  });

  test('deep links activate the named chapter and scene after layout measurement', async ({
    page,
  }) => {
    const errors = watchErrors(page);

    await page.goto(`${HARNESS}#the-turn`);
    await waitForRuntime(page);

    const deepLinked = await readRuntime(page);
    expect(deepLinked.activeChapter).toBe('the-turn');
    expect(deepLinked.activeScene).toBe('drift');
    expect(await page.evaluate(() => window.location.hash)).toBe('#the-turn');

    const chapterInView = await page.evaluate(() => {
      const element = document.getElementById('the-turn');
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    });
    expect(chapterInView).toBe(true);

    // Reloading the same fragment converges on the same chapter.
    await page.reload();
    await waitForRuntime(page);
    const reloaded = await readRuntime(page);
    expect(reloaded.activeChapter).toBe('the-turn');
    expect(reloaded.activeScene).toBe('drift');

    await page.goto(`${HARNESS}#pulling-back`);
    await waitForRuntime(page);
    const last = await readRuntime(page);
    expect(last.activeChapter).toBe('pulling-back');
    expect(last.activeScene).toBe('wide');

    expect(errors).toEqual([]);
  });

  test('progress rail reflects the active chapter and is keyboard operable', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const rail = page.getByRole('navigation', { name: 'Chapters' });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole('link')).toHaveCount(4);

    const firstLink = rail.getByRole('link', { name: /The moving point/ });
    const secondLink = rail.getByRole('link', { name: /A closer look/ });
    const lastLink = rail.getByRole('link', { name: /Pulling back/ });

    await expect(firstLink).toHaveAttribute('aria-current', 'location');
    await expect(secondLink).not.toHaveAttribute('aria-current', 'location');

    // Arrow keys move focus within the rail; Home and End jump to the edges.
    await firstLink.focus();
    await page.keyboard.press('ArrowRight');
    await expect(secondLink).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(firstLink).toBeFocused();
    await page.keyboard.press('End');
    await expect(lastLink).toBeFocused();
    await page.keyboard.press('Home');
    await expect(firstLink).toBeFocused();

    // Keyboard activation navigates to the chapter and updates both the rail
    // and the scene.
    await rail.getByRole('link', { name: /The turn/ }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.location.hash === '#the-turn');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
        'the-turn',
    );

    const active = await readRuntime(page);
    expect(active.activeChapter).toBe('the-turn');
    expect(active.activeScene).toBe('drift');
    expect(active.railActive).toBe('the-turn');
    await expect(rail.getByRole('link', { name: /The turn/ })).toHaveAttribute(
      'aria-current',
      'location',
    );
    await expect(firstLink).not.toHaveAttribute('aria-current', 'location');

    // Clicking a link also navigates.
    await lastLink.click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
        'pulling-back',
    );
    await page.waitForFunction(() => window.location.hash === '#pulling-back');
    expect(await page.evaluate(() => window.location.hash)).toBe('#pulling-back');

    expect(errors).toEqual([]);
  });

  test('the stage stays pinned with exactly one stage and canvas', async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HARNESS);
    await waitForRuntime(page);

    await scrollToChapter(page, 'a-closer-look');
    const before = await readRuntime(page);
    expect(before.stageCount).toBe(1);
    expect(before.canvasCount).toBe(1);

    await page.evaluate(() => window.scrollBy(0, 320));
    await page.waitForFunction(() => window.scrollY > 0);
    await page.waitForTimeout(120);

    const after = await readRuntime(page);
    expect(after.stageCount).toBe(1);
    expect(after.canvasCount).toBe(1);
    expect(after.stageTop).toBeCloseTo(before.stageTop, 0);
    expect(after.stageHeight).toBeCloseTo(before.stageHeight, 0);

    expect(errors).toEqual([]);
  });

  test('the runtime works at 360 px and 1440 px without horizontal overflow', async ({ page }) => {
    const errors = watchErrors(page);

    for (const viewport of [
      { width: 360, height: 720 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(HARNESS);
      await waitForRuntime(page);

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(overflow.document, `${viewport.width}px document overflow`).toBeLessThanOrEqual(0);
      expect(overflow.body, `${viewport.width}px body overflow`).toBeLessThanOrEqual(0);

      await scrollToChapter(page, 'the-turn');
      const state = await readRuntime(page);
      expect(state.stageCount).toBe(1);
      expect(state.activeChapter).toBe('the-turn');
      expect(state.stageTop).toBeGreaterThanOrEqual(0);
      expect(state.stageTop).toBeLessThanOrEqual(viewport.height);
    }

    expect(errors).toEqual([]);
  });

  test('the development page is noindex, unlinked, and absent from the sitemap', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    const navigationLinks = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          '.site-header a, .site-footer a, [aria-label="Primary"] a, [aria-label="Footer"] a',
        ),
        (anchor) => anchor.getAttribute('href') ?? '',
      ),
    );
    expect(navigationLinks.length).toBeGreaterThan(0);
    expect(navigationLinks.some((href) => href.includes('/dev/'))).toBe(false);

    const pageLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'), (anchor) =>
        anchor.getAttribute('href'),
      ).filter((href) => href?.includes('/dev/story-smoke')),
    );
    expect(pageLinks).toEqual([]);

    const sitemap = await page.request.get('/sitemap-0.xml');
    expect(sitemap.status()).toBe(200);
    const body = await sitemap.text();
    expect(body).not.toContain('/dev/');
    expect(body).toContain('/stories');

    expect(errors).toEqual([]);
  });

  test('play/pause, speed, and replay drive simulated time', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const pause = page.getByTestId('stage-play-pause');
    const replay = page.getByTestId('stage-replay');
    const speed = page.getByTestId('stage-speed');

    // Pause freezes the clock even while the page is still animating frames.
    await pause.click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true' &&
        document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.paused === 'true',
    );
    const pausedStart = (await readRuntime(page)).simTime;
    await page.waitForTimeout(450);
    const pausedEnd = (await readRuntime(page)).simTime;
    expect(pausedEnd).toBeCloseTo(pausedStart, 2);

    // Resume advances again.
    await pause.click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'false',
    );
    const resumed = await waitForSimTime(page, pausedEnd + 0.1);
    expect(resumed).toBeGreaterThan(pausedEnd);

    // Measure a 1× interval, then replay at 4× and compare growth.
    await pause.click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
    );
    await replay.click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simTime !==
        undefined,
    );
    await speed.selectOption('1');
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.speed === '1',
    );
    const oneStart = (await readRuntime(page)).simTime;
    await page.waitForTimeout(650);
    const oneEnd = (await readRuntime(page)).simTime;
    const oneDelta = oneEnd - oneStart;
    expect(oneDelta).toBeGreaterThan(0.2);
    expect(oneDelta).toBeLessThan(1.6);

    await pause.click();
    await replay.click();
    await speed.selectOption('4');
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.speed === '4',
    );
    const fourStart = (await readRuntime(page)).simTime;
    await page.waitForTimeout(650);
    const fourEnd = (await readRuntime(page)).simTime;
    const fourDelta = fourEnd - fourStart;
    expect(fourDelta).toBeGreaterThan(1.2);
    expect(fourDelta).toBeLessThan(4.5);
    expect(fourDelta / Math.max(oneDelta, 0.01)).toBeGreaterThan(1.5);

    // Replay resets simulated time and resumes playback.
    await pause.click();
    await replay.click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'false',
    );
    const replayed = (await readRuntime(page)).simTime;
    expect(replayed).toBeLessThan(0.35);
    const advanced = await waitForSimTime(page, replayed + 0.1);
    expect(advanced).toBeGreaterThan(replayed);

    expect(errors).toEqual([]);
  });

  test('teardown leaves no triggers, stages, or canvases behind', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);

    await page.evaluate(() => document.dispatchEvent(new Event('astro:before-swap')));
    await page.waitForFunction(
      () =>
        document.querySelectorAll('canvas[data-stage-canvas]').length === 0 &&
        document.querySelectorAll('[data-label-id]').length === 0,
    );

    const state = await page.evaluate(() => ({
      hasDirector: window.__scrollDirector !== undefined,
      dataTriggers: document.documentElement.dataset.scrollTriggers,
      dataChapters: document.documentElement.dataset.scrollChapters,
      runtime: document.documentElement.dataset.storyRuntime,
      stages: document.querySelectorAll('[data-story-stage]').length,
      stageStatus:
        document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.stageStatus ?? null,
    }));
    expect(state.hasDirector).toBe(false);
    expect(state.dataTriggers).toBe('0');
    expect(state.dataChapters).toBe('0');
    expect(state.runtime).toBeUndefined();
    // The Svelte island itself is removed by Astro's swap; a synthetic event
    // only tears down controller-owned runtime objects, so the shell section
    // remains with its destroyed status until the router replaces the DOM.
    expect(state.stages).toBe(1);
    expect(state.stageStatus).toBe('destroyed');

    // A full navigation back to the story must not duplicate anything.
    await page.goto('/');
    await page.goto(HARNESS);
    await waitForRuntime(page);
    const after = await readRuntime(page);
    expect(after.stageCount).toBe(1);
    expect(after.canvasCount).toBe(1);
    expect(await page.evaluate(() => window.__scrollDirector?.debugState().triggerCount)).toBe(4);
    expect(
      await page.evaluate(() => window.__scrollDirector?.debugState().scrollTriggerCount),
    ).toBe(4);

    expect(errors).toEqual([]);
  });
});
