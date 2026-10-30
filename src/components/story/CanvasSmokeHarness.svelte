<script lang="ts">
  import { FixedStepClock } from '../../engines/core/clock';
  import { Canvas2DRenderer } from '../../render/canvas2d/Canvas2DRenderer';
  import { SmokeEngine, type SmokeParams, type SmokeSnapshot } from '../../stories/dev/canvas-smoke-engine';
  import { createSmokeLayers, createSmokeScene } from './canvas-smoke-layers';
  import StoryStage from './StoryStage.svelte';
  import type { StoryStageHandle } from './story-stage-types';

  const params: SmokeParams = { speed: 1, orbit: 1, trails: true, seed: 1, variant: 'orbit' };
  const engine = new SmokeEngine(params);
  const clock = new FixedStepClock({ maxSubsteps: 8 });

  let paused = $state(false);
  let showGraph = $state(true);
  let showPheromone = $state(true);
  let handle: StoryStageHandle | null = null;

  const scene = $derived(createSmokeScene({ showGraph, showPheromone }));

  const createRenderer = (): Canvas2DRenderer<SmokeParams, SmokeSnapshot> =>
    new Canvas2DRenderer<SmokeParams, SmokeSnapshot>({
      layers: createSmokeLayers(),
      dprCap: 2,
    });

  const getSnapshot = (): Readonly<SmokeSnapshot> => engine.snapshot();

  /**
   * The only animation driver is StoryStage's GSAP ticker callback. It hands
   * this function a wall-time delta; the fixed-step clock owns simulation time.
   */
  const onFrame = (deltaSeconds: number): void => {
    const steps = clock.advance(deltaSeconds);
    for (let step = 0; step < steps; step += 1) {
      engine.step(clock.fixedStepSeconds);
    }
  };

  const ready = (storyStage: StoryStageHandle): void => {
    handle = storyStage;
  };

  const togglePaused = (): void => {
    paused = !paused;
  };

  const replay = (): void => {
    engine.reset();
    clock.reset();
    paused = false;
  };

  const zoomIn = (): void => {
    handle?.zoomBy(1.25);
  };

  const zoomOut = (): void => {
    handle?.zoomBy(0.8);
  };

  const resetCamera = (): void => {
    handle?.resetCamera();
  };
</script>

<div class="canvas-smoke" data-canvas-smoke>
  <StoryStage
    {createRenderer}
    {scene}
    {params}
    {getSnapshot}
    {onFrame}
    {paused}
    dprCap={2}
    testId="canvas-stage"
    ariaLabel="Canvas 2D stage smoke test"
    description="A live graph of fourteen cities with a moving colony, pheromone rings, and a dashed best tour. The canvas is decorative; the labels are real DOM text."
    onReady={ready}
  >
    <div class="canvas-smoke__controls" data-testid="stage-controls">
      <button type="button" class="canvas-smoke__button" data-testid="stage-pause" onclick={togglePaused}>
        {paused ? 'Play' : 'Pause'}
      </button>
      <button type="button" class="canvas-smoke__button" data-testid="stage-replay" onclick={replay}>
        Replay
      </button>
      <button type="button" class="canvas-smoke__button" data-testid="stage-zoom-in" onclick={zoomIn}>
        Zoom in
      </button>
      <button type="button" class="canvas-smoke__button" data-testid="stage-zoom-out" onclick={zoomOut}>
        Zoom out
      </button>
      <button type="button" class="canvas-smoke__button" data-testid="stage-reset-camera" onclick={resetCamera}>
        Reset camera
      </button>
      <button
        type="button"
        class="canvas-smoke__button"
        data-testid="stage-toggle-graph"
        aria-pressed={showGraph}
        onclick={() => (showGraph = !showGraph)}
      >
        Graph
      </button>
      <button
        type="button"
        class="canvas-smoke__button"
        data-testid="stage-toggle-pheromone"
        aria-pressed={showPheromone}
        onclick={() => (showPheromone = !showPheromone)}
      >
        Pheromone
      </button>
    </div>
  </StoryStage>

  <p class="canvas-smoke__note">
    <span class="data">canvas2d</span> · one GSAP ticker · DOM labels · DPR capped at 2 ·
    horizontal drag orbits, vertical drag scrolls the page natively.
  </p>
</div>

<style>
  .canvas-smoke {
    display: grid;
    gap: var(--space-sm);
    min-inline-size: 0;
  }

  .canvas-smoke__controls {
    position: absolute;
    inset-block-end: var(--space-sm);
    inset-inline-start: var(--space-sm);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    max-inline-size: calc(100% - 2 * var(--space-sm));
    pointer-events: none;
  }

  .canvas-smoke__button {
    pointer-events: auto;
    min-block-size: var(--tap-target);
    min-inline-size: var(--tap-target);
    padding: var(--space-2xs) var(--space-xs);
    border: var(--hairline) solid var(--color-rule-stage);
    border-radius: var(--radius-sm);
    background-color: color-mix(in srgb, var(--color-stage) 82%, transparent);
    color: var(--color-stage-ink);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    cursor: pointer;
  }

  .canvas-smoke__button:hover {
    border-color: var(--color-accent-stage);
    color: var(--color-accent-stage);
  }

  .canvas-smoke__button:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .canvas-smoke__button[aria-pressed='true'] {
    border-color: var(--color-accent-stage);
    color: var(--color-accent-stage);
  }

  .canvas-smoke__note {
    margin: 0;
    color: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
  }
</style>
