import { expect, test } from '@playwright/test';

test('home page renders the site shell', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Algorithm Stories/);
  await expect(page.getByRole('heading', { level: 1, name: 'Algorithm Stories' })).toBeVisible();
  await expect(
    page.getByText('Interactive visual essays that explain algorithms from the inside.'),
  ).toBeVisible();
});
