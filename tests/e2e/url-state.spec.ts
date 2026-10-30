import { expect, type Page, test } from '@playwright/test';
import { SITE_URL } from '../../src/config/site';

const HARNESS = '/dev/story-smoke';

interface RuntimeUrlState {
  readonly chapter: string | null;
  readonly scene: string | null;
  readonly seed: number;
  readonly orbit: number;
  readonly variant: string | null;
  readonly trails: boolean;
  readonly steps: number;
  readonly paused: boolean;
  readonly notices: string[];
  readonly noticeText: string;
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
      controller.dataset.activeChapter !== undefined &&
      stage?.dataset.stageStatus === 'ready' &&
      canvas !== null &&
      canvas !== undefined &&
      canvas.width > 0
    );
  });
}

async function readState(page: Page): Promise<RuntimeUrlState> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('[data-story-controller]');
    if (!controller) throw new Error('Missing story controller');
    const notices = Array.from(
      document.querySelectorAll<HTMLElement>('[data-url-notice]'),
      (element) => element.dataset.urlNotice ?? '',
    );
    return {
      chapter: controller.dataset.activeChapter ?? null,
      scene: controller.dataset.activeScene ?? null,
      seed: Number(controller.dataset.engineSeed ?? 'NaN'),
      orbit: Number(controller.dataset.engineOrbit ?? 'NaN'),
      variant: controller.dataset.engineVariant ?? null,
      trails: controller.dataset.engineTrails === 'true',
      steps: Number(controller.dataset.simSteps ?? 'NaN'),
      paused: controller.dataset.paused === 'true',
      notices,
      noticeText:
        document.querySelector<HTMLElement>('[data-url-notices]')?.textContent?.trim() ?? '',
    };
  });
}

async function scrollToChapter(page: Page, id: string): Promise<void> {
  await page.evaluate((chapterId) => {
    const element = document.getElementById(chapterId);
    if (!element) throw new Error(`Missing chapter ${chapterId}`);
    const top = element.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + 40;
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, top));
    html.style.scrollBehavior = previous;
  }, id);

  await page.waitForFunction(
    (chapterId) =>
      document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
      chapterId,
    id,
  );
}

async function setOrbit(page: Page, value: number): Promise<void> {
  await page.evaluate((next) => {
    const input = document.querySelector<HTMLInputElement>('#orbit-range');
    if (!input) throw new Error('Missing orbit range');
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test.describe('URL state and sharing', () => {
  test('a valid URL restores chapter, seed, structural parameters, and iteration 0', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    // Reduced motion starts paused, so the engine is provably at step 0 after
    // the runtime is ready. The URL is the only source of the run identity.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const url = '/dev/story-smoke?seed=12345&orbit=1.35&variant=spiral&trails=false#the-turn';

    await page.goto(url);
    await waitForRuntime(page);

    const first = await readState(page);
    expect(first.chapter).toBe('the-turn');
    expect(first.scene).toBe('drift');
    expect(first.seed).toBe(12345);
    expect(first.orbit).toBe(1.35);
    expect(first.variant).toBe('spiral');
    expect(first.trails).toBe(false);
    expect(first.steps).toBe(0);
    expect(first.paused).toBe(true);
    expect(first.notices).toEqual([]);
    expect(first.noticeText).toBe('');

    await page.reload();
    await waitForRuntime(page);
    const reloaded = await readState(page);

    expect(reloaded.chapter).toBe(first.chapter);
    expect(reloaded.scene).toBe(first.scene);
    expect(reloaded.seed).toBe(first.seed);
    expect(reloaded.orbit).toBe(first.orbit);
    expect(reloaded.variant).toBe(first.variant);
    expect(reloaded.trails).toBe(first.trails);
    expect(reloaded.steps).toBe(0);
    expect(reloaded.paused).toBe(true);
    expect(errors).toEqual([]);
  });

  test('invalid values clamp or fall back with a visible notice, never a crash', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const cases = [
      {
        name: 'numeric clamp',
        url: `${HARNESS}?orbit=99#the-turn`,
        assert: (state: RuntimeUrlState) => {
          expect(state.orbit).toBe(2.4);
          expect(state.notices).toContain('clamped');
          expect(state.noticeText).toContain('Orbit radius adjusted to 2.4.');
        },
      },
      {
        name: 'unknown enum',
        url: `${HARNESS}?variant=warp#the-turn`,
        assert: (state: RuntimeUrlState) => {
          expect(state.variant).toBe('orbit');
          expect(state.notices).toContain('enum-fallback');
          expect(state.noticeText).toContain('Unknown Variant');
        },
      },
      {
        name: 'invalid typed input',
        url: `${HARNESS}?seed=Infinity#the-turn`,
        assert: (state: RuntimeUrlState) => {
          expect(state.seed).toBe(20_261_030);
          expect(state.notices).toContain('invalid');
          expect(state.noticeText).toContain('Invalid Seed');
        },
      },
      {
        name: 'invalid boolean',
        url: `${HARNESS}?trails=maybe#the-turn`,
        assert: (state: RuntimeUrlState) => {
          expect(state.trails).toBe(true);
          expect(state.notices).toContain('invalid');
          expect(state.noticeText).toContain('Invalid Ant trails');
        },
      },
      {
        name: 'repeated key',
        url: `${HARNESS}?seed=7&seed=8#the-turn`,
        assert: (state: RuntimeUrlState) => {
          expect(state.seed).toBe(7);
          expect(state.notices).toContain('duplicate');
          expect(state.noticeText).toContain('Repeated Seed');
        },
      },
      {
        name: 'malformed number',
        url: `${HARNESS}?orbit=%ZZ#the-turn`,
        assert: (state: RuntimeUrlState) => {
          expect(state.orbit).toBe(1);
          expect(state.notices).toContain('invalid');
          expect(state.noticeText).toContain('Invalid Orbit radius');
        },
      },
      {
        name: 'unknown chapter fragment',
        url: `${HARNESS}#not-a-chapter`,
        assert: (state: RuntimeUrlState) => {
          expect(state.notices).toContain('unknown-chapter');
          expect(state.noticeText).toContain('Unknown chapter');
        },
      },
      {
        name: 'reserved keys and unknown fields',
        url: `${HARNESS}?__proto__=polluted&token=secret#the-turn`,
        assert: (state: RuntimeUrlState) => {
          expect(state.chapter).toBe('the-turn');
          expect(state.seed).toBe(20_261_030);
          expect(state.notices).toContain('rejected-key');
          expect(state.noticeText).not.toContain('secret');
        },
      },
    ] as const;

    for (const testCase of cases) {
      await page.goto(testCase.url);
      await waitForRuntime(page);
      const state = await readState(page);
      testCase.assert(state);
    }

    expect(errors).toEqual([]);
  });

  test('the share button copies the canonical absolute URL with query and fragment', async ({
    page,
  }) => {
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

    await page.goto(`${HARNESS}?seed=99&orbit=1.5#the-turn`);
    await waitForRuntime(page);

    await page.getByTestId('stage-share').click();
    await page.waitForFunction(
      () => (window as unknown as { __copied?: string }).__copied !== undefined,
    );

    const copied = await page.evaluate(
      () => (window as unknown as { __copied?: string }).__copied ?? '',
    );
    const parsed = new URL(copied);
    const site = new URL(SITE_URL);

    expect(parsed.origin).toBe(site.origin);
    expect(parsed.pathname).toBe(HARNESS);
    expect(parsed.search).toBe('?seed=99&orbit=1.5');
    expect(parsed.hash).toBe('#the-turn');
    expect(copied).toBe(`${site.origin}${HARNESS}?seed=99&orbit=1.5#the-turn`);

    const shareStatus = page.locator('[data-share-status]');
    await expect(shareStatus).toBeVisible();
    await expect(shareStatus).toHaveAttribute('data-share-ok', 'true');
    await expect(shareStatus).toContainText('Link copied');
    await expect(page.locator('[data-share-scope]')).toContainText('not included');

    expect(errors).toEqual([]);
  });

  test('repeated slider and chapter changes do not grow browser history', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);

    const initialLength = await page.evaluate(() => window.history.length);

    for (const value of [1.05, 1.1, 1.15, 1.2, 1.25]) {
      await setOrbit(page, value);
    }

    for (const chapter of ['the-turn', 'pulling-back', 'a-closer-look', 'the-turn']) {
      await page.locator(`[data-chapter-link="${chapter}"]`).click();
      await page.waitForFunction(
        (id) =>
          document.querySelector<HTMLElement>('[data-story-controller]')?.dataset.activeChapter ===
          id,
        chapter,
      );
    }

    await page.waitForFunction(() => window.location.hash === '#the-turn');
    await page.waitForTimeout(350);

    expect(await page.evaluate(() => window.history.length)).toBe(initialLength);
    await expect(page).toHaveURL(/#the-turn$/);
    expect(
      await page.evaluate(() => new URLSearchParams(window.location.search).get('orbit')),
    ).toBe('1.25');
    expect(errors).toEqual([]);
  });

  test('URL updates do not scroll or jump the page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForRuntime(page);

    await scrollToChapter(page, 'the-turn');
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    await setOrbit(page, 1.45);
    await page.waitForFunction(
      () => new URLSearchParams(window.location.search).get('orbit') === '1.45',
    );
    await page.waitForTimeout(350);

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(2);
    expect(errors).toEqual([]);
  });
});
