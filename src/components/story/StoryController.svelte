<script lang="ts">
  /**
   * Story controller.
   *
   * One island owns the story runtime for one route:
   *
   * - it reads the typed `StoryConfig` and constructs the engine inside the
   *   island (functions cannot cross the Astro hydration boundary);
   * - it constructs the renderer inside the island and hands it to
   *   `StoryStage`, which owns the single GSAP ticker callback;
   * - it registers every chapter element with `ScrollDirector`;
   * - it composes a `SceneState` from the chapter scene, chapter overrides, and
   *   scroll progress, then calls `setScene`;
   * - it advances the fixed-step clock and engine from `StoryStage.onFrame`;
   * - it owns deep links, replay, pause, speed, and teardown.
   *
   * Scroll never mutates engine parameters. A chapter entry may apply the
   * story's typed parameter defaults (and a `StoryConfig` chapter override),
   * but progress only changes camera, layer opacity, highlights, and reveal.
   *
   * Layout and motion are progressive enhancements:
   *
   * - the server renders the article layout; the stage exists only after
   *   `enhanced` flips in onMount, and never in article mode;
   * - reduced motion (OS or the reader's further-reduced choice) starts paused,
   *   ignores scroll progress for scene composition, and exposes discrete
   *   keyframe stepping instead of scrubbing;
   * - article mode and the manual motion choice persist through the safe
   *   `localStorage` wrapper, which degrades to "no preference".
   */

  import { onDestroy, onMount, type Snippet } from 'svelte';
  import { SITE_URL } from '../../config/site';
  import { FixedStepClock } from '../../engines/core/clock';
  import {
    parseUrlState,
    serializeUrlState,
    type UrlStateNotice,
  } from '../../engines/core/url-state';
  import {
    type ChapterSceneOverrides,
    parseChapterSceneOverrides,
    type RailChapterInfo,
  } from '../../lib/chapter-metadata';
  import { shareUrl } from '../../lib/clipboard';
  import {
    parseStoredMotionPreference,
    resolveMotionPreference,
    serializeMotionPreference,
  } from '../../lib/motion-policy';
  import {
    isPersistenceAvailable,
    PREFERENCE_KEYS,
    readPreference,
    writePreference,
  } from '../../lib/persistence';
  import { composeSceneState } from '../../lib/scene-composition';
  import { type ScrollChapterEvent, ScrollDirector } from '../../lib/scroll-director';
  import type { SceneState } from '../../render/types';
  import { loadStoryModule, type StoryModule } from '../../stories/loader';
  import type { ChapterSpec } from '../../stories/registry';
  import type {
    StoryMetric,
    StoryModuleView,
    StoryParamBag,
    StoryRuntime,
  } from '../../stories/runtime';
  import { presetParams } from '../../stories/runtime';
  import Metrics from '../controls/Metrics.svelte';
  import PresetPicker from '../controls/PresetPicker.svelte';
  import SeedControl from '../controls/SeedControl.svelte';
  import Slider from '../controls/Slider.svelte';
  import Toggle from '../controls/Toggle.svelte';
  import ArticleModeToggle from './ArticleModeToggle.svelte';
  import ProgressRail from './ProgressRail.svelte';
  import StageChrome from './StageChrome.svelte';
  import StoryStage from './StoryStage.svelte';
  import type {
    StoryRuntimeDebugState,
    StoryRuntimeEntryState,
  } from './story-runtime-debug';
  import type { StoryStageHandle } from './story-stage-types';

  interface Props {
    /**
     * Key into the story-config registry. The controller loads this config with
     * a dynamic import; it never imports a concrete story itself.
     */
    storyKey: string;
    /** CSS selector for chapter elements. One director owns every match. */
    chapterSelector?: string;
    /**
     * Chapter list known at build time. It lets the progress rail and its
     * fragment links render in the article/no-JS document; onMount replaces it
     * with the measured DOM ids, which remain the runtime source of truth.
     */
    initialChapters?: readonly RailChapterInfo[];
    /** Accessible name for the focusable stage region. */
    stageLabel?: string;
    /** Low-frequency text alternative for the canvas content. */
    stageDescription?: string;
    /** Prose chapters. They are server-rendered and remain readable without JS. */
    children?: Snippet;
  }

  let {
    storyKey,
    chapterSelector = '[data-story-chapter]',
    initialChapters = [],
    stageLabel = 'Interactive story stage',
    stageDescription = 'A deterministic simulation whose camera, visible layers, and highlights follow the active chapter. The canvas is decorative; chapter prose and stage labels carry the meaning.',
    children,
  }: Props = $props();

  /**
   * Server-safe empty state. The story module resolves in onMount; nothing in
   * the server-rendered article depends on a parameter being present.
   */
  const EMPTY_PARAMS: StoryParamBag = Object.freeze({ seed: 0 });

  interface RuntimeChapter {
    readonly id: string;
    readonly title: string;
    readonly sceneId: string;
    readonly overrides: ChapterSceneOverrides;
    readonly element: HTMLElement;
    readonly spec: ChapterSpec<StoryParamBag> | undefined;
  }

  const EMPTY_SNAPSHOT: Readonly<object> = Object.freeze({});
  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
  /** Backward stepping replays from reset; cap the work a long run can cause. */
  const MAX_REPLAY_STEPS = 10_000;
  /** A chapter without `reducedMotionSteps` exposes one settled keyframe. */
  const DEFAULT_REDUCED_MOTION_STEPS = 1;

  let root: HTMLElement | null = null;

  let story = $state<StoryModuleView | null>(null);
  let status = $state<'pending' | 'ready' | 'error' | 'destroyed'>('pending');
  let activeChapterId = $state<string | null>(null);
  let activeSceneId = $state<string | null>(null);
  let activeChapterTitle = $state('');
  let activeProgress = $state(0);
  let lastEvent = $state('');
  let paused = $state(false);
  let speed = $state(1);
  let scene = $state<SceneState | null>(null);
  let params = $state<StoryParamBag>({ ...EMPTY_PARAMS });
  let chapters = $state<readonly RailChapterInfo[]>(initialChapters);
  let selectedPreset = $state<string | null>(null);
  /**
   * Enhancement marker. False on the server and during hydration, so the
   * server-rendered document is the article layout. It flips only in onMount.
   */
  let enhanced = $state(false);
  let articleMode = $state(false);
  let systemReducedMotion = $state(false);
  let manualReducedMotion = $state(false);
  let sceneStep = $state(0);
  let persistenceAvailable = $state(false);
  let urlNotices = $state<readonly UrlStateNotice[]>([]);
  let shareStatus = $state<{ readonly ok: boolean; readonly message: string } | null>(null);
  let sharing = $state(false);
  let metricItems = $state<readonly StoryMetric[]>([]);

  let director: ScrollDirector | null = null;
  let runtime: StoryRuntime | null = null;
  let clock: FixedStepClock | null = null;
  let stageHandle: StoryStageHandle | null = null;
  let motionQuery: MediaQueryList | null = null;
  let runtimeChapters = new Map<string, RuntimeChapter>();
  /** Reader overrides persist across chapter entry; chapters reset the run only. */
  let readerParams: Partial<StoryParamBag> = {};
  let simulatedSeconds = 0;
  let stepCount = 0;
  let frameCount = 0;
  let metricSignature = '';
  let metricTimer: ReturnType<typeof setInterval> | null = null;
  let mounted = false;
  let cleanupDone = false;
  let listeners: AbortController | null = null;
  let initialHash = '';
  let urlChapter: string | null = null;
  let chapterIds: readonly string[] = [];
  let urlSyncTimer: number | null = null;

  /**
   * Deterministic starting state for the most recent chapter entry. It is
   * recorded after the run has been reset and before any frame can advance, so
   * deep links, forward scroll, reverse scroll, and reload can be compared
   * without racing the simulation clock.
   */
  let entryState = $state<StoryRuntimeEntryState | null>(null);
  let entryCount = 0;

  /** Query fields that may stay in the address bar but are never story state. */
  const RESERVED_QUERY_KEYS: ReadonlySet<string> = new Set([
    '__proto__',
    'prototype',
    'constructor',
  ]);

  let activeIndex = $derived(
    activeChapterId === null
      ? -1
      : chapters.findIndex((chapter) => chapter.id === activeChapterId),
  );

  /**
   * Typed accessors for the shell's primitive parameter bag. The concrete story
   * types stay behind `StoryRuntime`; the shell only needs these values for its
   * development control panel and debug attributes.
   */
  function numberParam(bag: StoryParamBag, key: string): number | null {
    const value = bag[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function stringParam(bag: StoryParamBag, key: string): string | null {
    const value = bag[key];
    return typeof value === 'string' ? value : null;
  }

  function booleanParam(bag: StoryParamBag, key: string): boolean | null {
    const value = bag[key];
    return typeof value === 'boolean' ? value : null;
  }

  let orbitValue = $derived(numberParam(params, 'orbit'));
  let trailsValue = $derived(booleanParam(params, 'trails'));
  let seedValue = $derived(numberParam(params, 'seed'));
  let variantValue = $derived(stringParam(params, 'variant'));

  /**
   * Effective motion policy. The OS preference is authoritative; the manual
   * preference can only add constraint. The story stage exists only after
   * hydration, and never in article mode.
   */
  let motionPreference = $derived(
    resolveMotionPreference({
      systemReduced: systemReducedMotion,
      manualReduced: manualReducedMotion,
    }),
  );
  let reducedMotion = $derived(motionPreference.reduced);
  let showStage = $derived(enhanced && !articleMode);
  let activeSceneStepCount = $derived(
    sceneStepCountFor(activeChapterId === null ? undefined : runtimeChapters.get(activeChapterId)),
  );

  /**
   * The story module owns the concrete renderer factory. The controller only
   * asks the non-generic runtime for one facade per stage mount; this keeps the
   * renderer hook out of the shell and makes the same controller serve the
   * development fixtures and ACO without a second import.
   */
  const createRenderer = () => {
    if (runtime === null) {
      throw new Error('The story runtime has not loaded yet.');
    }
    return runtime.createRenderer();
  };

  const getSnapshot = (): Readonly<object> => runtime?.snapshot() ?? EMPTY_SNAPSHOT;

  /** Keyframes declared by a chapter, with a safe settled minimum of one. */
  function sceneStepCountFor(chapter: RuntimeChapter | undefined): number {
    if (chapter?.spec?.reducedMotionSteps === undefined) return DEFAULT_REDUCED_MOTION_STEPS;
    return Math.max(DEFAULT_REDUCED_MOTION_STEPS, Math.floor(chapter.spec.reducedMotionSteps));
  }

  /** Progress represented by a discrete keyframe. The last frame is settled. */
  function keyframeProgress(step: number, count: number): number {
    if (count <= 1) return 1;
    return clamp01(step / (count - 1));
  }

  function readHash(): string {
    const raw = window.location.hash.replace(/^#/, '');
    if (raw.length === 0) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  /**
   * Chapter ids for URL validation. The DOM is the runtime source of truth;
   * the typed config is the fallback before chapters are measured.
   */
  function readChapterIds(): readonly string[] {
    if (root !== null) {
      const ids = Array.from(
        root.querySelectorAll<HTMLElement>(chapterSelector),
        (element) => element.id,
      ).filter((id) => id.length > 0);
      if (ids.length > 0) return ids;
    }
    return story?.chapters.map((chapter) => chapter.id) ?? [];
  }

  /** The canonical story query + fragment for the current state. */
  function canonicalUrlState() {
    const currentStory = story;
    if (currentStory === null) return { query: '', fragment: '' };
    return serializeUrlState(
      currentStory.urlParams,
      params,
      activeChapterId ?? urlChapter,
      {
        defaults: currentStory.defaults,
        chapterIds,
      },
    );
  }

  /**
   * Replace the address bar with the canonical story state. Unrelated query
   * fields (for example the development-only `?lenis=off` switch) are kept in
   * the live URL but never appear in a share link.
   */
  function syncUrlNow(): void {
    if (!mounted) return;
    const currentStory = story;
    if (currentStory === null) return;
    if (urlSyncTimer !== null) {
      window.clearTimeout(urlSyncTimer);
      urlSyncTimer = null;
    }

    const serialized = canonicalUrlState();
    const merged = new URLSearchParams(serialized.query);
    const knownQueries = new Set(currentStory.urlParams.params.map((param) => param.query));
    for (const [key, value] of new URLSearchParams(window.location.search)) {
      if (knownQueries.has(key) || RESERVED_QUERY_KEYS.has(key)) continue;
      merged.append(key, value);
    }

    const search = merged.toString();
    const relative = `${search.length > 0 ? `?${search}` : ''}${serialized.fragment}`;
    const next = `${window.location.pathname}${relative}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;

    // replaceState adds no history entry and does not scroll. `state` is
    // preserved for other routers or future history consumers.
    window.history.replaceState(window.history.state, '', next);
  }

  /** Debounced canonical URL update. Slider and chapter bursts collapse. */
  function scheduleUrlSync(delay = 180): void {
    if (!mounted) return;
    if (urlSyncTimer !== null) window.clearTimeout(urlSyncTimer);
    urlSyncTimer = window.setTimeout(() => {
      urlSyncTimer = null;
      syncUrlNow();
    }, delay);
  }

  /** Absolute share URL using the configured site origin, not the dev origin. */
  function canonicalAbsoluteUrl(): string {
    const serialized = canonicalUrlState();
    const base = new URL(SITE_URL);
    const url = new URL(window.location.pathname, base);
    url.search = serialized.query;
    url.hash = serialized.fragment;
    return url.toString();
  }

  async function shareCurrentState(): Promise<void> {
    if (sharing || story === null) return;
    sharing = true;
    const absolute = canonicalAbsoluteUrl();
    const result = await shareUrl(absolute);
    shareStatus = result.ok
      ? {
          ok: true,
          message:
            'Link copied. It restores this chapter, seed, and structural parameters at step 0. Canvas and map edits stay local.',
        }
      : {
          ok: false,
          message:
            'Could not copy the link. The address bar still holds the shareable URL.',
        };
    sharing = false;
  }

  function writeDebug(): void {
    if (root === null) return;
    root.dataset.storyKey = storyKey;
    root.dataset.simTime = simulatedSeconds.toFixed(3);
    root.dataset.simFrames = String(frameCount);
    root.dataset.simSteps = String(stepCount);
    root.dataset.paused = paused ? 'true' : 'false';
    root.dataset.speed = String(speed);
    const orbit = numberParam(params, 'orbit');
    if (orbit === null) delete root.dataset.engineOrbit;
    else root.dataset.engineOrbit = orbit.toFixed(3);
    const trails = booleanParam(params, 'trails');
    if (trails === null) delete root.dataset.engineTrails;
    else root.dataset.engineTrails = trails ? 'true' : 'false';
    const seed = numberParam(params, 'seed');
    if (seed === null) delete root.dataset.engineSeed;
    else root.dataset.engineSeed = String(seed);
    const variant = stringParam(params, 'variant');
    if (variant === null) delete root.dataset.engineVariant;
    else root.dataset.engineVariant = variant;
    root.dataset.urlNoticeCodes = urlNotices.map((notice) => notice.code).join(' ');
    root.dataset.preset = selectedPreset ?? 'custom';
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';
    root.dataset.systemReducedMotion = systemReducedMotion ? 'true' : 'false';
    root.dataset.manualReducedMotion = manualReducedMotion ? 'true' : 'false';
    root.dataset.articleMode = articleMode ? 'true' : 'false';
    root.dataset.sceneStep = String(sceneStep);
    root.dataset.sceneStepCount = String(activeSceneStepCount);
    root.dataset.persistence = persistenceAvailable ? 'available' : 'unavailable';
    root.dataset.entryCount = String(entryCount);
    if (entryState !== null) {
      root.dataset.entryChapter = entryState.chapter;
      root.dataset.entryScene = entryState.scene;
      root.dataset.entrySeed = String(entryState.seed);
      root.dataset.entryStructural = JSON.stringify(entryState.structural);
      root.dataset.entrySteps = String(entryState.steps);
      root.dataset.entrySimTime = entryState.simulatedSeconds.toFixed(3);
      root.dataset.entrySceneStep = String(entryState.sceneStep);
    } else {
      delete root.dataset.entryChapter;
      delete root.dataset.entryScene;
      delete root.dataset.entrySeed;
      delete root.dataset.entryStructural;
      delete root.dataset.entrySteps;
      delete root.dataset.entrySimTime;
      delete root.dataset.entrySceneStep;
    }
    // The manual preference also disables CSS smooth scrolling when the OS
    // allows motion. Lenis is handled by ScrollDirector's override.
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }

  /**
   * Rebuild the metrics rows only when the signature changes. The story's own
   * hook formats the values; the controller supplies the clock counters and
   * calls this on chapter entry, pause/replay, and a one-second timer — never
   * from `handleFrame`.
   */
  function sampleMetrics(force = false): void {
    if (runtime === null) return;
    const next = runtime.metrics({ simulatedSeconds, steps: stepCount });

    const signature = next.map((item) => `${item.id}=${item.value}`).join('|');
    if (!force && signature === metricSignature) return;
    metricSignature = signature;
    metricItems = next;
  }

  function resolveParams(spec: ChapterSpec<StoryParamBag> | undefined): StoryParamBag {
    const overrides = spec?.sceneOverrides?.params;
    // Parameter changes happen on chapter entry only, never on progress. Reader
    // control overrides sit on top so a slider or toggle does not get wiped out
    // when the next chapter applies its own typed defaults.
    const defaults = story?.defaults ?? EMPTY_PARAMS;
    const base = overrides === undefined ? { ...defaults } : { ...defaults, ...overrides };
    return { ...base, ...readerParams };
  }

  function readChapters(): {
    readonly runtime: readonly RuntimeChapter[];
    readonly rail: readonly RailChapterInfo[];
  } {
    const currentStory = story;
    if (root === null || currentStory === null) return { runtime: [], rail: [] };

    const elements = Array.from(root.querySelectorAll<HTMLElement>(chapterSelector));
    const runtime: RuntimeChapter[] = [];
    const rail: RailChapterInfo[] = [];

    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      if (element === undefined) continue;

      const id = element.id;
      if (id.length === 0) {
        throw new Error('Every story chapter needs a stable id for its deep link.');
      }

      const spec = currentStory.chapters.find((candidate) => candidate.id === id);
      const sceneId = element.dataset.scene ?? spec?.scene;
      const definition =
        sceneId === undefined ? undefined : currentStory.scenes[sceneId];
      if (definition === undefined) {
        throw new Error(`Chapter "${id}" references an unknown scene.`);
      }

      const domOverrides = parseChapterSceneOverrides(element.dataset.sceneOverrides);
      // The DOM is the authored source; the config spec is the typed fallback.
      const overrides: ChapterSceneOverrides = {
        ...(spec?.sceneOverrides ?? {}),
        ...domOverrides,
      };
      const title =
        spec?.title ??
        element.dataset.chapterTitle ??
        element.querySelector<HTMLElement>('.story-chapter__title')?.textContent?.trim() ??
        id;

      runtime.push({
        id,
        title,
        sceneId: definition.id,
        overrides,
        element,
        spec,
      });
      rail.push({ id, title, number: index + 1 });
    }

    return { runtime, rail };
  }

  function applySceneAt(chapter: RuntimeChapter, progress: number): void {
    const currentStory = story;
    if (currentStory === null) return;
    const definition = currentStory.scenes[chapter.sceneId];
    if (definition === undefined) return;

    const next = composeSceneState(definition, chapter.overrides, progress);
    scene = next;

    if (root !== null) {
      root.dataset.sceneZoom = next.camera.kind === '2d' ? next.camera.zoom.toFixed(2) : '';
      root.dataset.sceneReveal = next.revealProgress.toFixed(3);
      root.dataset.sceneLayers = next.layers
        .filter((layer) => layer.visible)
        .map((layer) => layer.id)
        .join(' ');
    }
  }

  /**
   * Apply the chapter's presentation. Under reduced motion scroll progress is
   * ignored: the scene jumps to a discrete keyframe (the settled frame on
   * chapter entry), so scrolling never scrubs the camera or reveal.
   */
  function applyScene(chapter: RuntimeChapter, progress: number): void {
    const nextProgress = reducedMotion
      ? keyframeProgress(sceneStep, sceneStepCountFor(chapter))
      : progress;
    applySceneAt(chapter, nextProgress);
  }

  function handleChapterEvent(
    kind: 'enter' | 'progress' | 'exit',
    chapter: RuntimeChapter,
    event: ScrollChapterEvent,
  ): void {
    if (!mounted) return;

    const progress = clamp01(event.progress);

    if (kind === 'enter') {
      const changed = activeChapterId !== chapter.id;
      activeChapterId = chapter.id;
      activeSceneId = chapter.sceneId;
      activeChapterTitle = chapter.title;
      activeProgress = progress;
      lastEvent = 'enter';

      if (changed) {
        // Chapter entry is the only place simulation configuration changes.
        // Reader overrides are re-applied so live controls survive scrolling.
        params = resolveParams(chapter.spec);
        runtime?.setParams(params);
        runtime?.reset();
        clock?.reset();
        syncStageSpeedFromParams();
        simulatedSeconds = 0;
        stepCount = 0;
        frameCount = 0;
        // Enter the chapter on its settled keyframe. Reduced-motion readers can
        // then step backwards through the discrete states, never scrub.
        sceneStep = sceneStepCountFor(chapter) - 1;
        // Capture the deterministic starting state before any frame can run.
        // This is the hook the acceptance gate uses to compare deep-link,
        // forward-scroll, reverse-scroll, and reload entry.
        entryCount += 1;
        entryState = {
          storyKey,
          chapter: chapter.id,
          scene: chapter.sceneId,
          seed: numberParam(params, 'seed') ?? 0,
          params: { ...params },
          structural: runtime?.structural() ?? {},
          steps: 0,
          simulatedSeconds: 0,
          sceneStep,
        };
        sampleMetrics(true);
        writeDebug();
        urlChapter = chapter.id;
        scheduleUrlSync();
      }

      applyScene(chapter, progress);
      return;
    }

    if (kind === 'progress') {
      if (activeChapterId !== chapter.id) {
        handleChapterEvent('enter', chapter, event);
        return;
      }
      activeProgress = progress;
      lastEvent = 'progress';
      // Scroll may update the rail, but it must not scrub a reduced-motion
      // scene. The keyframe stays put until the reader steps.
      if (!reducedMotion) applyScene(chapter, progress);
      return;
    }

    // Exit settles the presentation at the edge the reader crossed. It never
    // rewinds the engine or mutates its parameters. Reduced motion keeps the
    // discrete keyframe instead of settling to the scroll edge.
    activeProgress = progress;
    lastEvent = 'exit';
    if (!reducedMotion) applyScene(chapter, progress);
  }

  /**
   * The only simulation driver is `StoryStage`'s GSAP ticker callback. The
   * fixed-step clock converts wall time to whole substeps; the engine never
   * reads the scroll position.
   */
  function handleFrame(deltaSeconds: number): void {
    const currentClock = clock;
    const currentRuntime = runtime;
    if (currentClock === null || currentRuntime === null) return;

    const steps = currentClock.advance(deltaSeconds);
    for (let step = 0; step < steps; step += 1) {
      currentRuntime.step(currentClock.fixedStepSeconds);
    }

    if (steps === 0) return;

    stepCount += steps;
    simulatedSeconds = stepCount * currentClock.fixedStepSeconds;
    frameCount += 1;
    if (frameCount % 10 === 0) writeDebug();
  }

  function setPaused(next: boolean): void {
    paused = next;
    if (clock !== null) clock.paused = next;
    writeDebug();
    sampleMetrics(true);
  }

  function togglePaused(): void {
    setPaused(!paused);
  }

  /**
   * Reflect a presentation parameter back into the stage Speed readout.
   *
   * For an `engine` speed story the control writes `params.speed`; the fixed
   * clock stays at 1× so the multiplier is applied exactly once. A `clock`
   * story never calls this path.
   */
  function syncStageSpeedFromParams(): void {
    const control = story?.speedControl;
    if (control?.kind !== 'engine' || control.param === undefined) return;
    const value = numberParam(params, control.param);
    if (value !== null && value > 0) speed = value;
  }

  function changeSpeed(next: number): void {
    if (!Number.isFinite(next) || next <= 0) return;
    const control = story?.speedControl;
    if (control?.kind === 'engine' && control.param !== undefined) {
      // The engine applies the multiplier without a reset; the URL keeps it as
      // the ACO `speed` field. Do not also touch the clock.
      speed = next;
      applyParams({ [control.param]: next });
      return;
    }

    speed = next;
    if (clock !== null) clock.speed = next;
    writeDebug();
  }

  function replay(): void {
    runtime?.reset();
    clock?.reset();
    simulatedSeconds = 0;
    stepCount = 0;
    // Reduced motion never autoplays, including after an explicit replay.
    setPaused(reducedMotion);
    const chapter = activeChapterId === null ? undefined : runtimeChapters.get(activeChapterId);
    if (chapter !== undefined) {
      sceneStep = sceneStepCountFor(chapter) - 1;
      applyScene(chapter, activeProgress);
    }
    stageHandle?.redraw();
    writeDebug();
    sampleMetrics(true);
  }

  /**
   * Apply reader parameter changes live, without recreating the runtime.
   *
   * Slider and toggle edits update the existing engine and renderer. Seed and
   * preset changes pass `reset: true` because they define a new run.
   */
  function applyParams(
    next: Partial<StoryParamBag>,
    options: { reset?: boolean } = {},
  ): void {
    params = { ...params, ...next };
    readerParams = { ...readerParams, ...next };
    runtime?.setParams(params);
    syncStageSpeedFromParams();

    if (options.reset === true) {
      runtime?.reset();
      clock?.reset();
      simulatedSeconds = 0;
      stepCount = 0;
      stageHandle?.redraw();
    }

    writeDebug();
    sampleMetrics(true);
    scheduleUrlSync();
  }

  function changeOrbit(next: number): void {
    selectedPreset = null;
    applyParams({ orbit: next });
  }

  function changeTrails(next: boolean): void {
    selectedPreset = null;
    applyParams({ trails: next });
  }

  function applyPreset(id: string): void {
    const currentStory = story;
    if (currentStory === null) return;
    const preset = currentStory.presets.find((candidate) => candidate.id === id);
    if (preset === undefined) return;

    selectedPreset = id;
    // A preset is relative to the story defaults. The seed and any declared
    // `presetKeeps` fields are the reader's run identity or presentation
    // choice, not preset fields, so they survive the change.
    const base = presetParams(currentStory, preset, params);
    readerParams = { ...readerParams, ...preset.params };
    applyParams(base, { reset: true });
  }

  function changeSeed(seed: number): void {
    applyParams({ seed }, { reset: true });
  }

  /**
   * Deterministic single-step. Forward stepping runs one fixed step on the
   * existing engine. Backward stepping replays from reset, which is exact for a
   * pure seeded engine; the replay is capped for very long runs.
   */
  function stepSimulation(direction: 1 | -1): void {
    const currentRuntime = runtime;
    const currentClock = clock;
    if (currentRuntime === null || currentClock === null) return;

    setPaused(true);
    const stepSeconds = currentClock.fixedStepSeconds;

    if (direction > 0) {
      currentRuntime.step(stepSeconds);
      stepCount += 1;
    } else {
      const target = Math.max(0, stepCount - 1);
      if (stepCount > MAX_REPLAY_STEPS) {
        currentRuntime.reset();
        stepCount = 0;
      } else {
        currentRuntime.reset();
        for (let step = 0; step < target; step += 1) {
          currentRuntime.step(stepSeconds);
        }
        stepCount = target;
      }
    }

    simulatedSeconds = stepCount * stepSeconds;
    stageHandle?.redraw();
    writeDebug();
    sampleMetrics(true);
  }

  /**
   * Step between discrete scene keyframes. This is the reduced-motion reading
   * path: it pauses the clock, never scrubs scroll progress, and composes the
   * scene at an exact keyframe. Under full motion a later scroll event simply
   * takes control again.
   */
  function stepScene(direction: 1 | -1): void {
    const chapter = activeChapterId === null ? undefined : runtimeChapters.get(activeChapterId);
    if (chapter === undefined) return;

    setPaused(true);
    const count = sceneStepCountFor(chapter);
    const next = Math.max(0, Math.min(count - 1, sceneStep + direction));
    if (next === sceneStep) return;

    sceneStep = next;
    applySceneAt(chapter, keyframeProgress(next, count));
    stageHandle?.redraw();
    writeDebug();
    sampleMetrics(true);
  }

  /**
   * Reconcile motion state after either the OS media query or the manual
   * preference changes. Reducing motion pauses immediately and settles the
   * active chapter on its final keyframe; increasing it never autoplays.
   */
  function syncMotionState(pauseWhenReduced: boolean): void {
    const reduced = systemReducedMotion || manualReducedMotion;
    document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
    director?.setReducedMotionOverride(reduced);

    if (reduced && pauseWhenReduced) {
      setPaused(true);
      const chapter = activeChapterId === null ? undefined : runtimeChapters.get(activeChapterId);
      if (chapter !== undefined) {
        sceneStep = sceneStepCountFor(chapter) - 1;
        applySceneAt(chapter, keyframeProgress(sceneStep, sceneStepCountFor(chapter)));
        stageHandle?.redraw();
      }
    }

    writeDebug();
  }

  const handleMotionQueryChange = (): void => {
    if (!mounted || motionQuery === null) return;
    systemReducedMotion = motionQuery.matches;
    syncMotionState(motionQuery.matches);
    sampleMetrics(true);
  };

  /** The manual toggle may only reduce motion. A system preference locks it. */
  function changeReducedMotion(next: boolean): void {
    if (systemReducedMotion) return;
    manualReducedMotion = next;
    writePreference(
      PREFERENCE_KEYS.reducedMotion,
      serializeMotionPreference(next),
    );
    syncMotionState(next);
    sampleMetrics(true);
  }

  function toggleArticleMode(): void {
    articleMode = !articleMode;
    writePreference(PREFERENCE_KEYS.articleMode, articleMode ? 'article' : 'stage');
    if (articleMode) stageHandle = null;
    writeDebug();

    // The layout changes height when the stage leaves or returns. Re-measure
    // the chapter triggers on the next frame and keep the active chapter in
    // view, so the reader does not jump to an unrelated section.
    requestAnimationFrame(() => {
      if (!mounted) return;
      director?.refresh();
      if (activeChapterId !== null) scrollToChapter(activeChapterId);
    });
  }

  /**
   * Stage shortcuts are scoped to the focusable region itself. `StoryStage`
   * only forwards events whose target is the region, so a focused button,
   * slider, or number input keeps its native Space/arrow behaviour.
   *
   * - Space: toggle play/pause.
   * - ArrowRight / ArrowUp: pause and advance one fixed step (1/60 s).
   * - ArrowLeft / ArrowDown: pause and step back one fixed step.
   * - Escape: leave the stage and focus the first simulation control.
   *
   * Keys are never intercepted globally; page scrolling is untouched unless
   * the stage region itself has focus.
   */
  function handleStageKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        togglePaused();
        return;
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        stepSimulation(1);
        return;
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        stepSimulation(-1);
        return;
      case 'Escape':
        event.preventDefault();
        focusAfterStage();
        return;
      default:
        return;
    }
  }

  function focusAfterStage(): void {
    const panel = root?.querySelector<HTMLElement>('[data-controls-panel]');
    const firstControl = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), button:not([disabled]), summary',
    );
    if (firstControl !== null && firstControl !== undefined) {
      firstControl.focus();
      return;
    }

    const heading = root?.querySelector<HTMLElement>('.story-chapter__title');
    if (heading !== null && heading !== undefined) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  function handleStageReady(handle: StoryStageHandle): void {
    stageHandle = handle;
    director?.refresh();
    // The stage enhancement changes chapter heights. Re-resolve the fragment
    // against the measured stage layout, not the article layout measured before
    // hydration.
    if (initialHash.length > 0) resolveHash(true);
  }

  function scrollToChapter(id: string): boolean {
    const chapter = runtimeChapters.get(id);
    if (chapter === undefined) return false;

    // ScrollDirector's default range is `top center` … `bottom center`. Land a
    // few pixels past the start so the chapter is active even at the document
    // edges. The offsets are measured after registration, not guessed.
    const rect = chapter.element.getBoundingClientRect();
    const desired = rect.top + window.scrollY - window.innerHeight / 2 + 4;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const top = Math.max(0, Math.min(maxScroll, desired));

    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, top);
    html.style.scrollBehavior = previous;
    return true;
  }

  function resolveHash(force = false): void {
    const id = readHash();
    if (id.length === 0 || !runtimeChapters.has(id)) return;
    if (!force && activeChapterId === id) return;
    scrollToChapter(id);
  }

  function navigateToChapter(id: string): void {
    if (!runtimeChapters.has(id)) return;
    // The fragment is canonical. Update it through the same debounced
    // replaceState path as scrolling so history never grows per chapter.
    urlChapter = id;
    scheduleUrlSync();
    scrollToChapter(id);
  }

  const handleHashChange = (): void => {
    if (!mounted) return;
    const id = readHash();
    if (id.length > 0 && runtimeChapters.has(id)) {
      urlChapter = id;
      scrollToChapter(id);
    } else {
      director?.refresh();
    }
  };

  const handlePopState = (): void => {
    if (!mounted) return;
    window.setTimeout(() => {
      if (!mounted) return;
      director?.refresh();
      handleHashChange();
    }, 0);
  };

  const handlePageShow = (event: PageTransitionEvent): void => {
    if (!mounted || !event.persisted) return;
    director?.refresh();
    resolveHash();
  };

  const handlePageHide = (): void => {
    cleanup();
  };

  const handleBeforeSwap = (): void => {
    cleanup();
  };

  /** Publish the test/development hook once; its methods read live state. */
  function publishDebug(): void {
    if (typeof window === 'undefined') return;
    window.__storyRuntimeDebug = {
      storyKey,
      entryState: () => entryState,
      debugState: (): StoryRuntimeDebugState => ({
        storyKey,
        status,
        ready: status === 'ready',
        entry: entryState,
        entryCount,
        chapter: activeChapterId,
        scene: activeSceneId,
        steps: stepCount,
        simulatedSeconds,
        paused,
        speed,
        stageCount: root?.querySelectorAll('[data-story-stage]').length ?? 0,
        metricTimerActive: metricTimer !== null,
        listenersActive: listeners !== null && !listeners.signal.aborted,
        stageLive: window.__storyStageLive ?? 0,
        mounts: window.__storyRuntimeMounts ?? 0,
      }),
    };
  }

  function cleanup(): void {
    if (cleanupDone) return;
    cleanupDone = true;
    mounted = false;

    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    listeners?.abort();
    listeners = null;

    motionQuery?.removeEventListener('change', handleMotionQueryChange);
    motionQuery = null;

    if (metricTimer !== null) {
      clearInterval(metricTimer);
      metricTimer = null;
    }

    if (urlSyncTimer !== null) {
      window.clearTimeout(urlSyncTimer);
      urlSyncTimer = null;
    }

    const instance = director;
    director = null;
    instance?.destroy();

    if (window.__scrollDirector === instance) {
      delete window.__scrollDirector;
      delete window.__scrollDirectorDebug;
    }

    runtime?.dispose();
    runtime = null;
    clock = null;
    stageHandle = null;
    runtimeChapters = new Map();
    scene = null;
    status = 'destroyed';
    publishDebug();

    delete document.documentElement.dataset.storyRuntime;
    delete document.documentElement.dataset.scrollController;
    delete document.documentElement.dataset.reducedMotion;
  }

  /**
   * Resolve the story module, parse the shared state, then build the runtime.
   * Everything before this point is synchronous and safe on the server; the
   * article layout remains untouched while the story chunk loads.
   */
  async function initialize(): Promise<void> {
    let loaded: StoryModule;
    try {
      loaded = await loadStoryModule(storyKey);
    } catch (error) {
      if (!mounted) return;
      status = 'error';
      if (root !== null) {
        root.dataset.storyError = error instanceof Error ? error.message : 'Unknown story.';
      }
      publishDebug();
      return;
    }

    if (!mounted) return;
    const view = loaded.view;
    story = view;
    selectedPreset = view.presets[0]?.id ?? null;
    params = { ...view.defaults };

    // Parse the shareable starting state before constructing the engine. The
    // URL describes the run's start, never a mid-run frame: values are clamped
    // or rejected with notices here, and chapter entry below resets to step 0.
    chapterIds = readChapterIds();
    const parsedUrl = parseUrlState(view.urlParams, view.defaults, window.location.href, {
      chapterIds,
    });
    urlNotices = parsedUrl.notices;
    urlChapter = parsedUrl.chapter;
    params = { ...view.defaults, ...parsedUrl.explicit };
    readerParams = { ...parsedUrl.explicit };

    runtime = loaded.createRuntime();
    runtime.setParams(params);
    syncStageSpeedFromParams();
    // `clock` stories use the stage control as the playback rate. `engine`
    // stories (ACO) keep the clock at 1× and write the presentation multiplier
    // into the engine, so the speed is never applied twice.
    clock = new FixedStepClock({
      paused,
      speed: view.speedControl.kind === 'clock' ? speed : 1,
    });

    const instance = new ScrollDirector();
    director = instance;
    instance.setReducedMotionOverride(paused);

    try {
      const { runtime: chaptersInDocument, rail } = readChapters();
      runtimeChapters = new Map(chaptersInDocument.map((chapter) => [chapter.id, chapter]));
      chapters = rail;

      for (const chapter of chaptersInDocument) {
        instance.registerChapter(chapter.element, {
          id: chapter.id,
          onEnter: (event) => handleChapterEvent('enter', chapter, event),
          onProgress: (event) => handleChapterEvent('progress', chapter, event),
          onExit: (event) => handleChapterEvent('exit', chapter, event),
        });
      }
    } catch (error) {
      if (root !== null) {
        root.dataset.storyError = error instanceof Error ? error.message : 'Invalid chapter map.';
      }
      cleanup();
      status = 'error';
      publishDebug();
      return;
    }

    motionQuery?.addEventListener('change', handleMotionQueryChange);

    // Measure the chapter ranges before resolving a fragment. This is the
    // "after the pin offset is known" step: the stage is sticky, and chapter
    // heights can change once fonts settle.
    instance.refresh();
    initialHash = readHash();
    resolveHash();
    // A valid deep link is the canonical chapter even if the scroll trigger has
    // not fired its first entry yet.
    if (parsedUrl.chapter !== null) urlChapter = parsedUrl.chapter;
    // Canonicalize any clamped/rejected URL fields after the first chapter
    // entry has settled. The debounce folds the entry and this call together.
    scheduleUrlSync();

    window.__scrollDirector = instance;
    window.__scrollDirectorDebug = () => instance.debugState();
    document.documentElement.dataset.storyRuntime = 'ready';
    document.documentElement.dataset.scrollController = 'ready';

    // Enhancement only: the server-rendered document never contains a stage.
    // Article mode persists across reloads by simply never turning this on for
    // the stage layout.
    enhanced = true;
    if (!articleMode) {
      // The two-column/sticky layout changes chapter heights after Svelte
      // flushes. Registering the stage also refreshes; this covers article
      // readers who keep the compact layout.
      requestAnimationFrame(() => {
        if (mounted) instance.refresh();
      });
    }

    void document.fonts.ready.then(() => {
      if (!mounted) return;
      instance.refresh();
      if (initialHash.length > 0 && activeChapterId !== initialHash) resolveHash();
    });

    status = 'ready';
    writeDebug();
    sampleMetrics(true);
    publishDebug();

    // Metrics are sampled at UI frequency, never from the ticker. One second is
    // below the 2 Hz ceiling and keeps the polite live region quiet.
    metricTimer = setInterval(() => {
      if (mounted) sampleMetrics();
    }, 1_000);
  }

  onMount(() => {
    mounted = true;
    cleanupDone = false;
    listeners = new AbortController();
    const signal = listeners.signal;

    // A second controller on the same page must not leave a second trigger set.
    window.__scrollDirector?.destroy();
    window.__scrollDirectorMounts = (window.__scrollDirectorMounts ?? 0) + 1;
    window.__storyRuntimeMounts = (window.__storyRuntimeMounts ?? 0) + 1;

    // Preferences are best-effort. The article layout and full motion remain
    // usable when storage is missing or throws.
    persistenceAvailable = isPersistenceAvailable();
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    systemReducedMotion = motionQuery.matches;
    manualReducedMotion = parseStoredMotionPreference(
      readPreference(PREFERENCE_KEYS.reducedMotion),
    );
    articleMode = readPreference(PREFERENCE_KEYS.articleMode) === 'article';
    // Reduced motion never autoplays. Set this before the clock exists so no
    // frame can advance between hydration and the first reader input.
    paused = systemReducedMotion || manualReducedMotion;
    document.documentElement.dataset.reducedMotion = paused ? 'true' : 'false';

    document.addEventListener('astro:before-swap', handleBeforeSwap, { signal });
    window.addEventListener('pagehide', handlePageHide, { signal });
    window.addEventListener('hashchange', handleHashChange, { signal });
    window.addEventListener('popstate', handlePopState, { signal });
    window.addEventListener('pageshow', handlePageShow, { signal });

    publishDebug();
    void initialize();

    return cleanup;
  });

  onDestroy(cleanup);
</script>

<div
  bind:this={root}
  class="story-controller"
  class:story-controller--enhanced={enhanced}
  class:story-controller--article={articleMode}
  data-story-controller={status}
  data-story-key={storyKey}
  data-story-enhanced={enhanced ? 'true' : undefined}
  data-article-mode={articleMode ? 'true' : 'false'}
  data-motion={reducedMotion ? 'reduced' : 'full'}
  data-system-reduced-motion={systemReducedMotion ? 'true' : 'false'}
  data-manual-reduced-motion={manualReducedMotion ? 'true' : 'false'}
  data-active-chapter={activeChapterId ?? undefined}
  data-active-scene={activeSceneId ?? undefined}
  data-active-chapter-title={activeChapterTitle || undefined}
  data-scroll-progress={activeProgress.toFixed(4)}
  data-scroll-event={lastEvent || undefined}
  data-chapter-count={chapters.length}
  data-engine-params={JSON.stringify(params)}
  data-engine-orbit={orbitValue === null ? undefined : orbitValue.toFixed(3)}
  data-engine-trails={trailsValue === null ? undefined : String(trailsValue)}
  data-engine-seed={seedValue ?? undefined}
  data-engine-variant={variantValue ?? undefined}
  data-preset={selectedPreset ?? 'custom'}
  data-entry-count={entryCount}
  data-entry-chapter={entryState?.chapter}
  data-entry-scene={entryState?.scene}
  data-entry-seed={entryState?.seed}
  data-entry-structural={entryState === null ? undefined : JSON.stringify(entryState.structural)}
  data-entry-steps={entryState?.steps}
  data-entry-sim-time={entryState?.simulatedSeconds.toFixed(3)}
  data-entry-scene-step={entryState?.sceneStep}
  data-sim-time="0.000"
  data-sim-frames="0"
  data-sim-steps="0"
  data-paused="false"
  data-speed="1"
  data-scene-zoom=""
  data-scene-reveal=""
  data-scene-layers=""
  data-scene-step="0"
  data-scene-step-count={activeSceneStepCount}
>
  <ProgressRail
    {chapters}
    activeId={activeChapterId}
    progress={activeProgress}
    {activeIndex}
    onNavigate={navigateToChapter}
  />

  <div class="story-layout" data-story-layout>
    {#if showStage}
      <div class="story-layout__stage">
        <StoryStage
          {createRenderer}
          {scene}
          {params}
          {getSnapshot}
          onFrame={handleFrame}
          {paused}
          dprCap={2}
          testId="story-stage"
          ariaLabel={stageLabel}
          description={stageDescription}
          interactive
          roledescription="interactive simulation stage"
          describedBy="story-shortcuts"
          ariaKeyshortcuts="Space ArrowLeft ArrowRight ArrowUp ArrowDown Escape"
          onStageKeydown={handleStageKeydown}
          onReady={handleStageReady}
        >
          <StageChrome
            {paused}
            {speed}
            rendererId={story?.rendererId ?? 'canvas2d'}
            chapterTitle={activeChapterTitle}
            sceneId={activeSceneId}
            {reducedMotion}
            systemReducedMotion={motionPreference.systemReduced}
            {sceneStep}
            sceneStepCount={activeSceneStepCount}
            shareMessage={shareStatus?.message}
            shareOk={shareStatus?.ok}
            sharePending={sharing}
            onTogglePaused={togglePaused}
            onReplay={replay}
            onSpeedChange={changeSpeed}
            onStepScene={stepScene}
            onToggleReducedMotion={changeReducedMotion}
            onShare={shareCurrentState}
          />
        </StoryStage>
      </div>
    {/if}

    <div class="story-layout__column">
      <!--
        The server renders the article. This toolbar and the stage exist only
        after onMount sets the enhancement marker, so no empty stage or dead
        control is ever part of the no-JavaScript document.
      -->
      {#if enhanced}
        <div class="story-modes" data-story-modes>
          <ArticleModeToggle {articleMode} onToggle={toggleArticleMode} />
        </div>
      {/if}

      {#if enhanced && urlNotices.length > 0}
        <div class="story-notices" data-url-notices role="status" aria-live="polite">
          <p class="story-notices__title">Shared link adjusted</p>
          <ul class="story-notices__list">
            {#each urlNotices as notice, index (index)}
              <li class="story-notices__item" data-url-notice={notice.code}>{notice.message}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if showStage && story?.controlPanel === 'fixture'}
        <section class="story-controls" aria-labelledby="story-controls-title" data-controls-panel>
          <div class="story-controls__head">
            <h2 class="story-controls__title" id="story-controls-title">Simulation controls</h2>
            <p class="story-controls__note">
              Changes apply live to the running simulation. Presets and the seed start a new run;
              the orbit and trail controls never recreate the runtime.
            </p>
            <p class="story-controls__note" data-share-scope>
              <strong>Share links</strong> carry the chapter fragment, seed, and structural parameters.
              They restart the run at step 0. Canvas and city-map edits stay local and are not
              included.
            </p>
          </div>

          <div class="story-controls__grid">
            <Slider
              id="orbit"
              label="Orbit radius"
              value={orbitValue ?? 1}
              min={0.4}
              max={2.4}
              step={0.05}
              formatValue={(value) => `${value.toFixed(2)} ×`}
              hint="Scales the ant orbit and the focal pheromone ring."
              onValueChange={changeOrbit}
            />

            <Toggle
              id="trails"
              label="Show ant trails"
              checked={trailsValue ?? false}
              description="Draws a line from each ant to the focal city."
              onCheckedChange={changeTrails}
            />

            <PresetPicker
              id="preset"
              presets={story?.presets ?? []}
              selected={selectedPreset}
              onSelect={applyPreset}
            />

            <SeedControl id="seed" seed={seedValue ?? 0} onSeedChange={changeSeed} />
          </div>
        </section>
      {/if}

      {#if showStage}
        <Metrics id="story-metrics" title="Live metrics" items={metricItems} />

        <details class="story-controls__shortcuts" id="story-shortcuts" data-stage-shortcuts>
          <summary class="story-controls__summary">Keyboard shortcuts</summary>
          <ul class="story-controls__keys">
            <li><kbd>Space</kbd> Play or pause the simulation.</li>
            <li>
              <kbd>ArrowRight</kbd> / <kbd>ArrowUp</kbd> Pause and advance one fixed step (1/60 s).
            </li>
            <li>
              <kbd>ArrowLeft</kbd> / <kbd>ArrowDown</kbd> Pause and step back one fixed step.
            </li>
            <li><kbd>Escape</kbd> Leave the stage and move to the first simulation control.</li>
          </ul>
          <p class="story-controls__keys-note">
            Backward stepping replays the run from its first fixed step, so it is exact; runs
            longer than 10,000 fixed steps restart at zero when stepped back. Shortcuts apply
            only while the stage region itself has focus. Buttons, sliders, and inputs keep their
            native Space and arrow behaviour, and page scrolling is never hi-jacked from outside
            the stage.
          </p>
        </details>
      {/if}

      <div class="story-layout__chapters" data-story-chapters>
        {@render children?.()}
      </div>
    </div>
  </div>
</div>

<style>
  .story-notices {
    display: grid;
    gap: var(--space-3xs);
    margin-block-end: var(--space-sm);
    padding: var(--space-sm);
    border: var(--hairline) solid var(--color-rule-paper);
    border-inline-start: var(--rule-strong) solid var(--color-accent-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper-inset);
    color: var(--color-ink);
  }

  .story-notices__title {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .story-notices__list {
    display: grid;
    gap: var(--space-3xs);
    margin: 0;
    padding-inline-start: var(--space-md);
    color: var(--color-paper-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
</style>
