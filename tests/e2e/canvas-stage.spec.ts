import { expect, type Page, test } from '@playwright/test';

const HARNESS = '/dev/canvas-smoke';

interface StageSnapshot {
  readonly stageCount: number;
  readonly canvasCount: number;
  readonly status: string | null;
  readonly frames: number;
  readonly paused: string | null;
  readonly pauseReason: string | null;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly canvasRectWidth: number;
  readonly canvasRectHeight: number;
  readonly dpr: number;
  readonly deviceDpr: number;
  readonly labels: number;
  readonly labelText: string[];
  readonly live: number;
  readonly mounts: number;
  readonly touchAction: string;
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
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    return (
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0
    );
  });
}

async function readStage(page: Page): Promise<StageSnapshot> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    if (!stage) throw new Error('Missing stage');
    const host = stage.querySelector<HTMLElement>('.stage__surface');
    const canvas = stage.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    if (!host || !canvas) throw new Error('Missing stage surface');
    const hostRect = host.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const stageWindow = window as Window & {
      __storyStageMounts?: number;
      __storyStageLive?: number;
    };
    const labels = Array.from(
      stage.querySelectorAll<HTMLElement>('[data-label-id]'),
      (element) => element.textContent ?? '',
    );

    return {
      stageCount: document.querySelectorAll('[data-story-stage]').length,
      canvasCount: document.querySelectorAll('canvas[data-stage-canvas]').length,
      status: stage.dataset.stageStatus ?? null,
      frames: Number(stage.dataset.frames ?? 0),
      paused: stage.dataset.paused ?? null,
      pauseReason: stage.dataset.pauseReason ?? null,
      cssWidth: Number(canvas.dataset.cssWidth ?? 0),
      cssHeight: Number(canvas.dataset.cssHeight ?? 0),
      hostWidth: hostRect.width,
      hostHeight: hostRect.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasRectWidth: canvasRect.width,
      canvasRectHeight: canvasRect.height,
      dpr: Number(canvas.dataset.dpr ?? 0),
      deviceDpr: window.devicePixelRatio,
      labels: labels.length,
      labelText: labels,
      live: stageWindow.__storyStageLive ?? 0,
      mounts: stageWindow.__storyStageMounts ?? 0,
      touchAction: getComputedStyle(canvas).touchAction,
    };
  });
}

async function pausedFrames(
  page: Page,
  duration = 450,
): Promise<{ before: number; after: number }> {
  const before = (await readStage(page)).frames;
  await page.waitForTimeout(duration);
  const after = (await readStage(page)).frames;
  return { before, after };
}

/** Frame counter only; safe after the renderer has removed its canvas. */
async function readFrames(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number(document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.frames ?? 0),
  );
}

/** Scroll immediately even though the site's CSS enables smooth scrolling. */
async function scrollToInstant(page: Page, top: number): Promise<void> {
  await page.evaluate((target) => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, target);
    root.style.scrollBehavior = previous;
  }, top);
  await page.waitForFunction((target) => Math.abs(window.scrollY - target) <= 1, top);
}

test.describe('StoryStage and Canvas2DRenderer', () => {
  test('hydrates without SSR or console errors and creates one canvas with DOM labels', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    const stage = await readStage(page);
    expect(stage.stageCount).toBe(1);
    expect(stage.canvasCount).toBe(1);
    expect(stage.status).toBe('ready');
    expect(stage.mounts).toBe(1);
    expect(stage.live).toBe(1);
    expect(stage.labels).toBeGreaterThanOrEqual(4);
    expect(stage.labelText.join(' ')).toContain('focal city');
    expect(stage.labelText.join(' ')).toContain('DOM label');

    // The canvas is decorative; the label layer carries selectable text.
    const canvasAria = await page.evaluate(
      () =>
        document.querySelector('canvas[data-stage-canvas]')?.getAttribute('aria-hidden') ?? null,
    );
    expect(canvasAria).toBe('true');

    expect(errors).toEqual([]);
  });

  test('fills the stage without distortion and matches CSS size × DPR', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    const stage = await readStage(page);
    const expectedDpr = Math.min(Math.max(1, stage.deviceDpr), 2);

    expect(stage.canvasRectWidth).toBeCloseTo(stage.hostWidth, 1);
    expect(stage.canvasRectHeight).toBeCloseTo(stage.hostHeight, 1);
    expect(stage.dpr).toBeCloseTo(expectedDpr, 5);
    expect(stage.canvasWidth).toBe(Math.round(stage.cssWidth * stage.dpr));
    expect(stage.canvasHeight).toBe(Math.round(stage.cssHeight * stage.dpr));

    const cssRatio = stage.canvasRectWidth / stage.canvasRectHeight;
    const backingRatio = stage.canvasWidth / stage.canvasHeight;
    expect(Math.abs(cssRatio - backingRatio)).toBeLessThan(0.002);
    expect(stage.touchAction).toBe('pan-y');
    expect(stage.paused).toBe('false');

    expect(errors).toEqual([]);
  });

  test('caps the device pixel ratio at 2 on a high-density display', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 960, height: 720 },
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    const errors = watchErrors(page);

    await page.goto(HARNESS);
    await waitForStage(page);

    const stage = await readStage(page);
    expect(stage.deviceDpr).toBe(3);
    expect(stage.dpr).toBe(2);
    expect(stage.canvasWidth).toBe(Math.round(stage.cssWidth * 2));
    expect(stage.canvasHeight).toBe(Math.round(stage.cssHeight * 2));

    expect(errors).toEqual([]);
    await context.close();
  });

  test('resizing updates the backing store and redraws even while paused', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    await page.getByTestId('stage-pause').click();
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.paused === 'true',
    );

    const before = await readStage(page);
    await page.setViewportSize({ width: 1100, height: 720 });

    await page.waitForFunction(
      ({ width, frames }) => {
        const stage = document.querySelector<HTMLElement>('[data-story-stage]');
        const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
        return (
          canvas !== null &&
          canvas !== undefined &&
          canvas.width !== width &&
          Number(stage?.dataset.frames ?? 0) > frames
        );
      },
      { width: before.canvasWidth, frames: before.frames },
    );

    const after = await readStage(page);
    expect(after.canvasRectWidth).toBeCloseTo(after.hostWidth, 1);
    expect(after.canvasWidth).toBe(Math.round(after.cssWidth * after.dpr));
    expect(after.canvasWidth).not.toBe(before.canvasWidth);
    expect(after.frames).toBeGreaterThan(before.frames);
    expect(after.paused).toBe('true');

    await page.getByTestId('stage-pause').click();
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.paused === 'false',
    );
    const resumed = await pausedFrames(page, 300);
    expect(resumed.after).toBeGreaterThan(resumed.before);

    expect(errors).toEqual([]);
  });

  test('a visualViewport resize re-measures the stage without changing its size', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    // iOS Safari reports toolbar/keyboard changes on visualViewport. The stage
    // must re-measure and redraw even when window.innerWidth is unchanged.
    const before = await readStage(page);
    await page.evaluate(() => {
      window.visualViewport?.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction((frames) => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      return Number(stage?.dataset.frames ?? 0) > frames;
    }, before.frames);

    const after = await readStage(page);
    expect(after.canvasWidth).toBe(Math.round(after.cssWidth * after.dpr));
    expect(after.canvasHeight).toBe(Math.round(after.cssHeight * after.dpr));
    expect(after.canvasRectWidth).toBeCloseTo(after.hostWidth, 1);
    expect(after.canvasRectHeight).toBeCloseTo(after.hostHeight, 1);
    expect(after.status).toBe('ready');

    expect(errors).toEqual([]);
  });

  test('pauses offscreen and resumes when the stage returns', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      return stage?.dataset.paused === 'true' && stage.dataset.pauseReason === 'offscreen';
    });

    const offscreen = await pausedFrames(page);
    expect(offscreen.after).toBe(offscreen.before);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.paused === 'false',
    );

    await page.waitForFunction((frames) => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      return Number(stage?.dataset.frames ?? 0) > frames;
    }, offscreen.after);
    expect((await readStage(page)).paused).toBe('false');

    expect(errors).toEqual([]);
  });

  test('pauses when the page becomes hidden and resumes when visible', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    // Headless Chromium cannot switch OS tabs. Drive the same document API the
    // browser uses; StoryStage must react to visibilitychange, not a mock event.
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
    const hidden = await pausedFrames(page);
    expect(hidden.after).toBe(hidden.before);

    await page.evaluate(() => {
      const testWindow = window as Window & {
        __setVisibilityState?: (value: DocumentVisibilityState) => void;
      };
      testWindow.__setVisibilityState?.('visible');
    });
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.paused === 'false',
    );
    await page.waitForFunction((frames) => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      return Number(stage?.dataset.frames ?? 0) > frames;
    }, hidden.after);

    expect(errors).toEqual([]);
  });

  test('coarse pointer keeps vertical scrolling native and orbits horizontally', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = watchErrors(page);

    await page.goto(HARNESS);
    await waitForStage(page);

    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    expect(coarse, 'the emulated context must expose a coarse pointer').toBe(true);

    // Park the stage fully inside the viewport so every touch point is real.
    const stageTop = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      if (!stage) throw new Error('Missing stage');
      return stage.getBoundingClientRect().top + window.scrollY - 96;
    });
    await scrollToInstant(page, stageTop);
    const baseline = await page.evaluate(() => window.scrollY);

    const rect = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
      if (!canvas) throw new Error('Missing canvas');
      const box = canvas.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(844);

    const client = await context.newCDPSession(page);
    const touch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      x: number,
      y: number,
    ): Promise<void> => {
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    };

    // Find a point where the canvas, not a DOM label or overlay button, is the
    // hit target. Labels and controls are real DOM by design, so a hard-coded
    // coordinate would be brittle.
    const point = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
      if (!canvas) throw new Error('Missing canvas');
      const box = canvas.getBoundingClientRect();
      const candidates: readonly (readonly [number, number])[] = [
        [0.18, 0.3],
        [0.3, 0.26],
        [0.45, 0.3],
        [0.25, 0.22],
        [0.6, 0.3],
      ];
      for (const [fx, fy] of candidates) {
        const x = box.x + box.width * fx;
        const y = box.y + box.height * fy;
        if (document.elementFromPoint(x, y) === canvas) return { x, y };
      }
      throw new Error('No clear canvas point for the touch gesture.');
    });

    // Vertical drag: finger moves down, the page scrolls up natively. The
    // renderer never calls preventDefault and the canvas is `touch-action: pan-y`.
    const bottom = rect.y + rect.height - 8;
    await touch('touchStart', point.x, point.y);
    for (let step = 1; step <= 10; step += 1) {
      const y = Math.min(bottom, point.y + step * 16);
      await touch('touchMove', point.x, y);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', point.x, Math.min(bottom, point.y + 160));

    await page.waitForFunction((start) => window.scrollY < start - 30, baseline);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(baseline - 30);

    await scrollToInstant(page, baseline);

    const rotationBefore = await page.evaluate(() =>
      Number(
        document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]')?.dataset
          .cameraRotation ?? 0,
      ),
    );

    // Horizontal drag: the browser has no horizontal pan to perform, so the
    // pointer stream reaches the renderer and rotates the camera.
    const endX = Math.min(rect.x + rect.width - 12, point.x + 200);
    await touch('touchStart', point.x, point.y);
    for (let step = 1; step <= 10; step += 1) {
      await touch('touchMove', point.x + ((endX - point.x) * step) / 10, point.y);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', endX, point.y);

    await page.waitForFunction((before) => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
      return Number(canvas?.dataset.cameraRotation ?? 0) !== before;
    }, rotationBefore);

    const result = await page.evaluate(() => ({
      rotation: Number(
        document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]')?.dataset
          .cameraRotation ?? 0,
      ),
      zoom: Number(
        document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]')?.dataset
          .cameraZoom ?? 0,
      ),
      scrollY: window.scrollY,
    }));
    expect(Math.abs(result.rotation - rotationBefore)).toBeGreaterThan(0.05);
    expect(Math.abs(result.scrollY - baseline)).toBeLessThan(8);

    // Zoom buttons are the single-pointer alternative to a pinch gesture.
    await page.getByTestId('stage-zoom-in').tap();
    await page.waitForFunction((before) => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
      return Number(canvas?.dataset.cameraZoom ?? 0) > before;
    }, result.zoom);

    expect(errors).toEqual([]);
    await context.close();
  });

  test('dispose removes observers, listeners, labels, and canvas; reloads stay clean', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    await page.evaluate(() => document.dispatchEvent(new Event('astro:before-swap')));
    await page.waitForFunction(
      () =>
        document.querySelectorAll('canvas[data-stage-canvas]').length === 0 &&
        document.querySelectorAll('[data-label-id]').length === 0,
    );

    const stoppedBefore = await readFrames(page);
    await page.waitForTimeout(450);
    const stoppedAfter = await readFrames(page);
    expect(stoppedAfter).toBe(stoppedBefore);
    expect(
      await page.evaluate(
        () => (window as Window & { __storyStageLive?: number }).__storyStageLive ?? 0,
      ),
    ).toBe(0);

    // A disconnected ResizeObserver must not resurrect the canvas or advance
    // frames when the viewport changes after teardown.
    const beforeResize = await readFrames(page);
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.waitForTimeout(300);
    expect(await readFrames(page)).toBe(beforeResize);
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(0);

    for (let iteration = 0; iteration < 10; iteration += 1) {
      await page.reload();
      await waitForStage(page);
      const stage = await readStage(page);
      expect(stage.canvasCount, `canvases at reload ${iteration + 1}`).toBe(1);
      expect(stage.stageCount, `stages at reload ${iteration + 1}`).toBe(1);
      expect(stage.live, `live instances at reload ${iteration + 1}`).toBe(1);
      expect(stage.mounts, `mount counter at reload ${iteration + 1}`).toBe(1);
      expect(stage.labels).toBeGreaterThanOrEqual(4);
      expect(stage.frames).toBeLessThan(600);
    }

    expect(errors).toEqual([]);
  });
});
