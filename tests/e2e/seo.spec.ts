import { expect, test } from '@playwright/test';
import { SITE_URL } from '../../src/config/site';

const SITE_ORIGIN = new URL(SITE_URL).origin;

test('unknown routes return a 404 status with the custom recovery page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to the index' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(page.getByRole('link', { name: 'Browse the essay index' })).toHaveAttribute(
    'href',
    '/stories',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('the catalogue renders both collection entries with their metadata', async ({ page }) => {
  await page.goto('/stories');

  const aco = page.getByRole('listitem').filter({ hasText: 'The Colony That Finds a Short Route' });
  await expect(aco).toContainText('A colony has no leader and no map.');
  await expect(aco).toContainText('Optimization');
  await expect(aco).toContainText('intermediate');
  await expect(aco).toContainText('2d');

  const randu = page
    .getByRole('listitem')
    .filter({ hasText: 'Fifteen Planes: How RANDU Broke Randomness' });
  await expect(randu).toContainText('A generator used for years looked random');
  await expect(randu).toContainText('Randomness');
  await expect(randu).toContainText('intermediate');
  await expect(randu).toContainText('3d');
});

test('public pages have unique titles, descriptions, and absolute canonicals', async ({ page }) => {
  const routes = [
    { path: '/', status: 200, canonicalPath: '/' },
    { path: '/stories', status: 200, canonicalPath: '/stories' },
    { path: '/this-route-does-not-exist', status: 404, canonicalPath: '/404' },
  ] as const;

  const titles: string[] = [];
  const descriptions: string[] = [];

  for (const route of routes) {
    const response = await page.goto(route.path);
    expect(response?.status(), route.path).toBe(route.status);

    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

    expect(title.trim(), `${route.path} title`).not.toBe('');
    expect(description?.trim(), `${route.path} description`).not.toBe('');
    expect(canonical, `${route.path} canonical`).toBeTruthy();

    const canonicalUrl = new URL(canonical ?? '');
    expect(canonicalUrl.origin, `${route.path} canonical origin`).toBe(SITE_ORIGIN);
    expect(canonicalUrl.pathname, `${route.path} canonical path`).toBe(route.canonicalPath);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      description ?? '',
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      canonical ?? '',
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'Algorithm Stories',
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#/);

    titles.push(title);
    descriptions.push(description ?? '');
  }

  expect(new Set(titles).size, `Duplicate titles: ${titles.join(' | ')}`).toBe(routes.length);
  expect(new Set(descriptions).size, `Duplicate descriptions: ${descriptions.join(' | ')}`).toBe(
    routes.length,
  );
});
