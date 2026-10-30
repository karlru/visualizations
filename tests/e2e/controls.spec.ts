import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

const HARNESS = '/dev/story-smoke';

interface ControllerState {
  readonly paused: boolean;
  readonly speed: number;
  readonly simTime: number;
  readonly steps: number;
  readonly orbit: number;
  readonly trails: boolean;
  readonly seed: number;
  readonly preset: string | null;
  readonly activeId: string | null;
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
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0 &&
      Number(stage.dataset.frames) > 0
    );
  });
}

async function readController(page: Page): Promise<ControllerState> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    if (!controller) throw new Error('Missing story controller');
    const active = document.activeElement;
    return {
      paused: controller.dataset.paused === 'true',
      speed: Number(controller.dataset.speed ?? 'NaN'),
      simTime: Number(controller.dataset.simTime ?? 'NaN'),
      steps: Number(controller.dataset.simSteps ?? 'NaN'),
      orbit: Number(controller.dataset.engineOrbit ?? 'NaN'),
      trails: controller.dataset.engineTrails === 'true',
      seed: Number(controller.dataset.engineSeed ?? 'NaN'),
      preset: controller.dataset.preset ?? null,
      activeId:
        active instanceof HTMLElement
          ? active.id || active.getAttribute('data-testid') || null
          : null,
    };
  });
}

async function focusStage(page: Page): Promise<Locator> {
  const stage = page.locator('[data-story-stage]');
  await stage.focus();
  await expect(stage).toBeFocused();
  return stage;
}

async function pause(page: Page): Promise<void> {
  const controller = page.locator('[data-story-controller]');
  if ((await readController(page)).paused) return;
  await page.getByTestId('stage-play-pause').click();
  await expect(controller).toHaveAttribute('data-paused', 'true');
}

async function targetBox(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('Control has no layout box');
  return { width: box.width, height: box.height };
}

test.describe('story controls', () => {
  test('every control is reachable by Tab and keeps a visible focus ring', async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HARNESS);
    await waitForRuntime(page);

    // Tab reaches the focusable stage from the preceding page content before
    // any pointer interaction.
    await page.locator('.story-smoke__note a').focus();
    let reachedByTab = false;
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.hasAttribute('data-story-stage'))) {
        reachedByTab = true;
        break;
      }
    }
    expect(reachedByTab).toBe(true);

    const stage = await focusStage(page);
    const before = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-story-stage]');
      if (!element) return null;
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth };
    });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const unfocused = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-story-stage]');
      if (!element) return null;
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth };
    });
    expect(unfocused?.outline).not.toBe('solid');
    await stage.focus();
    const focused = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-story-stage]');
      if (!element) return null;
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth };
    });
    expect(focused?.outline).toBe('solid');
    expect(focused?.width).not.toBe('0px');
    expect(before).not.toBeNull();

    // Tab leaves the stage, enters its transport controls, then the control
    // panel in DOM order. None of these steps needs a pointer.
    const expected = [
      'stage-play-pause',
      'stage-replay',
      'stage-speed',
      'orbit-range',
      'orbit-number',
      'trails',
      'preset',
      'seed-input',
      'seed-randomize',
    ];
    const seen: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      const entry = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) return null;
        const style = getComputedStyle(element);
        return {
          id: element.getAttribute('data-testid') ?? element.id ?? element.tagName,
          outline: style.outlineStyle,
          width: style.outlineWidth,
        };
      });
      if (entry !== null) {
        seen.push(entry.id);
        expect(entry.outline, `focus ring on ${entry.id}`).toBe('solid');
        expect(entry.width, `focus ring width on ${entry.id}`).not.toBe('0px');
      }
    }

    for (const id of expected) {
      expect(seen, `Tab reaches ${id}`).toContain(id);
    }
    // DOM order is also the tab order: transport, then simulation controls.
    expect(seen.indexOf('stage-play-pause')).toBeLessThan(seen.indexOf('orbit-range'));
    expect(seen.indexOf('orbit-range')).toBeLessThan(seen.indexOf('trails'));
    expect(seen.indexOf('trails')).toBeLessThan(seen.indexOf('seed-input'));

    expect(errors).toEqual([]);
  });

  test('sliders expose their label and current value', async ({ page }) => {
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const range = page.getByRole('slider', { name: 'Orbit radius' });
    await expect(range).toBeVisible();
    await expect(range).toHaveAttribute('aria-valuetext', '1.00 ×');
    await expect(page.locator('#orbit-value')).toHaveText('1.00 ×');

    const number = page.getByRole('spinbutton', { name: 'Orbit radius, exact value' });
    await expect(number).toBeVisible();

    await range.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-story-controller]')).toHaveAttribute(
      'data-engine-orbit',
      '1.050',
    );
    await expect(range).toHaveAttribute('aria-valuetext', '1.05 ×');
    await expect(page.locator('#orbit-value')).toHaveText('1.05 ×');

    // Home and End are part of the native range contract.
    await page.keyboard.press('Home');
    await expect(range).toHaveAttribute('aria-valuetext', '0.40 ×');
    await page.keyboard.press('End');
    await expect(range).toHaveAttribute('aria-valuetext', '2.40 ×');
  });

  test('number, toggle, preset, and seed controls are keyboard operable', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);
    const controller = page.locator('[data-story-controller]');

    // Exact numeric entry, committed with Enter rather than a pointer.
    const number = page.getByRole('spinbutton', { name: 'Orbit radius, exact value' });
    await number.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1.8');
    await page.keyboard.press('Enter');
    await expect(controller).toHaveAttribute('data-engine-orbit', '1.800');
    await expect(controller).toHaveAttribute('data-preset', 'custom');

    // Toggle with Space; the stage shortcut must not also toggle playback.
    const pausedBefore = (await readController(page)).paused;
    const toggle = page.getByRole('checkbox', { name: 'Show ant trails' });
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(controller).toHaveAttribute('data-engine-trails', 'false');
    expect((await readController(page)).paused).toBe(pausedBefore);

    // Native select keyboard selection applies the preset.
    const preset = page.getByRole('combobox', { name: 'Preset' });
    await preset.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(controller).toHaveAttribute('data-preset', 'brisk');
    await expect(controller).toHaveAttribute('data-engine-orbit', '1.350');
    await expect(controller).toHaveAttribute('data-engine-trails', 'true');

    // Invalid seed input is rejected with a polite notice; the seed is kept.
    const seedInput = page.getByRole('spinbutton', { name: 'Seed' });
    const seedBefore = (await readController(page)).seed;
    await seedInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1.5');
    await page.keyboard.press('Enter');
    await expect(seedInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-seed-notice]')).toContainText('whole number');
    expect((await readController(page)).seed).toBe(seedBefore);
    await expect(seedInput).toHaveValue(String(seedBefore));

    // A valid seed restarts the run.
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1234');
    await page.keyboard.press('Enter');
    await expect(controller).toHaveAttribute('data-engine-seed', '1234');
    await expect(seedInput).toHaveAttribute('aria-invalid', 'false');
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.simTime ?? '1',
        ) < 0.2,
    );

    // Randomize is a button: Enter activates it and the seed changes.
    const randomize = page.locator('#seed-randomize');
    await randomize.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readController(page)).seed).not.toBe(1234);

    expect(errors).toEqual([]);
  });

  test('Space toggles play/pause only while the stage region has focus', async ({ page }) => {
    await page.goto(HARNESS);
    await waitForRuntime(page);
    const controller = page.locator('[data-story-controller]');
    await expect(controller).toHaveAttribute('data-paused', 'false');

    const stage = await focusStage(page);
    await page.keyboard.press('Space');
    await expect(controller).toHaveAttribute('data-paused', 'true');
    await page.keyboard.press('Space');
    await expect(controller).toHaveAttribute('data-paused', 'false');

    // A focused button activates exactly once through its native click.
    const play = page.getByTestId('stage-play-pause');
    await play.focus();
    await page.keyboard.press('Space');
    await expect(controller).toHaveAttribute('data-paused', 'true');
    await page.waitForTimeout(250);
    await expect(controller).toHaveAttribute('data-paused', 'true');
    await page.keyboard.press('Space');
    await expect(controller).toHaveAttribute('data-paused', 'false');

    // A focused slider/seed input keeps native Space behaviour; playback must
    // not change as a side effect.
    const range = page.getByRole('slider', { name: 'Orbit radius' });
    await range.focus();
    const pausedBefore = (await readController(page)).paused;
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect((await readController(page)).paused).toBe(pausedBefore);

    const seed = page.getByRole('spinbutton', { name: 'Seed' });
    await seed.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect((await readController(page)).paused).toBe(pausedBefore);

    await stage.focus();
  });

  test('arrows step only on the stage and Escape leaves without trapping focus', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);
    await pause(page);
    const controller = page.locator('[data-story-controller]');

    await focusStage(page);
    const start = await readController(page);
    await page.keyboard.press('ArrowRight');
    const forwardOne = await readController(page);
    expect(forwardOne.steps).toBe(start.steps + 1);
    expect(forwardOne.simTime).toBeCloseTo((start.steps + 1) / 60, 3);
    await page.keyboard.press('ArrowUp');
    const forwardTwo = await readController(page);
    expect(forwardTwo.steps).toBe(start.steps + 2);

    await page.keyboard.press('ArrowLeft');
    const backOne = await readController(page);
    expect(backOne.steps).toBe(start.steps + 1);
    expect(backOne.simTime).toBeCloseTo((start.steps + 1) / 60, 3);
    await page.keyboard.press('ArrowDown');
    const backTwo = await readController(page);
    expect(backTwo.steps).toBe(start.steps);

    // The same arrows on a focused range change the value, not simulation time.
    const range = page.getByRole('slider', { name: 'Orbit radius' });
    await range.focus();
    const beforeRange = await readController(page);
    await page.keyboard.press('ArrowRight');
    const afterRange = await readController(page);
    expect(afterRange.steps).toBe(beforeRange.steps);
    expect(afterRange.orbit).toBeGreaterThan(beforeRange.orbit);

    // Escape moves focus to the first simulation control and Tab continues from
    // there; nothing is trapped.
    await focusStage(page);
    await page.keyboard.press('Escape');
    expect((await readController(page)).activeId).toBe('orbit-range');
    await page.keyboard.press('Tab');
    expect((await readController(page)).activeId).toBe('orbit-number');
    await expect(controller).toHaveAttribute('data-paused', 'true');

    expect(errors).toEqual([]);
  });

  test('play/pause, replay, and speed respond to the keyboard', async ({ page }) => {
    await page.goto(HARNESS);
    await waitForRuntime(page);
    const controller = page.locator('[data-story-controller]');

    const pauseButton = page.getByTestId('stage-play-pause');
    await pauseButton.focus();
    await page.keyboard.press('Enter');
    await expect(controller).toHaveAttribute('data-paused', 'true');

    const replay = page.getByTestId('stage-replay');
    await replay.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    expect((await readController(page)).simTime).toBeLessThan(0.25);

    const speed = page.getByTestId('stage-speed');
    await speed.focus();
    await page.keyboard.press('ArrowDown');
    await expect(controller).toHaveAttribute('data-speed', '2');
    await page.keyboard.press('ArrowUp');
    await expect(controller).toHaveAttribute('data-speed', '1');
  });

  test('metrics update at a low frequency instead of every frame', async ({ page }) => {
    await page.goto(HARNESS);
    await waitForRuntime(page);
    await expect(page.locator('[data-story-controller]')).toHaveAttribute('data-paused', 'false');

    const live = page.locator('[data-metrics-live]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    const before = await page.locator('[data-metric="steps"]').textContent();

    // Observe the live region and the render frame counter for 1.6 s. At 1 Hz
    // sampling only a couple of values can change; a per-frame update would
    // produce dozens or hundreds of mutations.
    const result = await page.evaluate(async () => {
      const region = document.querySelector('[data-metrics-live]');
      const stage = document.querySelector<HTMLElement>('[data-story-stage]');
      if (!region || !stage) throw new Error('Missing metrics or stage');
      const framesBefore = Number(stage.dataset.frames ?? 0);
      let mutations = 0;
      const observer = new MutationObserver((records) => {
        mutations += records.length;
      });
      observer.observe(region, { subtree: true, childList: true, characterData: true });
      await new Promise((resolve) => setTimeout(resolve, 1600));
      observer.disconnect();
      return {
        mutations,
        frames: Number(stage.dataset.frames ?? 0) - framesBefore,
        text: region.textContent ?? '',
      };
    });

    expect(result.frames).toBeGreaterThan(20);
    expect(result.mutations).toBeGreaterThan(0);
    expect(result.mutations).toBeLessThan(20);
    // Ten times fewer DOM writes than rendered frames is the practical meaning
    // of "never every frame".
    expect(result.mutations * 10).toBeLessThan(result.frames);
    expect(result.text).toContain('Simulated time');
    const after = await page.locator('[data-metric="steps"]').textContent();
    expect(after).not.toBe(before);
  });

  test('touch targets are at least 44 px and focus is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const stageBox = await targetBox(page.locator('[data-story-stage]'));
    expect(stageBox.width).toBeGreaterThanOrEqual(44);
    expect(stageBox.height).toBeGreaterThanOrEqual(44);

    const targets: readonly [string, Locator][] = [
      ['play/pause', page.getByTestId('stage-play-pause')],
      ['replay', page.getByTestId('stage-replay')],
      ['speed', page.getByTestId('stage-speed')],
      ['orbit range', page.getByRole('slider', { name: 'Orbit radius' })],
      ['orbit number', page.getByRole('spinbutton', { name: 'Orbit radius, exact value' })],
      ['trails toggle', page.getByRole('checkbox', { name: 'Show ant trails' })],
      ['preset', page.getByRole('combobox', { name: 'Preset' })],
      ['seed', page.getByRole('spinbutton', { name: 'Seed' })],
      ['randomize', page.locator('#seed-randomize')],
      ['shortcut summary', page.locator('#story-shortcuts summary')],
    ];

    for (const [name, locator] of targets) {
      const box = await targetBox(locator);
      expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44);
    }

    // Computed focus styles change when keyboard focus arrives.
    const stage = page.locator('[data-story-stage]');
    const unfocusedOutline = await stage.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle} ${style.outlineWidth}`;
    });
    await stage.focus();
    const focusedOutline = await stage.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle} ${style.outlineWidth}`;
    });
    expect(unfocusedOutline).not.toBe(focusedOutline);
    expect(focusedOutline.startsWith('solid')).toBe(true);
  });

  test('DOM order matches visual order for stage, controls, metrics, and chapters', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const dom = await page.evaluate(() => {
      const stage = document.querySelector('[data-story-stage]');
      const panel = document.querySelector('[data-controls-panel]');
      const metrics = document.querySelector('[data-metrics]');
      const chapters = document.querySelector('[data-story-chapters]');
      if (!stage || !panel || !metrics || !chapters) throw new Error('Missing story sections');
      const follows = (first: Element, second: Element): boolean =>
        Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        stageBeforePanel: follows(stage, panel),
        panelBeforeMetrics: follows(panel, metrics),
        metricsBeforeChapters: follows(metrics, chapters),
      };
    });
    expect(dom).toEqual({
      stageBeforePanel: true,
      panelBeforeMetrics: true,
      metricsBeforeChapters: true,
    });

    const boxes = await page.evaluate(() => {
      const measure = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const rect = element.getBoundingClientRect();
        return { top: rect.top, left: rect.left, bottom: rect.bottom };
      };
      return {
        stage: measure('[data-story-stage]'),
        panel: measure('[data-controls-panel]'),
        metrics: measure('[data-metrics]'),
        chapters: measure('[data-story-chapters]'),
      };
    });

    expect(boxes.panel.top).toBeGreaterThanOrEqual(boxes.stage.top - 1);
    if (Math.abs(boxes.panel.top - boxes.stage.top) <= 1) {
      expect(boxes.stage.left).toBeLessThan(boxes.panel.left);
    }
    expect(boxes.metrics.top).toBeGreaterThan(boxes.panel.top);
    expect(boxes.chapters.top).toBeGreaterThan(boxes.metrics.top);

    // Within the panel, DOM order is the visual reading order too.
    const controls = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-controls-panel] [data-control]'),
        (element) => {
          const rect = element.getBoundingClientRect();
          return { id: element.dataset.controlId ?? '', top: rect.top, left: rect.left };
        },
      ),
    );
    const visual = [...controls].sort((first, second) =>
      Math.abs(first.top - second.top) > 2 ? first.top - second.top : first.left - second.left,
    );
    expect(visual.map((control) => control.id)).toEqual(controls.map((control) => control.id));
  });

  test('the 360 px layout keeps controls visible above the pinned stage', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-controls-panel]');
      if (!panel) throw new Error('Missing controls panel');
      window.scrollTo(0, panel.getBoundingClientRect().top + window.scrollY - 100);
    });
    await page.waitForTimeout(250);

    const visibility = await page.evaluate(() => {
      const title = document.getElementById('story-controls-title');
      if (!title) throw new Error('Missing controls title');
      const rect = title.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + 4, rect.top + rect.height / 2);
      return {
        top: rect.top,
        insidePanel: hit?.closest('[data-controls-panel]') !== null,
      };
    });
    // The panel paints above the pinned stage on one column, so its heading is
    // readable instead of disappearing underneath the canvas.
    expect(visibility.top).toBeGreaterThan(0);
    expect(visibility.top).toBeLessThan(720);
    expect(visibility.insidePanel).toBe(true);

    for (const id of ['orbit-range', 'trails', 'preset', 'seed-input', 'seed-randomize']) {
      const box = await targetBox(page.locator(`#${id}`));
      expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('the controls page has no serious or critical axe violations', async ({ page }) => {
    await page.goto(HARNESS);
    await waitForRuntime(page);

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
