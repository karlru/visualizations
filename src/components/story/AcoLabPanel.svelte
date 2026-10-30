<script lang="ts">
  /**
   * ACO free-play lab.
   *
   * The shell renders this component only at the story's lab chapter and only
   * after hydration. It is deliberately ACO-specific: slider ranges, layer
   * names, and the compare-mode deferral live here, while every engine call
   * goes through the generic `StoryRuntime`/`StoryMapRuntime` seams.
   *
   * Controls are low-frequency UI: metrics, the chart, the fan, and the text
   * summary arrive as sampled props from the controller, never from the frame
   * loop. The stage Speed control remains the single speed control; the lab
   * does not duplicate it.
   */

  import type {
    StoryAuxiliaryView,
    StoryCameraPreset,
    StoryMetric,
    StoryModuleView,
    StoryParamBag,
  } from '../../stories/runtime';
  import PresetPicker from '../controls/PresetPicker.svelte';
  import SeedControl from '../controls/SeedControl.svelte';
  import Slider from '../controls/Slider.svelte';
  import Toggle from '../controls/Toggle.svelte';
  import ConvergenceChart from './ConvergenceChart.svelte';
  import ProbabilityFanSummary from './ProbabilityFanSummary.svelte';

  interface Props {
    readonly story: StoryModuleView;
    readonly params: StoryParamBag;
    readonly metrics: readonly StoryMetric[];
    readonly auxiliary: StoryAuxiliaryView | null;
    readonly paused: boolean;
    readonly selectedPreset: string | null;
    readonly layerVisibility: Readonly<Record<string, boolean>>;
    readonly mapEditMode: boolean;
    readonly coarsePointer: boolean;
    readonly selectedCity: number | null;
    readonly mapNotice: string;
    readonly shareMessage?: string;
    readonly shareOk?: boolean;
    readonly sharePending?: boolean;
    readonly onParamChange: (key: string, value: number) => void;
    readonly onPreset: (id: string) => void;
    readonly onSeed: (seed: number) => void;
    readonly onTogglePaused: () => void;
    readonly onStep: (direction: 1 | -1) => void;
    readonly onRestart: () => void;
    readonly onShare: () => void;
    readonly onLayerChange: (id: string, visible: boolean) => void;
    readonly onCameraPreset: (preset: StoryCameraPreset) => void;
    readonly onZoom: (factor: number) => void;
    readonly onCameraReset: () => void;
    readonly onMapEditModeChange: (enabled: boolean) => void;
    readonly onSelectCity: (index: number) => void;
    readonly onMapAdd: () => void;
    readonly onMapRemove: () => void;
    readonly onMapReset: () => void;
  }

  let {
    story,
    params,
    metrics,
    auxiliary,
    paused,
    selectedPreset,
    layerVisibility,
    mapEditMode,
    coarsePointer,
    selectedCity,
    mapNotice,
    shareMessage,
    shareOk = true,
    sharePending = false,
    onParamChange,
    onPreset,
    onSeed,
    onTogglePaused,
    onStep,
    onRestart,
    onShare,
    onLayerChange,
    onCameraPreset,
    onZoom,
    onCameraReset,
    onMapEditModeChange,
    onSelectCity,
    onMapAdd,
    onMapRemove,
    onMapReset,
  }: Props = $props();

  const LAYER_CONTROLS = [
    { id: 'pheromone', label: 'Pheromone', description: 'Trail width and opacity encode pheromone strength.' },
    { id: 'ants', label: 'Ants', description: 'Agents interpolated along their current tours.' },
    { id: 'best-tour', label: 'Best tour', description: 'The dashed accent path with square markers.' },
    {
      id: 'probability-fan',
      label: 'Probability fan',
      description: 'The focal city’s next-city probabilities.',
    },
  ] as const;

  const LAYER_LABELS = new Map(LAYER_CONTROLS.map((layer) => [layer.id, layer.label]));

  function numberParam(key: string, fallback: number): number {
    const value = params[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  const cityCount = $derived(numberParam('cityCount', 30));
  const antCount = $derived(numberParam('antCount', 40));
  const alpha = $derived(numberParam('alpha', 1));
  const beta = $derived(numberParam('beta', 2));
  const rho = $derived(numberParam('rho', 0.5));
  const seed = $derived(numberParam('seed', 0));

  let metricValue = $derived.by(() => {
    const values = new Map(metrics.map((item) => [item.id, item.value]));
    return (id: string): string => values.get(id) ?? '—';
  });

  let bestLength = $derived(metricValue('best-length'));
  let iteration = $derived(metricValue('iteration'));
  let meanLength = $derived(metricValue('mean-length'));
  let entropy = $derived(metricValue('entropy'));
  let metricCities = $derived(metricValue('cities'));
  let metricAnts = $derived(metricValue('ants'));

  let map = $derived(auxiliary?.map ?? null);
  let mapCount = $derived(map?.points.length ?? 0);
  let canAdd = $derived(map?.canAdd ?? false);
  let canRemove = $derived(map?.canRemove ?? false);
  let fan = $derived(auxiliary?.fan ?? null);
  let history = $derived(auxiliary?.history ?? []);
  let summary = $derived(auxiliary?.summary ?? 'No lab sample yet.');
  let cameraPresets = $derived(auxiliary?.cameraPresets ?? []);

  let selectedLabel = $derived(
    selectedCity === null ? 'No city selected' : `City ${selectedCity + 1} selected`,
  );

  function followLayer(id: string, checked: boolean): void {
    if (id === 'graph') return;
    onLayerChange(id, checked);
  }

  function handleMapCityChange(event: Event & { currentTarget: HTMLSelectElement }): void {
    const value = event.currentTarget.value;
    if (value.length > 0) onSelectCity(Number(value));
  }
</script>

<section class="aco-lab" aria-labelledby="aco-lab-title" data-aco-lab data-lab-panel>
  <header class="aco-lab__head">
    <h2 class="aco-lab__title" id="aco-lab-title">Colony lab</h2>
    <p class="aco-lab__note">
      Change the instance, the rule, and the view. Structural changes restart the run at iteration
      0 with the same seed. The stage Speed control (0.5×, 1×, 2×, 4×) remains the only speed
      control.
    </p>
    <p class="aco-lab__note" data-share-scope data-testid="aco-lab-share-scope">
      <strong>Share links</strong> copy the canonical URL for this chapter, seed, speed, and
      structural parameters. They restart at step 0. <strong>Map edits are local and are not
      included in share links</strong>; a share restores a seeded map with the same city count.
    </p>
    <p class="aco-lab__note" data-compare-note data-testid="aco-lab-compare">
      Side-by-side comparison of two parameter sets is a documented <em>should</em> requirement
      deferred for release 1. Run one configuration at a time and use share links to compare runs.
    </p>
  </header>

  <fieldset class="aco-lab__transport">
    <legend class="visually-hidden">Playback</legend>
    <button
      type="button"
      class="aco-lab__button"
      data-testid="aco-lab-play"
      aria-pressed={paused}
      onclick={onTogglePaused}
    >
      {paused ? 'Play' : 'Pause'}
    </button>
    <button
      type="button"
      class="aco-lab__button"
      data-testid="aco-lab-step-back"
      onclick={() => onStep(-1)}
    >
      Step back
    </button>
    <button
      type="button"
      class="aco-lab__button"
      data-testid="aco-lab-step-forward"
      onclick={() => onStep(1)}
    >
      Step forward
    </button>
    <button
      type="button"
      class="aco-lab__button"
      data-testid="aco-lab-restart"
      onclick={onRestart}
    >
      Restart run
    </button>
    <button
      type="button"
      class="aco-lab__button"
      data-testid="aco-lab-share"
      disabled={sharePending}
      onclick={onShare}
    >
      {sharePending ? 'Copying…' : 'Share'}
    </button>
  </fieldset>

  {#if shareMessage}
    <p
      class="aco-lab__status"
      class:aco-lab__status--error={!shareOk}
      data-lab-share-status
      data-share-ok={shareOk ? 'true' : 'false'}
      role="status"
      aria-live="polite"
    >
      {shareMessage}
    </p>
  {/if}

  <div class="aco-lab__grid">
    <Slider
      id="aco-cities"
      label="Cities"
      value={cityCount}
      min={2}
      max={150}
      step={1}
      hint="2–150. Changing the count generates a new seeded map."
      onValueChange={(value) => onParamChange('cityCount', value)}
    />
    <Slider
      id="aco-ants"
      label="Ants"
      value={antCount}
      min={1}
      max={200}
      step={1}
      hint="1–200. Every ant builds one complete tour per iteration."
      onValueChange={(value) => onParamChange('antCount', value)}
    />
    <Slider
      id="aco-alpha"
      label="Pheromone weight α"
      value={alpha}
      min={0}
      max={5}
      step={0.1}
      formatValue={(value) => value.toFixed(1)}
      hint="0 ignores pheromone; higher values exploit experience."
      onValueChange={(value) => onParamChange('alpha', value)}
    />
    <Slider
      id="aco-beta"
      label="Distance weight β"
      value={beta}
      min={0}
      max={10}
      step={0.5}
      formatValue={(value) => value.toFixed(1)}
      hint="0 ignores distance; higher values favour short edges."
      onValueChange={(value) => onParamChange('beta', value)}
    />
    <Slider
      id="aco-rho"
      label="Evaporation ρ"
      value={rho}
      min={0}
      max={1}
      step={0.01}
      formatValue={(value) => value.toFixed(2)}
      hint="1 evaporates completely before each deposit."
      onValueChange={(value) => onParamChange('rho', value)}
    />
    <PresetPicker
      id="aco-preset"
      presets={story.presets}
      selected={selectedPreset}
      onSelect={onPreset}
    />
    <SeedControl id="aco-seed" {seed} onSeedChange={onSeed} />
  </div>

  <fieldset class="aco-lab__fieldset" data-lab-layers>
    <legend class="aco-lab__legend">Layers</legend>
    <p class="aco-lab__hint">
      The city graph always stays visible. Layer choices apply inside the lab and reset when you
      leave the chapter; the simulation is never recreated.
    </p>
    <div class="aco-lab__toggles">
      {#each LAYER_CONTROLS as layer (layer.id)}
        <Toggle
          id={`aco-layer-${layer.id}`}
          label={layer.label}
          checked={layerVisibility[layer.id] ?? true}
          description={layer.description}
          onCheckedChange={(checked) => followLayer(layer.id, checked)}
        />
      {/each}
    </div>
    <p class="aco-lab__hint" data-active-layers>
      Visible: graph{Object.entries(layerVisibility)
        .filter(([id, visible]) => id !== 'graph' && visible)
        .map(([id]) => `, ${LAYER_LABELS.get(id) ?? id}`)
        .join('')}
    </p>
  </fieldset>

  <fieldset class="aco-lab__fieldset" data-lab-camera>
    <legend class="aco-lab__legend">Camera</legend>
    <div class="aco-lab__buttons">
      {#each cameraPresets as preset (preset.id)}
        <button
          type="button"
          class="aco-lab__button"
          data-testid={`aco-camera-${preset.id}`}
          data-camera-preset={preset.id}
          onclick={() => onCameraPreset(preset)}
        >
          {preset.label}
        </button>
      {/each}
      <button
        type="button"
        class="aco-lab__button"
        data-testid="aco-camera-zoom-in"
        aria-label="Zoom in"
        onclick={() => onZoom(1.25)}
      >
        Zoom in
      </button>
      <button
        type="button"
        class="aco-lab__button"
        data-testid="aco-camera-zoom-out"
        aria-label="Zoom out"
        onclick={() => onZoom(0.8)}
      >
        Zoom out
      </button>
      <button
        type="button"
        class="aco-lab__button"
        data-testid="aco-camera-reset"
        onclick={onCameraReset}
      >
        Reset camera
      </button>
    </div>
  </fieldset>

  <fieldset class="aco-lab__fieldset" data-lab-map>
    <legend class="aco-lab__legend">Map</legend>
    <p class="aco-lab__hint">
      Turn on Edit map mode to show the city handles. Drag any handle on the stage, or focus it and
      use the arrow keys. Every edit pauses the run, rebuilds distances, and restarts at iteration
      0. At least 2 and at most 150 cities are kept; coordinates clamp to the map, and coincident
      cities are allowed.
    </p>
    <Toggle
      id="aco-map-edit"
      label="Edit map mode"
      checked={mapEditMode}
      description={coarsePointer
        ? 'On touch screens, turn this on to show and drag cities. When off, vertical page scroll stays native.'
        : 'Shows the draggable city handles on the stage.'}
      onCheckedChange={onMapEditModeChange}
    />
    <div class="aco-lab__buttons">
      <button
        type="button"
        class="aco-lab__button"
        data-testid="aco-map-add"
        disabled={!canAdd}
        onclick={onMapAdd}
      >
        Add city
      </button>
      <button
        type="button"
        class="aco-lab__button"
        data-testid="aco-map-remove"
        disabled={!canRemove}
        onclick={onMapRemove}
      >
        Remove selected
      </button>
      <button
        type="button"
        class="aco-lab__button"
        data-testid="aco-map-reset"
        onclick={onMapReset}
      >
        Reset map
      </button>
    </div>
    <div class="aco-lab__map-meta">
      <span class="data" data-testid="aco-map-count">{mapCount} cities</span>
      <span class="data" data-testid="aco-map-custom">{map?.custom ? 'Local map' : 'Seeded map'}</span>
      <span class="data" data-testid="aco-map-selected">{selectedLabel}</span>
    </div>
    <label class="aco-lab__select-label" for="aco-map-city">
      Select a city
      <select
        id="aco-map-city"
        class="aco-lab__select"
        data-testid="aco-map-city"
        value={selectedCity === null ? '' : String(selectedCity)}
        onchange={handleMapCityChange}
      >
        <option value="">None</option>
        {#each map?.points ?? [] as _point, index (index)}
          <option value={String(index)}>City {index + 1}</option>
        {/each}
      </select>
    </label>
    <p class="aco-lab__notice" role="status" aria-live="polite" data-testid="aco-map-notice">
      {mapNotice}
    </p>
  </fieldset>

  <section class="aco-lab__summary" aria-labelledby="aco-lab-summary-title" data-lab-summary>
    <h3 class="aco-lab__subtitle" id="aco-lab-summary-title">Current best tour</h3>
    <p
      class="aco-lab__summary-text"
      data-testid="aco-lab-summary"
      data-summary-best={bestLength}
      data-summary-iteration={iteration}
      data-summary-mean={meanLength}
      data-summary-entropy={entropy}
      data-summary-cities={metricCities}
      data-summary-ants={metricAnts}
    >
      {summary}
    </p>
  </section>

  <div class="aco-lab__data">
    {#if fan}
      <ProbabilityFanSummary fan={fan} id="aco-lab-probability-fan" />
    {:else}
      <p class="aco-lab__hint">The probability fan needs at least two cities.</p>
    {/if}
    <ConvergenceChart
      history={history}
      bestLength={bestLength === '—' ? null : Number(bestLength)}
      meanLength={meanLength === '—' ? null : Number(meanLength)}
      iteration={Number(iteration)}
      id="aco-lab-convergence"
    />
  </div>
</section>

<style>
  .aco-lab {
    display: grid;
    gap: var(--space-md);
    min-inline-size: 0;
    padding: var(--space-md);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-md);
    background-color: var(--color-paper-raised);
  }

  .aco-lab__head {
    display: grid;
    gap: var(--space-2xs);
  }

  .aco-lab__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lead);
    line-height: var(--leading-tight);
  }

  .aco-lab__subtitle,
  .aco-lab__legend {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .aco-lab__note,
  .aco-lab__hint,
  .aco-lab__notice,
  .aco-lab__status {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .aco-lab__status {
    color: var(--color-accent-paper);
  }

  .aco-lab__status--error {
    color: var(--color-ink);
  }

  .aco-lab__notice {
    min-block-size: 1.5rem;
    padding: var(--space-3xs) var(--space-2xs);
    border-inline-start: var(--rule-strong) solid var(--color-accent-paper);
    background-color: var(--color-paper-inset);
    color: var(--color-ink);
  }

  .aco-lab__transport,
  .aco-lab__buttons,
  .aco-lab__map-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    align-items: center;
  }

  .aco-lab__transport {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .aco-lab__button {
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

  .aco-lab__button:hover:not(:disabled) {
    border-color: var(--color-accent-paper);
    color: var(--color-accent-paper);
  }

  .aco-lab__button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .aco-lab__button:focus-visible,
  .aco-lab__select:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .aco-lab__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: var(--space-sm);
    min-inline-size: 0;
  }

  .aco-lab__fieldset {
    display: grid;
    gap: var(--space-2xs);
    min-inline-size: 0;
    margin: 0;
    padding: var(--space-sm);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
  }

  .aco-lab__toggles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: var(--space-2xs) var(--space-sm);
  }

  .aco-lab__map-meta {
    color: var(--color-ink);
    font-size: var(--text-xs);
  }

  .aco-lab__select-label {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    align-items: center;
    color: var(--color-ink);
    font-size: var(--text-sm);
  }

  .aco-lab__select {
    min-block-size: var(--tap-target);
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper);
    color: var(--color-ink);
    font-size: var(--text-sm);
  }

  .aco-lab__summary {
    display: grid;
    gap: var(--space-3xs);
  }

  .aco-lab__summary-text {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
  }

  .aco-lab__data {
    display: grid;
    gap: var(--space-md);
    min-inline-size: 0;
  }
</style>
