<script lang="ts">
  /**
   * Stage chrome: play/pause, replay, speed, and a details affordance.
   *
   * The component is presentational. The controller owns the clock and engine;
   * this component only reports reader intent. Step 1.6 added the stage-level
   * keyboard contract in `StoryStage`/`StoryController`; the labels, states, and
   * native controls here stay fully keyboard operable on their own.
   *
   * Step 3.6 adds the quality-tier control. The visible badge always names the
   * effective tier; the Auto/High/Medium/Low select lives in the details panel
   * so the compact mobile chrome does not grow another row of controls.
   */

  import type { QualityTier } from '../../engines/core/types';
  import {
    QUALITY_PREFERENCE_OPTIONS,
    type QualityPreference,
    qualityProfile,
    qualityTierLabel,
  } from '../../lib/quality';

  interface Props {
    readonly paused: boolean;
    readonly speed: number;
    /** Active renderer, used only for the human-readable details note. */
    readonly rendererId?: string;
    readonly chapterTitle?: string;
    readonly sceneId?: string | null;
    /** Effective reduced-motion state (OS or reader choice). */
    readonly reducedMotion?: boolean;
    /** True when the OS asks for reduced motion; the toggle is then locked. */
    readonly systemReducedMotion?: boolean;
    /** Zero-based keyframe inside the active chapter. */
    readonly sceneStep?: number;
    /** Number of keyframes declared by the active chapter (at least one). */
    readonly sceneStepCount?: number;
    /** Reader's quality preference; `auto` follows the detected tier. */
    readonly qualityPreference?: QualityPreference;
    /** Effective quality tier after detection, preference, and the workload cap. */
    readonly qualityTier?: QualityTier;
    /** True when a large workload band drives the effective tier. */
    readonly qualityReduced?: boolean;
    /** Current city count, used only by the workload notice. */
    readonly workloadCities?: number;
    /** Current ant count, used only by the workload notice. */
    readonly workloadAnts?: number;
    readonly onTogglePaused: () => void;
    readonly onReplay: () => void;
    readonly onSpeedChange: (speed: number) => void;
    readonly onStepScene?: (direction: 1 | -1) => void;
    readonly onToggleReducedMotion?: (reduced: boolean) => void;
    readonly onShare?: () => void;
    readonly onQualityChange?: (preference: QualityPreference) => void;
    readonly shareMessage?: string;
    readonly shareOk?: boolean;
    readonly sharePending?: boolean;
  }

  let {
    paused,
    speed,
    rendererId = 'canvas2d',
    chapterTitle,
    sceneId,
    reducedMotion = false,
    systemReducedMotion = false,
    sceneStep = 0,
    sceneStepCount = 1,
    qualityPreference = 'auto',
    qualityTier = 'high',
    qualityReduced = false,
    workloadCities = 0,
    workloadAnts = 0,
    onTogglePaused,
    onReplay,
    onSpeedChange,
    onStepScene,
    onToggleReducedMotion,
    onShare,
    onQualityChange,
    shareMessage,
    shareOk = true,
    sharePending = false,
  }: Props = $props();

  const SPEEDS = [0.5, 1, 2, 4] as const;

  let stepBackDisabled = $derived(sceneStep <= 0);
  let stepForwardDisabled = $derived(sceneStep >= sceneStepCount - 1);
  let dprCap = $derived(qualityProfile(qualityTier).dprCap);

  function formatSpeed(value: number): string {
    return value === 1 ? '1×' : `${value}×`;
  }

  function formatRenderer(value: string): string {
    if (value === 'canvas2d') return 'Canvas 2D';
    if (value === 'three') return 'WebGL 2 / Three.js';
    return value;
  }

  function handleSpeed(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    const next = Number.parseFloat(select.value);
    if (Number.isFinite(next) && next > 0) onSpeedChange(next);
  }

  function handleMotion(event: Event): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    // A system preference locks the control. Forced synthetic events must not
    // leave the visible checkbox out of sync with the authoritative state.
    if (systemReducedMotion) {
      input.checked = true;
      return;
    }
    onToggleReducedMotion?.(input.checked);
  }

  function handleQuality(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    const value = select.value;
    if (value === 'auto' || value === 'high' || value === 'medium' || value === 'low') {
      onQualityChange?.(value);
    }
  }
</script>

<div
  class="stage-chrome"
  data-stage-chrome
  data-paused={paused ? 'true' : 'false'}
  data-speed={speed}
  data-reduced-motion={reducedMotion ? 'true' : 'false'}
  data-system-reduced-motion={systemReducedMotion ? 'true' : 'false'}
  data-scene-step={sceneStep}
  data-scene-step-count={sceneStepCount}
  data-quality={qualityTier}
  data-quality-preference={qualityPreference}
  data-quality-reduced={qualityReduced ? 'true' : 'false'}
>
  <button
    type="button"
    class="stage-chrome__button"
    data-testid="stage-play-pause"
    aria-label={paused ? 'Play simulation' : 'Pause simulation'}
    aria-pressed={paused}
    aria-keyshortcuts="Space"
    onclick={onTogglePaused}
  >
    {paused ? 'Play' : 'Pause'}
  </button>

  <button
    type="button"
    class="stage-chrome__button"
    data-testid="stage-replay"
    aria-label="Replay the current chapter simulation"
    onclick={onReplay}
  >
    Replay
  </button>

  <fieldset class="stage-chrome__steps">
    <legend class="visually-hidden">Scene keyframes</legend>
    <button
      type="button"
      class="stage-chrome__button stage-chrome__step"
      data-testid="stage-step-back"
      aria-label="Previous scene keyframe"
      disabled={stepBackDisabled}
      onclick={() => onStepScene?.(-1)}
    >
      <span aria-hidden="true">‹</span>
    </button>
    <span class="stage-chrome__step-readout data" data-scene-step-readout aria-live="polite">
      {sceneStep + 1} / {sceneStepCount}
    </span>
    <button
      type="button"
      class="stage-chrome__button stage-chrome__step"
      data-testid="stage-step-forward"
      aria-label="Next scene keyframe"
      disabled={stepForwardDisabled}
      onclick={() => onStepScene?.(1)}
    >
      <span aria-hidden="true">›</span>
    </button>
  </fieldset>

  <label class="stage-chrome__field">
    <span class="stage-chrome__field-label">Speed</span>
    <select
      class="stage-chrome__select"
      data-testid="stage-speed"
      aria-label="Simulation speed"
      value={String(speed)}
      onchange={handleSpeed}
    >
      {#each SPEEDS as option (option)}
        <option value={String(option)}>{formatSpeed(option)}</option>
      {/each}
    </select>
  </label>

  <span
    class="stage-chrome__quality"
    data-testid="stage-quality"
    data-quality-tier={qualityTier}
    data-quality-preference={qualityPreference}
    data-quality-reduced={qualityReduced ? 'true' : 'false'}
    aria-live="polite"
  >
    Quality {qualityTierLabel(qualityTier)}
  </span>

  {#if qualityReduced}
    <p
      class="stage-chrome__quality-notice"
      data-testid="stage-quality-notice"
      data-quality-reduced="true"
      role="status"
      aria-live="polite"
    >
      Quality reduced to {qualityTierLabel(qualityTier)} for {workloadCities} cities × {workloadAnts}
      ants. Presentation only: the colony size, seed, and iteration state are unchanged.
    </p>
  {/if}

  <label class="stage-chrome__motion">
    <input
      type="checkbox"
      class="stage-chrome__motion-input"
      data-testid="motion-toggle"
      checked={reducedMotion}
      disabled={systemReducedMotion}
      aria-describedby={systemReducedMotion ? 'story-motion-note' : undefined}
      onchange={handleMotion}
    />
    <span>Reduce motion</span>
  </label>

  {#if systemReducedMotion}
    <p class="stage-chrome__motion-note" id="story-motion-note" data-motion-note>
      Your system asks for reduced motion. The story starts paused and this control can only
      reduce motion further.
    </p>
  {/if}

  {#if onShare}
    <button
      type="button"
      class="stage-chrome__button"
      data-testid="stage-share"
      aria-label="Share this story state"
      disabled={sharePending}
      onclick={onShare}
    >
      {sharePending ? 'Copying…' : 'Share'}
    </button>
  {/if}

  {#if shareMessage}
    <p
      class="stage-chrome__share-status"
      class:stage-chrome__share-status--error={!shareOk}
      data-share-status
      data-share-ok={shareOk ? 'true' : 'false'}
      role="status"
      aria-live="polite"
    >
      {shareMessage}
    </p>
  {/if}

  <details class="stage-chrome__details" data-testid="stage-details">
    <summary class="stage-chrome__summary">Details</summary>
    <div class="stage-chrome__panel">
      <dl class="stage-chrome__facts">
        <div>
          <dt>Chapter</dt>
          <dd>{chapterTitle ?? '—'}</dd>
        </div>
        <div>
          <dt>Scene</dt>
          <dd class="data">{sceneId ?? '—'}</dd>
        </div>
        <div>
          <dt>Keyframe</dt>
          <dd class="data">{sceneStep + 1} / {sceneStepCount}</dd>
        </div>
        <div>
          <dt>Motion</dt>
          <dd class="data">{reducedMotion ? 'Reduced' : 'Full'}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd class="data">{formatSpeed(speed)}</dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd class="data">
            {qualityTierLabel(qualityTier)}
            {qualityPreference === 'auto' ? '(auto)' : '(chosen)'}
          </dd>
        </div>
      </dl>

      <label class="stage-chrome__quality-field">
        <span class="stage-chrome__field-label">Presentation quality</span>
        <select
          class="stage-chrome__select"
          data-testid="stage-quality-select"
          aria-label="Presentation quality tier"
          value={qualityPreference}
          onchange={handleQuality}
        >
          {#each QUALITY_PREFERENCE_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      <p class="stage-chrome__note">
        Quality changes presentation cost only: DPR, rendered ants and trails, pheromone
        buckets, and edge detail. City and ant counts, the seed, and the iteration state never
        change.
      </p>

      <p class="stage-chrome__note">
        {formatRenderer(rendererId)} · DPR capped at {dprCap} · simulation pauses when the stage
        leaves the viewport. Share links carry the chapter, seed, and structural parameters;
        canvas and map edits stay local.
      </p>
    </div>
  </details>
</div>

<style>
  .stage-chrome {
    position: absolute;
    inset-inline: var(--space-sm);
    inset-block-end: var(--space-sm);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    align-items: center;
    pointer-events: none;
  }

  .stage-chrome > * {
    pointer-events: auto;
  }

  .stage-chrome__button,
  .stage-chrome__summary,
  .stage-chrome__select {
    min-block-size: var(--tap-target);
    padding: var(--space-2xs) var(--space-xs);
    border: var(--hairline) solid var(--color-rule-stage);
    border-radius: var(--radius-sm);
    background-color: color-mix(in srgb, var(--color-stage) 82%, transparent);
    color: var(--color-stage-ink);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .stage-chrome__button {
    cursor: pointer;
  }

  .stage-chrome__button:hover,
  .stage-chrome__summary:hover,
  .stage-chrome__select:hover {
    border-color: var(--color-accent-stage);
    color: var(--color-accent-stage);
  }

  .stage-chrome__button:focus-visible,
  .stage-chrome__summary:focus-visible,
  .stage-chrome__select:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .stage-chrome__button[aria-pressed='true'] {
    border-color: var(--color-accent-stage);
    color: var(--color-accent-stage);
  }

  .stage-chrome__button:disabled {
    border-color: var(--color-rule-stage);
    color: var(--color-stage-muted);
    cursor: not-allowed;
    opacity: 0.65;
  }

  .stage-chrome__steps {
    display: inline-flex;
    gap: var(--space-3xs);
    align-items: center;
    min-inline-size: 0;
    padding: 0;
    border: 0;
    margin: 0;
  }

  .stage-chrome__step {
    min-inline-size: var(--tap-target);
    padding-inline: 0;
    font-size: var(--text-sm);
  }

  .stage-chrome__step-readout {
    min-inline-size: 3.5ch;
    color: var(--color-stage-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-align: center;
  }

  .stage-chrome__quality {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap-target);
    padding-inline: var(--space-2xs);
    color: var(--color-stage-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .stage-chrome__quality-field {
    display: grid;
    gap: var(--space-3xs);
  }

  .stage-chrome__quality-notice {
    flex-basis: 100%;
    max-inline-size: 52ch;
    margin: 0;
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--hairline) solid var(--color-accent-stage);
    border-radius: var(--radius-sm);
    background-color: color-mix(in srgb, var(--color-stage) 88%, transparent);
    color: var(--color-stage-ink);
    font-size: var(--text-2xs);
    line-height: var(--leading-normal);
  }

  .stage-chrome__motion {
    display: inline-flex;
    gap: var(--space-2xs);
    align-items: center;
    min-block-size: var(--tap-target);
    padding-inline: var(--space-2xs);
    color: var(--color-stage-ink);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    cursor: pointer;
  }

  .stage-chrome__motion:has(.stage-chrome__motion-input:disabled) {
    cursor: not-allowed;
    opacity: 0.8;
  }

  .stage-chrome__motion-input {
    inline-size: 1.15rem;
    block-size: 1.15rem;
    accent-color: var(--color-accent-stage);
  }

  .stage-chrome__motion-input:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .stage-chrome__motion-note {
    flex-basis: 100%;
    max-inline-size: 46ch;
    margin: 0;
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--hairline) solid var(--color-rule-stage);
    border-radius: var(--radius-sm);
    background-color: color-mix(in srgb, var(--color-stage) 82%, transparent);
    color: var(--color-stage-muted);
    font-size: var(--text-2xs);
    line-height: var(--leading-normal);
  }

  .stage-chrome__share-status {
    flex-basis: 100%;
    max-inline-size: 46ch;
    margin: 0;
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--hairline) solid var(--color-rule-stage);
    border-radius: var(--radius-sm);
    background-color: color-mix(in srgb, var(--color-stage) 82%, transparent);
    color: var(--color-accent-stage);
    font-size: var(--text-2xs);
    line-height: var(--leading-normal);
  }

  .stage-chrome__share-status--error {
    color: var(--color-stage-ink);
  }

  .stage-chrome__field {
    display: inline-flex;
    gap: var(--space-2xs);
    align-items: center;
    padding-inline-start: var(--space-xs);
  }

  .stage-chrome__field-label {
    color: var(--color-stage-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .stage-chrome__select {
    padding-inline-end: var(--space-md);
    cursor: pointer;
  }

  .stage-chrome__details {
    position: relative;
  }

  .stage-chrome__summary {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    list-style: none;
  }

  .stage-chrome__summary::-webkit-details-marker {
    display: none;
  }

  .stage-chrome__details[open] .stage-chrome__summary {
    border-color: var(--color-accent-stage);
    color: var(--color-accent-stage);
  }

  .stage-chrome__panel {
    position: absolute;
    inset-block-end: calc(100% + var(--space-2xs));
    inset-inline-start: 0;
    display: grid;
    gap: var(--space-2xs);
    inline-size: min(18rem, calc(100vw - 2 * var(--space-md)));
    padding: var(--space-sm);
    border: var(--hairline) solid var(--color-rule-stage);
    border-radius: var(--radius-md);
    background-color: var(--color-stage);
    box-shadow: var(--shadow-panel);
  }

  .stage-chrome__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
    gap: var(--space-2xs);
    margin: 0;
  }

  .stage-chrome__facts dt {
    color: var(--color-stage-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .stage-chrome__facts dd {
    margin: 0;
    overflow: hidden;
    color: var(--color-stage-ink);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stage-chrome__note {
    margin: 0;
    color: var(--color-stage-muted);
    font-size: var(--text-2xs);
    line-height: var(--leading-normal);
  }

  @media (max-width: 40rem) {
    .stage-chrome {
      inset-inline: var(--space-2xs);
      inset-block-end: var(--space-2xs);
    }

    .stage-chrome__button,
    .stage-chrome__summary,
    .stage-chrome__select {
      padding-inline: var(--space-2xs);
    }

    .stage-chrome__field-label {
      display: none;
    }

    .stage-chrome__facts {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
