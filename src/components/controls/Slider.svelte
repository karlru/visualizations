<script lang="ts">
  /**
   * Accessible numeric slider.
   *
   * A native `<input type="range">` carries the label, the current value, and
   * the keyboard contract (arrows, Home, End, PageUp/PageDown). `aria-valuetext`
   * carries the formatted value so a screen reader announces "1.25 ×" rather
   * than "1.25". A second native number input gives readers an exact-entry path
   * without abandoning the label or the range semantics.
   *
   * The component is presentational: it validates and snaps to `step`, then
   * reports one typed number. The story controller owns engine parameters.
   */

  interface Props {
    /** Base id. The range gets `${id}-range`, the number input `${id}-number`. */
    id: string;
    /** Visible label, associated with both inputs. */
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** Formats the readout and `aria-valuetext`. Defaults to the raw number. */
    formatValue?: (value: number) => string;
    /** Optional visible helper text. */
    hint?: string;
    disabled?: boolean;
    onValueChange: (value: number) => void;
  }

  let {
    id,
    label,
    value,
    min,
    max,
    step,
    formatValue,
    hint,
    disabled = false,
    onValueChange,
  }: Props = $props();

  const rangeId = `${id}-range`;
  const numberId = `${id}-number`;
  const readoutId = `${id}-value`;
  const hintId = `${id}-hint`;

  let numberInput: HTMLInputElement | null = null;

  const fallbackFormat = (next: number): string => String(next);
  let formatted = $derived((formatValue ?? fallbackFormat)(value));
  let describedBy = $derived([readoutId, hint === undefined ? null : hintId].filter(Boolean).join(' '));

  /** Clamp to the range and snap to the step grid without float drift. */
  function normalize(raw: number): number {
    if (!Number.isFinite(raw)) return value;
    const clamped = Math.min(max, Math.max(min, raw));
    const snapped = min + Math.round((clamped - min) / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
  }

  function commit(raw: number): void {
    const next = normalize(raw);
    // Keep the visible number input coherent even when the value did not change
    // (for example after an out-of-range entry that clamps back to the value).
    if (numberInput !== null) numberInput.value = String(next);
    if (next !== value) onValueChange(next);
  }

  function handleRangeInput(event: Event & { currentTarget: HTMLInputElement }): void {
    commit(Number.parseFloat(event.currentTarget.value));
  }

  function handleNumberChange(event: Event & { currentTarget: HTMLInputElement }): void {
    commit(Number.parseFloat(event.currentTarget.value));
  }

  function handleNumberKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    // Enter should commit even in browsers that defer `change` until blur.
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(Number.parseFloat(event.currentTarget.value));
    }
  }
</script>

<div class="slider" data-control="slider" data-control-id={id}>
  <div class="slider__head">
    <label class="slider__label" for={rangeId}>{label}</label>
    <output class="slider__value data" id={readoutId} for={rangeId}>{formatted}</output>
  </div>

  <div class="slider__inputs">
    <input
      class="slider__range"
      id={rangeId}
      type="range"
      {min}
      {max}
      {step}
      {value}
      {disabled}
      aria-valuetext={formatted}
      aria-describedby={describedBy}
      oninput={handleRangeInput}
    />

    <label class="visually-hidden" for={numberId}>{label}, exact value</label>
    <input
      class="slider__number data"
      id={numberId}
      bind:this={numberInput}
      type="number"
      {min}
      {max}
      {step}
      {value}
      {disabled}
      inputmode="decimal"
      aria-describedby={describedBy}
      onchange={handleNumberChange}
      onkeydown={handleNumberKeydown}
    />
  </div>

  {#if hint}
    <p class="slider__hint" id={hintId}>{hint}</p>
  {/if}
</div>

<style>
  .slider {
    display: grid;
    gap: var(--space-3xs);
    min-inline-size: 0;
  }

  .slider__head {
    display: flex;
    gap: var(--space-2xs);
    align-items: baseline;
    justify-content: space-between;
  }

  .slider__label {
    color: var(--color-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .slider__value {
    color: var(--color-accent-paper);
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .slider__inputs {
    display: flex;
    gap: var(--space-2xs);
    align-items: center;
    min-inline-size: 0;
  }

  .slider__range {
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: var(--tap-target);
    margin: 0;
    accent-color: var(--color-accent-paper);
    cursor: pointer;
  }

  .slider__number {
    flex: 0 0 auto;
    inline-size: 6.5rem;
    min-block-size: var(--tap-target);
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper-raised);
    color: var(--color-ink);
    font-size: var(--text-sm);
    text-align: end;
  }

  .slider__hint {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .slider__range:focus-visible,
  .slider__number:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }
</style>
