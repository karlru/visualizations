<script lang="ts">
  /**
   * Convergence chart: best and mean tour length over completed iterations.
   *
   * This is deliberately SVG/DOM, not canvas text (`technology.md` §3.9). The
   * chart reads the engine's bounded history at UI frequency, uses d3-scale for
   * the axes and d3-shape for the two line paths, and exposes a visible current
   * value plus an accessible description. Best and mean differ by weight and dash
   * pattern as well as colour, so the chart survives grayscale.
   */

  import { scaleLinear } from 'd3-scale';
  import { curveMonotoneX, line } from 'd3-shape';
  import type { StoryHistoryPoint } from '../../stories/runtime';

  interface Props {
    /** Chronological history, oldest first. */
    history: readonly StoryHistoryPoint[];
    bestLength: number | null;
    meanLength: number | null;
    iteration: number;
    /** Stable id used for SVG title/description references and the test hook. */
    id?: string;
    width?: number;
    height?: number;
  }

  let {
    history,
    bestLength,
    meanLength,
    iteration,
    id = 'aco-convergence',
    width = 560,
    height = 224,
  }: Props = $props();

  const margin = { top: 14, right: 18, bottom: 30, left: 48 };
  const plotWidth = $derived(Math.max(1, width - margin.left - margin.right));
  const plotHeight = $derived(Math.max(1, height - margin.top - margin.bottom));

  const domain = $derived.by(() => {
    const first = history[0];
    const last = history[history.length - 1];
    const rawMin = first?.iteration ?? 1;
    const rawMax = last?.iteration ?? rawMin + 1;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of history) {
      if (Number.isFinite(point.bestLength)) min = Math.min(min, point.bestLength);
      if (Number.isFinite(point.meanLength)) max = Math.max(max, point.meanLength);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    } else {
      const pad = Math.max((max - min) * 0.08, 0.05);
      min = Math.max(0, min - pad);
      max = max + pad;
    }
    if (!(max > min)) max = min + 1;

    return {
      x: [rawMin, Math.max(rawMin + 1, rawMax)] as [number, number],
      y: [min, max] as [number, number],
    };
  });

  const xScale = $derived(scaleLinear().domain(domain.x).range([0, plotWidth]));
  const yScale = $derived(scaleLinear().domain(domain.y).range([plotHeight, 0]));

  const bestPath = $derived(
    line<StoryHistoryPoint>()
      .x((point) => xScale(point.iteration))
      .y((point) => yScale(point.bestLength))
      .curve(curveMonotoneX)(history) ?? '',
  );
  const meanPath = $derived(
    line<StoryHistoryPoint>()
      .x((point) => xScale(point.iteration))
      .y((point) => yScale(point.meanLength))
      .curve(curveMonotoneX)(history) ?? '',
  );

  const xTicks = $derived(xScale.ticks(Math.min(5, Math.max(2, history.length))));
  const yTicks = $derived(yScale.ticks(4));

  const lastPoint = $derived(history[history.length - 1] ?? null);
  const bestLabel = $derived(formatLength(bestLength));
  const meanLabel = $derived(formatLength(meanLength));

  const description = $derived.by(() => {
    if (lastPoint === null) {
      return 'No completed iterations yet. The chart will plot best and mean tour length once the colony runs.';
    }
    return `Best tour length ${bestLabel}, mean tour length ${meanLabel}, at iteration ${iteration}. Best is the solid lower line; mean is the dashed higher line.`;
  });

  function formatLength(value: number | null): string {
    return value === null || !Number.isFinite(value) ? '—' : value.toFixed(2);
  }

  function formatTick(value: number): string {
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2).replace(/\.?0+$/, '');
  }
</script>

<figure
  class="convergence"
  data-testid={id}
  data-history-length={history.length}
  data-chart-iteration={iteration}
  aria-labelledby={`${id}-caption`}
>
  <figcaption class="convergence__caption">
    <span class="convergence__title" id={`${id}-caption`}>Best and mean tour length</span>
    <span class="convergence__values">
      <span>Best <strong data-chart-best>{bestLabel}</strong></span>
      <span aria-hidden="true">·</span>
      <span>Mean <strong data-chart-mean>{meanLabel}</strong></span>
      <span aria-hidden="true">·</span>
      <span>Iteration <strong data-chart-iteration-value>{iteration}</strong></span>
    </span>
  </figcaption>

  <svg
    class="convergence__svg"
    viewBox={`0 0 ${width} ${height}`}
    role="img"
    aria-labelledby={`${id}-svg-title ${id}-svg-desc`}
    preserveAspectRatio="xMidYMid meet"
  >
    <title id={`${id}-svg-title`}>Convergence chart</title>
    <desc id={`${id}-svg-desc`}>{description}</desc>

    <g transform={`translate(${margin.left} ${margin.top})`}>
      {#each yTicks as tick (tick)}
        <line
          class="convergence__grid"
          x1="0"
          x2={plotWidth}
          y1={yScale(tick)}
          y2={yScale(tick)}
        />
        <text class="convergence__tick" x="-8" y={yScale(tick)} text-anchor="end" dy="0.32em">
          {formatTick(tick)}
        </text>
      {/each}

      {#each xTicks as tick (tick)}
        <text class="convergence__tick" x={xScale(tick)} y={plotHeight + 18} text-anchor="middle">
          {formatTick(tick)}
        </text>
      {/each}

      <text class="convergence__axis-label" x={plotWidth} y={plotHeight + 30} text-anchor="end">
        iteration
      </text>
      <text class="convergence__axis-label" x="0" y="-2" text-anchor="start">length</text>

      {#if lastPoint !== null}
        <path class="convergence__line convergence__line--mean" d={meanPath} />
        <path class="convergence__line convergence__line--best" d={bestPath} />
        <circle
          class="convergence__dot convergence__dot--mean"
          cx={xScale(lastPoint.iteration)}
          cy={yScale(lastPoint.meanLength)}
          r="3"
        />
        <circle
          class="convergence__dot convergence__dot--best"
          cx={xScale(lastPoint.iteration)}
          cy={yScale(lastPoint.bestLength)}
          r="3.4"
        />
      {:else}
        <text class="convergence__empty" x={plotWidth / 2} y={plotHeight / 2} text-anchor="middle">
          Waiting for the first iteration…
        </text>
      {/if}
    </g>
  </svg>

  <ul class="convergence__legend" aria-label="Chart legend">
    <li><span class="convergence__swatch convergence__swatch--best" aria-hidden="true"></span>Best (solid)</li>
    <li><span class="convergence__swatch convergence__swatch--mean" aria-hidden="true"></span>Mean (dashed)</li>
  </ul>
</figure>

<style>
  .convergence {
    display: grid;
    gap: var(--space-2xs);
    min-inline-size: 0;
    margin: 0;
    padding: var(--space-sm);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-md);
    background-color: var(--color-paper-raised);
  }

  .convergence__caption {
    display: grid;
    gap: var(--space-3xs);
  }

  .convergence__title {
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .convergence__values {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    color: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .convergence__values strong {
    color: var(--color-ink);
    font-weight: var(--weight-semibold);
  }

  .convergence__svg {
    display: block;
    inline-size: 100%;
    block-size: auto;
    overflow: visible;
  }

  .convergence__grid {
    stroke: var(--color-rule-paper);
    stroke-width: 1;
  }

  .convergence__tick,
  .convergence__axis-label,
  .convergence__empty {
    fill: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .convergence__axis-label {
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .convergence__line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .convergence__line--best {
    stroke: var(--color-accent-paper);
    stroke-width: 2.5;
  }

  .convergence__line--mean {
    stroke: var(--color-paper-muted);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .convergence__dot--best {
    fill: var(--color-accent-paper);
  }

  .convergence__dot--mean {
    fill: var(--color-paper-muted);
  }

  .convergence__legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    color: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    list-style: none;
  }

  .convergence__legend li {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3xs);
  }

  .convergence__swatch {
    display: inline-block;
    inline-size: 1.25rem;
    block-size: 0;
    border-block-start: 2px solid var(--color-paper-muted);
  }

  .convergence__swatch--best {
    border-block-start-color: var(--color-accent-paper);
    border-block-start-width: 2.5px;
  }

  .convergence__swatch--mean {
    border-block-start-style: dashed;
  }

  @media (max-width: 40rem) {
    .convergence {
      padding: var(--space-xs);
    }

    .convergence__svg {
      min-block-size: 9rem;
    }
  }
</style>
