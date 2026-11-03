<script lang="ts">
/**
 * Compact stage caption for the guided ACO opening.
 *
 * The canvas carries the motion; this overlay carries the numbers and names so
 * the sequence is understandable with the prose covered and remains real text
 * for assistive technology. It is presentation-only: it reads the pure lesson
 * data and the low-frequency metrics sample, never engine internals.
 *
 * The caption updates only when the integer lesson step changes, so a scroll
 * frame does not announce a new status every few pixels.
 */

import {
  ACO_LESSON_CHAPTER_IDS,
  ACO_LESSON_GROWTH_STAGES,
  ACO_LESSON_ONE_ANT_STEPS,
  ACO_LESSON_OPTIMUM_TOUR,
  ACO_LESSON_TOURS,
  bestTourIndexUpTo,
  enumerationStep,
  growthStageAt,
  type LessonGrowthStage,
  type LessonStep,
  type LessonTour,
  lessonProgress,
  oneAntStepIndex,
} from '../../stories/aco/lesson';
import type { StoryMetric } from '../../stories/runtime';

interface Props {
  readonly chapterId: string | null;
  /** Chapter scroll progress in [0, 1]. */
  readonly progress: number;
  /** Low-frequency metrics sample, used by the ant and colony captions. */
  readonly metrics?: readonly StoryMetric[];
  readonly reducedMotion?: boolean;
}

let { chapterId, progress, metrics = [], reducedMotion = false }: Props = $props();

let lesson = $derived(chapterId !== null && ACO_LESSON_CHAPTER_IDS.has(chapterId));
let lessonValue = $derived(lessonProgress(progress));

function metric(id: string): string | null {
  const item = metrics.find((entry) => entry.id === id);
  return item?.value ?? null;
}

function formatLength(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(3);
}

function exitLabel(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '—';
}

function firstTour(): LessonTour {
  const tour = ACO_LESSON_TOURS[0];
  if (tour === undefined) throw new Error('ACO lesson tours are empty.');
  return tour;
}

function firstAntStep(): LessonStep {
  const step = ACO_LESSON_ONE_ANT_STEPS[0];
  if (step === undefined) throw new Error('ACO one-ant lesson steps are empty.');
  return step;
}

const FALLBACK_TOUR = firstTour();
const FALLBACK_ANT_STEP = firstAntStep();

let currentTour = $derived(
  ACO_LESSON_TOURS[enumerationStep(lessonValue)] ?? FALLBACK_TOUR,
);
let bestTourIndex = $derived(bestTourIndexUpTo(enumerationStep(lessonValue)));
let bestTour = $derived(ACO_LESSON_TOURS[bestTourIndex] ?? FALLBACK_TOUR);
let isEnumerationBest = $derived(enumerationStep(lessonValue) === bestTourIndex);

let antStep = $derived(oneAntStepIndex(lessonValue));
let antChoice = $derived(ACO_LESSON_ONE_ANT_STEPS[antStep] ?? FALLBACK_ANT_STEP);

let growth = $derived<LessonGrowthStage>(growthStageAt(lessonValue));

let bestLength = $derived(metric('best-length'));
let meanLength = $derived(metric('mean-length'));
let antCount = $derived(metric('ants'));
let iteration = $derived(metric('iteration'));

function growthClass(stage: LessonGrowthStage): string {
  if (stage.cityCount === growth.cityCount) return 'lesson__growth-row lesson__growth-row--current';
  return 'lesson__growth-row';
}
</script>

{#if lesson}
  <aside
    class="lesson"
    data-lesson-overlay
    data-lesson-chapter={chapterId}
    data-lesson-step={chapterId === 'too-many-tours' ? growth.cityCount : antStep}
    data-reduced-motion={reducedMotion ? 'true' : 'false'}
    aria-label="What the visualization is showing"
  >
    {#if chapterId === 'the-problem'}
      <p class="lesson__eyebrow">The problem</p>
      <p class="lesson__line">
        Leg <strong>{antStep + 1} of 5</strong> · visit every city once, then return home
      </p>
      <div class="lesson__ticks" aria-hidden="true">
        {#each ACO_LESSON_ONE_ANT_STEPS as _step, index (index)}
          <span class:lesson__tick--active={index <= antStep} class="lesson__tick"></span>
        {/each}
      </div>
    {:else if chapterId === 'try-every-tour'}
      <p class="lesson__eyebrow">Brute force</p>
      <p class="lesson__line" aria-live="polite">
        Tour <strong>{enumerationStep(lessonValue) + 1} of {ACO_LESSON_TOURS.length}</strong> ·
        length {exitLabel(currentTour.length)} · shortest so far {exitLabel(bestTour.length)}
      </p>
      <p class="lesson__note">
        {#if isEnumerationBest}
          New shortest tour. Keep checking.
        {:else}
          The shortest tour so far is marked in amber.
        {/if}
      </p>
      <div class="lesson__ticks lesson__ticks--tours" aria-hidden="true">
        {#each ACO_LESSON_TOURS as _tour, index (index)}
          <span
            class="lesson__tick"
            class:lesson__tick--active={index <= enumerationStep(lessonValue)}
            class:lesson__tick--best={index === bestTourIndex}
          ></span>
        {/each}
      </div>
    {:else if chapterId === 'too-many-tours'}
      <p class="lesson__eyebrow">The wall</p>
      <p class="lesson__line" aria-live="polite">
        <strong>{growth.cityCount} cities</strong> · {growth.toursLabel} tours · {growth.timeLabel}
      </p>
      <ol class="lesson__growth" aria-label="Tours to check as cities are added">
        {#each ACO_LESSON_GROWTH_STAGES as stage (stage.cityCount)}
          <li class={growthClass(stage)}>
            <span>{stage.cityCount} cities</span>
            <span>{stage.toursLabel}</span>
            <span>{stage.timeLabel}</span>
          </li>
        {/each}
      </ol>
    {:else if chapterId === 'one-ants-choice'}
      <p class="lesson__eyebrow">One ant</p>
      <p class="lesson__line" aria-live="polite">
        Step <strong>{antStep + 1} of 5</strong> · at city {antChoice.currentCity + 1} ·
        {antChoice.candidates.length} unvisited
      </p>
      <ul class="lesson__candidates" aria-label="Possible next cities">
        {#each antChoice.candidates as candidate (candidate.city)}
          <li class:lesson__candidate--chosen={candidate.city === antChoice.chosenCity}>
            <span>City {candidate.city + 1}</span>
            <span>{(candidate.probability * 100).toFixed(0)}%</span>
          </li>
        {/each}
      </ul>
      <p class="lesson__note">The stronger line is the city it chose. It also leaves a trail behind it.</p>
      <div class="lesson__ticks" aria-hidden="true">
        {#each ACO_LESSON_ONE_ANT_STEPS as _step, index (index)}
          <span class:lesson__tick--active={index <= antStep} class="lesson__tick"></span>
        {/each}
      </div>
    {:else if chapterId === 'leaving-a-trace'}
      <p class="lesson__eyebrow">Pheromone</p>
      <p class="lesson__line">
        1 ant · best <strong>{bestLength ?? '—'}</strong> · the completed tour marks its edges
      </p>
      <p class="lesson__note">A shorter tour adds more pheromone to every edge it used.</p>
    {:else if chapterId === 'forgetting'}
      <p class="lesson__eyebrow">Evaporation</p>
      <p class="lesson__line">
        1 ant · best <strong>{bestLength ?? '—'}</strong> · every trail loses a fraction each round
      </p>
      <p class="lesson__note">Trails that keep being used are renewed; unused trails fade.</p>
    {:else if chapterId === 'two-ants'}
      <p class="lesson__eyebrow">A second ant</p>
      <p class="lesson__line">
        {antCount ?? '2'} ants · best <strong>{bestLength ?? '—'}</strong> · iteration
        {iteration ?? '—'}
      </p>
      <p class="lesson__note">The second ant can follow the trail, or try a different edge.</p>
    {:else if chapterId === 'emergence'}
      <p class="lesson__eyebrow">The colony</p>
      <p class="lesson__line">
        {antCount ?? '8'} ants · best <strong>{bestLength ?? '—'}</strong> · mean
        {meanLength ?? '—'}
      </p>
      <p class="lesson__note">
        Brute force checked 12 tours and found {formatLength(ACO_LESSON_OPTIMUM_TOUR.length)}.
        {#if bestLength !== null && Number.parseFloat(bestLength) <= ACO_LESSON_OPTIMUM_TOUR.length + 0.0005}
          The colony found the same tour.
        {:else}
          The colony is still searching.
        {/if}
      </p>
    {/if}
  </aside>
{/if}

<style>
  .lesson {
    position: absolute;
    inset-inline-start: var(--space-sm);
    inset-block-end: calc(var(--tap-target) + var(--space-2xl));
    display: grid;
    gap: var(--space-3xs);
    max-inline-size: min(23rem, calc(100% - 2 * var(--space-sm)));
    padding: var(--space-xs) var(--space-sm);
    border: var(--hairline) solid var(--color-rule-stage);
    border-radius: var(--radius-sm);
    background-color: color-mix(in srgb, var(--color-stage) 88%, transparent);
    color: var(--color-stage-ink);
    pointer-events: none;
  }

  .lesson__eyebrow {
    margin: 0;
    color: var(--color-accent-stage);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .lesson__line,
  .lesson__note {
    margin: 0;
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .lesson__line strong {
    color: var(--color-stage-ink);
    font-weight: var(--weight-semibold);
  }

  .lesson__note {
    color: var(--color-stage-muted);
    font-size: var(--text-2xs);
  }

  .lesson__ticks {
    display: flex;
    gap: 3px;
    margin-block-start: 2px;
  }

  .lesson__ticks--tours {
    gap: 2px;
  }

  .lesson__tick {
    inline-size: 0.55rem;
    block-size: 0.35rem;
    border-radius: 1px;
    background-color: var(--color-rule-stage);
  }

  .lesson__ticks--tours .lesson__tick {
    inline-size: 0.4rem;
  }

  .lesson__tick--active {
    background-color: var(--color-accent-stage);
  }

  .lesson__tick--best {
    background-color: var(--color-amber);
  }

  .lesson__candidates {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs) var(--space-2xs);
    margin: 0;
    padding: 0;
    color: var(--color-stage-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    list-style: none;
  }

  .lesson__candidates li {
    display: inline-flex;
    gap: var(--space-3xs);
    padding: 0.05em 0.3em;
    border: var(--hairline) solid var(--color-rule-stage);
    border-radius: var(--radius-xs);
  }

  .lesson__candidate--chosen {
    border-color: var(--color-amber);
    color: var(--color-stage-ink);
  }

  .lesson__growth {
    display: grid;
    gap: 1px;
    margin: 2px 0 0;
    padding: 0;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    list-style: none;
  }

  .lesson__growth-row {
    display: grid;
    grid-template-columns: 4.5rem 5.5rem 1fr;
    gap: var(--space-2xs);
    color: var(--color-stage-muted);
  }

  .lesson__growth-row--current {
    color: var(--color-accent-stage);
  }

  @media (max-width: 40rem) {
    .lesson {
      inset-inline: var(--space-2xs);
      max-inline-size: none;
      padding: var(--space-2xs);
    }

    .lesson__growth-row {
      grid-template-columns: 4rem 5rem 1fr;
    }
  }
</style>
