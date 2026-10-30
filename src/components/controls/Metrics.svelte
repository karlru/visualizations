<script lang="ts">
  /**
   * Low-frequency metrics panel.
   *
   * The controller samples values on chapter entry, pause/replay, and a one-per-
   * second timer. It never writes here from the animation frame, so the polite
   * live region announces a handful of changes per minute rather than once per
   * frame. The `<dl>` keeps the key/value pairing for assistive technology, and
   * `aria-atomic="true"` makes each announcement read as a complete sentence.
   */

  import type { MetricItem } from './metrics-types';

  interface Props {
    id?: string;
    title?: string;
    items: readonly MetricItem[];
  }

  let { id = 'story-metrics', title = 'Live metrics', items }: Props = $props();

  const titleId = `${id}-title`;
</script>

<section class="metrics" aria-labelledby={titleId} data-metrics data-metrics-id={id}>
  <div class="metrics__head">
    <h2 class="metrics__title" id={titleId}>{title}</h2>
    <p class="metrics__note">Sampled about once a second, and on pause, replay, and chapter change.</p>
  </div>

  <dl
    class="metrics__list"
    id={`${id}-live`}
    aria-live="polite"
    aria-atomic="true"
    data-metrics-live
  >
    {#each items as item (item.id)}
      <div class="metrics__row">
        <dt class="metrics__label">{item.label}</dt>
        <dd class="metrics__value data" data-metric={item.id}>{item.value}</dd>
      </div>
    {/each}
  </dl>
</section>

<style>
  .metrics {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-sm);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-md);
    background-color: var(--color-paper-raised);
  }

  .metrics__head {
    display: grid;
    gap: var(--space-3xs);
  }

  .metrics__title {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .metrics__note {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .metrics__list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2xs) var(--space-sm);
    margin: 0;
  }

  .metrics__row {
    display: grid;
    gap: var(--space-3xs);
    min-inline-size: 0;
  }

  .metrics__label {
    margin: 0;
    color: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .metrics__value {
    margin: 0;
    overflow: hidden;
    color: var(--color-ink);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 40rem) {
    .metrics__list {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
