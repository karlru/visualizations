<script lang="ts">
  /**
   * Accessible preset picker.
   *
   * A native `<select>` keeps type-ahead, arrow-key selection, and the platform
   * popup. Presets are the story config's typed `Preset` objects, so the
   * component never invents parameter names. `selected = null` means the reader
   * has customised a value since the last preset and the "Custom" option is
   * shown.
   */

  interface PresetOption {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
  }

  interface Props {
    id: string;
    presets: readonly PresetOption[];
    /** The applied preset id, or null when values are custom. */
    selected: string | null;
    onSelect: (id: string) => void;
  }

  let { id, presets, selected, onSelect }: Props = $props();

  const hintId = `${id}-hint`;

  let currentDescription = $derived(
    presets.find((preset) => preset.id === selected)?.description ??
      'Custom values: adjust any control below.',
  );

  function handleChange(event: Event & { currentTarget: HTMLSelectElement }): void {
    const next = event.currentTarget.value;
    if (next.length === 0) {
      // "Custom" is a state, not an action; keep the visible selection coherent
      // with the parameters the controller still holds.
      event.currentTarget.value = selected ?? '';
      return;
    }
    onSelect(next);
  }
</script>

<div class="preset-picker" data-control="preset-picker" data-control-id={id}>
  <label class="preset-picker__label" for={id}>Preset</label>
  <select
    class="preset-picker__select"
    {id}
    value={selected ?? ''}
    aria-describedby={hintId}
    onchange={handleChange}
  >
    <option value="">Custom</option>
    {#each presets as preset (preset.id)}
      <option value={preset.id}>{preset.label}</option>
    {/each}
  </select>
  <p class="preset-picker__hint" id={hintId}>{currentDescription}</p>
</div>

<style>
  .preset-picker {
    display: grid;
    gap: var(--space-3xs);
    min-inline-size: 0;
  }

  .preset-picker__label {
    color: var(--color-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .preset-picker__select {
    min-block-size: var(--tap-target);
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper-raised);
    color: var(--color-ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .preset-picker__hint {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .preset-picker__select:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }
</style>
