import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  // Guard against axe silently scanning nothing.
  expect(results.passes.length).toBeGreaterThan(0);
});

test('ACO story has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/stories/ant-colony-optimization');
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.storyController ===
      'ready',
  );

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  expect(results.passes.length).toBeGreaterThan(0);
});

test('ACO story in article mode has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/stories/ant-colony-optimization');
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.storyController ===
      'ready',
  );
  await page.getByTestId('article-mode-toggle').click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.articleMode ===
      'true',
  );

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  expect(results.passes.length).toBeGreaterThan(0);
});

test.describe('ACO reduced motion accessibility', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the settled reduced-motion story has no serious or critical axe violations', async ({
    page,
  }) => {
    await page.goto('/stories/ant-colony-optimization');
    await page.waitForFunction(() => {
      const controller = document.querySelector<HTMLElement>('[data-story-controller]');
      return (
        controller?.dataset.storyController === 'ready' &&
        controller.dataset.motion === 'reduced' &&
        controller.dataset.paused === 'true'
      );
    });

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
