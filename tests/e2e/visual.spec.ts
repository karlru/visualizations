import { expect, test } from '@playwright/test';

// Visual baselines are generated from the production build with animations
// disabled and fonts settled. Story-specific fixed-scroll baselines arrive with
// the story runtime; this baseline protects the site shell from Phase 0.
test('home page matches the visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});
