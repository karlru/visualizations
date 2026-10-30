<script lang="ts">
  /**
   * Textual alternative to the canvas probability fan.
   *
   * It renders the exact same `ProbabilityFan` object the canvas layer consumes:
   * the top N candidates in descending probability, the explicit "other (Σ)"
   * bucket, and the normalized total. The list is the required ranked alternative
   * from `FR-ACO-06` and `stories.md` §2.9. It is not a live region: the canvas
   * updates every iteration, while this panel is part of the reader's static
   * explanation and is sampled at UI frequency by its host.
   */

  import type { ProbabilityFan } from '../../stories/aco/probability-fan';

  interface Props {
    fan: ProbabilityFan;
    id?: string;
    title?: string;
  }

  let { fan, id = 'aco-probability-fan', title = 'Next-city probabilities' }: Props = $props();

  const headingId = `${id}-title`;
  const descriptionId = `${id}-description`;

  function percent(probability: number): string {
    if (!Number.isFinite(probability)) return '0.0%';
    return `${(probability * 100).toFixed(1)}%`;
  }

  function barWidth(probability: number): string {
    const value = Number.isFinite(probability) ? Math.max(0, Math.min(1, probability)) : 0;
    return `${(value * 100).toFixed(2)}%`;
  }
</script>

<section
  class="fan"
  data-testid={id}
  aria-labelledby={headingId}
  aria-describedby={descriptionId}
>
  <div class="fan__head">
    <h2 class="fan__title" id={headingId}>{title}</h2>
    <p class="fan__description" id={descriptionId}>
      The focal ant is at city {fan.focalCity}. The {fan.entries.length} most likely next cities,
      plus every remaining candidate grouped as “other (Σ)”.
    </p>
  </div>

  <ol class="fan__list">
    {#each fan.entries as entry (entry.city)}
      <li class="fan__row" data-fan-row data-fan-city={entry.city}>
        <span class="fan__label">City {entry.city}</span>
        <span class="fan__bar" aria-hidden="true">
          <span class="fan__bar-fill" style:inline-size={barWidth(entry.probability)}></span>
        </span>
        <span class="fan__value data" data-fan-probability={entry.probability}>
          {percent(entry.probability)}
        </span>
      </li>
    {/each}

    {#if fan.other.count > 0}
      <li class="fan__row fan__row--other" data-fan-other-row>
        <span class="fan__label">
          Other (Σ) <span class="fan__count">· {fan.other.count} cities</span>
        </span>
        <span class="fan__bar" aria-hidden="true">
          <span class="fan__bar-fill" style:inline-size={barWidth(fan.other.probability)}></span>
        </span>
        <span class="fan__value data" data-fan-other={fan.other.probability}>
          {percent(fan.other.probability)}
        </span>
      </li>
    {/if}
  </ol>

  <p class="fan__total">
    <span>Normalized total</span>
    <strong class="data" data-fan-total>{fan.total.toFixed(3)}</strong>
  </p>

  {#if fan.uniform}
    <p class="fan__note">
      Every transition weight was zero, so the engine fell back to a uniform choice over the
      allowed cities.
    </p>
  {:else if fan.other.count === 0}
    <p class="fan__note">Every allowed city is named, so there is nothing in the other bucket.</p>
  {/if}
</section>

<style>
  .fan {
    display: grid;
    gap: var(--space-xs);
    min-inline-size: 0;
    padding: var(--space-sm);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-md);
    background-color: var(--color-paper-raised);
  }

  .fan__head {
    display: grid;
    gap: var(--space-3xs);
  }

  .fan__title {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .fan__description,
  .fan__note {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .fan__list {
    display: grid;
    gap: var(--space-2xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fan__row {
    display: grid;
    grid-template-columns: minmax(6.5rem, 1fr) minmax(3rem, 2fr) 4.25rem;
    gap: var(--space-2xs);
    align-items: center;
    min-inline-size: 0;
    font-size: var(--text-xs);
  }

  .fan__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fan__count {
    color: var(--color-paper-muted);
    font-size: var(--text-2xs);
  }

  .fan__bar {
    overflow: hidden;
    block-size: 0.5rem;
    border-radius: var(--radius-pill);
    background-color: var(--color-paper-inset);
  }

  .fan__bar-fill {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background-color: var(--color-accent-paper);
  }

  .fan__row--other .fan__bar-fill {
    background-color: var(--color-paper-muted);
  }

  .fan__value {
    color: var(--color-ink);
    text-align: end;
  }

  .fan__total {
    display: flex;
    justify-content: space-between;
    margin: 0;
    padding-block-start: var(--space-2xs);
    border-block-start: var(--hairline) solid var(--color-rule-paper);
    color: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .fan__total strong {
    color: var(--color-ink);
  }

  @media (max-width: 26rem) {
    .fan__row {
      grid-template-columns: minmax(5.5rem, 1fr) 3.5rem;
    }

    .fan__bar {
      display: none;
    }
  }
</style>
