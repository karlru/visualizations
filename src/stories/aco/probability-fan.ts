/**
 * Pure probability-fan data for the focal ant's next-city choice.
 *
 * The Story 3.2 canvas arcs and the DOM ranked alternative both consume this
 * module. It deliberately delegates the mathematics to the engine's exported
 * `transitionProbabilities`, so the visual explanation cannot drift from the
 * simulation's transition rule.
 *
 * ### Whose choice is shown?
 *
 * The story frames city {@link ACO_FOCAL_CITY_INDEX} and asks what an ant would
 * do on its **first** move from that city: only the focal city has been visited,
 * so every other city is allowed. A caller may pass an explicit `visited` list
 * to explain a later move; the focal city is always excluded.
 *
 * The result is deterministic: candidates arrive in descending probability with
 * ties broken by ascending city index. The top candidates plus the aggregated
 * "other (Σ)" bucket sum to 1.
 */

import { buildTransitionWeights, transitionProbabilities } from '../../engines/aco/engine';
import type { City, DistanceMatrix, TspInstance } from '../../engines/aco/types';
import { ACO_FOCAL_CITY_INDEX, acoWorldPoint } from './world';

/** Default number of named candidates before the "other" bucket. */
export const DEFAULT_FAN_CANDIDATES = 8;

/**
 * The portion of a problem the fan needs.
 *
 * `AcoSnapshot` satisfies this structurally, so a renderer can pass the live
 * snapshot without copying the graph.
 */
export interface ProbabilityFanProblem {
  readonly cityCount: number;
  readonly cities: readonly City[];
  readonly distanceMatrix: Readonly<DistanceMatrix>;
}

/** One named next-city candidate. */
export interface ProbabilityFanEntry {
  /** City index in the problem. */
  readonly city: number;

  /** Normalized probability in `(0, 1]`. */
  readonly probability: number;

  /** Euclidean distance from the focal city in normalized problem units. */
  readonly distance: number;

  /** Candidate position in ACO world space, for the canvas arcs. */
  readonly x: number;
  readonly y: number;
}

/** The aggregated candidates outside the top N. */
export interface ProbabilityFanOther {
  /** Sum of the omitted candidates' probabilities; 0 when none were omitted. */
  readonly probability: number;

  /** Number of omitted candidates. */
  readonly count: number;
}

/** Everything the canvas fan and the DOM ranked list need. */
export interface ProbabilityFan {
  /** Focal city index. */
  readonly focalCity: number;

  /** Named candidates, highest probability first. At most `topN`. */
  readonly entries: readonly ProbabilityFanEntry[];

  /** Omitted candidates, or a zero bucket when every candidate is named. */
  readonly other: ProbabilityFanOther;

  /** `sum(entries) + other.probability`; 1 within floating-point tolerance. */
  readonly total: number;

  /** True when all transition weights were zero and the engine chose uniformly. */
  readonly uniform: boolean;

  /** Number of allowed cities before the top-N cut. */
  readonly candidateCount: number;

  /** Effective top-N limit. */
  readonly topN: number;
}

/** Optional focal city, visited set, and candidate limit. */
export interface ProbabilityFanOptions {
  /** Defaults to {@link ACO_FOCAL_CITY_INDEX}. */
  readonly focalCity?: number;

  /** Defaults to {@link DEFAULT_FAN_CANDIDATES}; at least one. */
  readonly topN?: number;

  /**
   * Cities already visited by the focal ant. The focal city itself is always
   * excluded. Omit for the first move (only the focal city is visited).
   */
  readonly visited?: readonly number[];
}

/** Parameters the transition rule needs. */
export interface ProbabilityFanParams {
  readonly alpha: number;
  readonly beta: number;
}

function assertCityIndex(index: number, size: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    throw new RangeError(`focalCity must be an integer city index in [0, ${size - 1}]`);
  }
}

function normalizeTopN(topN: number | undefined, candidateCount: number): number {
  if (topN === undefined || !Number.isFinite(topN)) {
    return Math.min(DEFAULT_FAN_CANDIDATES, candidateCount);
  }
  const integer = Math.floor(topN);
  return Math.max(1, Math.min(candidateCount, integer));
}

/**
 * Build the focal ant's fan from a problem, pheromone matrix, and the α/β that
 * produced it.
 *
 * @throws RangeError for an out-of-range focal city, an invalid top N, or a
 *   pheromone matrix that does not match the problem size.
 */
export function buildProbabilityFan(
  problem: ProbabilityFanProblem,
  pheromone: Float64Array,
  params: ProbabilityFanParams,
  options: ProbabilityFanOptions = {},
): ProbabilityFan {
  const size = problem.cityCount;
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('problem.cityCount must be a positive integer');
  }
  if (problem.cities.length !== size) {
    throw new RangeError('problem.cities must contain exactly cityCount entries');
  }

  const focalCity = options.focalCity ?? ACO_FOCAL_CITY_INDEX;
  assertCityIndex(focalCity, size);

  // `transitionProbabilities` reads only these fields; the seed is irrelevant
  // to the transition rule and is present because the engine's signature owns a
  // complete TspInstance.
  const instance: TspInstance = {
    seed: 0,
    cityCount: size,
    cities: problem.cities,
    distanceMatrix: problem.distanceMatrix,
  };

  const allowed = new Uint8Array(size);
  allowed.fill(1);
  allowed[focalCity] = 0;
  if (options.visited !== undefined) {
    for (const city of options.visited) {
      if (Number.isInteger(city) && city >= 0 && city < size) {
        allowed[city] = 0;
      }
    }
  }

  const weights = buildTransitionWeights(instance, pheromone, params.alpha, params.beta);
  const probabilities = transitionProbabilities(
    instance,
    pheromone,
    focalCity,
    allowed,
    params.alpha,
    params.beta,
    { weights },
  );

  const candidates: ProbabilityFanEntry[] = [];
  const distances = problem.distanceMatrix.data;
  const row = focalCity * size;

  for (let index = 0; index < probabilities.count; index += 1) {
    const city = probabilities.cities[index];
    const cityData = problem.cities[city];
    if (city === undefined || cityData === undefined) continue;
    const point = acoWorldPoint(cityData);
    candidates.push({
      city,
      probability: probabilities.probabilities[index],
      distance: distances[row + city],
      x: point.x,
      y: point.y,
    });
  }

  candidates.sort((a, b) => b.probability - a.probability || a.city - b.city);
  const topN = normalizeTopN(options.topN, candidates.length);
  const entries = candidates.slice(0, topN);

  let namedTotal = 0;
  for (const entry of entries) {
    namedTotal += entry.probability;
  }

  let otherProbability = 0;
  if (candidates.length > entries.length) {
    otherProbability = Math.max(0, 1 - namedTotal);
  }

  return {
    focalCity,
    entries,
    other: {
      probability: otherProbability,
      count: Math.max(0, candidates.length - entries.length),
    },
    total: namedTotal + otherProbability,
    uniform: probabilities.uniform,
    candidateCount: candidates.length,
    topN,
  };
}
