/**
 * Step 1.9 story-runtime acceptance gate.
 *
 * This suite proves the runtime end to end on the built preview, not just the
 * individual contracts from earlier steps. Each test names the requirement it
 * closes; `docs/runtime-acceptance.md` maps FR-STORY-01..20 to the whole set of
 * browser tests, including the earlier focused suites.
 *
 * Two development stories share one controller:
 *   A = /dev/story-smoke  (orbit fixture)
 *   B = /dev/pulse-smoke  (pulse fixture, added by config + page only)
 */

import { expect, type Page, test } from '@playwright/test';
import type { StoryRuntimeEntryState } from '../../src/components/story/story-runtime-debug';
import { SITE_URL } from '../../src/config/site';

const STORY_A = '/dev/story-smoke';
const STORY_B = '/dev/pulse-smoke';

const CHAPTERS_A = [
  { id: 'the-moving-point', scene: 'overview' },
  { id: 'a-closer-look', scene: 'closeup' },
  { id: 'the-turn', scene: 'drift' },
  { id: 'pulling-back', scene: 'wide' },
] as const;

const CHAPTERS_B = [
  { id: 'the-pulse', scene: 'pulse-overview' },
  { id: 'the-interval', scene: 'pulse-closeup' },
  { id: 'the-lattice', scene: 'pulse-drift' },
  { id: 'the-return', scene: 'pulse-wide' },
] as const;

type EntryState = StoryRuntimeEntryState;

interface RuntimeSnapshot {
  readonly storyKey: string;
  readonly controllerStatus: string | null;
  readonly activeChapter: string | null;
  readonly activeScene: string | null;
  readonly progress: number;
  readonly chapterCount: number;
  readonly stageCount: number;
  readonly canvasCount: number;
  readonly simTime: number;
  readonly steps: number;
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
  readonly pauseReason: string | null;
  readonly articleMode: boolean;
  readonly motion: string;
  readonly entryCount: number;
  readonly entry: EntryState | null;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
  readonly deviceDpr: number;
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
    const debug = window.__storyRuntimeDebug?.debugState();
    return (
      controller?.dataset.storyController === 'ready' &&
      controller.dataset.activeChapter !== undefined &&
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0 &&
      debug?.ready === true &&
      window.__scrollDirector?.debugState().triggerCount === 4
    );
  });
}

async function readRuntime(page: Page): Promise<RuntimeSnapshot> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const rail = document.querySelector<HTMLElement>('[data-progress-rail]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    if (!controller || !stage || !rail || !canvas) throw new Error('Missing story runtime');

    const stageRect = stage.getBoundingClientRect();
    const debug = window.__storyRuntimeDebug?.debugState();
    return {
      storyKey: controller.dataset.storyKey ?? '',
      controllerStatus: controller.dataset.storyController ?? null,
      activeChapter: controller.dataset.activeChapter ?? null,
      activeScene: controller.dataset.activeScene ?? null,
      progress: Number.parseFloat(controller.dataset.scrollProgress ?? 'NaN'),
      chapterCount: Number(controller.dataset.chapterCount ?? 0),
      stageCount: document.querySelectorAll('[data-story-stage]').length,
      canvasCount: document.querySelectorAll('canvas[data-stage-canvas]').length,
      simTime: Number(controller.dataset.simTime ?? 'NaN'),
      steps: Number(controller.dataset.simSteps ?? 'NaN'),
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
      pauseReason: stage.dataset.pauseReason ?? null,
      articleMode: controller.dataset.articleMode === 'true',
      motion: controller.dataset.motion ?? '',
      entryCount: Number(controller.dataset.entryCount ?? 0),
      entry: debug?.entry ?? null,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      cssWidth: Number(canvas.dataset.cssWidth ?? 0),
      cssHeight: Number(canvas.dataset.cssHeight ?? 0),
      dpr: Number(canvas.dataset.dpr ?? 0),
      deviceDpr: window.devicePixelRatio,
    };
  });
}

async function readEntry(page: Page): Promise<EntryState> {
  const entry = await page.evaluate(() => window.__storyRuntimeDebug?.entryState() ?? null);
  if (entry === null) throw new Error('No chapter entry has been recorded yet.');
  return entry as EntryState;
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

async function waitForEntry(page: Page, chapter: string): Promise<EntryState> {
  await page.waitForFunction(
    (chapterId) => window.__storyRuntimeDebug?.entryState()?.chapter === chapterId,
    chapter,
  );
  return readEntry(page);
}

async function setSpeed(page: Page, value: number): Promise<void> {
  await page.getByTestId('stage-speed').selectOption(String(value));
  await page.waitForFunction(
    (speed) =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.speed ===
      String(speed),
    value,
  );
}

async function replay(page: Page): Promise<void> {
  await page.getByTestId('stage-replay').click();
  await page.waitForFunction(
    () =>
      Number(document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simTime ?? 1) <
      0.2,
  );
}

async function pause(page: Page): Promise<void> {
  const controller = page.locator('[data-story-controller]');
  if ((await controller.getAttribute('data-paused')) !== 'true') {
    await page.getByTestId('stage-play-pause').click();
  }
  await expect(controller).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('[data-story-stage]')).toHaveAttribute('data-paused', 'true');
}

test.describe('story runtime acceptance', () => {
  test('FR-STORY-01/02/03/04/14 one controller runs both story configs with one stage and a live rail', async ({
    page,
  }) => {
    const errors = watchErrors(page);

    for (const story of [
      { url: STORY_A, key: 'story-smoke', chapters: CHAPTERS_A, label: 'Development story stage' },
      {
        url: STORY_B,
        key: 'pulse-smoke',
        chapters: CHAPTERS_B,
        label: 'Second development story stage',
      },
    ] as const) {
      await page.goto(story.url);
      await waitForRuntime(page);

      const initial = await readRuntime(page);
      expect(initial.storyKey).toBe(story.key);
      expect(initial.controllerStatus).toBe('ready');
      expect(initial.chapterCount).toBe(4);
      expect(initial.stageCount).toBe(1);
      expect(initial.canvasCount).toBe(1);
      expect(initial.entryCount).toBeGreaterThanOrEqual(1);
      expect(initial.entry?.chapter).toBe(story.chapters[0].id);
      expect(initial.entry?.steps).toBe(0);
      expect(initial.entry?.simulatedSeconds).toBe(0);
      expect(initial.railActive).toBe(story.chapters[0].id);
      await expect(page.locator('[data-story-stage]')).toHaveAttribute('aria-label', story.label);
      expect(await page.evaluate(() => window.__scrollDirector?.debugState().triggerCount)).toBe(4);

      const chapterMap = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-story-chapter]'), (element) => ({
          id: element.id,
          scene: element.dataset.scene ?? null,
        })),
      );
      expect(chapterMap).toEqual(story.chapters.map(({ id, scene }) => ({ id, scene })));

      // Scroll updates chapter, scene, and rail without a reload.
      for (const chapter of story.chapters.slice(1)) {
        await scrollToChapter(page, chapter.id);
        const state = await readRuntime(page);
        expect(state.activeChapter).toBe(chapter.id);
        expect(state.activeScene).toBe(chapter.scene);
        expect(state.railActive).toBe(chapter.id);
        expect(state.progress).toBeGreaterThanOrEqual(0);
        expect(state.progress).toBeLessThanOrEqual(1);
        expect(state.sceneZoom).toBeGreaterThan(0);
        expect(state.sceneReveal).toBeGreaterThan(0);
        expect(state.sceneLayers.length).toBeGreaterThan(0);
        expect(state.stageCount).toBe(1);
        expect(state.canvasCount).toBe(1);
      }

      await page.waitForFunction(
        (hash) => window.location.hash === hash,
        `#${story.chapters[3].id}`,
      );
      expect(await page.evaluate(() => window.location.hash)).toBe(`#${story.chapters[3].id}`);
    }

    expect(errors).toEqual([]);
  });

  test('the second config page is noindex, unlinked, and absent from the sitemap', async ({
    page,
  }) => {
    const errors = watchErrors(page);

    for (const story of [STORY_A, STORY_B]) {
      await page.goto(story);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

      const devLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'), (anchor) =>
          anchor.getAttribute('href'),
        ).filter((href) => href?.includes('/dev/')),
      );
      expect(devLinks, `${story} links to a dev route`).toEqual([]);

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
    }

    const sitemap = await page.request.get('/sitemap-0.xml');
    expect(sitemap.status()).toBe(200);
    const body = await sitemap.text();
    expect(body).not.toContain('/dev/');
    expect(body).toContain('/stories');

    expect(errors).toEqual([]);
  });

  test('FR-STORY-07 every speed option changes the simulation rate in order', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(STORY_A);
    await waitForRuntime(page);

    const options = await page
      .getByTestId('stage-speed')
      .locator('option')
      .evaluateAll((elements) => elements.map((element) => (element as HTMLOptionElement).value));
    expect(options).toEqual(['0.5', '1', '2', '4']);

    const deltas: Record<string, number> = {};
    for (const speed of [0.5, 1, 2, 4]) {
      await setSpeed(page, speed);
      await replay(page);
      const start = (await readRuntime(page)).simTime;
      await page.waitForTimeout(800);
      const end = (await readRuntime(page)).simTime;
      deltas[String(speed)] = end - start;
      expect(deltas[String(speed)], `${speed}× advances`).toBeGreaterThan(0.1);
    }

    expect(deltas['0.5']).toBeLessThan(deltas['1'] * 0.85);
    expect(deltas['1']).toBeLessThan(deltas['2'] * 0.9);
    expect(deltas['2']).toBeLessThan(deltas['4'] * 0.9);
    expect(deltas['4'] / Math.max(deltas['0.5'], 0.001)).toBeGreaterThan(3);

    expect(errors).toEqual([]);
  });

  test('FR-STORY-05 pause freezes simulation and rendering; resume advances both', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(STORY_A);
    await waitForRuntime(page);

    await page.waitForFunction(
      () =>
        Number(document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simTime) >
        0.2,
    );
    const before = await readRuntime(page);
    expect(before.paused).toBe(false);

    await pause(page);
    const pausedAt = await readRuntime(page);
    await page.waitForTimeout(450);
    const stopped = await readRuntime(page);

    expect(stopped.simTime).toBeCloseTo(pausedAt.simTime, 3);
    expect(stopped.steps).toBe(pausedAt.steps);
    expect(stopped.frames).toBe(pausedAt.frames);
    expect(stopped.sceneZoom).toBeCloseTo(pausedAt.sceneZoom, 3);

    await page.getByTestId('stage-play-pause').click();
    await expect(page.locator('[data-story-controller]')).toHaveAttribute('data-paused', 'false');
    await page.waitForFunction(
      ({ time, frames }) => {
        const controller = document.querySelector<HTMLElement>('[data-story-controller]');
        const stage = document.querySelector<HTMLElement>('[data-story-stage]');
        return (
          Number(controller?.dataset.simTime ?? 0) > time &&
          Number(stage?.dataset.frames ?? 0) > frames
        );
      },
      { time: stopped.simTime, frames: stopped.frames },
    );

    expect(errors).toEqual([]);
  });

  test('FR-STORY-06 replay restarts the current chapter at step 0 with the same run identity', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY_A}?seed=5150&variant=spiral`);
    await waitForRuntime(page);
    await scrollToChapter(page, 'the-turn');

    const entry = await waitForEntry(page, 'the-turn');
    await page.waitForFunction(
      () =>
        Number(document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simTime) >
        0.4,
    );
    const running = await readRuntime(page);
    expect(running.activeChapter).toBe('the-turn');
    expect(running.steps).toBeGreaterThan(0);

    await replay(page);
    const replayed = await readRuntime(page);
    expect(replayed.activeChapter).toBe('the-turn');
    expect(replayed.activeScene).toBe('drift');
    expect(replayed.simTime).toBeLessThan(0.25);
    expect(replayed.steps).toBeLessThan(20);
    expect(replayed.entry?.seed).toBe(entry.seed);
    expect(replayed.entry?.structural).toEqual(entry.structural);
    expect(replayed.entry?.params).toEqual(entry.params);

    expect(errors).toEqual([]);
  });

  test('FR-STORY-08 offscreen and hidden pause the simulation and rendering', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(STORY_A);
    await waitForRuntime(page);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      return stage?.dataset.paused === 'true' && stage.dataset.pauseReason === 'offscreen';
    });
    const offscreen = await readRuntime(page);
    await page.waitForTimeout(400);
    const offscreenAfter = await readRuntime(page);
    expect(offscreenAfter.simTime).toBeCloseTo(offscreen.simTime, 3);
    expect(offscreenAfter.frames).toBe(offscreen.frames);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.paused === 'false',
    );
    await page.waitForFunction(
      (frames) =>
        Number(document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.frames ?? 0) >
        frames,
      offscreenAfter.frames,
    );

    await page.evaluate(() => {
      let visibility: DocumentVisibilityState = 'hidden';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibility,
      });
      const testWindow = window as Window & {
        __setVisibilityState?: (value: DocumentVisibilityState) => void;
      };
      testWindow.__setVisibilityState = (value) => {
        visibility = value;
        document.dispatchEvent(new Event('visibilitychange'));
      };
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForFunction(() => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      return stage?.dataset.paused === 'true' && stage.dataset.pauseReason === 'hidden';
    });
    const hidden = await readRuntime(page);
    await page.waitForTimeout(400);
    const hiddenAfter = await readRuntime(page);
    expect(hiddenAfter.simTime).toBeCloseTo(hidden.simTime, 3);
    expect(hiddenAfter.frames).toBe(hidden.frames);

    await page.evaluate(() => {
      const testWindow = window as Window & {
        __setVisibilityState?: (value: DocumentVisibilityState) => void;
      };
      testWindow.__setVisibilityState?.('visible');
    });
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.paused === 'false',
    );

    expect(errors).toEqual([]);
  });

  test('FR-STORY-12 fast forward and reverse scrolling settle on a coherent chapter and scene', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY_A}?lenis=off`);
    await waitForRuntime(page);

    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    const jumpTo = async (top: number): Promise<void> => {
      await page.evaluate((target) => {
        const html = document.documentElement;
        const previous = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        window.scrollTo(0, target);
        html.style.scrollBehavior = previous;
      }, top);
      await page.waitForTimeout(20);
    };

    // Rapid forward pass: twelve jumps with no settle between them.
    for (let step = 1; step <= 12; step += 1) {
      await jumpTo((maxScroll * step) / 12);
    }
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
        'pulling-back',
    );

    const forward = await readRuntime(page);
    expect(forward.activeChapter).toBe('pulling-back');
    expect(forward.activeScene).toBe('wide');
    expect(forward.sceneLayers.length).toBeGreaterThan(0);
    expect(forward.sceneReveal).toBeGreaterThan(0);
    expect(forward.stageCount).toBe(1);
    expect(forward.canvasCount).toBe(1);
    expect(await page.evaluate(() => window.__scrollDirector?.debugState().triggerCount)).toBe(4);

    // Rapid reverse pass returns to the first chapter, not a blank or stale
    // scene between chapters.
    for (let step = 11; step >= 0; step -= 1) {
      await jumpTo((maxScroll * step) / 12);
    }
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
        'the-moving-point',
    );

    const reverse = await readRuntime(page);
    expect(reverse.activeChapter).toBe('the-moving-point');
    expect(reverse.activeScene).toBe('overview');
    expect(reverse.railActive).toBe('the-moving-point');
    expect(reverse.sceneLayers).toContain('ants');
    expect(reverse.sceneReveal).toBeGreaterThan(0);
    expect(reverse.sceneZoom).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.document.documentElement.dataset.scrollTriggers)).toBe(
      '4',
    );

    expect(errors).toEqual([]);
  });

  test('FR-STORY-13 the runtime flows at 360 px and 1440 px with correct DPR and no overflow', async ({
    browser,
  }) => {
    for (const viewport of [
      { width: 360, height: 720 },
      { width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 3 });
      const page = await context.newPage();
      const errors = watchErrors(page);

      await page.goto(STORY_A);
      await waitForRuntime(page);

      const initial = await readRuntime(page);
      expect(initial.deviceDpr).toBe(3);
      expect(initial.dpr).toBe(2);
      expect(initial.canvasWidth).toBe(Math.round(initial.cssWidth * 2));
      expect(initial.canvasHeight).toBe(Math.round(initial.cssHeight * 2));
      expect(initial.canvasWidth).toBeGreaterThan(0);

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(overflow.document, `${viewport.width}px document overflow`).toBeLessThanOrEqual(0);
      expect(overflow.body, `${viewport.width}px body overflow`).toBeLessThanOrEqual(0);

      await scrollToChapter(page, 'the-turn');
      await pause(page);
      await page.waitForTimeout(120);
      const offPaused = await readRuntime(page);
      expect(offPaused.frames).toBeGreaterThan(0);
      await page.getByTestId('stage-play-pause').click();
      await expect(page.locator('[data-story-controller]')).toHaveAttribute('data-paused', 'false');

      await setSpeed(page, 2);
      expect((await readRuntime(page)).speed).toBe(2);

      // Article mode removes the stage and keeps every chapter readable at both
      // widths.
      await page.getByTestId('article-mode-toggle').click();
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
          'true',
      );
      await expect(page.locator('[data-story-stage]')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      await expect(page.locator('[data-story-chapter]')).toHaveCount(4);
      for (let index = 0; index < 4; index += 1) {
        await expect(page.locator('[data-story-chapter]').nth(index)).toBeVisible();
      }
      const articleOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(articleOverflow, `${viewport.width}px article overflow`).toBeLessThanOrEqual(0);

      await page.getByTestId('article-mode-toggle').click();
      await waitForRuntime(page);
      const restored = await readRuntime(page);
      expect(restored.stageCount).toBe(1);
      expect(restored.canvasCount).toBe(1);

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
          'the-moving-point',
      );
      await scrollToChapter(page, 'the-moving-point');
      const top = await readRuntime(page);
      expect(top.stageTop).toBeGreaterThanOrEqual(-1);
      expect(top.stageTop).toBeLessThan(viewport.height);

      expect(errors).toEqual([]);
      await context.close();
    }

    // The second config uses the same runtime; check its narrow layout too.
    const pulseContext = await browser.newContext({
      viewport: { width: 360, height: 720 },
      deviceScaleFactor: 3,
    });
    const pulsePage = await pulseContext.newPage();
    const pulseErrors = watchErrors(pulsePage);
    await pulsePage.goto(STORY_B);
    await waitForRuntime(pulsePage);
    await scrollToChapter(pulsePage, 'the-lattice');
    const pulseState = await readRuntime(pulsePage);
    expect(pulseState.storyKey).toBe('pulse-smoke');
    expect(pulseState.activeChapter).toBe('the-lattice');
    expect(pulseState.activeScene).toBe('pulse-drift');
    expect(pulseState.stageCount).toBe(1);
    expect(pulseState.canvasCount).toBe(1);
    expect(
      await pulsePage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await pulsePage.getByTestId('article-mode-toggle').click();
    await pulsePage.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
        'true',
    );
    await expect(pulsePage.locator('[data-story-stage]')).toHaveCount(0);
    await expect(pulsePage.locator('[data-story-chapter]')).toHaveCount(4);
    expect(pulseErrors).toEqual([]);
    await pulseContext.close();
  });

  test('FR-STORY-15/16 a shared mid-run URL restores the starting state and discloses local edits', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const target = window as unknown as { __copied?: string };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            target.__copied = text;
          },
        },
      });
    });

    await page.goto(`${STORY_A}?seed=99&orbit=1.5&variant=spiral&trails=false#the-turn`);
    await waitForRuntime(page);
    const sharedEntry = await waitForEntry(page, 'the-turn');

    // Share from mid-run, not from the initial frame.
    await page.waitForFunction(
      () =>
        Number(document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simTime) >
        0.3,
    );
    await page.getByTestId('stage-share').click();
    await page.waitForFunction(
      () => (window as unknown as { __copied?: string }).__copied !== undefined,
    );

    const copied = await page.evaluate(
      () => (window as unknown as { __copied?: string }).__copied ?? '',
    );
    const parsed = new URL(copied);
    const site = new URL(SITE_URL);
    expect(parsed.origin).toBe(site.origin);
    expect(parsed.pathname).toBe(STORY_A);
    expect(parsed.search).toBe('?seed=99&orbit=1.5&variant=spiral&trails=false');
    expect(parsed.hash).toBe('#the-turn');

    const status = page.locator('[data-share-status]');
    await expect(status).toContainText('Link copied');
    await expect(status).toContainText('step 0');
    await expect(page.locator('[data-share-scope]')).toContainText('not included');
    await expect(page.locator('[data-share-scope]')).toContainText('stay local');

    // Open the copied URL against the preview origin. The URL's origin is the
    // production site, so keep only its path, query, and fragment.
    await page.goto(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    await waitForRuntime(page);
    const restoredEntry = await waitForEntry(page, 'the-turn');

    expect(restoredEntry).toEqual(sharedEntry);
    expect(restoredEntry.chapter).toBe('the-turn');
    expect(restoredEntry.scene).toBe('drift');
    expect(restoredEntry.seed).toBe(99);
    expect(restoredEntry.params.orbit).toBe(1.5);
    expect(restoredEntry.params.variant).toBe('spiral');
    expect(restoredEntry.params.trails).toBe(false);
    expect(restoredEntry.steps).toBe(0);
    expect(restoredEntry.simulatedSeconds).toBe(0);

    expect(errors).toEqual([]);
  });

  test('FR-STORY-16 deep link, forward scroll, reverse scroll, and reload converge at chapter entry', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const query = '?seed=4242&orbit=1.2&variant=spiral&trails=false';
    const target = 'the-turn';

    // (a) Deep link.
    await page.goto(`${STORY_A}${query}#${target}`);
    await waitForRuntime(page);
    const deep = await waitForEntry(page, target);

    // (b) Forward scroll through the preceding chapters.
    await page.goto(`${STORY_A}${query}`);
    await waitForRuntime(page);
    await scrollToChapter(page, 'a-closer-look');
    await scrollToChapter(page, target);
    const forward = await waitForEntry(page, target);

    // (c) Reverse scroll from the last chapter back into the target.
    await page.goto(`${STORY_A}${query}#pulling-back`);
    await waitForRuntime(page);
    await waitForEntry(page, 'pulling-back');
    await scrollToChapter(page, target);
    const reverse = await waitForEntry(page, target);

    // (d) Reload of the shared/deep URL.
    await page.goto(`${STORY_A}${query}#${target}`);
    await waitForRuntime(page);
    await page.reload();
    await waitForRuntime(page);
    const reloaded = await waitForEntry(page, target);

    expect(deep).toEqual(forward);
    expect(forward).toEqual(reverse);
    expect(reverse).toEqual(reloaded);

    for (const entry of [deep, forward, reverse, reloaded]) {
      expect(entry.chapter).toBe(target);
      expect(entry.scene).toBe('drift');
      expect(entry.seed).toBe(4242);
      expect(entry.structural).toEqual({ variant: 'spiral' });
      expect(entry.params.orbit).toBe(1.2);
      expect(entry.params.trails).toBe(false);
      expect(entry.steps).toBe(0);
      expect(entry.simulatedSeconds).toBe(0);
    }

    // The canonical URL carries the same starting identity after each method.
    await expect(page).toHaveURL(
      new RegExp(`${STORY_A}\\?seed=4242&orbit=1.2&variant=spiral&trails=false#the-turn$`),
    );

    expect(errors).toEqual([]);
  });

  test('FR-STORY-19 ten round-trips between both stories leave one runtime and no growing timers', async ({
    page,
  }) => {
    const errors = watchErrors(page);

    for (let iteration = 0; iteration < 10; iteration += 1) {
      for (const story of [
        { url: `${STORY_A}?lenis=off`, key: 'story-smoke' },
        { url: `${STORY_B}?lenis=off`, key: 'pulse-smoke' },
      ] as const) {
        await page.goto(story.url);
        await waitForRuntime(page);

        const snapshot = await page.evaluate(() => {
          const debug = window.__storyRuntimeDebug?.debugState();
          const director = window.__scrollDirector?.debugState();
          return {
            storyKey:
              document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.storyKey ??
              null,
            ready: debug?.ready,
            mounts: debug?.mounts,
            stageLive: debug?.stageLive,
            entries: debug?.entryCount,
            stages: document.querySelectorAll('[data-story-stage]').length,
            canvases: document.querySelectorAll('canvas[data-stage-canvas]').length,
            controllers: document.querySelectorAll('[data-story-controller]').length,
            directors: window.__scrollDirector === undefined ? 0 : 1,
            triggers: director?.triggerCount,
            scrollTriggers: director?.scrollTriggerCount,
            dataTriggers: document.documentElement.dataset.scrollTriggers,
            stageMounts: (window as Window & { __storyStageMounts?: number }).__storyStageMounts,
          };
        });

        expect(snapshot.storyKey).toBe(story.key);
        expect(snapshot.ready).toBe(true);
        expect(snapshot.mounts, `runtime mounts at round-trip ${iteration + 1}`).toBe(1);
        expect(snapshot.stageLive, `live stages at round-trip ${iteration + 1}`).toBe(1);
        expect(snapshot.stageMounts).toBe(1);
        expect(snapshot.entries).toBeGreaterThanOrEqual(1);
        expect(snapshot.stages).toBe(1);
        expect(snapshot.canvases).toBe(1);
        expect(snapshot.controllers).toBe(1);
        expect(snapshot.directors).toBe(1);
        expect(snapshot.triggers).toBe(4);
        expect(snapshot.scrollTriggers).toBe(4);
        expect(snapshot.dataTriggers).toBe('4');
      }
    }

    // In-page teardown clears the controller-owned interval and listeners.
    await page.goto(STORY_A);
    await waitForRuntime(page);
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
        hasDirector: window.__scrollDirector !== undefined,
        triggers: document.documentElement.dataset.scrollTriggers,
        chapters: document.documentElement.dataset.scrollChapters,
        canvases: document.querySelectorAll('canvas[data-stage-canvas]').length,
      };
    });
    expect(cleaned.status).toBe('destroyed');
    expect(cleaned.metricTimerActive).toBe(false);
    expect(cleaned.listenersActive).toBe(false);
    expect(cleaned.stageLive).toBe(0);
    expect(cleaned.hasDirector).toBe(false);
    expect(cleaned.triggers).toBe('0');
    expect(cleaned.chapters).toBe('0');
    expect(cleaned.canvases).toBe(0);

    expect(errors).toEqual([]);
  });

  test('FR-STORY-20 article mode and the reduced-motion override persist across visits', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(STORY_A);
    await waitForRuntime(page);

    await page.getByTestId('motion-toggle').click();
    await expect(page.locator('[data-story-controller]')).toHaveAttribute('data-motion', 'reduced');
    await expect(page.locator('[data-story-controller]')).toHaveAttribute('data-paused', 'true');

    await page.getByTestId('article-mode-toggle').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
        'true',
    );

    const stored = await page.evaluate(() => ({
      article: window.localStorage.getItem('algorithm-stories.article-mode'),
      motion: window.localStorage.getItem('algorithm-stories.reduced-motion'),
    }));
    expect(stored).toEqual({ article: 'article', motion: 'reduced' });

    await page.reload();
    await page.waitForFunction(() => {
      const controller = document.querySelector<HTMLElement>('[data-story-controller]');
      return (
        controller?.dataset.storyController === 'ready' &&
        controller.dataset.storyEnhanced === 'true' &&
        controller.dataset.articleMode === 'true'
      );
    });

    const restored = await page.evaluate(() => {
      const controller = document.querySelector<HTMLElement>('[data-story-controller]');
      return {
        articleMode: controller?.dataset.articleMode,
        motion: controller?.dataset.motion,
        paused: controller?.dataset.paused,
        stages: document.querySelectorAll('[data-story-stage]').length,
        canvases: document.querySelectorAll('canvas').length,
        chapters: document.querySelectorAll('[data-story-chapter]').length,
      };
    });
    expect(restored.articleMode).toBe('true');
    expect(restored.motion).toBe('reduced');
    expect(restored.paused).toBe('true');
    expect(restored.stages).toBe(0);
    expect(restored.canvases).toBe(0);
    expect(restored.chapters).toBe(4);

    // Restoring the stage respects the remembered reduced-motion preference.
    await page.getByTestId('article-mode-toggle').click();
    await waitForRuntime(page);
    const stage = await readRuntime(page);
    expect(stage.articleMode).toBe(false);
    expect(stage.motion).toBe('reduced');
    expect(stage.paused).toBe(true);
    expect(stage.stageCount).toBe(1);

    expect(errors).toEqual([]);
  });
});
