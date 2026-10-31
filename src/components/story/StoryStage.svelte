<script lang="ts" generics="P extends object, S">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onDestroy, onMount, type Snippet } from 'svelte';
  import type { QualityTier } from '../../engines/core/types';
  import { qualityProfile } from '../../lib/quality';
  import type { Camera2DState, SceneState, StageRenderer } from '../../render/types';
  import type { StoryStageDebugState, StoryStageHandle } from './story-stage-types';

  interface Props {
    /** An already-constructed renderer. Prefer `createRenderer` inside onMount. */
    renderer?: StageRenderer<P, S> | null;
    /** Construct the renderer after the DOM exists. May dynamically import one. */
    createRenderer?: () => StageRenderer<P, S> | Promise<StageRenderer<P, S>>;
    /** Presentation state; `null` draws an empty stage. */
    scene?: SceneState | null;
    /** Typed story parameters, passed through to the renderer. */
    params: P;
    /** Read-only engine snapshot for the current frame. Must reuse buffers. */
    getSnapshot: () => Readonly<S>;
    /** Advance simulation time. Called from the stage's single GSAP ticker. */
    onFrame?: (deltaSeconds: number) => void;
    /** Reader pause. Offscreen and hidden pause states are added by the stage. */
    paused?: boolean;
    /** Maximum device pixel ratio for the backing store. */
    dprCap?: number;
    /** Presentation quality tier. Defaults to `high`. */
    quality?: QualityTier;
    /** Optional `data-testid` for the stage root. */
    testId?: string;
    /** Optional accessible name for the stage region. */
    ariaLabel?: string;
    /** Low-frequency text alternative for the canvas content. */
    description?: string;
    /**
     * Make the stage a focusable keyboard region. Shortcuts are supplied by the
     * story controller through `onStageKeydown`; this component only guarantees
     * that the handler runs when the region itself has focus.
     */
    interactive?: boolean;
    /** Human-readable role, e.g. "interactive simulation stage". */
    roledescription?: string;
    /** Id of the documented shortcut list read as the region description. */
    describedBy?: string;
    /** `aria-keyshortcuts` value for the shortcuts implemented by the host. */
    ariaKeyshortcuts?: string;
    /** Called only when the stage region, not one of its controls, has focus. */
    onStageKeydown?: (event: KeyboardEvent) => void;
    /** Called once the renderer can accept frames. */
    onReady?: (handle: StoryStageHandle) => void;
    /** Overlay controls drawn above the canvas. */
    children?: Snippet;
  }

  let {
    renderer = null,
    createRenderer,
    scene = null,
    params,
    getSnapshot,
    onFrame,
    paused = false,
    dprCap = 2,
    quality = 'high',
    testId,
    ariaLabel = 'Interactive story stage',
    description,
    interactive = false,
    roledescription,
    describedBy,
    ariaKeyshortcuts,
    onStageKeydown,
    onReady,
    children,
  }: Props = $props();

  type StageStatus = StoryStageDebugState['status'];
  type PauseReason = StoryStageDebugState['pauseReason'];

  const EMPTY_CAMERA: Camera2DState = { kind: '2d', panX: 0, panY: 0, zoom: 1, rotation: 0 };
  const EMPTY_SCENE: SceneState = {
    camera: EMPTY_CAMERA,
    layers: [],
    highlights: [],
    revealProgress: 1,
    labels: [],
  };

  let root: HTMLElement | null = null;
  let host: HTMLDivElement | null = null;

  let status = $state<StageStatus>('pending');
  let stageError = $state<string | null>(null);
  let ready = $state(false);

  let rendererInstance: StageRenderer<P, S> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let listeners: AbortController | null = null;

  /** The stricter of the caller's cap and the active presentation profile. */
  let effectiveDprCap = $derived(
    Math.min(Math.max(1, dprCap), qualityProfile(quality).dprCap),
  );

  let frames = 0;
  let visible = true;
  let hidden = false;
  let effectivePaused = true;
  let pauseReason: PauseReason = 'pending';
  let lastTickerTime = 0;
  let tornDown = false;
  let cleanupDone = false;
  let stageHandle: StoryStageHandle | null = null;

  interface StageWindow extends Window {
    __storyStageMounts?: number;
    __storyStageLive?: number;
  }

  interface CameraControl {
    zoomBy(factor: number): void;
    resetCamera(): void;
  }

  interface ProjectionControl {
    screenToWorld(clientX: number, clientY: number): { readonly x: number; readonly y: number } | null;
    worldToScreen(x: number, y: number): { readonly x: number; readonly y: number } | null;
  }

  function cameraControl(instance: StageRenderer<P, S>): CameraControl | null {
    const candidate = instance as Partial<CameraControl>;
    if (typeof candidate.zoomBy === 'function' && typeof candidate.resetCamera === 'function') {
      return candidate as CameraControl;
    }
    return null;
  }

  function projectionControl(instance: StageRenderer<P, S>): ProjectionControl | null {
    const candidate = instance as Partial<ProjectionControl>;
    if (
      typeof candidate.screenToWorld === 'function' &&
      typeof candidate.worldToScreen === 'function'
    ) {
      return candidate as ProjectionControl;
    }
    return null;
  }

  function syncFrames(force = false): void {
    if (!root) return;
    if (force || frames === 1 || frames % 15 === 0) {
      // String creation is deliberately confined to this low-frequency debug
      // path; the steady-state draw loop does not touch the DOM.
      root.dataset.frames = String(frames);
    }
  }

  function drawFrame(force = false): void {
    if (tornDown || !ready || rendererInstance === null) return;
    if (!force && effectivePaused) return;

    rendererInstance.render(getSnapshot());
    frames += 1;
    syncFrames(force);
  }

  function computePauseReason(): PauseReason {
    if (paused) return 'reader';
    if (!visible) return 'offscreen';
    if (hidden) return 'hidden';
    return 'running';
  }

  function applyPause(): void {
    const nextReason = computePauseReason();
    const nextPaused = nextReason !== 'running';
    pauseReason = nextReason;
    effectivePaused = nextPaused;

    if (root) {
      root.dataset.paused = String(nextPaused);
      root.dataset.pauseReason = nextReason;
    }
    rendererInstance?.setPaused(nextPaused);

    // A stale ticker time would turn the first resumed frame into a catch-up
    // spike. Start from zero instead.
    lastTickerTime = 0;

    if (!ready) return;
    if (nextPaused) {
      syncFrames(true);
    } else {
      drawFrame(true);
    }
  }

  function measure(forceDraw = true): void {
    const container = host;
    const instance = rendererInstance;
    if (container === null || instance === null) return;

    const rect = container.getBoundingClientRect();
    const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    // The renderer contract expects the host to cap DPR before calling resize.
    const cappedDpr = Math.min(Math.max(1, deviceDpr), effectiveDprCap);

    if (root) {
      root.dataset.cssWidth = String(Math.round(rect.width * 100) / 100);
      root.dataset.cssHeight = String(Math.round(rect.height * 100) / 100);
      root.dataset.dpr = String(cappedDpr);
    }

    instance.resize(rect.width, rect.height, cappedDpr);
    if (forceDraw) drawFrame(true);
  }

  function scheduleRefresh(delay = 180): void {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (!tornDown) ScrollTrigger.refresh();
    }, delay);
  }

  function handleViewportResize(): void {
    measure();
    // iOS Safari reports keyboard/browser-bar changes through visualViewport,
    // often without a matching window resize. Re-measure, then let triggers
    // settle on a debounced refresh.
    scheduleRefresh();
  }

  function handleDocumentVisibility(): void {
    hidden = document.visibilityState === 'hidden';
    applyPause();
  }

  /**
   * Keyboard events from the stage's overlay controls bubble here. Only events
   * whose target is the region itself are forwarded, so a focused button,
   * slider, or number input always keeps its native arrow/Space behaviour.
   */
  function handleStageKeydown(event: KeyboardEvent): void {
    if (!interactive) return;
    if (event.target !== event.currentTarget) return;
    onStageKeydown?.(event);
  }

  function handleTick(time: number): void {
    if (tornDown || !ready) {
      lastTickerTime = 0;
      return;
    }
    if (effectivePaused) {
      lastTickerTime = 0;
      return;
    }

    const delta = lastTickerTime === 0 ? 0 : Math.min(Math.max(time - lastTickerTime, 0), 0.1);
    lastTickerTime = time;

    onFrame?.(delta);
    drawFrame();
  }

  function cleanup(): void {
    if (cleanupDone) return;
    cleanupDone = true;
    tornDown = true;
    ready = false;

    gsap.ticker.remove(handleTick);

    listeners?.abort();
    listeners = null;

    resizeObserver?.disconnect();
    resizeObserver = null;
    intersectionObserver?.disconnect();
    intersectionObserver = null;

    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    rendererInstance?.dispose();
    rendererInstance = null;
    stageHandle = null;

    if (typeof window !== 'undefined') {
      const stageWindow = window as StageWindow;
      stageWindow.__storyStageLive = Math.max(0, (stageWindow.__storyStageLive ?? 1) - 1);
    }

    if (root) {
      root.dataset.frames = String(frames);
      root.dataset.paused = 'true';
    }
    status = 'destroyed';
  }

  async function mountRenderer(): Promise<void> {
    if (host === null) return;

    let candidate: StageRenderer<P, S> | Promise<StageRenderer<P, S>> | null = renderer;
    if (candidate === null && createRenderer !== undefined) {
      candidate = createRenderer();
    }
    if (candidate === null) {
      stageError = 'No stage renderer was provided.';
      status = 'error';
      return;
    }

    let instance: StageRenderer<P, S>;
    try {
      instance = await candidate;
    } catch (error) {
      stageError = error instanceof Error ? error.message : 'The stage renderer failed to load.';
      status = 'error';
      return;
    }

    if (tornDown) {
      instance.dispose();
      return;
    }

    rendererInstance = instance;
    try {
      await instance.mount(host);
      if (tornDown) {
        instance.dispose();
        return;
      }

      instance.setScene(scene ?? EMPTY_SCENE);
      instance.setParams(params);
      ready = true;
      applyPause();
      measure();
      status = 'ready';

      stageHandle = {
        zoomBy: (factor: number) => {
          const control = cameraControl(instance);
          control?.zoomBy(factor);
          drawFrame(true);
        },
        resetCamera: () => {
          const control = cameraControl(instance);
          control?.resetCamera();
          drawFrame(true);
        },
        screenToWorld: (clientX: number, clientY: number) => {
          const control = projectionControl(instance);
          return control?.screenToWorld(clientX, clientY) ?? null;
        },
        worldToScreen: (x: number, y: number) => {
          const control = projectionControl(instance);
          return control?.worldToScreen(x, y) ?? null;
        },
        /** Repaint the last snapshot, for deterministic keyboard stepping. */
        redraw: () => {
          drawFrame(true);
        },
        dispose: cleanup,
        debugState: () => ({
          status,
          frames,
          paused: effectivePaused,
          pauseReason,
          visible,
          hidden,
          dprCap: effectiveDprCap,
          quality,
        }),
      };
      onReady?.(stageHandle);
    } catch (error) {
      stageError = error instanceof Error ? error.message : 'The stage renderer failed to mount.';
      status = 'error';
      instance.dispose();
      rendererInstance = null;
    }
  }

  // Apply presentation changes after the renderer exists. These effects run
  // only in the browser; static generation never evaluates canvas code.
  $effect(() => {
    const nextScene = scene;
    const nextParams = params;
    if (!ready || rendererInstance === null) return;
    rendererInstance.setScene(nextScene ?? EMPTY_SCENE);
    rendererInstance.setParams(nextParams);
    // The animation loop is paused offscreen or hidden, and the reader can
    // pause it too. Presentation edits still repaint while the stage is visible
    // so layer toggles stay responsive; resume always forces one frame.
    if (visible && !hidden) drawFrame(true);
  });

  $effect(() => {
    // applyPause() reads the `paused` prop synchronously, which registers it as
    // an effect dependency even though the function lives outside this block.
    if (!ready) return;
    applyPause();
  });

  $effect(() => {
    // Quality is presentation-only: forward it to the renderer (when it
    // implements the optional seam) and re-size the backing store at the new
    // DPR cap. The engine and clock are never touched, so the iteration state
    // survives a reader changing the tier.
    const tier = quality;
    if (!ready || rendererInstance === null) return;
    rendererInstance.setQuality?.(tier);
    measure();
  });

  onMount(() => {
    tornDown = false;
    cleanupDone = false;
    listeners = new AbortController();
    const signal = listeners.signal;
    const stageWindow = window as StageWindow;
    stageWindow.__storyStageMounts = (stageWindow.__storyStageMounts ?? 0) + 1;
    stageWindow.__storyStageLive = (stageWindow.__storyStageLive ?? 0) + 1;

    gsap.registerPlugin(ScrollTrigger);

    hidden = document.visibilityState === 'hidden';
    applyPause();

    if (host !== null) {
      resizeObserver = new ResizeObserver(() => {
        measure();
        scheduleRefresh();
      });
      resizeObserver.observe(host);
    }

    if (root !== null) {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry === undefined) return;
          visible = entry.isIntersecting;
          applyPause();
        },
        { threshold: 0 },
      );
      intersectionObserver.observe(root);
    }

    document.addEventListener('visibilitychange', handleDocumentVisibility, { signal });
    window.addEventListener('resize', handleViewportResize, { signal });
    window.visualViewport?.addEventListener('resize', handleViewportResize, { signal });
    window.addEventListener('pagehide', cleanup, { signal });
    document.addEventListener('astro:before-swap', cleanup, { signal });

    gsap.ticker.add(handleTick);

    void document.fonts.ready.then(() => {
      if (tornDown) return;
      measure();
      scheduleRefresh();
    });

    void mountRenderer();

    return cleanup;
  });

  onDestroy(cleanup);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  bind:this={root}
  class="stage story-stage"
  data-story-stage
  data-stage-status={status}
  data-paused="true"
  data-pause-reason="pending"
  data-frames="0"
  data-testid={testId}
  data-quality={quality}
  role={interactive ? 'region' : undefined}
  tabindex={interactive ? 0 : undefined}
  aria-label={ariaLabel}
  aria-roledescription={roledescription}
  aria-describedby={describedBy}
  aria-keyshortcuts={ariaKeyshortcuts}
  onkeydown={handleStageKeydown}
>
  <div class="stage__surface story-stage__surface" bind:this={host}>
    <canvas class="story-stage__canvas" data-stage-canvas aria-hidden="true"></canvas>

    {#if children}
      <div class="story-stage__overlay" data-stage-overlay>
        {@render children()}
      </div>
    {/if}

    {#if description}
      <p class="visually-hidden" data-stage-description>{description}</p>
    {/if}

    {#if stageError}
      <p class="story-stage__error" role="status" data-stage-error>{stageError}</p>
    {/if}
  </div>
</section>
