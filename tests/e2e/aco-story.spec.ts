import { expect, type Page, test } from '@playwright/test';
import type { StoryRuntimeEntryState } from '../../src/components/story/story-runtime-debug';

const STORY = '/stories/ant-colony-optimization';

const CHAPTERS = [
  { id: 'the-colony', title: 'The colony', scene: 'colony-overview' },
  { id: 'the-problem', title: 'The problem', scene: 'tour-problem' },
  { id: 'one-ants-choice', title: "One ant's choice", scene: 'focal-choice' },
  { id: 'the-probability-rule', title: 'The probability rule', scene: 'probability-rule' },
  { id: 'leaving-a-trace', title: 'Leaving a trace', scene: 'deposit' },
  { id: 'forgetting', title: 'Forgetting', scene: 'evaporation' },
  { id: 'emergence', title: 'Emergence', scene: 'emergence' },
  { id: 'tuning-the-colony', title: 'Tuning the colony', scene: 'tuning' },
  { id: 'when-it-fails', title: 'When it fails', scene: 'limits' },
  { id: 'the-lab', title: 'The lab', scene: 'lab' },
] as const;

interface StorySnapshot {
  readonly storyKey: string;
  readonly chapterCount: number;
  readonly activeChapter: string | null;
  readonly activeScene: string | null;
  readonly activeTitle: string | null;
  readonly stageCount: number;
  readonly canvasCount: number;
  readonly railActive: string | null;
  readonly railLinks: number;
  readonly layers: string;
  readonly simTime: number;
  readonly speed: number;
  readonly params: Record<string, unknown>;
  readonly entry: StoryRuntimeEntryState | null;
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
      window.__scrollDirector?.debugState().triggerCount === 10
    );
  });
}

async function readStory(page: Page): Promise<StorySnapshot> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const rail = document.querySelector<HTMLElement>('[data-progress-rail]');
    if (!controller || !rail) throw new Error('Missing story runtime');

    return {
      storyKey: controller.dataset.storyKey ?? '',
      chapterCount: Number(controller.dataset.chapterCount ?? 0),
      activeChapter: controller.dataset.activeChapter ?? null,
      activeScene: controller.dataset.activeScene ?? null,
      activeTitle: controller.dataset.activeChapterTitle ?? null,
      stageCount: document.querySelectorAll('[data-story-stage]').length,
      canvasCount: document.querySelectorAll('canvas[data-stage-canvas]').length,
      railActive: rail.querySelector<HTMLElement>('[aria-current]')?.dataset.chapterLink ?? null,
      railLinks: rail.querySelectorAll('[data-chapter-link]').length,
      layers: controller.dataset.sceneLayers ?? '',
      simTime: Number(controller.dataset.simTime ?? 'NaN'),
      speed: Number(controller.dataset.speed ?? 'NaN'),
      params: JSON.parse(controller.dataset.engineParams ?? '{}') as Record<string, unknown>,
      entry: window.__storyRuntimeDebug?.entryState() ?? null,
      triggerCount: window.__scrollDirector?.debugState().triggerCount ?? 0,
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

test.describe('ACO story route', () => {
  test('renders one live stage, ten chapters, the rail, and colony metrics', async ({ page }) => {
    const errors = watchErrors(page);
    const response = await page.goto(STORY);

    expect(response?.status()).toBe(200);
    await waitForRuntime(page);

    const initial = await readStory(page);
    expect(initial.storyKey).toBe('ant-colony-optimization');
    expect(initial.chapterCount).toBe(10);
    expect(initial.stageCount).toBe(1);
    expect(initial.canvasCount).toBe(1);
    expect(initial.railLinks).toBe(10);
    expect(initial.railActive).toBe('the-colony');
    expect(initial.activeChapter).toBe('the-colony');
    expect(initial.activeScene).toBe('colony-overview');
    expect(initial.activeTitle).toBe('The colony');
    expect(initial.triggerCount).toBe(10);
    expect(initial.layers.length).toBeGreaterThan(0);
    expect(initial.entry?.chapter).toBe('the-colony');
    expect(initial.entry?.scene).toBe('colony-overview');
    expect(initial.entry?.seed).toBe(42);
    expect(initial.entry?.structural).toEqual({
      cityCount: 30,
      antCount: 40,
      alpha: 1,
      beta: 2,
      rho: 0.5,
    });

    // The chapter order and scene map are the ACO_CHAPTERS contract.
    const chapterMap = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-story-chapter]'), (element) => ({
        id: element.id,
        title: element.dataset.chapterTitle ?? '',
        scene: element.dataset.scene ?? '',
      })),
    );
    expect(chapterMap).toEqual(CHAPTERS.map(({ id, title, scene }) => ({ id, title, scene })));

    await expect(page.getByRole('navigation', { name: 'Chapters' }).getByRole('link')).toHaveCount(
      10,
    );

    // The real renderer mounted: DOM labels exist, and the metric panel uses the
    // ACO describer rather than the fixture rows.
    expect(await page.locator('.story-label').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-metric="iteration"]')).toHaveText('0');
    await expect(page.locator('[data-metric="best-length"]')).toHaveText('—');
    await expect(page.locator('[data-metric="mean-length"]')).toHaveText('—');
    await expect(page.locator('[data-metric="entropy"]')).toHaveText('1.000');
    await expect(page.locator('[data-metric="ants"]')).toHaveText('40');
    await expect(page.locator('[data-metric="cities"]')).toHaveText('30');

    // ACO lab controls are Step 3.5; the route must not render a dead panel.
    await expect(page.locator('[data-controls-panel]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('deep links activate the named chapter and scene and survive reload', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto(`${STORY}#emergence`);
    await waitForRuntime(page);

    const deepLinked = await readStory(page);
    expect(deepLinked.activeChapter).toBe('emergence');
    expect(deepLinked.activeScene).toBe('emergence');
    expect(deepLinked.railActive).toBe('emergence');
    expect(await page.evaluate(() => window.location.hash)).toBe('#emergence');
    expect(
      await page.evaluate(() => {
        const element = document.getElementById('emergence');
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }),
    ).toBe(true);

    await page.reload();
    await waitForRuntime(page);
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
        'emergence',
    );
    const reloaded = await readStory(page);
    expect(reloaded.activeChapter).toBe('emergence');
    expect(reloaded.activeScene).toBe('emergence');
    expect(reloaded.entry?.chapter).toBe('emergence');

    // Scrolling to another chapter updates the rail and the active scene.
    await scrollToChapter(page, 'the-probability-rule');
    const scrolled = await readStory(page);
    expect(scrolled.activeChapter).toBe('the-probability-rule');
    expect(scrolled.activeScene).toBe('probability-rule');
    expect(scrolled.railActive).toBe('the-probability-rule');

    expect(errors).toEqual([]);
  });

  test('the speed control writes the engine parameter once and round-trips the URL', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(STORY);
    await waitForRuntime(page);

    // Bring the sticky stage into view so the simulation is running, not
    // paused by the offscreen rule.
    await page.locator('[data-story-stage]').scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.pauseReason ===
        'running',
    );

    const speedSelect = page.getByTestId('stage-speed');
    await speedSelect.selectOption('2');
    await page.waitForFunction(() => {
      const controller = document.querySelector<HTMLElement>('[data-story-controller]');
      return (
        controller?.dataset.speed === '2' &&
        new URLSearchParams(window.location.search).get('speed') === '2'
      );
    });

    const two = await readStory(page);
    expect(two.speed).toBe(2);
    expect(two.params.speed).toBe(2);

    // The clock stays at 1× so the engine multiplier is applied exactly once:
    // simulated time grows at roughly one second per second, not two.
    await page.getByTestId('stage-replay').click();
    const start = (await readStory(page)).simTime;
    await page.waitForTimeout(750);
    const end = (await readStory(page)).simTime;
    const delta = end - start;
    expect(delta).toBeGreaterThan(0.35);
    expect(delta).toBeLessThan(1.3);

    // Changing speed does not restart the run.
    const beforeChange = (await readStory(page)).simTime;
    await speedSelect.selectOption('4');
    await page.waitForFunction(
      () => new URLSearchParams(window.location.search).get('speed') === '4',
    );
    expect((await readStory(page)).simTime).toBeGreaterThanOrEqual(beforeChange);

    // The URL is the run's starting state: a reload restores the speed and the
    // chapter fragment without double-applying anything.
    await page.goto(`${STORY}?speed=4#emergence`);
    await waitForRuntime(page);
    const restored = await readStory(page);
    expect(restored.speed).toBe(4);
    expect(restored.params.speed).toBe(4);
    expect(restored.activeChapter).toBe('emergence');
    expect(restored.activeScene).toBe('emergence');
    await expect(page.getByTestId('stage-speed')).toHaveValue('4');
    expect(await page.evaluate(() => window.location.search)).toBe('?speed=4');
    expect(await page.evaluate(() => window.location.hash)).toBe('#emergence');

    expect(errors).toEqual([]);
  });

  test('article mode removes the stage and keeps all ten chapters readable', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(STORY);
    await waitForRuntime(page);

    await page.getByTestId('article-mode-toggle').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
        'true',
    );

    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);

    const chapters = page.locator('[data-story-chapter]');
    await expect(chapters).toHaveCount(10);
    for (let index = 0; index < CHAPTERS.length; index += 1) {
      await expect(chapters.nth(index)).toBeVisible();
      await expect(chapters.nth(index).locator('.story-chapter__title')).toHaveText(
        CHAPTERS[index]?.title ?? '',
      );
    }

    await page.getByTestId('article-mode-toggle').click();
    await waitForRuntime(page);
    const restored = await readStory(page);
    expect(restored.stageCount).toBe(1);
    expect(restored.canvasCount).toBe(1);

    expect(errors).toEqual([]);
  });
});

test.describe('ACO story route without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('serves the complete article with ten chapters, the rail, and no empty stage', async ({
    page,
  }) => {
    const response = await page.goto(STORY);
    expect(response?.status()).toBe(200);

    await expect(page.locator('[data-story-controller]')).toHaveCount(1);
    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('[data-controls-panel]')).toHaveCount(0);
    await expect(page.locator('[data-metrics]')).toHaveCount(0);
    await expect(page.getByTestId('article-mode-toggle')).toHaveCount(0);
    await expect(page.locator('[data-story-controller]')).not.toHaveAttribute(
      'data-story-enhanced',
    );

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'The Colony That Finds a Short Route',
    );
    await expect(page.getByText('What you will learn')).toBeVisible();
    await expect(page.getByText('Before you start')).toBeVisible();

    const chapters = page.locator('[data-story-chapter]');
    await expect(chapters).toHaveCount(10);
    for (let index = 0; index < CHAPTERS.length; index += 1) {
      const chapter = chapters.nth(index);
      await expect(chapter).toBeVisible();
      await expect(chapter.locator('.story-chapter__title')).toHaveText(
        CHAPTERS[index]?.title ?? '',
      );
      await expect(chapter.locator('.story-chapter__prose p').first()).toBeVisible();
    }

    const rail = page.getByRole('navigation', { name: 'Chapters' });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole('link')).toHaveCount(10);
    await expect(rail.getByRole('link', { name: /Emergence/ })).toHaveAttribute(
      'href',
      '#emergence',
    );
  });
});
