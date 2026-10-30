import { expect, type Page, test } from '@playwright/test';

interface LayoutShiftRecord {
  value: number;
  hadRecentInput: boolean;
  startTime: number;
}

declare global {
  interface Window {
    __layoutShifts?: LayoutShiftRecord[];
  }
}

/**
 * Collect layout-shift entries from the first paint so a font swap cannot hide
 * behind a late observer. Entries with recent input are ignored, as in CLS.
 */
async function observeLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__layoutShifts = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
        };
        window.__layoutShifts?.push({
          value: shift.value ?? 0,
          hadRecentInput: shift.hadRecentInput ?? false,
          startTime: entry.startTime,
        });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  });
}

test('fonts load without third-party requests or visible layout shift', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') {
      fontRequests.push(request.url());
    }
  });

  await observeLayoutShifts(page);
  await page.goto('/');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  expect(await page.evaluate(() => document.fonts.status)).toBe('loaded');
  expect(await page.evaluate(() => document.fonts.check('1em Geist'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('1em "Instrument Serif"'))).toBe(true);

  // Give late font swaps and entry transitions time to settle before reading shifts.
  await page.waitForTimeout(300);

  const shifts = await page.evaluate(() => window.__layoutShifts ?? []);
  const significantShifts = shifts.filter((entry) => !entry.hadRecentInput && entry.value > 0.01);
  expect(
    significantShifts,
    `Layout shift after font load: ${JSON.stringify(significantShifts, null, 2)}`,
  ).toEqual([]);

  expect(fontRequests.length, 'Expected the page to request its self-hosted fonts').toBeGreaterThan(
    0,
  );
  const origin = new URL(page.url()).origin;
  for (const url of fontRequests) {
    expect(new URL(url).origin, `${url} is cross-origin`).toBe(origin);
    expect(url).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  }
});

test('skip link becomes visible on focus and the header/footer are keyboard reachable', async ({
  page,
}) => {
  await page.goto('/');

  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await expect(skipLink).not.toBeInViewport();

  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();

  const primaryNav = page.getByRole('navigation', { name: 'Primary' });
  await expect(primaryNav).toBeVisible();
  const indexLink = primaryNav.getByRole('link', { name: 'Index' });
  await indexLink.focus();
  await expect(indexLink).toBeFocused();

  const footerNav = page.getByRole('navigation', { name: 'Footer' });
  const backToTop = footerNav.getByRole('link', { name: 'Back to top' });
  await backToTop.focus();
  await expect(backToTop).toBeFocused();
});

test('layout has no horizontal overflow at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });

  for (const path of ['/', '/dev/type-specimen']) {
    await page.goto(path);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));

    expect(overflow.document, `${path} overflows the document at 320 px`).toBeLessThanOrEqual(0);
    expect(overflow.body, `${path} overflows the body at 320 px`).toBeLessThanOrEqual(0);
  }
});
