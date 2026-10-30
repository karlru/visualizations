import { expect, type Page, test } from '@playwright/test';

const HARNESS = '/dev/aco-smoke';

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

async function fanTotal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const values = Array.from(
      document.querySelectorAll<HTMLElement>('[data-fan-probability], [data-fan-other]'),
      (element) => {
        const explicit = element.dataset.fanProbability ?? element.dataset.fanOther ?? '0';
        return Number(explicit);
      },
    );
    return values.reduce((total, value) => total + value, 0);
  });
}

test.describe('ACO renderer fixture', () => {
  test('mounts every layer, chart, fan, and metrics without console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    await expect(page.locator('[data-testid="aco-stage"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-pause"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-convergence"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-probability-fan"]')).toBeVisible();
    await expect(page.locator('[data-metrics-id="aco-metrics"]')).toBeVisible();

    // The chart starts empty and gains both series after the first iteration.
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('[data-testid="aco-convergence"]')
            ?.getAttribute('data-history-length') ?? '0',
        ) >= 1,
      undefined,
      { timeout: 10_000 },
    );
    expect(await page.locator('[data-testid="aco-convergence"] svg path').count()).toBe(2);
    await expect(page.locator('[data-chart-best]')).not.toHaveText('—');
    await expect(page.locator('[data-chart-mean]')).not.toHaveText('—');

    // The ranked list names the top N and sums to 1 with the other bucket.
    const topRows = await page.locator('[data-fan-row]').count();
    expect(topRows).toBeGreaterThanOrEqual(1);
    expect(topRows).toBeLessThanOrEqual(8);
    expect(Math.abs((await fanTotal(page)) - 1)).toBeLessThan(1e-6);
    await expect(page.locator('[data-fan-total]')).toHaveText('1.000');

    const best = await page.locator('[data-metric="best-length"]').textContent();
    expect(best?.trim()).toMatch(/^\d+\.\d{3}$/);
    expect(errors).toEqual([]);
  });

  test('layer toggles change the canvas without recreating the engine', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForStage(page);

    await page.locator('[data-testid="aco-pause"]').click();
    await expect(page.locator('[data-story-stage]')).toHaveAttribute('data-paused', 'true');
    await page.waitForTimeout(250);

    const before = await canvasSignature(page);
    const mountsBefore = await page.evaluate(
      () => (window as Window & { __storyStageMounts?: number }).__storyStageMounts ?? 0,
    );

    await page.locator('[data-testid="aco-toggle-pheromone"] input').uncheck();
    await page.waitForTimeout(150);
    const withoutPheromone = await canvasSignature(page);
    expect(withoutPheromone).not.toBe(before);

    await page.locator('[data-testid="aco-toggle-pheromone"] input').check();
    await page.waitForTimeout(150);
    expect(await canvasSignature(page)).toBe(before);

    const mountsAfter = await page.evaluate(
      () => (window as Window & { __storyStageMounts?: number }).__storyStageMounts ?? 0,
    );
    expect(mountsAfter).toBe(mountsBefore);
    expect(errors).toEqual([]);
  });

  test('remains legible and usable at 360 px', async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(HARNESS);
    await waitForStage(page);

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      stageWidth: document.querySelector('[data-testid="aco-stage"]')?.getBoundingClientRect()
        .width,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
    }));

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.stageWidth).toBeLessThanOrEqual(360);
    await expect(page.locator('[data-testid="aco-toggle-graph"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-toggle-pheromone"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-toggle-ants"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-toggle-best-tour"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-toggle-probability-fan"]')).toBeVisible();
    await expect(page.locator('[data-testid="aco-convergence"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
