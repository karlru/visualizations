import { expect, type Page, test } from '@playwright/test';
import type { StoryRuntimeEntryState } from '../../src/components/story/story-runtime-debug';

const STORY = '/stories/ant-colony-optimization';

const CHAPTERS = [
  { id: 'the-problem', title: 'Five cities, one round trip', scene: 'five-cities' },
  { id: 'try-every-tour', title: 'Try every tour', scene: 'enumerate-tours' },
  { id: 'too-many-tours', title: 'Too many tours', scene: 'factorial-wall' },
  { id: 'one-ants-choice', title: 'One ant, alone', scene: 'one-ant' },
  { id: 'leaving-a-trace', title: 'Leaving a trail', scene: 'deposit' },
  { id: 'forgetting', title: 'Trails fade', scene: 'evaporation' },
  { id: 'two-ants', title: 'A second ant', scene: 'two-ants' },
  { id: 'emergence', title: 'A few more ants', scene: 'colony' },
  {
    id: 'the-probability-rule',
    title: 'The rule behind the choice',
    scene: 'probability-rule',
  },
  { id: 'the-update-rule', title: 'The rule behind the trail', scene: 'update-rule' },
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
      window.__scrollDirector?.debugState().triggerCount === 13
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

/** Wait for fragment resolution to settle after hydration or reload. */
async function waitForChapter(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (chapterId) =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
      chapterId,
    id,
  );
}

test.describe('ACO story route', () => {
  test('renders one live stage, thirteen chapters, and a guided opening', async ({ page }) => {
    const errors = watchErrors(page);
    const response = await page.goto(STORY);

    expect(response?.status()).toBe(200);
    await waitForRuntime(page);

    const initial = await readStory(page);
    expect(initial.storyKey).toBe('ant-colony-optimization');
    expect(initial.chapterCount).toBe(13);
    expect(initial.stageCount).toBe(1);
    expect(initial.canvasCount).toBe(1);
    expect(initial.railLinks).toBe(13);
    expect(initial.railActive).toBe('the-problem');
    expect(initial.activeChapter).toBe('the-problem');
    expect(initial.activeScene).toBe('five-cities');
    expect(initial.activeTitle).toBe('Five cities, one round trip');
    expect(initial.triggerCount).toBe(13);
    expect(initial.layers).toContain('graph');
    expect(initial.layers).toContain('lesson-tour');
    expect(initial.layers).not.toContain('pheromone');
    expect(initial.entry?.chapter).toBe('the-problem');
    expect(initial.entry?.scene).toBe('five-cities');
    expect(initial.entry?.seed).toBe(42);
    expect(initial.entry?.structural).toEqual({
      cityCount: 5,
      antCount: 1,
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
      13,
    );

    // The real renderer mounted: DOM labels and the lesson caption exist.
    expect(await page.locator('.story-label').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-lesson-overlay]')).toBeVisible();
    await expect(page.locator('[data-lesson-overlay]')).toHaveAttribute(
      'data-lesson-chapter',
      'the-problem',
    );

    // The guided opening has no simulation controls, metrics, or pseudocode.
    await expect(page.locator('[data-stage-chrome]')).toHaveAttribute('data-mode', 'none');
    await expect(page.getByTestId('stage-play-pause')).toHaveCount(0);
    await expect(page.locator('[data-metric]')).toHaveCount(0);
    await expect(page.locator('[data-pseudocode-panel]')).toHaveCount(0);
    await expect(page.locator('[data-controls-panel]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('deep links activate the named chapter and scene and survive reload', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto(`${STORY}#emergence`);
    await waitForRuntime(page);
    await waitForChapter(page, 'emergence');

    const deepLinked = await readStory(page);
    expect(deepLinked.activeChapter).toBe('emergence');
    expect(deepLinked.activeScene).toBe('colony');
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
    await waitForChapter(page, 'emergence');
    const reloaded = await readStory(page);
    expect(reloaded.activeChapter).toBe('emergence');
    expect(reloaded.activeScene).toBe('colony');
    expect(reloaded.entry?.chapter).toBe('emergence');

    // Scrolling to another chapter updates the rail and the active scene.
    await scrollToChapter(page, 'the-probability-rule');
    const scrolled = await readStory(page);
    expect(scrolled.activeChapter).toBe('the-probability-rule');
    expect(scrolled.activeScene).toBe('probability-rule');
    expect(scrolled.railActive).toBe('the-probability-rule');

    expect(errors).toEqual([]);
  });

  test('the lab speed control writes the engine parameter once and round-trips the URL', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY}#the-lab`);
    await waitForRuntime(page);
    await waitForChapter(page, 'the-lab');

    // The stage speed control is only present in the full lab chrome.
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
    await page.getByTestId('aco-lab-play').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'false',
    );
    const start = (await readStory(page)).simTime;
    await page.waitForTimeout(750);
    const end = (await readStory(page)).simTime;
    const delta = end - start;
    expect(delta).toBeGreaterThan(0.35);
    expect(delta).toBeLessThan(1.3);

    // Changing speed does not restart the run. Dispatch the change without
    // scrolling the page; the stage speed select is sticky above the lab.
    const beforeChange = (await readStory(page)).simTime;
    await speedSelect.evaluate((element) => {
      const select = element as HTMLSelectElement;
      select.value = '4';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(
      () => new URLSearchParams(window.location.search).get('speed') === '4',
    );
    expect((await readStory(page)).simTime).toBeGreaterThanOrEqual(beforeChange);

    // The URL is the run's starting state: a reload restores the speed and the
    // chapter fragment without double-applying anything.
    await page.goto(`${STORY}?speed=4#the-lab`);
    await waitForRuntime(page);
    await waitForChapter(page, 'the-lab');
    const restored = await readStory(page);
    expect(restored.speed).toBe(4);
    expect(restored.params.speed).toBe(4);
    expect(restored.activeChapter).toBe('the-lab');
    expect(restored.activeScene).toBe('lab');
    await expect(page.getByTestId('stage-speed')).toHaveValue('4');
    expect(await page.evaluate(() => window.location.search)).toBe('?speed=4');
    expect(await page.evaluate(() => window.location.hash)).toBe('#the-lab');

    expect(errors).toEqual([]);
  });

  test('build-time math and the pseudocode panel follow the formal chapters', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(STORY);
    await waitForRuntime(page);

    // The guided opening has no pseudocode panel.
    await expect(page.locator('[data-pseudocode-panel]')).toHaveCount(0);

    // The article carries three display formulas, each rendered by KaTeX during
    // the build with a MathML copy for assistive technology.
    await expect(page.locator('.katex-display')).toHaveCount(3);
    expect(await page.locator('.katex').count()).toBeGreaterThanOrEqual(3);
    expect(await page.locator('math').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('#formula-transition')).toBeVisible();
    await expect(page.locator('#formula-deposit')).toBeVisible();
    await expect(page.locator('#formula-update')).toBeVisible();

    await scrollToChapter(page, 'the-probability-rule');
    await waitForChapter(page, 'the-probability-rule');
    const panel = page.locator('[data-pseudocode-panel]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('h2')).toHaveText('The algorithm');
    await expect(panel.locator('pre[data-pseudocode]')).toHaveCount(1);
    await expect(panel.locator('pre[data-pseudocode]')).toHaveAttribute(
      'aria-label',
      'Ant System pseudocode',
    );

    // Chapter 09 introduces line 4. Exactly one line carries
    // `aria-current="step"` — the chapter drives the highlight, not progress.
    await expect(panel.locator('[data-line="4"][aria-current="step"]')).toHaveCount(1);
    await expect(panel.locator('[data-line][data-active]')).toHaveCount(1);

    await scrollToChapter(page, 'the-update-rule');
    await waitForChapter(page, 'the-update-rule');
    await expect(panel.locator('[data-line="6"][aria-current="step"]')).toHaveCount(1);
    await expect(panel.locator('[data-line="4"][aria-current="step"]')).toHaveCount(0);
    await expect(panel.locator('[data-line][data-active]')).toHaveCount(1);

    // Scrolling back into the guided opening hides the panel again.
    await scrollToChapter(page, 'leaving-a-trace');
    await waitForChapter(page, 'leaving-a-trace');
    await expect(panel).toHaveCount(0);

    // The stage panel also stays inside the page at 320 px.
    await scrollToChapter(page, 'the-probability-rule');
    await waitForChapter(page, 'the-probability-rule');
    await page.setViewportSize({ width: 320, height: 720 });
    await page.waitForFunction(() => document.documentElement.clientWidth === 320);
    await expect(panel).toBeVisible();
    const stageOverflow = await page.evaluate(() => {
      const pre = document.querySelector<HTMLElement>(
        '[data-pseudocode-panel] pre[data-pseudocode]',
      );
      if (!pre) throw new Error('Missing stage pseudocode');
      return {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
        preRight: pre.getBoundingClientRect().right,
      };
    });
    expect(stageOverflow.document).toBeLessThanOrEqual(0);
    expect(stageOverflow.body).toBeLessThanOrEqual(0);
    expect(stageOverflow.preRight).toBeLessThanOrEqual(320);

    // The article copy and the panel must not share ids.
    const duplicateIds = await page.evaluate(() => {
      const ids = Array.from(
        document.querySelectorAll<HTMLElement>('[id]'),
        (element) => element.id,
      );
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(duplicateIds).toEqual([]);

    expect(errors).toEqual([]);
  });

  test('math and pseudocode stay readable in article mode at 320 px', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(STORY);
    await waitForRuntime(page);

    await page.getByTestId('article-mode-toggle').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
        'true',
    );

    // The stage panel is gone; the article listing and every formula remain.
    await expect(page.locator('[data-pseudocode-panel]')).toHaveCount(0);
    const articleListing = page.locator('pre[data-pseudocode]');
    await expect(articleListing).toBeVisible();
    await expect(page.locator('.katex-display')).toHaveCount(3);
    expect(
      await page.locator('pre[data-pseudocode] span[style*="pseudocode-keyword"]').count(),
    ).toBeGreaterThan(0);

    await page.setViewportSize({ width: 320, height: 720 });
    await page.waitForFunction(() => document.documentElement.clientWidth === 320);

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);

    // Long content scrolls inside its own container instead of widening the page.
    const surfaces = await page.evaluate(() => {
      const pre = document.querySelector<HTMLElement>('pre[data-pseudocode]');
      const math = document.querySelector<HTMLElement>(
        '#formula-transition .formula-math__display',
      );
      if (!pre || !math) throw new Error('Missing pseudocode or formula surface');
      return {
        preClient: pre.clientWidth,
        preScroll: pre.scrollWidth,
        mathClient: math.clientWidth,
        mathScroll: math.scrollWidth,
        preRight: pre.getBoundingClientRect().right,
        mathRight: math.getBoundingClientRect().right,
      };
    });
    expect(surfaces.preRight).toBeLessThanOrEqual(320);
    expect(surfaces.mathRight).toBeLessThanOrEqual(320);
    expect(surfaces.preScroll).toBeGreaterThan(surfaces.preClient);
    expect(surfaces.mathScroll).toBeGreaterThan(surfaces.mathClient);

    expect(errors).toEqual([]);
  });

  test('article mode removes the stage and keeps all thirteen chapters readable', async ({
    page,
  }) => {
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
    await expect(chapters).toHaveCount(13);
    for (let index = 0; index < CHAPTERS.length; index += 1) {
      await expect(chapters.nth(index)).toBeVisible();
      await expect(chapters.nth(index).locator('.story-chapter__title')).toHaveText(
        CHAPTERS[index]?.title ?? '',
      );
    }

    // Article mode carries the static figure, the glossary, and the citations,
    // not just the chapter prose.
    const figure = page.locator('figure[data-figure="aco-best-tour"]');
    await expect(figure).toBeVisible();
    await expect(figure.locator('svg')).toBeVisible();
    await expect(figure.locator('figcaption')).toContainText('4.91');
    await expect(page.getByRole('heading', { name: 'Glossary' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'References and further reading' }),
    ).toBeVisible();
    expect(await page.locator('#references a[href^="https://"]').count()).toBeGreaterThanOrEqual(3);

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

  test('serves the complete article with thirteen chapters, the rail, and no empty stage', async ({
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

    // The article carries build-time math and the full highlighted listing; the
    // stage-only pseudocode panel is absent.
    await expect(page.locator('[data-pseudocode-panel]')).toHaveCount(0);
    await expect(page.locator('.katex-display')).toHaveCount(3);
    expect(await page.locator('math').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('pre[data-pseudocode]')).toBeVisible();
    await expect(
      page.locator('pre[data-pseudocode] [data-line="4"][aria-current="step"]'),
    ).toHaveCount(1);
    expect(
      await page.locator('pre[data-pseudocode] span[style*="pseudocode-keyword"]').count(),
    ).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'The Colony That Finds a Short Route',
    );
    await expect(page.getByText('What you will learn')).toBeVisible();
    await expect(page.getByText('Before you start')).toBeVisible();

    const chapters = page.locator('[data-story-chapter]');
    await expect(chapters).toHaveCount(13);
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
    await expect(rail.getByRole('link')).toHaveCount(13);
    await expect(rail.getByRole('link', { name: /A few more ants/ })).toHaveAttribute(
      'href',
      '#emergence',
    );
  });

  test('reveals a prediction and carries the figure, glossary, and citations', async ({ page }) => {
    await page.goto(STORY);

    // Native <details>/<summary>, no client script: clicking the summary opens
    // the answer.
    const predict = page.locator('details[data-predict]').first();
    await expect(predict).toBeVisible();
    expect(await predict.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(false);
    await expect(predict.locator('[data-predict-answer]')).not.toBeVisible();
    await predict.locator('summary').click();
    expect(await predict.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(true);
    await expect(predict.locator('[data-predict-answer]')).toBeVisible();
    await expect(predict.locator('[data-predict-answer]')).toContainText('random');

    // The best-tour figure is inline SVG in the server-rendered article.
    const figure = page.locator('figure[data-figure="aco-best-tour"]');
    await expect(figure).toBeVisible();
    await expect(figure.locator('svg')).toBeVisible();
    await expect(figure.locator('figcaption')).toContainText('4.91');
    await expect(figure.locator('figcaption')).toContainText('dashed');
    await expect(figure.locator('figcaption')).toContainText('square');

    // Both explicit failure-mode sections are real headings.
    await expect(page.getByRole('heading', { name: 'Limitations', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Applications', level: 3 })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Glossary' })).toBeVisible();
    await expect(page.locator('#glossary dl dt')).toHaveCount(13);

    await expect(
      page.getByRole('heading', { name: 'References and further reading' }),
    ).toBeVisible();
    const citations = page.locator('#references a[href^="https://"]');
    expect(await citations.count()).toBeGreaterThanOrEqual(3);
    for (let index = 0; index < (await citations.count()); index += 1) {
      const rel = await citations.nth(index).getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });
});
