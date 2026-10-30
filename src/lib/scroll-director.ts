/**
 * ScrollDirector — the single source of scroll truth for a story.
 *
 * Responsibilities:
 * - create one ScrollTrigger per chapter and report entry, progress, and exit;
 * - integrate Lenis with ScrollTrigger, using the GSAP ticker as the only RAF
 *   driver, and disable Lenis when smoothing would take control away from the
 *   reader;
 * - expose a small debug snapshot for browser tests;
 * - tear down every trigger, ticker callback, listener, and Lenis instance.
 *
 * It deliberately does NOT own simulation time, step an engine, transform
 * parameters, or interpolate scene values. Callers decide what a chapter event
 * means. `docs/technology.md` §4.4 and §4.5 make that separation normative.
 *
 * Lenis policy (see `scroll-policy.ts`):
 * - test mode: `?lenis=off`, or an authored `data-lenis="off"` before mount;
 * - `prefers-reduced-motion: reduce`;
 * - `(pointer: coarse)`.
 * The effective state is mirrored to `data-lenis="on|off"` on `<html>`.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  isLenisTestMode,
  resolveSmoothScrollPolicy,
  type SmoothScrollEnvironment,
  type SmoothScrollPolicy,
} from './scroll-policy';

export type ScrollDirection = -1 | 1;

export interface ScrollChapterEvent {
  /** Stable chapter id (the element id unless the spec overrides it). */
  readonly id: string;
  /** Progress through this chapter's trigger range, 0 at start, 1 at end. */
  readonly progress: number;
  /** 1 while scrolling down, -1 while scrolling up. */
  readonly direction: ScrollDirection;
  /** Window scroll offset when the event was emitted. */
  readonly scrollY: number;
  /** The chapter element. */
  readonly element: HTMLElement;
}

export interface ScrollChapterCallbacks {
  readonly onEnter?: (event: ScrollChapterEvent) => void;
  readonly onProgress?: (event: ScrollChapterEvent) => void;
  readonly onExit?: (event: ScrollChapterEvent) => void;
}

export interface ScrollChapterSpec extends ScrollChapterCallbacks {
  /** Defaults to the element's id. One of the two is required. */
  readonly id?: string;
  /** ScrollTrigger start. Defaults to `top center`. */
  readonly start?: string | number;
  /** ScrollTrigger end. Defaults to `bottom center`. */
  readonly end?: string | number;
}

export interface ScrollActiveChange {
  readonly id: string;
  readonly previousId: string | null;
  readonly progress: number;
  readonly direction: ScrollDirection;
}

export interface ScrollDirectorOptions extends ScrollChapterCallbacks {
  /** Fires when the active chapter changes, including the first activation. */
  readonly onActiveChange?: (change: ScrollActiveChange) => void;
}

export interface ScrollChapterDebugState {
  readonly id: string;
  readonly progress: number;
  readonly active: boolean;
  readonly start: number;
  readonly end: number;
}

export interface ScrollDirectorDebugState {
  readonly activeChapterId: string | null;
  readonly chapters: readonly ScrollChapterDebugState[];
  /** Triggers owned by this director. */
  readonly triggerCount: number;
  /** Every live ScrollTrigger in the document; a leak detector for tests. */
  readonly scrollTriggerCount: number;
  readonly scrollY: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly lenis: SmoothScrollPolicy & { readonly instance: boolean };
  /** The single animation driver. Lenis RAF is called from this ticker. */
  readonly driver: 'gsap.ticker';
  readonly destroyed: boolean;
}

interface ChapterRecord {
  readonly id: string;
  readonly element: HTMLElement;
  readonly spec: ScrollChapterSpec;
  readonly trigger: ReturnType<typeof ScrollTrigger.create>;
  progress: number;
  active: boolean;
}

declare global {
  interface Window {
    /** The live director for development and browser tests. */
    __scrollDirector?: ScrollDirector;
    /** Snapshot helper; safe to call after hydration. */
    __scrollDirectorDebug?: () => ScrollDirectorDebugState;
    /** Incremented by StoryController on every mount. */
    __scrollDirectorMounts?: number;
  }
}

let pluginsRegistered = false;

/** Registration is deferred until browser construction, never module import. */
function registerScrollTrigger(): void {
  if (pluginsRegistered) return;
  gsap.registerPlugin(ScrollTrigger);
  pluginsRegistered = true;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(value, 1));

export class ScrollDirector {
  private readonly options: ScrollDirectorOptions;
  private readonly context: gsap.Context;
  private readonly chapters = new Map<string, ChapterRecord>();
  private readonly reducedMotionQuery: MediaQueryList;
  private readonly coarsePointerQuery: MediaQueryList;
  // Assigned synchronously by applySmoothScrollPolicy() in the constructor.
  private policy!: SmoothScrollPolicy;
  private lenis: Lenis | null = null;
  private tickerCallback: ((time: number) => void) | null = null;
  private activeChapterIdValue: string | null = null;
  private destroyed = false;

  constructor(options: ScrollDirectorOptions = {}) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('ScrollDirector is browser-only. Construct it inside onMount.');
    }

    registerScrollTrigger();
    this.options = options;
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.coarsePointerQuery = window.matchMedia('(pointer: coarse)');
    this.context = gsap.context(() => {
      // Chapter triggers are added to this context in registerChapter().
    });

    this.applySmoothScrollPolicy();
    this.reducedMotionQuery.addEventListener('change', this.handleEnvironmentChange);
    this.coarsePointerQuery.addEventListener('change', this.handleEnvironmentChange);
  }

  /** The chapter whose trigger most recently received entry. */
  get activeChapterId(): string | null {
    return this.activeChapterIdValue;
  }

  /**
   * Register one chapter. The trigger is created inside the director's
   * `gsap.context`, so `destroy()` can revert it and no ScrollTrigger leaks.
   */
  registerChapter(element: HTMLElement, spec: ScrollChapterSpec = {}): string {
    if (this.destroyed) {
      throw new Error('Cannot register a chapter on a destroyed ScrollDirector.');
    }

    const id = spec.id ?? element.id;
    if (!id) {
      throw new Error('A chapter needs an id on the element or in its ScrollChapterSpec.');
    }

    if (this.chapters.has(id)) {
      this.unregisterChapter(id);
    }

    this.context.add(() => {
      const trigger = ScrollTrigger.create({
        trigger: element,
        start: spec.start ?? 'top center',
        end: spec.end ?? 'bottom center',
        onEnter: (self) => this.handleEnter(id, self.progress, self.direction === -1 ? -1 : 1),
        onEnterBack: (self) => this.handleEnter(id, self.progress, self.direction === -1 ? -1 : 1),
        onLeave: (self) => this.handleExit(id, self.progress, 1),
        onLeaveBack: (self) => this.handleExit(id, self.progress, -1),
        onUpdate: (self) => this.handleProgress(id, self.progress, self.direction === -1 ? -1 : 1),
      });

      this.chapters.set(id, {
        id,
        element,
        spec,
        trigger,
        progress: clamp01(trigger.progress),
        active: trigger.isActive,
      });
    });

    this.syncDataAttributes();
    return id;
  }

  /** Remove one chapter and kill its trigger. Safe to call for unknown ids. */
  unregisterChapter(id: string): boolean {
    const record = this.chapters.get(id);
    if (!record) return false;

    record.trigger.kill();
    this.chapters.delete(id);
    if (this.activeChapterIdValue === id) {
      this.activeChapterIdValue = null;
    }
    this.syncDataAttributes();
    return true;
  }

  /**
   * Re-measure every trigger after layout changes (fonts, images, resize,
   * dynamic chapter content). Presentation-only; never touches engine state.
   */
  refresh(): void {
    if (this.destroyed) return;

    ScrollTrigger.refresh();
    this.lenis?.resize();
    this.syncActiveChapter();
    this.syncDataAttributes();
  }

  /** Snapshot of the current scroll state. Cheap enough for tests and the HUD. */
  debugState(): ScrollDirectorDebugState {
    const chapters = Array.from(this.chapters.values(), (record) => ({
      id: record.id,
      progress: clamp01(record.progress),
      active: record.active,
      start: record.trigger.start,
      end: record.trigger.end,
    }));

    return {
      activeChapterId: this.activeChapterIdValue,
      chapters,
      triggerCount: chapters.length,
      scrollTriggerCount: ScrollTrigger.getAll().length,
      scrollY: window.scrollY,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      lenis: { ...this.policy, instance: this.lenis !== null },
      driver: 'gsap.ticker',
      destroyed: this.destroyed,
    };
  }

  /** Full cleanup. Idempotent, including after component teardown races. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.reducedMotionQuery.removeEventListener('change', this.handleEnvironmentChange);
    this.coarsePointerQuery.removeEventListener('change', this.handleEnvironmentChange);

    this.stopLenis();

    for (const record of this.chapters.values()) {
      record.trigger.kill();
    }
    this.chapters.clear();
    this.activeChapterIdValue = null;

    // Reverts every trigger and animation created inside the context.
    this.context.revert();

    const root = document.documentElement;
    // Leave no controller-owned state behind. A remount in a view-transition
    // document must re-evaluate the environment from scratch.
    delete root.dataset.lenis;
    delete root.dataset.lenisReason;
    delete root.dataset.lenisManaged;
    this.syncDataAttributes();
  }

  private readonly handleEnvironmentChange = (): void => {
    if (this.destroyed) return;
    this.applySmoothScrollPolicy();
  };

  private handleEnter(id: string, progress: number, direction: ScrollDirection): void {
    const record = this.chapters.get(id);
    if (!record) return;

    const previousId = this.activeChapterIdValue;
    this.activeChapterIdValue = id;
    for (const candidate of this.chapters.values()) {
      candidate.active = candidate.id === id;
    }
    record.progress = clamp01(progress);

    if (previousId !== id) {
      this.options.onActiveChange?.({
        id,
        previousId,
        progress: record.progress,
        direction,
      });
    }

    this.emit('onEnter', record, direction);
  }

  private handleProgress(id: string, progress: number, direction: ScrollDirection): void {
    const record = this.chapters.get(id);
    if (!record) return;

    record.progress = clamp01(progress);
    if (this.activeChapterIdValue !== id) {
      this.handleEnter(id, record.progress, direction);
    }
    this.emit('onProgress', record, direction);
  }

  private handleExit(id: string, progress: number, direction: ScrollDirection): void {
    const record = this.chapters.get(id);
    if (!record) return;

    record.progress = clamp01(progress);
    record.active = false;
    this.emit('onExit', record, direction);
  }

  private emit(
    kind: 'onEnter' | 'onProgress' | 'onExit',
    record: ChapterRecord,
    direction: ScrollDirection,
  ): void {
    const event: ScrollChapterEvent = {
      id: record.id,
      progress: clamp01(record.progress),
      direction,
      scrollY: window.scrollY,
      element: record.element,
    };

    record.spec[kind]?.(event);
    this.options[kind]?.(event);
  }

  /**
   * After a refresh or first registration, ScrollTrigger may already be inside
   * a chapter without firing `onEnter`. Report the chapter that contains the
   * viewport centre so the overlay and rail have a coherent initial value.
   */
  private syncActiveChapter(): void {
    if (this.destroyed || this.chapters.size === 0) return;

    const records = Array.from(this.chapters.values());
    const active = records.find((record) => record.active || record.trigger.isActive);

    if (active) {
      if (this.activeChapterIdValue !== active.id) {
        this.handleEnter(active.id, active.trigger.progress, 1);
      } else {
        active.progress = clamp01(active.trigger.progress);
        this.emit('onProgress', active, 1);
      }
      return;
    }

    // Before the first start or after the last end, look at the nearest range.
    const scroll = window.scrollY;
    const sorted = [...records].sort((a, b) => a.trigger.start - b.trigger.start);
    const nearest =
      sorted.find((record) => scroll < record.trigger.start) ?? sorted[sorted.length - 1];
    if (nearest && this.activeChapterIdValue !== nearest.id) {
      this.handleEnter(nearest.id, nearest.trigger.progress, 1);
    }
  }

  private applySmoothScrollPolicy(): void {
    const environment = this.readEnvironment();
    this.policy = resolveSmoothScrollPolicy(environment);

    if (this.policy.enabled) {
      this.startLenis();
    } else {
      this.stopLenis();
    }

    const root = document.documentElement;
    root.dataset.lenis = this.policy.enabled ? 'on' : 'off';
    root.dataset.lenisReason = this.policy.reason;
    // Mark the attribute as controller-owned so a later instance in the same
    // document does not mistake the reflected state for an authored opt-out.
    root.dataset.lenisManaged = 'true';
    this.syncDataAttributes();
  }

  private readEnvironment(): SmoothScrollEnvironment {
    const root = document.documentElement;
    const authoredAttribute = root.dataset.lenisManaged === 'true' ? null : root.dataset.lenis;

    return {
      testMode: isLenisTestMode(window.location.search, authoredAttribute),
      reducedMotion: this.reducedMotionQuery.matches,
      coarsePointer: this.coarsePointerQuery.matches,
    };
  }

  private startLenis(): void {
    if (this.lenis) return;

    const lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      // Touch devices are excluded by policy; keep this off as a second guard.
      syncTouch: false,
      autoResize: true,
      respectReducedMotion: true,
    });

    this.lenis = lenis;
    lenis.on('scroll', this.handleLenisScroll);

    // The GSAP ticker is the only animation driver on the page.
    this.tickerCallback = (time: number): void => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(this.tickerCallback);
    gsap.ticker.lagSmoothing(0);

    ScrollTrigger.refresh();
  }

  private stopLenis(): void {
    if (this.tickerCallback) {
      gsap.ticker.remove(this.tickerCallback);
      this.tickerCallback = null;
    }

    if (this.lenis) {
      this.lenis.off('scroll', this.handleLenisScroll);
      this.lenis.destroy();
      this.lenis = null;
    }

    const root = document.documentElement;
    for (const className of [
      'lenis',
      'lenis-smooth',
      'lenis-scrolling',
      'lenis-stopped',
      'lenis-locked',
      'lenis-autoToggle',
    ]) {
      root.classList.remove(className);
    }
  }

  private readonly handleLenisScroll = (): void => {
    // ScrollTrigger reads the native scroll position; Lenis only changes how
    // the browser arrives there. This keeps triggers in sync with smoothing.
    ScrollTrigger.update();
  };

  private syncDataAttributes(): void {
    const root = document.documentElement;
    root.dataset.scrollChapters = String(this.chapters.size);
    root.dataset.scrollTriggers = String(ScrollTrigger.getAll().length);
    if (this.activeChapterIdValue) {
      root.dataset.scrollChapter = this.activeChapterIdValue;
    } else {
      delete root.dataset.scrollChapter;
    }
  }
}
