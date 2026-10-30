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
   */

  import { onDestroy, onMount, type Snippet } from 'svelte';
  import { FixedStepClock } from '../../engines/core/clock';
  import type { Engine } from '../../engines/core/types';
  import {
    type ChapterSceneOverrides,
    parseChapterSceneOverrides,
    type RailChapterInfo,
  } from '../../lib/chapter-metadata';
  import { composeSceneState } from '../../lib/scene-composition';
  import { type ScrollChapterEvent, ScrollDirector } from '../../lib/scroll-director';
  import { Canvas2DRenderer } from '../../render/canvas2d/Canvas2DRenderer';
  import type { SceneState } from '../../render/types';
  import type {
    SmokeMetrics,
    SmokeParams,
    SmokeSnapshot,
  } from '../../stories/dev/canvas-smoke-engine';
  import { devStoryConfig } from '../../stories/dev/config';
  import type { ChapterSpec } from '../../stories/registry';
  import { createSmokeLayers } from './canvas-smoke-layers';
  import ProgressRail from './ProgressRail.svelte';
  import StageChrome from './StageChrome.svelte';
  import StoryStage from './StoryStage.svelte';

  interface Props {
    /** CSS selector for chapter elements. One director owns every match. */
    chapterSelector?: string;
    /** Prose chapters. They are server-rendered and remain readable without JS. */
    children?: Snippet;
  }

  let { chapterSelector = '[data-story-chapter]', children }: Props = $props();

  interface RuntimeChapter {
    readonly id: string;
    readonly title: string;
    readonly sceneId: string;
    readonly overrides: ChapterSceneOverrides;
    readonly params: SmokeParams;
    readonly element: HTMLElement;
    readonly spec: ChapterSpec<SmokeParams> | undefined;
  }

  const story = devStoryConfig;
  const EMPTY_SNAPSHOT: SmokeSnapshot = { time: 0, phase: 0, pulse: 0 };
  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

  let root: HTMLElement | null = null;

  let status = $state<'pending' | 'ready' | 'destroyed'>('pending');
  let activeChapterId = $state<string | null>(null);
  let activeSceneId = $state<string | null>(null);
  let activeChapterTitle = $state('');
  let activeProgress = $state(0);
  let lastEvent = $state('');
  let paused = $state(false);
  let speed = $state(1);
  let scene = $state<SceneState | null>(null);
  let params = $state<SmokeParams>({ ...story.defaults });
  let chapters = $state<readonly RailChapterInfo[]>([]);

  let director: ScrollDirector | null = null;
  let engine: Engine<SmokeParams, SmokeSnapshot, SmokeMetrics> | null = null;
  let clock: FixedStepClock | null = null;
  let runtimeChapters = new Map<string, RuntimeChapter>();
  let simulatedSeconds = 0;
  let frameCount = 0;
  let mounted = false;
  let cleanupDone = false;
  let listeners: AbortController | null = null;
  let initialHash = '';

  let activeIndex = $derived(
    activeChapterId === null
      ? -1
      : chapters.findIndex((chapter) => chapter.id === activeChapterId),
  );

  /**
   * The renderer factory is created here, inside the island. Astro cannot pass
   * a function across hydration, and a story config must not import a renderer.
   * Step 4.1 replaces this single concrete factory with a renderer-id registry.
   */
  const createRenderer = (): Canvas2DRenderer<SmokeParams, SmokeSnapshot> =>
    new Canvas2DRenderer<SmokeParams, SmokeSnapshot>({
      layers: createSmokeLayers(),
      dprCap: 2,
    });

  const getSnapshot = (): Readonly<SmokeSnapshot> => engine?.snapshot() ?? EMPTY_SNAPSHOT;

  function readHash(): string {
    const raw = window.location.hash.replace(/^#/, '');
    if (raw.length === 0) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function writeDebug(): void {
    if (root === null) return;
    root.dataset.simTime = simulatedSeconds.toFixed(3);
    root.dataset.simFrames = String(frameCount);
    root.dataset.paused = paused ? 'true' : 'false';
    root.dataset.speed = String(speed);
  }

  function resolveParams(spec: ChapterSpec<SmokeParams> | undefined): SmokeParams {
    const overrides = spec?.sceneOverrides?.params;
    // Parameter changes happen on chapter entry only, never on progress.
    return overrides === undefined ? { ...story.defaults } : { ...story.defaults, ...overrides };
  }

  function readChapters(): {
    readonly runtime: readonly RuntimeChapter[];
    readonly rail: readonly RailChapterInfo[];
  } {
    if (root === null) return { runtime: [], rail: [] };

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

      const spec = story.chapters.find((candidate) => candidate.id === id);
      const sceneId = element.dataset.scene ?? spec?.scene;
      const definition = sceneId === undefined ? undefined : story.scenes[sceneId];
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
        params: resolveParams(spec),
        element,
        spec,
      });
      rail.push({ id, title, number: index + 1 });
    }

    return { runtime, rail };
  }

  function applyScene(chapter: RuntimeChapter, progress: number): void {
    const definition = story.scenes[chapter.sceneId];
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
        params = chapter.params;
        engine?.setParams(chapter.params);
        engine?.reset();
        clock?.reset();
        simulatedSeconds = 0;
        writeDebug();
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
      applyScene(chapter, progress);
      return;
    }

    // Exit settles the presentation at the edge the reader crossed. It never
    // rewinds the engine or mutates its parameters.
    activeProgress = progress;
    lastEvent = 'exit';
    applyScene(chapter, progress);
  }

  /**
   * The only simulation driver is `StoryStage`'s GSAP ticker callback. The
   * fixed-step clock converts wall time to whole substeps; the engine never
   * reads the scroll position.
   */
  function handleFrame(deltaSeconds: number): void {
    const currentClock = clock;
    const currentEngine = engine;
    if (currentClock === null || currentEngine === null) return;

    const steps = currentClock.advance(deltaSeconds);
    for (let step = 0; step < steps; step += 1) {
      currentEngine.step(currentClock.fixedStepSeconds);
    }

    if (steps === 0) return;

    simulatedSeconds = currentClock.simulatedSeconds;
    frameCount += 1;
    if (frameCount % 10 === 0) writeDebug();
  }

  function togglePaused(): void {
    paused = !paused;
    if (clock !== null) clock.paused = paused;
    writeDebug();
  }

  function changeSpeed(next: number): void {
    if (!Number.isFinite(next) || next <= 0) return;
    speed = next;
    if (clock !== null) clock.speed = next;
    writeDebug();
  }

  function replay(): void {
    engine?.reset();
    clock?.reset();
    simulatedSeconds = 0;
    paused = false;
    if (clock !== null) clock.paused = false;
    const chapter = activeChapterId === null ? undefined : runtimeChapters.get(activeChapterId);
    if (chapter !== undefined) applyScene(chapter, activeProgress);
    writeDebug();
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

  function resolveHash(): void {
    const id = readHash();
    if (id.length === 0 || !runtimeChapters.has(id)) return;
    if (activeChapterId === id) return;
    scrollToChapter(id);
  }

  function navigateToChapter(id: string): void {
    if (!runtimeChapters.has(id)) return;
    // The fragment is canonical (Step 1.8 completes the URL contract). Using
    // replaceState avoids a history entry per chapter while keeping the link
    // shareable and the controller state coherent.
    const nextHash = `#${id}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
    scrollToChapter(id);
  }

  const handleHashChange = (): void => {
    if (!mounted) return;
    const id = readHash();
    if (id.length > 0 && runtimeChapters.has(id)) {
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

  function cleanup(): void {
    if (cleanupDone) return;
    cleanupDone = true;
    mounted = false;

    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    listeners?.abort();
    listeners = null;

    const instance = director;
    director = null;
    instance?.destroy();

    if (window.__scrollDirector === instance) {
      delete window.__scrollDirector;
      delete window.__scrollDirectorDebug;
    }

    engine = null;
    clock = null;
    runtimeChapters = new Map();
    scene = null;
    status = 'destroyed';

    delete document.documentElement.dataset.storyRuntime;
    delete document.documentElement.dataset.scrollController;
  }

  onMount(() => {
    mounted = true;
    cleanupDone = false;
    listeners = new AbortController();
    const signal = listeners.signal;

    // A second controller on the same page must not leave a second trigger set.
    window.__scrollDirector?.destroy();
    window.__scrollDirectorMounts = (window.__scrollDirectorMounts ?? 0) + 1;

    engine = story.createEngine(params);
    clock = new FixedStepClock({ paused, speed });
    writeDebug();

    const instance = new ScrollDirector();
    director = instance;

    try {
      const { runtime, rail } = readChapters();
      runtimeChapters = new Map(runtime.map((chapter) => [chapter.id, chapter]));
      chapters = rail;

      for (const chapter of runtime) {
        instance.registerChapter(chapter.element, {
          id: chapter.id,
          onEnter: (event) => handleChapterEvent('enter', chapter, event),
          onProgress: (event) => handleChapterEvent('progress', chapter, event),
          onExit: (event) => handleChapterEvent('exit', chapter, event),
        });
      }
    } catch (error) {
      cleanup();
      throw error;
    }

    // Measure the chapter ranges before resolving a fragment. This is the
    // "after the pin offset is known" step: the stage is sticky, and chapter
    // heights can change once fonts settle.
    instance.refresh();
    initialHash = readHash();
    resolveHash();

    window.__scrollDirector = instance;
    window.__scrollDirectorDebug = () => instance.debugState();
    document.documentElement.dataset.storyRuntime = 'ready';
    document.documentElement.dataset.scrollController = 'ready';

    void document.fonts.ready.then(() => {
      if (!mounted) return;
      instance.refresh();
      if (initialHash.length > 0 && activeChapterId !== initialHash) resolveHash();
    });

    document.addEventListener('astro:before-swap', handleBeforeSwap, { signal });
    window.addEventListener('pagehide', handlePageHide, { signal });
    window.addEventListener('hashchange', handleHashChange, { signal });
    window.addEventListener('popstate', handlePopState, { signal });
    window.addEventListener('pageshow', handlePageShow, { signal });

    status = 'ready';

    return cleanup;
  });

  onDestroy(cleanup);
</script>

<div
  bind:this={root}
  class="story-controller"
  data-story-controller={status}
  data-active-chapter={activeChapterId ?? undefined}
  data-active-scene={activeSceneId ?? undefined}
  data-active-chapter-title={activeChapterTitle || undefined}
  data-scroll-progress={activeProgress.toFixed(4)}
  data-scroll-event={lastEvent || undefined}
  data-chapter-count={chapters.length}
  data-engine-params={JSON.stringify(params)}
  data-sim-time="0.000"
  data-sim-frames="0"
  data-paused="false"
  data-speed="1"
  data-scene-zoom=""
  data-scene-reveal=""
  data-scene-layers=""
>
  <div class="story-layout">
    <div class="story-layout__stage">
      <ProgressRail
        {chapters}
        activeId={activeChapterId}
        progress={activeProgress}
        {activeIndex}
        onNavigate={navigateToChapter}
      />

      <StoryStage
        {createRenderer}
        {scene}
        {params}
        {getSnapshot}
        onFrame={handleFrame}
        {paused}
        dprCap={2}
        testId="story-stage"
        ariaLabel="Development story stage"
        description="A moving point orbits a focal city while four chapters change the camera, layers, and highlighted object. The canvas is decorative; chapter prose and stage labels carry the meaning."
        onReady={() => director?.refresh()}
      >
        <StageChrome
          {paused}
          {speed}
          chapterTitle={activeChapterTitle}
          sceneId={activeSceneId}
          onTogglePaused={togglePaused}
          onReplay={replay}
          onSpeedChange={changeSpeed}
        />
      </StoryStage>
    </div>

    <div class="story-layout__chapters" data-story-chapters>
      {@render children?.()}
    </div>
  </div>
</div>
