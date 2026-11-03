/**
 * Pure lesson data for the opening of the Ant Colony Optimization story.
 *
 * The first eight chapters teach the problem before the formal algorithm:
 * a five-city tour, exhaustive enumeration, the factorial wall, one ant,
 * pheromone deposit/evaporation, and a growing colony. None of this belongs in
 * the simulation engine: it is deterministic teaching material derived from the
 * same TSP model, and both the canvas lesson layers and the DOM captions read
 * it so the picture and the numbers cannot disagree.
 *
 * This module is pure TypeScript. It imports the TSP model and story world
 * helpers only; it has no DOM, renderer, Svelte, or Astro dependency.
 */

import { createTspInstance, createTspInstanceFromCities, tourLength } from '../../engines/aco/tsp';
import type { City, TspInstance } from '../../engines/aco/types';
import { ACO_DEMO_CITIES, ACO_DEMO_CITY_COUNT, ACO_DEMO_SEED } from './world';

/** The five-city teaching instance, built from the frozen story map. */
export const ACO_LESSON_INSTANCE: TspInstance = createTspInstanceFromCities(
  ACO_DEMO_CITIES,
  ACO_DEMO_SEED,
);

/** Five-city map in normalized problem space. */
export const ACO_LESSON_CITIES: readonly City[] = ACO_LESSON_INSTANCE.cities;

/** One distinct round trip through the five-city map. */
export interface LessonTour {
  /** City indices in visit order. The return to `order[0]` is implicit. */
  readonly order: readonly number[];
  /** Closed-tour length in normalized problem units. */
  readonly length: number;
}

/**
 * The 12 distinct tours, in deterministic lexicographic order.
 *
 * A tour is a loop, so fixing the start city and one direction removes the
 * duplicate representations: `(5 − 1)! / 2 = 12`. This is the order the
 * enumeration animation checks them in.
 */
export const ACO_LESSON_TOURS: readonly LessonTour[] = Object.freeze(
  buildCanonicalTours(ACO_LESSON_INSTANCE),
);

/** Index of the shortest tour in {@link ACO_LESSON_TOURS}. */
export const ACO_LESSON_OPTIMUM_INDEX = findOptimumIndex(ACO_LESSON_TOURS);

/** The shortest tour, as found by exhaustive enumeration. */
export const ACO_LESSON_OPTIMUM_TOUR: LessonTour = ACO_LESSON_TOURS[
  ACO_LESSON_OPTIMUM_INDEX
] as LessonTour;

/**
 * The first tour produced by one ant on the five-city map.
 *
 * It is the engine's actual first tour for seed 42 / five cities / one ant, so
 * the scripted one-ant walk continues seamlessly into the real simulation.
 */
export const ACO_LESSON_ONE_ANT_TOUR = Object.freeze([0, 3, 2, 4, 1] as const);

/** Length of {@link ACO_LESSON_ONE_ANT_TOUR} including the return edge. */
export const ACO_LESSON_ONE_ANT_LENGTH = tourLength(ACO_LESSON_INSTANCE, ACO_LESSON_ONE_ANT_TOUR);

/** One possible next city from a step of the one-ant tour. */
export interface LessonCandidate {
  readonly city: number;
  /** Normalized transition probability with uniform pheromone and β = 2. */
  readonly probability: number;
}

/** One choice point of the scripted one-ant walk. */
export interface LessonStep {
  readonly currentCity: number;
  /** Every unvisited city, most likely first. */
  readonly candidates: readonly LessonCandidate[];
  readonly chosenCity: number;
}

/**
 * The choice points of {@link ACO_LESSON_ONE_ANT_TOUR}.
 *
 * Pheromone is uniform at the start of a run, so the weights are `1 / d²`.
 * The final step has one unvisited city (home), which is why it is certain.
 */
export const ACO_LESSON_ONE_ANT_STEPS: readonly LessonStep[] = Object.freeze(
  buildLessonSteps(ACO_LESSON_INSTANCE, ACO_LESSON_ONE_ANT_TOUR),
);

/** One city count in the factorial-growth sequence. */
export interface LessonGrowthStage {
  readonly cityCount: number;
  /** Distinct tours, `(n − 1)! / 2`. */
  readonly tours: bigint;
  /** Compact display: grouped below one billion, scientific above. */
  readonly toursLabel: string;
  /** Time to check every tour at one billion tours per second. */
  readonly timeLabel: string;
  /** The map at this city count, for the growth layer. */
  readonly cities: readonly City[];
}

/** Tours checked per second in the growth chapter's comparison. */
export const ACO_LESSON_TOURS_PER_SECOND = 1_000_000_000;

/** Age of the universe used only for the human comparison. */
const UNIVERSE_AGE_YEARS = 13_800_000_000;

/**
 * The five stages shown while the reader watches the search space explode.
 * Each layout is generated from the same seed, so the five-city map is the
 * first five cities of every later stage.
 */
export const ACO_LESSON_GROWTH_STAGES: readonly LessonGrowthStage[] = Object.freeze(
  [5, 10, 15, 20, 30].map((cityCount) => {
    const tours = distinctTourCount(cityCount);
    return Object.freeze({
      cityCount,
      tours,
      toursLabel: formatTourCount(tours),
      timeLabel: formatSearchTime(tours),
      cities: buildStageCities(cityCount),
    });
  }),
);

/** A chapter id that belongs to the guided opening. */
export const ACO_LESSON_CHAPTER_IDS: ReadonlySet<string> = new Set([
  'the-problem',
  'try-every-tour',
  'too-many-tours',
  'one-ants-choice',
  'leaving-a-trace',
  'forgetting',
  'two-ants',
  'emergence',
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Deterministic permutations of a small integer list. */
function permutations(values: readonly number[]): number[][] {
  if (values.length <= 1) return [values.slice()];
  const result: number[][] = [];
  for (let index = 0; index < values.length; index += 1) {
    const rest = values.slice(0, index).concat(values.slice(index + 1));
    for (const permutation of permutations(rest)) {
      result.push([values[index] as number, ...permutation]);
    }
  }
  return result;
}

function compareTours(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const left = a[index] as number;
    const right = b[index] as number;
    if (left !== right) return left - right;
  }
  return a.length - b.length;
}

/** Build the 12 distinct loops: start at city 0, one direction per loop. */
function buildCanonicalTours(instance: TspInstance): LessonTour[] {
  const tours: number[][] = [];
  for (const permutation of permutations([1, 2, 3, 4])) {
    const order = [0, ...permutation];
    // Keep one of each reverse pair. The second city index is always smaller
    // than the last city index for exactly one direction.
    if ((order[1] as number) < (order[order.length - 1] as number)) {
      tours.push(order);
    }
  }
  tours.sort(compareTours);
  return tours.map((order) =>
    Object.freeze({
      order: Object.freeze(order),
      length: tourLength(instance, order),
    }),
  );
}

function findOptimumIndex(tours: readonly LessonTour[]): number {
  let best = 0;
  for (let index = 1; index < tours.length; index += 1) {
    if ((tours[index] as LessonTour).length < (tours[best] as LessonTour).length) {
      best = index;
    }
  }
  return best;
}

function buildLessonSteps(instance: TspInstance, tour: readonly number[]): LessonStep[] {
  const steps: LessonStep[] = [];
  const size = instance.cityCount;
  const distance = instance.distanceMatrix.data;

  for (let position = 0; position < tour.length; position += 1) {
    const currentCity = tour[position] as number;
    const chosenCity = tour[(position + 1) % tour.length] as number;
    // At the last position the only unvisited city is home; earlier positions
    // choose among the cities still ahead in the tour.
    const remaining = position === tour.length - 1 ? [tour[0] as number] : tour.slice(position + 1);
    const candidates: LessonCandidate[] = remaining.map((city) => {
      const from = currentCity * size + city;
      const distanceValue = distance[from] as number;
      // Uniform pheromone (α = 1) and β = 2: the raw weight is 1 / d².
      const weight = distanceValue > 0 ? 1 / (distanceValue * distanceValue) : 0;
      return { city, probability: weight };
    });
    const total = candidates.reduce((sum, candidate) => sum + candidate.probability, 0);
    const normalized = candidates
      .map((candidate) => ({
        city: candidate.city,
        probability: total > 0 ? candidate.probability / total : 1 / candidates.length,
      }))
      .sort((left, right) => right.probability - left.probability || left.city - right.city);
    steps.push({
      currentCity,
      candidates: Object.freeze(normalized),
      chosenCity,
    });
  }
  return steps;
}

function factorial(value: number): bigint {
  let result = 1n;
  for (let factor = 2n; factor <= BigInt(value); factor += 1n) {
    result *= factor;
  }
  return result;
}

/** Distinct closed tours for `cityCount`: `(n − 1)! / 2`, and 1 for tiny maps. */
export function distinctTourCount(cityCount: number): bigint {
  if (!Number.isInteger(cityCount) || cityCount < 1) return 0n;
  if (cityCount < 3) return 1n;
  return factorial(cityCount - 1) / 2n;
}

function groupDigits(value: bigint): string {
  const digits = value.toString();
  let grouped = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) grouped += ',';
    grouped += digits[index];
  }
  return grouped;
}

/** Locale-independent compact count: grouped below 1e9, otherwise scientific. */
export function formatTourCount(value: bigint): string {
  if (value < 1_000_000_000n) return groupDigits(value);
  const numeric = Number(value);
  const exponent = Math.floor(Math.log10(numeric));
  const mantissa = numeric / 10 ** exponent;
  return `${mantissa.toFixed(1)} × 10${superscript(exponent)}`;
}

function superscript(value: number): string {
  const map: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return String(value)
    .split('')
    .map((digit) => map[digit] ?? digit)
    .join('');
}

function formatMagnitude(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1000) {
    const exponent = Math.floor(Math.log10(value));
    const mantissa = value / 10 ** exponent;
    return `${mantissa.toFixed(digits)} × 10${superscript(exponent)}`;
  }
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(digits);
  return value.toFixed(2);
}

/**
 * Human-readable time to check every tour at one billion tours per second.
 * This is an illustrative comparison, not a benchmark of the reader's device.
 */
export function formatSearchTime(value: bigint): string {
  if (value <= 0n) return 'instant';
  const seconds = Number(value) / ACO_LESSON_TOURS_PER_SECOND;
  if (!Number.isFinite(seconds) || seconds < 1e-3) return 'instant';
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} seconds`;
  if (seconds < 3_600) {
    const minutes = seconds / 60;
    return `about ${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} minutes`;
  }
  if (seconds < 172_800) {
    const hours = seconds / 3_600;
    return `about ${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
  }
  if (seconds < 63_115_200) {
    const days = seconds / 86_400;
    return `about ${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
  }
  const years = seconds / 31_557_600;
  const universeAges = years / UNIVERSE_AGE_YEARS;
  if (universeAges >= 100) {
    return `about ${formatMagnitude(universeAges)} × the age of the universe`;
  }
  return `about ${formatMagnitude(years)} years`;
}

/**
 * The scene composition starts reveal at 0.35 of its target and reaches 1 at
 * the end of the chapter. Lesson layers want 0 at entry and 1 at settlement.
 */
export function lessonProgress(revealProgress: number): number {
  const reveal = clamp01(revealProgress);
  return clamp01((reveal - 0.35) / 0.65);
}

/** Current registration of the enumeration animation, `0…11`. */
export function enumerationStep(progress: number): number {
  return Math.min(
    ACO_LESSON_TOURS.length - 1,
    Math.floor(clamp01(progress) * ACO_LESSON_TOURS.length),
  );
}

/** Fraction of the current candidate tour already drawn, `[0, 1)`. */
export function enumerationFraction(progress: number): number {
  const scaled = clamp01(progress) * ACO_LESSON_TOURS.length;
  return scaled - Math.floor(scaled);
}

/** Index of the shortest tour seen up to and including `step`. */
export function bestTourIndexUpTo(step: number): number {
  const limit = Math.max(0, Math.min(ACO_LESSON_TOURS.length - 1, Math.floor(step)));
  let best = 0;
  for (let index = 1; index <= limit; index += 1) {
    if (
      (ACO_LESSON_TOURS[index] as LessonTour).length < (ACO_LESSON_TOURS[best] as LessonTour).length
    ) {
      best = index;
    }
  }
  return best;
}

/** Current leg of the one-ant walk, `0…4`. */
export function oneAntStepIndex(progress: number): number {
  return Math.min(
    ACO_LESSON_ONE_ANT_STEPS.length - 1,
    Math.floor(clamp01(progress) * ACO_LESSON_ONE_ANT_STEPS.length),
  );
}

/** Fraction of the current one-ant leg already walked, `[0, 1)`. */
export function oneAntFraction(progress: number): number {
  const scaled = clamp01(progress) * ACO_LESSON_ONE_ANT_STEPS.length;
  return scaled - Math.floor(scaled);
}

/** Current stage of the factorial-growth sequence, `0…4`. */
export function growthStageIndex(progress: number): number {
  return Math.min(
    ACO_LESSON_GROWTH_STAGES.length - 1,
    Math.floor(clamp01(progress) * ACO_LESSON_GROWTH_STAGES.length),
  );
}

/** Fraction into the current growth stage, `[0, 1)`. */
export function growthStageFraction(progress: number): number {
  const scaled = clamp01(progress) * ACO_LESSON_GROWTH_STAGES.length;
  return scaled - Math.floor(scaled);
}

/** The current growth stage, clamped. */
export function growthStageAt(progress: number): LessonGrowthStage {
  return ACO_LESSON_GROWTH_STAGES[growthStageIndex(progress)] as LessonGrowthStage;
}

function buildStageCities(cityCount: number): readonly City[] {
  // The five-city stage reuses the frozen coordinates exactly, so the opening
  // map does not jump when the growth chapter begins. Later stages are the
  // real seed-42 layouts, generated by the same pure TSP model as the story.
  if (cityCount === ACO_DEMO_CITY_COUNT) return ACO_LESSON_CITIES;
  return createTspInstance(ACO_DEMO_SEED, cityCount).cities;
}
