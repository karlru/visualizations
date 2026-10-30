<script lang="ts">

  /**
   * `/dev/aco-smoke` renderer fixture.
   *
   * Self-contained on purpose: one real `AcoEngine`, one fixed-step clock, one
   * `StoryStage` + `Canvas2DRenderer`, and the complete ACO layer set. It proves
   * the layers, probability fan, convergence chart, layer toggles, and DOM
   * labels work against the shipped engine without the Step 3.3 story
   * controller. The engine is created once; toggling a layer only changes the
   * composed `SceneState`, never the simulation.
   */

  import { AcoEngine } from '../../engines/aco/engine';
  import type { AcoMetrics, AcoParams, AcoSnapshot } from '../../engines/aco/types';
  import { FixedStepClock } from '../../engines/core/clock';
  import { Canvas2DRenderer } from '../../render/canvas2d/Canvas2DRenderer';
  import { createAcoLayers } from '../../render/canvas2d/layers';
  import type { SceneState } from '../../render/types';
  import { ACO_DEFAULTS } from '../../stories/aco/config';
  import {
    buildProbabilityFan,
    DEFAULT_FAN_CANDIDATES,
    type ProbabilityFan,
  } from '../../stories/aco/probability-fan';
  import {
    ACO_CANVAS_LAYER_IDS,
    ACO_SCENES,
    type AcoCanvasLayerId,
  } from '../../stories/aco/scenes';
  import { ACO_FOCAL_CITY_INDEX } from '../../stories/aco/world';
  import Metrics from '../controls/Metrics.svelte';
  import type { MetricItem } from '../controls/metrics-types';
  import ConvergenceChart from './ConvergenceChart.svelte';
  import ProbabilityFanSummary from './ProbabilityFanSummary.svelte';
  import StoryStage from './StoryStage.svelte';
  import type { StoryStageHandle } from './story-stage-types';

  const params: AcoParams = ACO_DEFAULTS;
  const engine = new AcoEngine(params);
  const clock = new FixedStepClock({ maxSubsteps: 8 });
  const baseScene = ACO_SCENES.emergence;

  type LayerVisibility = Record<AcoCanvasLayerId, boolean>;

  const initialVisibility: LayerVisibility = {
    graph: true,
    pheromone: true,
    ants: true,
    'best-tour': true,
    'probability-fan': true,
  };

  let paused = $state(false);
  let visibility = $state<LayerVisibility>(initialVisibility);
  let handle: StoryStageHandle | null = null;
  let metrics = $state<Readonly<AcoMetrics>>(engine.metrics());
  let fan = $state<ProbabilityFan>(
    buildProbabilityFan(engine.snapshot(), engine.snapshot().pheromone, engine.snapshot().params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      topN: DEFAULT_FAN_CANDIDATES,
    }),
  );
  let lastSampledIteration = 0;

  const baseOpacity = (id: AcoCanvasLayerId): number => {
    const layer = baseScene.layers.find((entry) => entry.id === id);
    if (layer === undefined) return 1;
    // The emergence scene hides the fan; this fixture starts it visible so the
    // toggle has something to reveal.
    return layer.opacity > 0 ? layer.opacity : 1;
  };

  const scene = $derived<SceneState>({
    camera: baseScene.camera,
    layers: ACO_CANVAS_LAYER_IDS.map((id) => ({
      id,
      visible: visibility[id],
      opacity: visibility[id] ? baseOpacity(id) : 0,
    })),
    highlights: baseScene.highlights,
    revealProgress: baseScene.revealProgress,
    labels: baseScene.labels,
  });

  const createRenderer = (): Canvas2DRenderer<AcoParams, AcoSnapshot> =>
    new Canvas2DRenderer<AcoParams, AcoSnapshot>({
      layers: createAcoLayers({ focalCity: ACO_FOCAL_CITY_INDEX, topN: DEFAULT_FAN_CANDIDATES }),
      dprCap: 2,
    });

  const getSnapshot = (): Readonly<AcoSnapshot> => engine.snapshot();

  /** Low-frequency sample: metrics history, the ranked fan, and the text summary. */
  function sample(): void {
    const snapshot = engine.snapshot();
    metrics = engine.metrics();
    fan = buildProbabilityFan(snapshot, snapshot.pheromone, snapshot.params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      topN: DEFAULT_FAN_CANDIDATES,
    });
  }

  const onFrame = (deltaSeconds: number): void => {
    const steps = clock.advance(deltaSeconds);
    for (let step = 0; step < steps; step += 1) {
      engine.step(clock.fixedStepSeconds);
    }

    const iteration = engine.snapshot().iteration;
    if (iteration !== lastSampledIteration) {
      lastSampledIteration = iteration;
      sample();
    }
  };

  const ready = (storyStage: StoryStageHandle): void => {
    handle = storyStage;
  };

  const togglePaused = (): void => {
    paused = !paused;
    sample();
  };

  const replay = (): void => {
    engine.reset();
    clock.reset();
    paused = false;
    lastSampledIteration = 0;
    sample();
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

  const setLayer = (id: AcoCanvasLayerId, value: boolean): void => {
    visibility = { ...visibility, [id]: value };
  };

  function formatLength(value: number | null): string {
    return value === null || !Number.isFinite(value) ? '—' : value.toFixed(3);
  }

  const metricItems = $derived<MetricItem[]>([
    { id: 'iteration', label: 'Iteration', value: String(metrics.iteration) },
    { id: 'best-length', label: 'Best length', value: formatLength(metrics.bestLength) },
    { id: 'mean-length', label: 'Mean length', value: formatLength(metrics.meanLength) },
    { id: 'entropy', label: 'Diversity', value: metrics.entropy.toFixed(3) },
    { id: 'ants', label: 'Ants', value: String(metrics.antCount) },
    { id: 'cities', label: 'Cities', value: String(metrics.cityCount) },
  ]);

  const summary = $derived(
    metrics.bestLength === null
      ? `No completed iteration yet. ${metrics.antCount} ants are ready on ${metrics.cityCount} cities.`
      : `Best tour ${formatLength(metrics.bestLength)} after ${metrics.iteration} iteration${metrics.iteration === 1 ? '' : 's'}; mean ${formatLength(metrics.meanLength)}.`,
  );
</script>

<div class="aco-smoke" data-aco-smoke>
  <StoryStage
    {createRenderer}
    {scene}
    {params}
    {getSnapshot}
    {onFrame}
    {paused}
    dprCap={2}
    testId="aco-stage"
    ariaLabel="Ant colony optimization renderer fixture"
    description="A live ant colony on a city map: faint all-pairs candidate edges, pheromone trails whose width and opacity encode strength, moving ants with short trails, and a dashed best tour. Labels, the probability fan, the convergence chart, and the metrics are DOM text."
    onReady={ready}
  />

  <section class="aco-smoke__card" aria-labelledby="aco-controls-title" data-testid="aco-controls">
    <h2 class="aco-smoke__card-title" id="aco-controls-title">Controls</h2>
    <div class="aco-smoke__buttons">
      <button type="button" class="aco-smoke__button" data-testid="aco-pause" onclick={togglePaused}>
        {paused ? 'Play' : 'Pause'}
      </button>
      <button type="button" class="aco-smoke__button" data-testid="aco-replay" onclick={replay}>
        Replay
      </button>
      <button type="button" class="aco-smoke__button" data-testid="aco-zoom-in" onclick={zoomIn}>
        Zoom in
      </button>
      <button type="button" class="aco-smoke__button" data-testid="aco-zoom-out" onclick={zoomOut}>
        Zoom out
      </button>
      <button
        type="button"
        class="aco-smoke__button"
        data-testid="aco-reset-camera"
        onclick={resetCamera}
      >
        Reset camera
      </button>
    </div>

    <fieldset class="aco-smoke__layers">
      <legend class="aco-smoke__legend">Layers</legend>
      {#each ACO_CANVAS_LAYER_IDS as id (id)}
        <label class="aco-smoke__layer" data-testid={`aco-toggle-${id}`}>
          <input
            type="checkbox"
            checked={visibility[id]}
            onchange={(event) => setLayer(id, event.currentTarget.checked)}
          />
          <span>{id === 'best-tour' ? 'Best tour' : id === 'probability-fan' ? 'Probability fan' : id}</span>
        </label>
      {/each}
    </fieldset>
  </section>

  <div class="aco-smoke__data">
    <ProbabilityFanSummary {fan} id="aco-probability-fan" />
    <ConvergenceChart
      history={metrics.history}
      bestLength={metrics.bestLength}
      meanLength={metrics.meanLength}
      iteration={metrics.iteration}
      id="aco-convergence"
    />
    <Metrics id="aco-metrics" title="Colony metrics" items={metricItems} />
  </div>

  <p class="aco-smoke__summary" data-testid="aco-summary">{summary}</p>

  <p class="aco-smoke__note">
    <span class="data">canvas2d</span> · fixed 60 Hz clock · one GSAP ticker · DOM labels · DPR
    capped at 2 · one iteration per simulated second.
  </p>
</div>

<style>
  .aco-smoke {
    display: grid;
    gap: var(--space-md);
    min-inline-size: 0;
  }

  .aco-smoke__card {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-md);
    background-color: var(--color-paper-raised);
  }

  .aco-smoke__card-title,
  .aco-smoke__legend {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .aco-smoke__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }

  .aco-smoke__button {
    min-block-size: var(--tap-target);
    min-inline-size: var(--tap-target);
    padding: var(--space-2xs) var(--space-xs);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    cursor: pointer;
  }

  .aco-smoke__button:hover {
    border-color: var(--color-accent-paper);
    color: var(--color-accent-paper);
  }

  .aco-smoke__button:focus-visible,
  .aco-smoke__layer input:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .aco-smoke__layers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--space-2xs) var(--space-sm);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .aco-smoke__legend {
    padding: 0;
  }

  .aco-smoke__layer {
    display: inline-flex;
    gap: var(--space-2xs);
    align-items: center;
    min-block-size: var(--tap-target);
    color: var(--color-ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .aco-smoke__layer input {
    inline-size: 1.15rem;
    block-size: 1.15rem;
    margin: 0;
    accent-color: var(--color-accent-paper);
  }

  .aco-smoke__data {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
    gap: var(--space-md);
    min-inline-size: 0;
  }

  .aco-smoke__summary {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--text-sm);
  }

  .aco-smoke__note {
    margin: 0;
    color: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
  }
</style>
