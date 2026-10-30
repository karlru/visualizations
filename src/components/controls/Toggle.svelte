<script lang="ts">
  /**
   * Accessible toggle.
   *
   * A native checkbox keeps the platform semantics (Space toggles, the checked
   * state is exposed). The checkbox itself is a transparent 44 × 44 px target
   * laid over a small visual track, so the touch target is the full square while
   * the control still looks like a switch. The label is also a target and never
   * disappears.
   */

  interface Props {
    id: string;
    label: string;
    checked: boolean;
    /** Optional visible explanation, referenced by `aria-describedby`. */
    description?: string;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
  }

  let { id, label, checked, description, disabled = false, onCheckedChange }: Props = $props();

  const descriptionId = `${id}-description`;

  function handleChange(event: Event & { currentTarget: HTMLInputElement }): void {
    onCheckedChange(event.currentTarget.checked);
  }
</script>

<div class="toggle" data-control="toggle" data-control-id={id}>
  <label class="toggle__label" for={id}>
    <span class="toggle__hit">
      <input
        class="toggle__input"
        {id}
        type="checkbox"
        {checked}
        {disabled}
        aria-describedby={description === undefined ? undefined : descriptionId}
        onchange={handleChange}
      />
      <span class="toggle__track" aria-hidden="true">
        <span class="toggle__thumb"></span>
      </span>
    </span>
    <span class="toggle__text">{label}</span>
  </label>

  {#if description}
    <p class="toggle__description" id={descriptionId}>{description}</p>
  {/if}
</div>

<style>
  .toggle {
    display: grid;
    gap: var(--space-3xs);
    min-inline-size: 0;
  }

  .toggle__label {
    display: inline-flex;
    gap: var(--space-2xs);
    align-items: center;
    min-block-size: var(--tap-target);
    color: var(--color-ink);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .toggle__hit {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    inline-size: var(--tap-target);
    block-size: var(--tap-target);
  }

  .toggle__input {
    position: absolute;
    inset: 0;
    inline-size: var(--tap-target);
    block-size: var(--tap-target);
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .toggle__track {
    position: relative;
    display: block;
    inline-size: 2.75rem;
    block-size: 1.5rem;
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-pill);
    background-color: var(--color-paper-inset);
    transition: background-color var(--duration-quick) var(--ease-out);
  }

  .toggle__thumb {
    position: absolute;
    inset-block-start: 0.1875rem;
    inset-inline-start: 0.1875rem;
    inline-size: 1rem;
    block-size: 1rem;
    border-radius: var(--radius-pill);
    background-color: var(--color-paper-raised);
    box-shadow: var(--shadow-paper);
    transition: transform var(--duration-quick) var(--ease-out);
  }

  .toggle__input:checked + .toggle__track {
    border-color: var(--color-accent-paper);
    background-color: var(--color-accent-paper);
  }

  .toggle__input:checked + .toggle__track .toggle__thumb {
    transform: translateX(1.2rem);
  }

  .toggle__input:focus-visible + .toggle__track {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .toggle__input:disabled ~ * {
    opacity: 0.6;
  }

  .toggle__text {
    min-inline-size: 0;
  }

  .toggle__description {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle__track,
    .toggle__thumb {
      transition: none;
    }
  }
</style>
