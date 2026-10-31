import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * ACO frame-time harness for Step 3.6 / FR-PERF-06/07/08/12 and FR-ACO-22.
 *
 * The workload is fixed: ten seconds at the lab, with the simulation running,
 * a small scroll oscillation every 250 ms (the stage stays sticky and chapters
 * keep reporting progress), and a camera zoom interaction every second.
 *
 * What is measured
 * ----------------
 * `requestAnimationFrame` is wrapped in an init script *before the page
 * loads*. Every callback's own execution time is recorded and grouped by the
 * rAF timestamp, so a frame's work is the sum of the app's callbacks for that
 * frame (simulation step plus canvas draw). This is the part the implementation
 * controls, and it is what the p95 budget asserts.
 *
 * The wall-clock interval between frames is also reported. It is **not**
 * asserted: headless Chromium's compositor, vsync, and scheduler introduce
 * gaps that belong to the harness, not to the app. The p95 frame-work numbers
 * are the reference-independent signal; the interval is diagnostic.
 *
 * Long tasks are collected with a non-buffered `PerformanceObserver` while the
 * probe is active, so page load and hydration are excluded. A long task is the
 * whole task, including layout and paint, which is why the 200 ms long-task
 * criterion is the belt to the frame-work braces.
 *
 * CI proxy (requirements §1.4): Playwright Chromium. Desktop is 1440×900 at
 * DPR 2 with no throttle; mobile is 390×844 at DPR 2 with a 4× CPU throttle
 * through CDP. The reference-device budgets are asserted for the default
 * 30×40 instance. The worst case (150×200 at 4× speed) asserts the 200 ms
 * long-task budget, asserts that the workload drops presentation to `low`,
 * and reports frame work without pretending headless Chromium is an M1 or an
 * iPhone.
 */

const STORY = '/stories/ant-colony-optimization';
const DEFAULT_URL = `${STORY}?seed=42#the-lab`;
const WORST_URL = `${STORY}?seed=42&cities=150&ants=200&speed=4#the-lab`;

/** Budget from FR-PERF-06: 55 fps ≈ 18.2 ms. */
const DESKTOP_FRAME_WORK_BUDGET_MS = 18.2;
/** Budget from FR-PERF-06: 45 fps ≈ 22.2 ms. */
const MOBILE_FRAME_WORK_BUDGET_MS = 22.2;
/** FR-PERF-07 / FR-ACO-22. */
const LONG_TASK_BUDGET_MS = 200;
/** Robust minimum for a ten-second sample; the work measure is primary. */
const MIN_FRAMES = 100;

interface FrameProbeReport {
  /** Frames in which at least one app rAF callback ran. */
  readonly frames: number;
  /** Total app rAF callbacks (several can share one frame). */
  readonly callbacks: number;
  /** Summed callback execution time per frame. */
  readonly workP50: number;
  readonly workP95: number;
  readonly workMean: number;
  readonly workMax: number;
  /** Wall-clock delta between consecutive sampled frames, for information. */
  readonly intervalP50: number;
  readonly intervalP95: number;
  readonly intervalMean: number;
  readonly intervalMax: number;
  readonly longTasks: readonly number[];
  readonly maxLongTask: number;
  readonly sampleDurationMs: number;
}

interface QualityState {
  readonly quality: string;
  readonly qualityPreference: string;
  readonly qualityReduced: boolean;
  readonly cities: number;
  readonly ants: number;
  readonly speed: number;
  readonly iterations: number;
  readonly droppedIterations: number;
  /** Backing-store pixels per CSS pixel of the stage canvas. */
  readonly canvasDpr: number;
}

interface PerfArtifact {
  readonly label: string;
  readonly viewport: string;
  readonly deviceScaleFactor: number;
  readonly cpuThrottle: number;
  readonly url: string;
  readonly quality: string;
  readonly qualityPreference: string;
  readonly qualityReduced: boolean;
  readonly canvasDpr: number;
  readonly cities: number;
  readonly ants: number;
  readonly speed: number;
  readonly iterations: number;
  readonly droppedIterations: number;
  readonly frameWorkP95BudgetMs: number | null;
  readonly result: FrameProbeReport;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/**
 * Install the rAF probe before any page script runs.
 *
 * The probe is inert until `start()` is called, so hydration and the first
 * frames stay out of the sample. `stop()` returns percentiles for frame work,
 * the wall-clock interval, and the long tasks observed while active.
 */
async function installFrameProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface ProbeState {
      active: boolean;
      work: Map<number, number>;
      callbacks: number;
      longTasks: number[];
      observer: PerformanceObserver | null;
    }

    interface ProbeReport {
      frames: number;
      callbacks: number;
      workP50: number;
      workP95: number;
      workMean: number;
      workMax: number;
      intervalP50: number;
      intervalP95: number;
      intervalMean: number;
      intervalMax: number;
      longTasks: number[];
      maxLongTask: number;
      sampleDurationMs: number;
    }

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const state: ProbeState = {
      active: false,
      work: new Map<number, number>(),
      callbacks: 0,
      longTasks: [],
      observer: null,
    };

    const percentile = (sorted: readonly number[], fraction: number): number => {
      if (sorted.length === 0) return 0;
      const index = Math.max(
        0,
        Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1),
      );
      return sorted[index] ?? 0;
    };
    const mean = (values: readonly number[]): number => {
      if (values.length === 0) return 0;
      let total = 0;
      for (const value of values) total += value;
      return total / values.length;
    };

    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      nativeRequestAnimationFrame((timestamp: number) => {
        const started = performance.now();
        try {
          callback(timestamp);
        } finally {
          if (state.active) {
            const duration = performance.now() - started;
            state.callbacks += 1;
            state.work.set(timestamp, (state.work.get(timestamp) ?? 0) + duration);
          }
        }
      });

    try {
      const observer = new PerformanceObserver((list) => {
        if (!state.active) return;
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
      });
      observer.observe({ type: 'longtask', buffered: false });
      state.observer = observer;
    } catch {
      // Long-task observation is Chromium-based; an empty list is reported.
      state.observer = null;
    }

    const probe = {
      start(): void {
        state.work.clear();
        state.longTasks.length = 0;
        state.callbacks = 0;
        state.observer?.takeRecords();
        state.active = true;
      },
      stop(): ProbeReport {
        state.active = false;
        for (const entry of state.observer?.takeRecords() ?? []) {
          state.longTasks.push(entry.duration);
        }
        const records = [...state.work.entries()].sort((left, right) => left[0] - right[0]);
        const frameWork = records.map((entry) => entry[1]).sort((left, right) => left - right);
        const intervals: number[] = [];
        for (let index = 1; index < records.length; index += 1) {
          const previous = records[index - 1];
          const current = records[index];
          if (previous !== undefined && current !== undefined) {
            intervals.push(current[0] - previous[0]);
          }
        }
        intervals.sort((left, right) => left - right);
        const longTasks = [...state.longTasks].sort((left, right) => left - right);
        const first = records[0]?.[0] ?? 0;
        const last = records[records.length - 1]?.[0] ?? first;
        return {
          frames: frameWork.length,
          callbacks: state.callbacks,
          workP50: percentile(frameWork, 0.5),
          workP95: percentile(frameWork, 0.95),
          workMean: mean(frameWork),
          workMax: frameWork[frameWork.length - 1] ?? 0,
          intervalP50: percentile(intervals, 0.5),
          intervalP95: percentile(intervals, 0.95),
          intervalMean: mean(intervals),
          intervalMax: intervals[intervals.length - 1] ?? 0,
          longTasks,
          maxLongTask: longTasks[longTasks.length - 1] ?? 0,
          sampleDurationMs: last - first,
        };
      },
    };

    (window as unknown as { __acoFrameProbe?: typeof probe }).__acoFrameProbe = probe;
  });
}

async function startProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __acoFrameProbe?: { start(): void } }).__acoFrameProbe;
    if (!probe) throw new Error('Frame probe was not installed');
    probe.start();
  });
}

async function stopProbe(page: Page): Promise<FrameProbeReport> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __acoFrameProbe?: { stop(): FrameProbeReport } })
      .__acoFrameProbe;
    if (!probe) throw new Error('Frame probe was not installed');
    return probe.stop();
  });
}

async function waitForRuntime(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    return (
      controller?.dataset.storyController === 'ready' &&
      controller.dataset.activeChapter === 'the-lab' &&
      controller.dataset.labActive === 'true' &&
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0
    );
  });
}

async function ensureRunning(page: Page): Promise<void> {
  await page.locator('[data-story-stage]').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.pauseReason === 'running',
  );
  const paused = await page.evaluate(
    () => document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
  );
  if (paused) {
    await page.getByTestId('stage-play-pause').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'false',
    );
  }
}

async function readQualityState(page: Page): Promise<QualityState> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    if (!controller) throw new Error('Missing story controller');
    const params = JSON.parse(controller.dataset.engineParams ?? '{}') as Record<string, unknown>;
    const cssWidth = canvas?.getBoundingClientRect().width ?? 0;
    return {
      quality: controller.dataset.quality ?? 'unknown',
      qualityPreference: controller.dataset.qualityPreference ?? 'unknown',
      qualityReduced: controller.dataset.qualityReduced === 'true',
      cities: typeof params.cityCount === 'number' ? params.cityCount : 0,
      ants: typeof params.antCount === 'number' ? params.antCount : 0,
      speed: typeof params.speed === 'number' ? params.speed : 0,
      iterations: Number(
        document.querySelector('[data-metric="iteration"]')?.textContent?.trim() ?? '0',
      ),
      droppedIterations: Number(controller.dataset.engineDroppedIterations ?? '0'),
      canvasDpr: canvas && cssWidth > 0 ? canvas.width / cssWidth : 0,
    };
  });
}

/**
 * The fixed 10-second workload. It never leaves the lab chapter, so the engine
 * runs continuously while the page scrolls a little and the camera is zoomed.
 */
async function runWorkload(page: Page, durationMs: number): Promise<void> {
  const started = Date.now();
  let step = 0;
  while (Date.now() - started < durationMs) {
    const direction = step % 2 === 0 ? 26 : -26;
    await page.evaluate((delta) => window.scrollBy(0, delta), direction);
    if (step % 4 === 0) {
      const testId = step % 8 === 0 ? 'aco-camera-zoom-in' : 'aco-camera-zoom-out';
      await page.evaluate((id) => {
        document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)?.click();
      }, testId);
    }
    await page.waitForTimeout(250);
    step += 1;
  }
}

function writeArtifact(name: string, artifact: PerfArtifact): void {
  const directory = resolve('test-results');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `aco-performance-${name}.json`);
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`[aco-performance] ${name}: ${JSON.stringify(artifact)}`);
}

function buildArtifact(
  label: string,
  viewport: string,
  deviceScaleFactor: number,
  cpuThrottle: number,
  url: string,
  state: QualityState,
  frameWorkP95BudgetMs: number | null,
  result: FrameProbeReport,
): PerfArtifact {
  return {
    label,
    viewport,
    deviceScaleFactor,
    cpuThrottle,
    url,
    quality: state.quality,
    qualityPreference: state.qualityPreference,
    qualityReduced: state.qualityReduced,
    canvasDpr: Number(state.canvasDpr.toFixed(3)),
    cities: state.cities,
    ants: state.ants,
    speed: state.speed,
    iterations: state.iterations,
    droppedIterations: state.droppedIterations,
    frameWorkP95BudgetMs,
    result,
  };
}

test.describe('ACO frame-time harness: desktop reference proxy', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  test.setTimeout(120_000);

  test('default 30×40 frame work meets the 55 fps p95 budget', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await installFrameProbe(page);
    await page.goto(DEFAULT_URL);
    await waitForRuntime(page);
    await ensureRunning(page);
    await page.waitForTimeout(1_000);

    await startProbe(page);
    await runWorkload(page, 10_000);
    const result = await stopProbe(page);
    const state = await readQualityState(page);
    const artifact = buildArtifact(
      'desktop-default-30x40',
      '1440x900',
      2,
      1,
      DEFAULT_URL,
      state,
      DESKTOP_FRAME_WORK_BUDGET_MS,
      result,
    );
    writeArtifact('desktop-default', artifact);

    expect(state.cities).toBe(30);
    expect(state.ants).toBe(40);
    expect(state.qualityReduced).toBe(false);
    expect(result.frames).toBeGreaterThan(MIN_FRAMES);
    expect(result.workP95).toBeGreaterThan(0);
    expect(result.workP95).toBeLessThanOrEqual(DESKTOP_FRAME_WORK_BUDGET_MS);
    expect(result.maxLongTask).toBeLessThanOrEqual(LONG_TASK_BUDGET_MS);
    expect(errors).toEqual([]);
  });

  test('worst case 150×200 degrades presentation and has no long task over 200 ms', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await installFrameProbe(page);
    await page.goto(WORST_URL);
    await waitForRuntime(page);
    await ensureRunning(page);

    // The workload cap is visible without opening the details panel, and the
    // lab guard still names the engine-level cap.
    await expect(page.getByTestId('stage-quality-notice')).toBeVisible();
    await expect(page.getByTestId('aco-lab-guard')).toBeVisible();
    await page.waitForTimeout(1_000);

    await startProbe(page);
    await runWorkload(page, 10_000);
    const result = await stopProbe(page);
    const state = await readQualityState(page);
    const artifact = buildArtifact(
      'desktop-worst-150x200',
      '1440x900',
      2,
      1,
      WORST_URL,
      state,
      null,
      result,
    );
    writeArtifact('desktop-worst', artifact);

    expect(state.cities).toBe(150);
    expect(state.ants).toBe(200);
    // Presentation only: the cap is low and the backing store is at DPR 1,
    // while the run identity still uses the requested 150 × 200 colony.
    expect(state.quality).toBe('low');
    expect(state.qualityReduced).toBe(true);
    expect(state.canvasDpr).toBeLessThanOrEqual(1.05);
    expect(result.frames).toBeGreaterThan(MIN_FRAMES);
    expect(Number.isFinite(result.workP95)).toBe(true);
    expect(result.workP95).toBeGreaterThan(0);
    expect(result.maxLongTask).toBeLessThanOrEqual(LONG_TASK_BUDGET_MS);
    // One iteration per step: ten seconds at 4× is about 40 iterations plus
    // clock slack. The backlog cap means it can never run unbounded.
    expect(state.iterations).toBeLessThanOrEqual(60);
    expect(errors).toEqual([]);
  });
});

test.describe('ACO frame-time harness: mobile CI proxy', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  test.setTimeout(120_000);

  test('default 30×40 frame work meets the 45 fps p95 budget at 4× CPU throttle', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await installFrameProbe(page);
    await page.goto(DEFAULT_URL);
    await waitForRuntime(page);
    await ensureRunning(page);
    await page.waitForTimeout(1_000);

    await startProbe(page);
    await runWorkload(page, 10_000);
    const result = await stopProbe(page);
    const state = await readQualityState(page);
    const artifact = buildArtifact(
      'mobile-default-30x40',
      '390x844',
      2,
      4,
      DEFAULT_URL,
      state,
      MOBILE_FRAME_WORK_BUDGET_MS,
      result,
    );
    writeArtifact('mobile-default', artifact);

    expect(state.cities).toBe(30);
    expect(state.ants).toBe(40);
    expect(state.qualityReduced).toBe(false);
    expect(result.frames).toBeGreaterThan(MIN_FRAMES);
    expect(result.workP95).toBeGreaterThan(0);
    expect(result.workP95).toBeLessThanOrEqual(MOBILE_FRAME_WORK_BUDGET_MS);
    expect(result.maxLongTask).toBeLessThanOrEqual(LONG_TASK_BUDGET_MS);
    expect(errors).toEqual([]);
  });
});
