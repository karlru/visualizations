import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { createTspInstance } from '../../src/engines/aco/tsp';
import { acoWorldPoint } from '../../src/stories/aco/world';

const STORY = '/stories/ant-colony-optimization';
const LAB = `${STORY}#the-lab`;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function waitForLab(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    const stage = document.querySelector<HTMLElement>('[data-story-stage]');
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    return (
      controller?.dataset.storyController === 'ready' &&
      controller.dataset.activeChapter === 'the-lab' &&
      controller.dataset.lab === 'aco' &&
      controller.dataset.labActive === 'true' &&
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0 &&
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

async function enableMapEdit(page: Page): Promise<void> {
  await page.locator('#aco-map-edit').check({ force: true });
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapEditMode ===
        'true' && document.querySelectorAll('[data-city-handle]').length >= 2,
  );
}

async function waitForPauseReason(page: Page): Promise<void> {
  await scrollToLab(page);
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('[data-story-stage]')?.dataset.pauseReason === 'running',
  );
}

interface LabState {
  readonly chapter: string | null;
  readonly scene: string | null;
  readonly params: Record<string, unknown>;
  readonly paused: boolean;
  readonly simSteps: number;
  readonly simTime: number;
  readonly preset: string;
  readonly mapCustom: boolean;
  readonly mapCities: number;
  readonly mapSelected: string;
  readonly mapEditMode: boolean;
  readonly cameraPreset: string;
  readonly cameraOverride: boolean;
  readonly layerOverrides: string;
  readonly stageMounts: number;
  readonly cityCount: number;
  readonly firstCity: { x: number; y: number };
  readonly stageCount: number;
  readonly canvasCount: number;
}

async function readLab(page: Page): Promise<LabState> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    if (!controller) throw new Error('Missing story controller');
    const handle = document.querySelector<HTMLElement>('[data-city-handle]');
    return {
      chapter: controller.dataset.activeChapter ?? null,
      scene: controller.dataset.activeScene ?? null,
      params: JSON.parse(controller.dataset.engineParams ?? '{}') as Record<string, unknown>,
      paused: controller.dataset.paused === 'true',
      simSteps: Number(controller.dataset.simSteps ?? '0'),
      simTime: Number(controller.dataset.simTime ?? '0'),
      preset: controller.dataset.preset ?? 'custom',
      mapCustom: controller.dataset.mapCustom === 'true',
      mapCities: Number(controller.dataset.mapCities ?? '0'),
      mapSelected: controller.dataset.mapSelected ?? '',
      mapEditMode: controller.dataset.mapEditMode === 'true',
      cameraPreset: controller.dataset.cameraPreset ?? 'none',
      cameraOverride: controller.dataset.cameraOverride === 'true',
      layerOverrides: controller.dataset.layerOverrides ?? '{}',
      stageMounts: (window as Window & { __storyStageMounts?: number }).__storyStageMounts ?? 0,
      cityCount: document.querySelectorAll('[data-city-handle]').length,
      firstCity: {
        x: Number(handle?.dataset.cityX ?? 'NaN'),
        y: Number(handle?.dataset.cityY ?? 'NaN'),
      },
      stageCount: document.querySelectorAll('[data-story-stage]').length,
      canvasCount: document.querySelectorAll('canvas[data-stage-canvas]').length,
    };
  });
}

async function canvasSignature(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
    if (canvas === null) throw new Error('Missing canvas');
    const url = canvas.toDataURL();
    let hash = 2166136261;
    for (let index = 0; index < url.length; index += 1) {
      hash ^= url.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
}

async function setNumber(page: Page, id: string, value: number): Promise<void> {
  const input = page.locator(`#${id}-number`);
  await input.fill(String(value));
  await input.press('Enter');
}

async function dragFirstCity(page: Page, dx = 36, dy = -24): Promise<void> {
  await enableMapEdit(page);
  await scrollToLab(page);
  const handle = page.locator('[data-city-handle]').first();
  const box = await handle.boundingBox();
  if (box === null) throw new Error('Missing city handle box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 6 });
  await page.mouse.up();
}

test.describe('ACO lab', () => {
  test('shows every documented control, one stage, and a matching text summary', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);

    const lab = page.locator('[data-aco-lab]');
    await expect(lab).toBeVisible();
    await expect(lab.getByRole('heading', { name: 'Colony lab' })).toBeVisible();

    for (const id of ['aco-cities', 'aco-ants', 'aco-alpha', 'aco-beta', 'aco-rho']) {
      await expect(page.locator(`#${id}-range`)).toBeVisible();
    }
    await expect(page.locator('#aco-preset')).toBeVisible();
    await expect(page.locator('#aco-seed-input')).toBeVisible();
    await expect(page.getByTestId('seed-randomize')).toBeVisible();

    const labels = await page.locator('.slider__label').allTextContents();
    expect(labels.some((label) => /^\s*Q\b/.test(label))).toBe(false);

    // Speed lives in the stage chrome and is not duplicated in the lab.
    await expect(page.getByTestId('stage-speed')).toBeVisible();

    const presetOptions = await page.locator('#aco-preset option').allTextContents();
    expect(presetOptions).toEqual(['Custom', 'Balanced', 'Greedy', 'Stagnant', 'Forgetful']);

    for (const testId of [
      'aco-lab-play',
      'aco-lab-step-back',
      'aco-lab-step-forward',
      'aco-lab-restart',
      'aco-lab-share',
      'aco-map-add',
      'aco-map-remove',
      'aco-map-reset',
      'aco-camera-overview',
      'aco-camera-focus-city',
      'aco-camera-best-tour',
      'aco-camera-convergence',
      'aco-camera-zoom-in',
      'aco-camera-zoom-out',
      'aco-camera-reset',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }

    for (const layer of ['pheromone', 'ants', 'best-tour', 'probability-fan']) {
      await expect(page.locator(`#aco-layer-${layer}`)).toBeVisible();
    }

    await expect(page.getByTestId('aco-lab-compare')).toContainText('deferred for release 1');
    await expect(page.getByTestId('aco-lab-share-scope')).toContainText('not included');
    await expect(page.getByTestId('aco-lab-share-scope')).toContainText('seeded map');

    const state = await readLab(page);
    expect(state.stageCount).toBe(1);
    expect(state.canvasCount).toBe(1);
    expect(state.chapter).toBe('the-lab');
    expect(state.scene).toBe('lab');
    expect(state.params).toMatchObject({
      cityCount: 30,
      antCount: 40,
      alpha: 1,
      beta: 2,
      rho: 0.5,
      speed: 1,
      seed: 42,
    });

    // The text summary carries the same values as the visible metric rows.
    const best = await page.locator('[data-metric="best-length"]').textContent();
    const iteration = await page.locator('[data-metric="iteration"]').textContent();
    const mean = await page.locator('[data-metric="mean-length"]').textContent();
    const entropy = await page.locator('[data-metric="entropy"]').textContent();
    await expect(page.getByTestId('aco-lab-summary')).toHaveAttribute(
      'data-summary-best',
      best ?? '',
    );
    await expect(page.getByTestId('aco-lab-summary')).toHaveAttribute(
      'data-summary-iteration',
      iteration ?? '',
    );
    await expect(page.getByTestId('aco-lab-summary')).toHaveAttribute(
      'data-summary-mean',
      mean ?? '',
    );
    await expect(page.getByTestId('aco-lab-summary')).toHaveAttribute(
      'data-summary-entropy',
      entropy ?? '',
    );

    expect(errors).toEqual([]);
  });

  test('applies all four presets with exact values and preserves the run identity', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);

    // Establish a non-default run identity that a preset must not overwrite.
    await setNumber(page, 'aco-ants', 12);
    await page.getByTestId('stage-speed').selectOption('2');
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.speed === '2',
    );
    expect((await readLab(page)).params.antCount).toBe(12);

    const expected = [
      ['greedy', { alpha: 0.5, beta: 8, rho: 0.5 }],
      ['stagnant', { alpha: 5, beta: 1, rho: 0.1 }],
      ['forgetful', { alpha: 1, beta: 2, rho: 0.95 }],
      ['balanced', { alpha: 1, beta: 2, rho: 0.5 }],
    ] as const;

    for (const [id, values] of expected) {
      await page.locator('#aco-preset').selectOption(id);
      await page.waitForFunction(
        (preset) =>
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.preset === preset,
        id,
      );
      const state = await readLab(page);
      expect(state.params).toMatchObject({
        cityCount: 30,
        antCount: 12,
        seed: 42,
        speed: 2,
        ...values,
      });
      expect(state.preset).toBe(id);
      // A preset is structural: it restarts the run at iteration 0.
      await expect(page.locator('[data-metric="iteration"]')).toHaveText('0');
    }

    expect(errors).toEqual([]);
  });

  test('play, pause, deterministic stepping, and restart use one clock', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);
    await waitForPauseReason(page);

    await page.getByTestId('aco-lab-play').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
    );

    const paused = await readLab(page);
    expect(paused.paused).toBe(true);

    await page.getByTestId('aco-lab-step-forward').click();
    const forward = await readLab(page);
    expect(forward.paused).toBe(true);
    expect(forward.simSteps).toBe(paused.simSteps + 1);

    await page.getByTestId('aco-lab-step-back').click();
    const back = await readLab(page);
    expect(back.simSteps).toBe(paused.simSteps);
    expect(back.simTime).toBeCloseTo(paused.simTime, 3);

    // Let the run advance, then restart: iteration 0, step 0, paused.
    await page.getByTestId('aco-lab-play').click();
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simSteps ?? '0',
        ) > 30,
    );
    await page.getByTestId('aco-lab-restart').click();
    const restarted = await readLab(page);
    expect(restarted.paused).toBe(true);
    expect(restarted.simSteps).toBe(0);
    expect(restarted.simTime).toBe(0);
    await expect(page.locator('[data-metric="iteration"]')).toHaveText('0');

    expect(errors).toEqual([]);
  });

  test('layer toggles change the render without recreating the engine', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);
    await waitForPauseReason(page);
    await page.getByTestId('aco-lab-play').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
    );
    await page.waitForTimeout(250);

    const before = await readLab(page);
    const signature = await canvasSignature(page);
    expect(before.stageMounts).toBeGreaterThan(0);

    await page.locator('#aco-layer-pheromone').uncheck({ force: true });
    await page.waitForFunction(
      () =>
        document
          .querySelector<HTMLElement>('[data-story-controller]')
          ?.dataset.layerOverrides?.includes('"pheromone":false') ?? false,
    );
    await page.waitForTimeout(150);
    expect(await canvasSignature(page)).not.toBe(signature);

    await page.locator('#aco-layer-pheromone').check({ force: true });
    await page.waitForTimeout(150);
    expect(await canvasSignature(page)).toBe(signature);

    const after = await readLab(page);
    expect(after.stageMounts).toBe(before.stageMounts);
    expect(after.stageCount).toBe(1);
    expect(after.canvasCount).toBe(1);
    expect(errors).toEqual([]);
  });

  test('camera presets and zoom work from the keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);

    const preset = page.getByTestId('aco-camera-best-tour');
    await preset.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.cameraPreset ===
        'best-tour',
    );
    const framed = await readLab(page);
    expect(framed.cameraOverride).toBe(true);
    expect(framed.cameraPreset).toBe('best-tour');

    const zoomBefore = Number(
      await page.locator('[data-stage-canvas]').getAttribute('data-camera-zoom'),
    );
    const zoomIn = page.getByTestId('aco-camera-zoom-in');
    await zoomIn.focus();
    await page.keyboard.press('Enter');
    const zoomAfter = Number(
      await page.locator('[data-stage-canvas]').getAttribute('data-camera-zoom'),
    );
    expect(zoomAfter).toBeGreaterThan(zoomBefore);

    const reset = page.getByTestId('aco-camera-reset');
    await reset.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.cameraPreset ===
        'none',
    );
    const cleared = await readLab(page);
    expect(cleared.cameraOverride).toBe(false);
    expect(errors).toEqual([]);
  });

  test('dragging a city changes the map, metrics, and restarts at iteration 0', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);
    await waitForPauseReason(page);

    // Run long enough to have a best tour, then pause for a stable comparison.
    await page.waitForFunction(
      () => Number(document.querySelector('[data-metric="iteration"]')?.textContent ?? '0') > 0,
    );
    await page.getByTestId('aco-lab-play').click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.paused === 'true',
    );
    const before = await readLab(page);
    expect(before.mapCustom).toBe(false);
    const beforeSignature = await canvasSignature(page);

    await dragFirstCity(page);
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapCustom ===
        'true',
    );
    const after = await readLab(page);

    expect(after.params.cityCount).toBe(before.params.cityCount);
    expect(after.mapCities).toBe(Number(before.params.cityCount));
    expect(after.mapSelected).toBe('0');
    expect(after.firstCity.x).not.toBeCloseTo(before.firstCity.x, 4);
    expect(after.paused).toBe(true);
    await expect(page.locator('[data-metric="iteration"]')).toHaveText('0');
    await expect(page.locator('[data-metric="best-length"]')).toHaveText('—');
    await expect(page.getByTestId('aco-map-notice')).toContainText('local');
    await expect(page.getByTestId('aco-map-notice')).toContainText('not included in share links');
    expect(await canvasSignature(page)).not.toBe(beforeSignature);
    expect(errors).toEqual([]);
  });

  test('add, remove, and reset keep a valid instance and restart the run', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);

    const start = await readLab(page);
    await page.getByTestId('aco-map-add').click();
    await page.waitForFunction(
      (count) =>
        Number(document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapCities) >
        count,
      start.mapCities,
    );
    const added = await readLab(page);
    expect(added.mapCities).toBe(start.mapCities + 1);
    expect(added.mapCustom).toBe(true);
    expect(added.mapSelected).toBe(String(added.mapCities - 1));
    await expect(page.locator('[data-metric="iteration"]')).toHaveText('0');

    await page.getByTestId('aco-map-remove').click();
    const removed = await readLab(page);
    expect(removed.mapCities).toBe(start.mapCities);
    expect(removed.params.cityCount).toBe(start.params.cityCount);

    // The UI minimum is two cities: removal is disabled there.
    await setNumber(page, 'aco-cities', 2);
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapCities,
        ) === 2,
    );
    await expect(page.getByTestId('aco-map-remove')).toBeDisabled();
    await expect(page.getByTestId('aco-map-add')).toBeEnabled();

    await page.getByTestId('aco-map-add').click();
    expect((await readLab(page)).mapCities).toBe(3);
    await page.getByTestId('aco-map-reset').click();
    const reset = await readLab(page);
    expect(reset.mapCustom).toBe(false);
    expect(reset.mapCities).toBe(3);
    expect(reset.params.cityCount).toBe(3);
    await expect(page.getByTestId('aco-map-notice')).toContainText('Seeded map restored');

    expect(errors).toEqual([]);
  });

  test('share and reload restore the seeded map and disclose local edits', async ({ page }) => {
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

    await page.goto(LAB);
    await waitForLab(page);
    await dragFirstCity(page, 28, 20);
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapCustom ===
        'true',
    );

    await page.getByTestId('aco-lab-share').click();
    await page.waitForFunction(
      () => (window as unknown as { __copied?: string }).__copied !== undefined,
    );
    const copied = await page.evaluate(
      () => (window as unknown as { __copied?: string }).__copied ?? '',
    );
    const parsed = new URL(copied);
    expect(parsed.pathname).toBe(STORY);
    expect(parsed.hash).toBe('#the-lab');
    expect([...parsed.searchParams.keys()]).not.toContain('x');
    expect([...parsed.searchParams.keys()]).not.toContain('y');
    expect([...parsed.searchParams.keys()]).not.toContain('map');
    await expect(page.getByTestId('aco-lab-share-scope')).toContainText('not included');

    await page.goto(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    await page.reload();
    await waitForLab(page);
    await enableMapEdit(page);
    const restored = await readLab(page);
    expect(restored.mapCustom).toBe(false);
    expect(restored.mapCities).toBe(30);

    const seeded = createTspInstance(42, 30).cities[0];
    if (seeded === undefined) throw new Error('Missing seeded city');
    const expected = acoWorldPoint(seeded);
    expect(restored.firstCity.x).toBeCloseTo(expected.x, 5);
    expect(restored.firstCity.y).toBeCloseTo(expected.y, 5);
    await expect(page.getByTestId('aco-map-notice')).toContainText('not included in share links');
    expect(errors).toEqual([]);
  });

  test('reaches the 2-city, 1-ant, α = 0, β = 0, ρ = 1 edge cases', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);

    await setNumber(page, 'aco-cities', 2);
    await setNumber(page, 'aco-ants', 1);
    await setNumber(page, 'aco-alpha', 0);
    await setNumber(page, 'aco-beta', 0);
    await setNumber(page, 'aco-rho', 1);

    await page.waitForFunction(() => {
      const controller = document.querySelector<HTMLElement>('[data-story-controller]');
      if (!controller) return false;
      const params = JSON.parse(controller.dataset.engineParams ?? '{}') as Record<string, unknown>;
      return (
        params.cityCount === 2 &&
        params.antCount === 1 &&
        params.alpha === 0 &&
        params.beta === 0 &&
        params.rho === 1
      );
    });

    // Make sure the run is playing, then let at least one iteration complete.
    if ((await readLab(page)).paused) await page.getByTestId('aco-lab-play').click();
    await page.waitForFunction(
      () => Number(document.querySelector('[data-metric="iteration"]')?.textContent ?? '0') > 0,
      undefined,
      { timeout: 10_000 },
    );
    await expect(page.locator('[data-metric="cities"]')).toHaveText('2');
    await expect(page.locator('[data-metric="ants"]')).toHaveText('1');
    await expect(page.getByTestId('aco-lab-summary')).toContainText('Best tour');
    await expect(page.locator('[data-fan-total]')).toHaveText('1.000');
    expect(errors).toEqual([]);
  });

  test('has no serious axe violations at the lab', async ({ page }) => {
    await page.goto(LAB);
    await waitForLab(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    expect(results.passes.length).toBeGreaterThan(0);
  });

  test('fits at 360 px without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(LAB);
    await waitForLab(page);

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
      labRight: document.querySelector('[data-aco-lab]')?.getBoundingClientRect().right ?? 0,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.labRight).toBeLessThanOrEqual(360);
    await expect(page.getByTestId('aco-camera-overview')).toBeVisible();
    await expect(page.getByTestId('aco-map-add')).toBeVisible();
  });
});

test.describe('ACO lab on a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('requires Edit map mode before a touch drag captures the gesture', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(LAB);
    await waitForLab(page);

    const state = await page.evaluate(() => ({
      coarse: document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapEditMode,
      touchAction: getComputedStyle(
        document.querySelector<HTMLElement>('[data-city-handle]') ?? document.body,
      ).touchAction,
    }));
    expect(state.coarse).toBe('false');
    expect(state.touchAction).toBe('auto');

    await page.locator('#aco-map-edit').check({ force: true });
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapEditMode ===
        'true',
    );
    await scrollToLab(page);
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector<HTMLElement>('[data-city-handle]') ?? document.body,
          ).touchAction,
      ),
    ).toBe('none');

    const handle = page.locator('[data-city-handle]').first();
    const box = await handle.boundingBox();
    if (box === null) throw new Error('Missing city handle box');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const before = await readLab(page);

    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY }],
    });
    for (let step = 1; step <= 6; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX + step * 6, y: startY - step * 4 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.mapCustom ===
        'true',
    );
    const after = await readLab(page);
    expect(after.mapCustom).toBe(true);
    expect(after.firstCity.x).not.toBeCloseTo(before.firstCity.x, 4);
    await expect(page.getByTestId('aco-map-notice')).toContainText('local');
    expect(errors).toEqual([]);
  });
});
