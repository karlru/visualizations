import { expect, type Page, test } from '@playwright/test';
import type { ScrollDirectorDebugState } from '../../src/lib/scroll-director';

const HARNESS = '/dev/scroll-smoke';

interface HarnessState {
  readonly activeChapterId: string | null;
  readonly overlayActive: string | null;
  readonly overlayProgress: number;
  readonly controllerStatus: string | null;
  readonly dataActiveChapter: string | null;
  readonly dataProgress: string | null;
}

/** Collect console errors and uncaught page errors for a page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

async function waitForDirector(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const director = window.__scrollDirector;
    if (!director) return false;
    const state = director.debugState();
    return state.triggerCount > 0 && !state.destroyed;
  });
}

async function readDebug(page: Page): Promise<ScrollDirectorDebugState> {
  const state = await page.evaluate(() => window.__scrollDirector?.debugState() ?? null);
  if (!state) throw new Error('ScrollDirector is not mounted.');
  return state;
}

async function readHarnessState(page: Page): Promise<HarnessState> {
  return page.evaluate(() => {
    const controller = document.querySelector<HTMLElement>('.story-controller');
    const overlayActive = document.querySelector<HTMLElement>('[data-scroll-active]');
    const overlayProgress = document.querySelector<HTMLElement>('[data-scroll-progress-label]');
    return {
      activeChapterId: controller?.dataset.activeChapter ?? null,
      overlayActive: overlayActive?.textContent ?? null,
      overlayProgress: Number.parseFloat(overlayProgress?.textContent ?? 'NaN'),
      controllerStatus: controller?.dataset.storyController ?? null,
      dataActiveChapter: controller?.dataset.activeChapter ?? null,
      dataProgress: controller?.dataset.scrollProgress ?? null,
    } satisfies HarnessState;
  });
}

/** Scroll the chapter's top edge well past its `top center` start. */
async function scrollToChapter(page: Page, id: string): Promise<void> {
  await page.evaluate((chapterId) => {
    const element = document.getElementById(chapterId);
    if (!element) throw new Error(`Missing chapter ${chapterId}`);
    window.scrollTo(0, element.offsetTop + 60);
  }, id);

  await page.waitForFunction((chapterId) => {
    return window.__scrollDirector?.debugState().activeChapterId === chapterId;
  }, id);
}

async function scrollToAbsolute(page: Page, top: number): Promise<number> {
  await page.evaluate((target) => window.scrollTo(0, target), top);
  await page.waitForFunction((target) => Math.abs(window.scrollY - target) <= 2, top);
  return page.evaluate(() => window.scrollY);
}

/**
 * Lenis keeps easing after a key press. Wait until the position stops moving so
 * each keyboard assertion compares settled positions rather than momentum.
 */
async function waitForScrollSettled(page: Page): Promise<number> {
  let previous = await page.evaluate(() => window.scrollY);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await page.waitForTimeout(50);
    const current = await page.evaluate(() => window.scrollY);
    if (Math.abs(current - previous) < 0.5) return current;
    previous = current;
  }

  return previous;
}

test.describe('ScrollDirector and Lenis', () => {
  test('scrolling updates the active chapter, progress, and the dev overlay', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForDirector(page);

    const initial = await readDebug(page);
    expect(initial.driver).toBe('gsap.ticker');
    expect(initial.triggerCount).toBe(4);
    expect(initial.scrollTriggerCount).toBe(4);
    expect(initial.activeChapterId).toBe('chapter-1');

    const overlay = await readHarnessState(page);
    expect(overlay.controllerStatus).toBe('ready');
    expect(overlay.overlayActive).toBe('chapter-1');
    expect(overlay.overlayProgress).toBeGreaterThanOrEqual(0);
    expect(overlay.overlayProgress).toBeLessThanOrEqual(1);

    for (const id of ['chapter-2', 'chapter-3', 'chapter-4']) {
      await scrollToChapter(page, id);

      const state = await readDebug(page);
      expect(state.activeChapterId, `active chapter after scrolling to ${id}`).toBe(id);
      expect(state.chapters.find((chapter) => chapter.id === id)?.active).toBe(true);

      const view = await readHarnessState(page);
      expect(view.overlayActive, `overlay after scrolling to ${id}`).toBe(id);
      expect(view.dataActiveChapter).toBe(id);
      expect(view.overlayProgress).toBeGreaterThanOrEqual(0);
      expect(view.overlayProgress).toBeLessThanOrEqual(1);
      expect(Number(view.dataProgress)).toBeCloseTo(view.overlayProgress, 3);
    }

    // Progress within one chapter must advance without a chapter change.
    await scrollToChapter(page, 'chapter-2');
    const early = await readDebug(page);
    const earlyProgress =
      early.chapters.find((chapter) => chapter.id === 'chapter-2')?.progress ?? Number.NaN;
    const chapterTwo = await page.evaluate(() => {
      const element = document.getElementById('chapter-2');
      if (!element) throw new Error('Missing chapter-2');
      return element.offsetTop;
    });
    await scrollToAbsolute(page, chapterTwo + 320);

    // ScrollTrigger may publish the new progress on the next frame.
    await page.waitForFunction(
      ({ id, min }) => {
        const chapter = window.__scrollDirector
          ?.debugState()
          .chapters.find((candidate) => candidate.id === id);
        return chapter !== undefined && chapter.progress > min;
      },
      { id: 'chapter-2', min: earlyProgress },
    );

    const late = await readDebug(page);

    expect(late.activeChapterId).toBe('chapter-2');
    const lateProgress =
      late.chapters.find((chapter) => chapter.id === 'chapter-2')?.progress ?? Number.NaN;
    expect(lateProgress).toBeGreaterThan(earlyProgress);
    const lateOverlay = await readHarnessState(page);
    expect(Number(lateOverlay.dataProgress)).toBeCloseTo(lateProgress, 3);

    expect(errors).toEqual([]);
  });

  test('the document is the scroller and the native scrollbar is not hidden', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForDirector(page);

    const surface = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        scrollerIsDocument: document.scrollingElement === document.documentElement,
        htmlOverflow: html.overflowY,
        bodyOverflow: body.overflowY,
        htmlInlineOverflow: html.overflowX,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        lenisClass: document.documentElement.classList.contains('lenis'),
      };
    });

    expect(surface.scrollerIsDocument).toBe(true);
    expect(surface.htmlOverflow).not.toBe('hidden');
    expect(surface.htmlOverflow).not.toBe('clip');
    expect(surface.bodyOverflow).not.toBe('hidden');
    expect(surface.bodyOverflow).not.toBe('clip');
    expect(surface.htmlInlineOverflow).not.toBe('hidden');
    expect(surface.documentHeight).toBeGreaterThan(surface.viewportHeight * 3);

    const before = await page.evaluate(() => window.scrollY);
    const after = await scrollToAbsolute(page, Math.round(surface.viewportHeight * 1.5));
    expect(after).toBeGreaterThan(before);
    expect(surface.lenisClass).toBe(true);
    expect(errors).toEqual([]);
  });

  test('PageDown, PageUp, arrows, Home, and End all scroll', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HARNESS);
    await waitForDirector(page);
    await scrollToAbsolute(page, 0);

    const press = async (key: string): Promise<number> => {
      const before = await waitForScrollSettled(page);
      await page.keyboard.press(key);
      await page.waitForFunction((start) => Math.abs(window.scrollY - start) > 1, before);
      return waitForScrollSettled(page);
    };

    const pageDown = await press('PageDown');
    expect(pageDown).toBeGreaterThan(0);

    const arrowDown = await press('ArrowDown');
    expect(arrowDown).toBeGreaterThan(pageDown);

    const arrowUp = await press('ArrowUp');
    expect(arrowUp).toBeLessThan(arrowDown);

    const pageUp = await press('PageUp');
    expect(pageUp).toBeLessThan(arrowUp);

    await page.keyboard.press('Home');
    await waitForScrollSettled(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.abs(window.scrollY - max) <= 2;
    });
    await waitForScrollSettled(page);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(pageDown);

    expect(errors).toEqual([]);
  });

  test('reduced motion disables Lenis but leaves native scrolling intact', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(HARNESS);
    await waitForDirector(page);

    const state = await readDebug(page);
    expect(state.lenis.enabled).toBe(false);
    expect(state.lenis.reason).toBe('reduced-motion');
    expect(state.lenis.reducedMotion).toBe(true);
    expect(state.lenis.instance).toBe(false);

    const root = await page.evaluate(() => ({
      dataLenis: document.documentElement.dataset.lenis,
      reason: document.documentElement.dataset.lenisReason,
      hasLenisClass: document.documentElement.classList.contains('lenis'),
    }));
    expect(root.dataLenis).toBe('off');
    expect(root.reason).toBe('reduced-motion');
    expect(root.hasLenisClass).toBe(false);

    await scrollToChapter(page, 'chapter-3');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('?lenis=off is an explicit test mode and disables Lenis', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HARNESS}?lenis=off`);
    await waitForDirector(page);

    const state = await readDebug(page);
    expect(state.lenis.enabled).toBe(false);
    expect(state.lenis.reason).toBe('test-mode');
    expect(state.lenis.testMode).toBe(true);
    expect(state.lenis.instance).toBe(false);

    const root = await page.evaluate(() => ({
      dataLenis: document.documentElement.dataset.lenis,
      reason: document.documentElement.dataset.lenisReason,
      hasLenisClass: document.documentElement.classList.contains('lenis'),
    }));
    expect(root.dataLenis).toBe('off');
    expect(root.reason).toBe('test-mode');
    expect(root.hasLenisClass).toBe(false);

    await scrollToChapter(page, 'chapter-2');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('an authored data-lenis="off" marker is test mode', async ({ page }) => {
    const errors = watchErrors(page);

    await page.route('**/dev/scroll-smoke', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        '<html lang="en"',
        '<html lang="en" data-lenis="off"',
      );
      await route.fulfill({ response, body });
    });

    await page.goto(HARNESS);
    await waitForDirector(page);

    const state = await readDebug(page);
    expect(state.lenis.enabled).toBe(false);
    expect(state.lenis.reason).toBe('test-mode');
    expect(state.lenis.testMode).toBe(true);
    expect(await page.evaluate(() => document.documentElement.dataset.lenis)).toBe('off');

    await scrollToChapter(page, 'chapter-2');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('a coarse pointer disables Lenis (or at least matches the detection state)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = watchErrors(page);

    await page.goto(HARNESS);
    await waitForDirector(page);

    const result = await page.evaluate(() => {
      const state = window.__scrollDirector?.debugState() ?? null;
      return {
        coarse: window.matchMedia('(pointer: coarse)').matches,
        state,
        dataLenis: document.documentElement.dataset.lenis,
        hasLenisClass: document.documentElement.classList.contains('lenis'),
      };
    });

    expect(result.state).not.toBeNull();
    expect(result.state?.lenis.coarsePointer).toBe(result.coarse);

    if (result.coarse) {
      expect(result.state?.lenis.enabled).toBe(false);
      expect(result.state?.lenis.reason).toBe('coarse-pointer');
      expect(result.dataLenis).toBe('off');
      expect(result.hasLenisClass).toBe(false);
    } else {
      // Chromium can report a fine pointer in headless emulation. The detection
      // contract still has to agree with matchMedia.
      expect(result.state?.lenis.reason).toBe('enabled');
    }

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForFunction(() => window.scrollY > 0);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('destroy reverts every trigger and is idempotent', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HARNESS}?lenis=off`);
    await waitForDirector(page);

    const before = await readDebug(page);
    expect(before.triggerCount).toBe(4);
    expect(before.scrollTriggerCount).toBe(4);

    const after = await page.evaluate(() => {
      const director = window.__scrollDirector;
      if (!director) throw new Error('ScrollDirector is not mounted.');
      director.destroy();
      director.destroy();
      return director.debugState();
    });

    expect(after.destroyed).toBe(true);
    expect(after.triggerCount).toBe(0);
    expect(after.scrollTriggerCount).toBe(0);
    expect(after.activeChapterId).toBeNull();

    const root = await page.evaluate(() => ({
      dataLenis: document.documentElement.dataset.lenis,
      dataTriggers: document.documentElement.dataset.scrollTriggers,
      dataChapters: document.documentElement.dataset.scrollChapters,
      hasLenisClass: document.documentElement.classList.contains('lenis'),
    }));
    expect(root.dataLenis).toBeUndefined();
    expect(root.hasLenisClass).toBe(false);
    expect(root.dataTriggers).toBe('0');
    expect(root.dataChapters).toBe('0');

    // Native scrolling still works after the director is gone.
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForFunction(() => window.scrollY > 0);
    expect(errors).toEqual([]);
  });

  test('ten navigations leave exactly one director and one trigger set', async ({ page }) => {
    const errors = watchErrors(page);

    for (let iteration = 0; iteration < 10; iteration += 1) {
      await page.goto('/');
      await page.goto(`${HARNESS}?lenis=off`);
      await waitForDirector(page);

      const snapshot = await page.evaluate(() => {
        const state = window.__scrollDirector?.debugState() ?? null;
        return {
          mounts: window.__scrollDirectorMounts,
          controllers: document.querySelectorAll('.story-controller').length,
          readyControllers: document.querySelectorAll(
            '.story-controller[data-story-controller="ready"]',
          ).length,
          triggerCount: state?.triggerCount,
          scrollTriggerCount: state?.scrollTriggerCount,
          dataTriggers: document.documentElement.dataset.scrollTriggers,
          dataChapters: document.documentElement.dataset.scrollChapters,
          destroyed: state?.destroyed,
        };
      });

      expect(snapshot.mounts, `mount count at navigation ${iteration + 1}`).toBe(1);
      expect(snapshot.controllers, `controller count at navigation ${iteration + 1}`).toBe(1);
      expect(snapshot.readyControllers).toBe(1);
      expect(snapshot.triggerCount).toBe(4);
      expect(snapshot.scrollTriggerCount).toBe(4);
      expect(snapshot.dataTriggers).toBe('4');
      expect(snapshot.dataChapters).toBe('4');
      expect(snapshot.destroyed).toBe(false);
    }

    expect(errors).toEqual([]);
  });

  test('back and forward restore the page and scrolling still works', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto('/');
    await page.goto(HARNESS);
    await waitForDirector(page);
    await scrollToChapter(page, 'chapter-3');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Algorithm Stories' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/scroll-smoke$/);
    await waitForDirector(page);
    await scrollToChapter(page, 'chapter-2');

    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Algorithm Stories' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/scroll-smoke$/);
    await waitForDirector(page);
    await scrollToChapter(page, 'chapter-4');

    expect(errors).toEqual([]);
  });
});
