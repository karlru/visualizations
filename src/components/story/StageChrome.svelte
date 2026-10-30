<script lang="ts">
  /**
   * Stage chrome: play/pause, replay, speed, and a details affordance.
   *
   * The component is presentational. The controller owns the clock and engine;
   * this component only reports reader intent. Step 1.6 added the stage-level
   * keyboard contract in `StoryStage`/`StoryController`; the labels, states, and
   * native controls here stay fully keyboard operable on their own.
   */

  interface Props {
    readonly paused: boolean;
    readonly speed: number;
    readonly chapterTitle?: string;
    readonly sceneId?: string | null;
    readonly onTogglePaused: () => void;
    readonly onReplay: () => void;
    readonly onSpeedChange: (speed: number) => void;
  }

  let {
    paused,
    speed,
    chapterTitle,
    sceneId,
    onTogglePaused,
    onReplay,
    onSpeedChange,
  }: Props = $props();

  const SPEEDS = [0.5, 1, 2, 4] as const;

  function formatSpeed(value: number): string {
    return value === 1 ? '1×' : `${value}×`;
  }

  function handleSpeed(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    const next = Number.parseFloat(select.value);
    if (Number.isFinite(next) && next > 0) onSpeedChange(next);
  }
</script>

<div
  class="stage-chrome"
  data-stage-chrome
  data-paused={paused ? 'true' : 'false'}
  data-speed={speed}
>
  <button
    type="button"
    class="stage-chrome__button"
    data-testid="stage-play-pause"
    aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
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
          <dt>Speed</dt>
          <dd class="data">{formatSpeed(speed)}</dd>
        </div>
      </dl>
      <p class="stage-chrome__note">
        Canvas 2D · DPR capped at 2 · simulation pauses when the stage leaves the viewport.
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
