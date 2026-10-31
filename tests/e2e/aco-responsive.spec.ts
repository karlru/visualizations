import { expect, type Page, test } from '@playwright/test';

/**
 * ACO responsive and touch gate for Step 3.6.
 *
 * The matrix covers every supported width (FR-RESP-01/02) and checks that the
 * stage, chrome, and controls stay inside the viewport. The 360 px block goes
 * further: it verifies the lab, chart/fan, pseudocode panel, formulas, and map
 * handles remain reachable at the documented mobile width. The touch block
 * proves vertical page scroll stays native while Edit map mode is off and that
 * a city drag under Edit map mode does not move the page.
 */

const STORY = '/stories/ant-colony-optimization';
const LAB = `${STORY}#the-lab`;

const WIDTHS = [
  { width: 320, height: 720 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

interface LayoutSnapshot {
  readonly documentOverflow: number;
  readonly bodyOverflow: number;
  readonly stageLeft: number;
  readonly stageRight: number;
  readonly stageWidth: number;
  readonly stageBottom: number;
  readonly stageTop: number;
  readonly columnLeft: number;
  readonly chapterTop: number;
  readonly widestOverflow: readonly { tag: string; className: string; right: number }[];
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

async function scrollToLab(page: Page): Promise<void> {
  const target = await page.evaluate(() => {
    const element = document.getElementById('the-lab');
    if (!element) throw new Error('Missing the-lab chapter');
    const top = element.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + 40;
    const clamped = Math.max(0, top);
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, clamped);
    html.style.scrollBehavior = previous;
    return clamped;
  });
  await page.waitForFunction((top) => Math.abs(window.scrollY - top) <= 2, target);
}

async function readLayout(page: Page): Promise<LayoutSnapshot> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const column = document.querySelector<HTMLElement>('.story-layout__column');
    const chapter = document.querySelector<HTMLElement>('[data-story-chapter]');
    if (!stage || !column || !chapter) throw new Error('Missing story layout');
    const stageRect = stage.getBoundingClientRect();
    const columnRect = column.getBoundingClientRect();
    const chapterRect = chapter.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const widest = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className.toString().slice(0, 80),
        right: element.getBoundingClientRect().right,
      }))
      .filter((entry) => entry.right > viewport + 1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 6);

    return {
      documentOverflow: document.documentElement.scrollWidth - viewport,
      bodyOverflow: document.body.scrollWidth - viewport,
      stageLeft: stageRect.left,
      stageRight: stageRect.right,
      stageWidth: stageRect.width,
      stageTop: stageRect.top,
      stageBottom: stageRect.bottom,
      columnLeft: columnRect.left,
      chapterTop: chapterRect.top,
      widestOverflow: widest,
    };
  });
}

test.describe('ACO responsive matrix', () => {
  for (const viewport of WIDTHS) {
    test(`fits the story and stage at ${viewport.width} px`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize(viewport);
      await page.goto(STORY);
      await waitForRuntime(page);

      const layout = await readLayout(page);
      expect(
        layout.documentOverflow,
        JSON.stringify(layout.widestOverflow, null, 2),
      ).toBeLessThanOrEqual(0);
      expect(layout.bodyOverflow).toBeLessThanOrEqual(0);
      expect(layout.stageWidth).toBeGreaterThan(120);
      expect(layout.stageLeft).toBeGreaterThanOrEqual(-0.5);
      expect(layout.stageRight).toBeLessThanOrEqual(viewport.width + 0.5);

      // The stage and prose are siblings, never overlapping at the settled
      // initial scroll position. Above the two-column breakpoint they sit side
      // by side; below it the stage reserves its own row above the column.
      if (viewport.width > 960) {
        expect(layout.stageRight).toBeLessThanOrEqual(layout.columnLeft + 0.5);
      } else {
        expect(layout.stageBottom).toBeLessThanOrEqual(layout.chapterTop + 0.5);
      }

      const chrome = page.getByTestId('stage-details');
      await expect(chrome).toBeVisible();
      const chromeBox = await chrome.boundingBox();
      if (chromeBox === null) throw new Error('Missing stage details control box');
      expect(chromeBox.x).toBeGreaterThanOrEqual(0);
      expect(chromeBox.x + chromeBox.width).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(chromeBox.height).toBeGreaterThanOrEqual(44);
      expect(errors).toEqual([]);
    });
  }

  test('keeps the stage, chrome, pseudocode, and formulas usable at 360 px', async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(STORY);
    await waitForRuntime(page);

    // Stage chrome controls meet the 44 px touch target and stay on screen.
    for (const testId of ['stage-play-pause', 'stage-replay', 'stage-details']) {
      const control = page.getByTestId(testId);
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      if (box === null) throw new Error(`Missing ${testId} box`);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360.5);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // The visible quality badge and the details-panel control are reachable.
    await expect(page.getByTestId('stage-quality')).toBeVisible();
    await page.getByTestId('stage-details').click();
    await expect(page.getByTestId('stage-quality-select')).toBeVisible();
    await page.getByTestId('stage-details').click();

    // Pseudocode and formulas stay inside their own containers.
    await expect(page.locator('[data-pseudocode-panel]')).toBeVisible();
    await expect(page.locator('.katex-display')).toHaveCount(3);
    const surfaces = await page.evaluate(() => {
      const pre = document.querySelector<HTMLElement>(
        '[data-pseudocode-panel] pre[data-pseudocode]',
      );
      const formulas = Array.from(document.querySelectorAll<HTMLElement>('.formula-math__display'));
      if (!pre) throw new Error('Missing stage pseudocode');
      return {
        preRight: pre.getBoundingClientRect().right,
        formulaRights: formulas.map((formula) => formula.getBoundingClientRect().right),
      };
    });
    expect(surfaces.preRight).toBeLessThanOrEqual(360);
    for (const right of surfaces.formulaRights) expect(right).toBeLessThanOrEqual(360);
    expect(errors).toEqual([]);
  });

  test('keeps the lab, chart, fan, camera, and map handles usable at 360 px', async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(LAB);
    await waitForRuntime(page);
    await waitForLab(page);
    await scrollToLab(page);

    await expect(page.locator('[data-aco-lab]')).toBeVisible();
    await expect(page.getByTestId('aco-lab-convergence')).toBeVisible();
    await expect(page.getByTestId('aco-lab-probability-fan')).toBeVisible();
    await expect(page.getByTestId('aco-camera-overview')).toBeVisible();
    await expect(page.getByTestId('aco-map-add')).toBeVisible();

    const labLayout = await page.evaluate(() => {
      const lab = document.querySelector<HTMLElement>('[data-aco-lab]');
      if (!lab) throw new Error('Missing lab panel');
      return {
        right: lab.getBoundingClientRect().right,
        width: lab.getBoundingClientRect().width,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        bodyOverflow: document.body.scrollWidth - window.innerWidth,
        chartRight: document
          .querySelector<HTMLElement>('[data-testid="aco-lab-convergence"]')
          ?.getBoundingClientRect().right,
        fanRight: document
          .querySelector<HTMLElement>('[data-testid="aco-lab-probability-fan"]')
          ?.getBoundingClientRect().right,
      };
    });
    expect(labLayout.right).toBeLessThanOrEqual(360);
    expect(labLayout.width).toBeGreaterThan(200);
    expect(labLayout.documentOverflow).toBeLessThanOrEqual(0);
    expect(labLayout.bodyOverflow).toBeLessThanOrEqual(0);
    expect(labLayout.chartRight ?? Infinity).toBeLessThanOrEqual(360);
    expect(labLayout.fanRight ?? Infinity).toBeLessThanOrEqual(360);

    // Edit map mode makes handles reachable without overlapping target-size
    // violations; the map editor itself was already reachable above.
    await page.locator('#aco-map-edit').check({ force: true });
    await page.waitForFunction(() => document.querySelectorAll('[data-city-handle]').length >= 2);
    const handleBox = await page.locator('[data-city-handle]').first().boundingBox();
    if (handleBox === null) throw new Error('Missing city handle');
    expect(handleBox.width).toBeGreaterThanOrEqual(43.9);
    expect(handleBox.height).toBeGreaterThanOrEqual(43.9);
    expect(handleBox.x).toBeGreaterThanOrEqual(0);
    expect(handleBox.x + handleBox.width).toBeLessThanOrEqual(360.5);
    expect(errors).toEqual([]);
  });
});

test.describe('ACO quality tiers', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('quality changes take effect without a reload and preserve the run', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY}?seed=42&speed=4#the-lab`);
    await waitForRuntime(page);
    await waitForLab(page);
    await scrollToLab(page);
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.pauseReason ===
        'running',
    );
    const startedPaused = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
    );
    if (startedPaused) {
      await page.getByTestId('stage-play-pause').click();
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused ===
          'false',
      );
    }
    await page.waitForFunction(
      () => Number(document.querySelector('[data-metric="iteration"]')?.textContent ?? '0') > 0,
    );

    // Freeze the simulation so iteration state is directly comparable.
    const paused = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
    );
    if (!paused) {
      await page.getByTestId('stage-play-pause').click();
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
      );
    }

    const readQuality = () =>
      page.evaluate(() => {
        const controller = document.querySelector<HTMLElement>('[data-story-controller]');
        const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
        const cssWidth = canvas?.getBoundingClientRect().width ?? 0;
        return {
          quality: controller?.dataset.quality ?? 'unknown',
          detected: controller?.dataset.qualityDetected ?? 'unknown',
          reduced: controller?.dataset.qualityReduced === 'true',
          dpr: canvas && cssWidth > 0 ? canvas.width / cssWidth : 0,
          iteration: Number(
            document.querySelector('[data-metric="iteration"]')?.textContent?.trim() ?? '0',
          ),
        };
      });

    const before = await readQuality();
    await page.evaluate(() => {
      (window as unknown as { __qualityNoReload?: boolean }).__qualityNoReload = true;
    });

    await page.getByTestId('stage-details').click();
    // An explicit choice wins over detection and is applied in place.
    await page.getByTestId('stage-quality-select').selectOption('high');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.quality === 'high',
    );
    const highBefore = await readQuality();
    expect(highBefore.dpr).toBeGreaterThan(1.9);
    expect(highBefore.iteration).toBe(before.iteration);

    await page.getByTestId('stage-quality-select').selectOption('low');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.quality === 'low',
    );

    const low = await readQuality();
    expect(low.dpr).toBeLessThanOrEqual(1.05);
    expect(low.iteration).toBe(before.iteration);
    expect(low.reduced).toBe(false); // the reader chose low; the workload is not the cause
    expect(
      await page.evaluate(
        () => (window as unknown as { __qualityNoReload?: boolean }).__qualityNoReload === true,
      ),
    ).toBe(true);

    // A higher explicit tier raises presentation cost again without a reload.
    await page.getByTestId('stage-quality-select').selectOption('high');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.quality === 'high',
    );
    const high = await readQuality();
    expect(high.dpr).toBeGreaterThan(1.9);
    expect(high.iteration).toBe(before.iteration);
    expect(errors).toEqual([]);
  });

  test('the 150 × 200 workload caps an explicit high choice to low', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${STORY}?seed=42&cities=150&ants=200&speed=4#the-lab`);
    await waitForRuntime(page);
    await waitForLab(page);

    const readQuality = () =>
      page.evaluate(() => {
        const controller = document.querySelector<HTMLElement>('[data-story-controller]');
        const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
        const cssWidth = canvas?.getBoundingClientRect().width ?? 0;
        return {
          quality: controller?.dataset.quality ?? 'unknown',
          reduced: controller?.dataset.qualityReduced === 'true',
          dpr: canvas && cssWidth > 0 ? canvas.width / cssWidth : 0,
        };
      });

    // Auto resolves to low from the workload, and the notice explains why.
    expect((await readQuality()).quality).toBe('low');
    expect((await readQuality()).reduced).toBe(true);
    await expect(page.getByTestId('stage-quality-notice')).toBeVisible();

    // Choosing High cannot bypass the presentation budget: the cap applies to
    // an explicit choice too, and the page is not reloaded.
    await page.evaluate(() => {
      (window as unknown as { __qualityNoReload?: boolean }).__qualityNoReload = true;
    });
    await page.getByTestId('stage-details').click();
    await page.getByTestId('stage-quality-select').selectOption('high');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset
          .qualityPreference === 'high',
    );
    const capped = await readQuality();
    expect(capped.quality).toBe('low');
    expect(capped.reduced).toBe(true);
    expect(capped.dpr).toBeLessThanOrEqual(1.05);
    expect(
      await page.evaluate(
        () => (window as unknown as { __qualityNoReload?: boolean }).__qualityNoReload === true,
      ),
    ).toBe(true);
    await expect(page.getByTestId('stage-quality-notice')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('ACO touch behavior', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('vertical page scroll stays native with Edit map mode off', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(STORY);
    await waitForRuntime(page);

    // Swipe vertically from the canvas while edit mode is off.
    const canvasBox = await page.locator('[data-stage-canvas]').boundingBox();
    if (canvasBox === null) throw new Error('Missing canvas box');
    const startX = canvasBox.x + canvasBox.width / 2;
    const startY = canvasBox.y + canvasBox.height / 2;

    const before = await page.evaluate(() => window.scrollY);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY }],
    });
    for (let step = 1; step <= 8; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX, y: startY - step * 28 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction((start) => window.scrollY > start + 40, before);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 40);
    expect(errors).toEqual([]);
  });

  test('a captured city drag does not move the page and zoom still works', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForRuntime(page);
    await waitForLab(page);
    await scrollToLab(page);
    await page.locator('#aco-map-edit').check({ force: true });
    await page.waitForFunction(() => document.querySelectorAll('[data-city-handle]').length >= 2);

    const client = await page.context().newCDPSession(page);
    const handle = page.locator('[data-city-handle]').first();
    const box = await handle.boundingBox();
    if (box === null) throw new Error('Missing city handle box');
    const dragX = box.x + box.width / 2;
    const dragY = box.y + box.height / 2;
    const scrollBeforeDrag = await page.evaluate(() => window.scrollY);
    const cityBefore = await handle.getAttribute('data-city-x');

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: dragX, y: dragY }],
    });
    for (let step = 1; step <= 6; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: dragX + step * 7, y: dragY - step * 5 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapCustom ===
        'true',
    );
    expect(await handle.getAttribute('data-city-x')).not.toBe(cityBefore);
    const scrollAfterDrag = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfterDrag - scrollBeforeDrag)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('aco-map-notice')).toContainText('local');

    // Single-pointer zoom still works after a touch drag.
    const zoomBefore = Number(
      await page.locator('[data-stage-canvas]').getAttribute('data-camera-zoom'),
    );
    await page.getByTestId('aco-camera-zoom-in').click();
    const zoomAfter = Number(
      await page.locator('[data-stage-canvas]').getAttribute('data-camera-zoom'),
    );
    expect(zoomAfter).toBeGreaterThan(zoomBefore);
    expect(errors).toEqual([]);
  });
});
