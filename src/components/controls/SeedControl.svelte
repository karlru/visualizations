<script lang="ts">
  /**
   * Accessible seed control.
   *
   * The seed identifies a run, so changing it restarts the simulation. Numeric
   * entry is validated as an unsigned 32-bit integer; invalid input is rejected,
   * the previous seed is restored, and a polite notice explains why. Randomize
   * uses `crypto.getRandomValues` when available (never a simulation RNG, so the
   * run's own seeded sequence is unaffected).
   */

  interface Props {
    id: string;
    seed: number;
    onSeedChange: (seed: number) => void;
  }

  let { id, seed, onSeedChange }: Props = $props();

  /** `rng.ts` normalises a seed to an unsigned 32-bit integer. */
  const MAX_SEED = 4_294_967_295;
  const DEFAULT_NOTICE = 'Changing the seed restarts the run at its first step.';

  const inputId = `${id}-input`;
  const randomizeId = `${id}-randomize`;
  const noticeId = `${id}-notice`;

  let input: HTMLInputElement | null = null;
  let notice = $state(DEFAULT_NOTICE);
  let invalid = $state(false);

  function randomSeed(): number {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      const value = buffer[0];
      if (value !== undefined) return value;
    }
    return Math.floor(Math.random() * (MAX_SEED + 1));
  }

  function commit(raw: string): void {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (
      !/^\d+$/.test(trimmed) ||
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > MAX_SEED
    ) {
      invalid = true;
      notice = `Seed must be a whole number from 0 to ${MAX_SEED.toLocaleString('en-US')}. Keeping ${seed}.`;
      if (input !== null) input.value = String(seed);
      return;
    }

    invalid = false;
    notice = `Seed ${parsed}. The run restarts at its first step.`;
    if (input !== null) input.value = String(parsed);
    if (parsed !== seed) onSeedChange(parsed);
  }

  function handleChange(event: Event & { currentTarget: HTMLInputElement }): void {
    commit(event.currentTarget.value);
  }

  function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(event.currentTarget.value);
    }
  }

  function handleRandomize(): void {
    const next = randomSeed();
    invalid = false;
    notice = `Seed ${next}. The run restarts at its first step.`;
    if (input !== null) input.value = String(next);
    onSeedChange(next);
  }
</script>

<div class="seed-control" data-control="seed" data-control-id={id}>
  <label class="seed-control__label" for={inputId}>Seed</label>

  <div class="seed-control__row">
    <input
      class="seed-control__input data"
      id={inputId}
      bind:this={input}
      type="number"
      min="0"
      max={MAX_SEED}
      step="1"
      inputmode="numeric"
      value={seed}
      aria-describedby={noticeId}
      aria-invalid={invalid ? 'true' : 'false'}
      onchange={handleChange}
      onkeydown={handleKeydown}
    />
    <button
      class="seed-control__button"
      id={randomizeId}
      type="button"
      data-testid="seed-randomize"
      onclick={handleRandomize}
    >
      Randomize
    </button>
  </div>

  <p
    class="seed-control__notice"
    class:seed-control__notice--invalid={invalid}
    id={noticeId}
    role="status"
    aria-live="polite"
    data-seed-notice
  >
    {notice}
  </p>
</div>

<style>
  .seed-control {
    display: grid;
    gap: var(--space-3xs);
    min-inline-size: 0;
  }

  .seed-control__label {
    color: var(--color-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .seed-control__row {
    display: flex;
    gap: var(--space-2xs);
    align-items: center;
    min-inline-size: 0;
  }

  .seed-control__input {
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: var(--tap-target);
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper-raised);
    color: var(--color-ink);
    font-size: var(--text-sm);
  }

  .seed-control__button {
    flex: 0 0 auto;
    min-block-size: var(--tap-target);
    min-inline-size: var(--tap-target);
    padding: var(--space-3xs) var(--space-xs);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper-raised);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    cursor: pointer;
  }

  .seed-control__button:hover {
    border-color: var(--color-accent-paper);
    color: var(--color-accent-paper);
  }

  .seed-control__notice {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .seed-control__notice--invalid {
    color: var(--color-accent-paper);
  }

  .seed-control__input:focus-visible,
  .seed-control__button:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }
</style>
