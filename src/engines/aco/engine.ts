/**
 * The Ant System engine for the traveling salesman story.
 *
 * One **iteration** constructs one complete tour per ant, measures the tours,
 * updates the best/mean history, evaporates pheromone, deposits new pheromone,
 * and recomputes the diversity metric. `stepIteration()` runs exactly one
 * iteration; `step(dt)` converts simulated seconds into whole iterations with a
 * documented rate, multiplier, remainder, and backlog cap.
 *
 * ### Math
 *
 * The transition rule, deposit, and update are the textbook Ant System from
 * `docs/stories.md` §2.7:
 *
 * ```text
 * p_ij = τ_ij^α · η_ij^β / Σ_l τ_il^α · η_il^β      η_ij = 1 / d_ij
 * Δτ_ij = Q / L_k                                    for edges in ant k's tour
 * τ_ij ← (1 − ρ) · τ_ij + Σ_k Δτ_ij
 * ```
 *
 * `Q` is fixed at 1. The entropy metric is the normalized Shannon entropy from
 * §2.6 over the `E = n(n − 1)/2` unique edges.
 *
 * ### Determinism
 *
 * A run identity is `(seed, structural parameters, city set, start iteration)`.
 * `SeededRandom` is reset on every structural change. Randomness is consumed in
 * a fixed order: ant index ascending, then construction step ascending, with
 * exactly one draw per next-city choice. The starting city of ant `k` is
 * `k mod cityCount` and consumes no draw. This makes two runs with the same
 * identity bit-for-bit identical.
 *
 * ### Time
 *
 * `BASE_ITERATIONS_PER_SECOND` is 1 and the `speed` parameter multiplies it.
 * `step(dt)` adds `dt × speed × rate` to a pending-iteration budget, runs whole
 * iterations, and carries the fractional remainder. At most
 * `MAX_ITERATIONS_PER_STEP` iterations run in one call, so a 150-city × 200-ant
 * colony cannot monopolise a frame. A backlog larger than
 * `MAX_PENDING_ITERATIONS` is trimmed and the discarded whole iterations are
 * counted in `metrics().droppedIterations`; the UI can show that quality has
 * degraded instead of freezing. No time is dropped silently.
 *
 * This module is pure TypeScript. It imports only `engines/core` and the TSP
 * model; `tests/unit/import-boundaries.test.ts` enforces that.
 */

import { normalizeSeed, SeededRandom } from '../core/rng';
import type { Engine } from '../core/types';
import { createTspInstance, createTspInstanceFromCities } from './tsp';
import type { AcoHistory, AcoMetrics, AcoParams, AcoSnapshot, City, TspInstance } from './types';

/** Fixed deposit constant `Q` for release 1. */
export const ACO_DEPOSIT_CONSTANT = 1;

/**
 * Initial pheromone `τ₀` on every edge.
 *
 * A small positive constant is deliberate: `1 / (n · L_nn)` is a common choice,
 * but a one-city instance has `L_nn = 0`, and a constant keeps initialization
 * finite for every valid instance and makes the initial entropy exactly 1.
 * The diagonal (a self-edge that no tour can use) is set to zero.
 */
export const INITIAL_PHEROMONE = 0.1;

/**
 * Base iteration rate at `speed = 1`. One Ant System iteration per simulated
 * second is readable at story pacing and leaves room for the renderer to
 * animate a full tour between iterations.
 */
export const BASE_ITERATIONS_PER_SECOND = 1;

/**
 * Maximum whole iterations one `step(dt)` call may run.
 *
 * At the release-1 worst case (150 cities × 200 ants) one iteration evaluates
 * about 2.25 million candidate transitions, which is already a large slice of
 * a 200 ms budget in a browser. One iteration per call keeps a single frame
 * task below the long-task limit even on the reference mobile device; at the
 * normal 1×–4× speeds the pending-time budget still averages one iteration per
 * 250 ms–1 s, so the cap does not slow an ordinary run.
 */
export const MAX_ITERATIONS_PER_STEP = 1;

/**
 * Maximum whole-iteration backlog retained across calls (about two simulated
 * seconds at 4× speed). Excess whole iterations are discarded and counted, so
 * a long tab-away gap cannot create a permanent catch-up spiral.
 */
export const MAX_PENDING_ITERATIONS = 8;

/**
 * Maximum retained convergence-history points.
 *
 * One point per completed iteration means 512 points is over eight minutes at
 * the default 1× speed and still a small, fixed allocation. The history is a
 * ring-like sliding window: when full, the oldest point is reused so recording
 * an iteration never allocates.
 */
export const ACO_HISTORY_CAPACITY = 512;

/** Inclusive engine limits. The UI is narrower: 2–150 cities, 1–200 ants. */
export const ACO_LIMITS = Object.freeze({
  cityCount: Object.freeze({ min: 1, max: 150 }),
  antCount: Object.freeze({ min: 1, max: 200 }),
  alpha: Object.freeze({ min: 0, max: 5 }),
  beta: Object.freeze({ min: 0, max: 10 }),
  rho: Object.freeze({ min: 0, max: 1 }),
});

/**
 * Absorbs floating-point accumulation error at an iteration boundary. It is 1
 * ns of iteration budget, far smaller than any real frame, and prevents a sum
 * such as 49.99999999999999 iterations from losing a whole iteration when the
 * same elapsed time at 30, 60, and 120 fps is compared.
 */
const ITERATION_EPSILON = 1e-9;

/**
 * Result buffers for {@link transitionProbabilities}.
 *
 * Only the first `count` entries of `cities` and `probabilities` are valid.
 * The object is reused by the engine so the hot construction path allocates
 * nothing per construction step.
 */
export interface TransitionProbabilities {
  /** Allowed city indices in ascending order. */
  readonly cities: Int32Array;

  /** `probabilities[i]` is the probability of `cities[i]`. */
  readonly probabilities: Float64Array;

  /** Number of valid entries. Zero when there is no allowed city. */
  count: number;

  /**
   * True when all raw weights were zero or unusable and every allowed city was
   * given the same probability. False for a normal weighted result and for the
   * empty set.
   */
  uniform: boolean;
}

/** Optional precomputation and output for {@link transitionProbabilities}. */
export interface TransitionProbabilityOptions {
  /**
   * Row-major `τ^α · η^β` matrix built by {@link buildTransitionWeights} for
   * the same instance, pheromone, `alpha`, and `beta`. Supplying it avoids
   * recomputing powers for every construction step. The helper trusts this
   * matrix; callers must keep it in sync.
   */
  readonly weights?: Float64Array;

  /** Reused result object. When omitted, a new capacity-sized result is made. */
  readonly output?: TransitionProbabilities;
}

/** Allocate reusable transition result buffers for a city count. */
export function createTransitionProbabilities(capacity: number): TransitionProbabilities {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError(`capacity must be a safe integer >= 0; received ${capacity}`);
  }
  return {
    cities: new Int32Array(capacity),
    probabilities: new Float64Array(capacity),
    count: 0,
    uniform: false,
  };
}

/** Throw a precise RangeError for a non-index city argument. */
function assertCityIndex(index: number, size: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    throw new RangeError(`${label} must be an integer city index in [0, ${size - 1}]`);
  }
}

/** Throw when a transition weight exponent is not a finite non-negative number. */
function assertExponent(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
}

/**
 * Raw Ant System weight for one ordered pair: `τ_ij^α · η_ij^β`.
 *
 * `η_ij = 1 / d_ij`. A non-positive or non-finite pheromone value contributes
 * zero (except for `α = 0`, where the standard `x^0 = 1` convention applies),
 * and a non-positive distance contributes zero rather than `Infinity`. The TSP
 * matrix already guarantees a positive off-diagonal distance, so this is only a
 * defensive guard. Exported so the per-iteration matrix, tests, and any
 * single-edge explanation use exactly the same arithmetic.
 *
 * The caller must pass finite non-negative `alpha` and `beta`.
 */
export function edgeTransitionWeight(
  pheromone: number,
  distance: number,
  alpha: number,
  beta: number,
): number {
  const tau = Number.isFinite(pheromone) ? Math.max(pheromone, 0) : 0;
  const eta = Number.isFinite(distance) && distance > 0 ? 1 / distance : 0;
  return tau ** alpha * eta ** beta;
}

/**
 * Build the row-major `n × n` matrix of raw transition weights.
 *
 * The matrix is symmetric for a symmetric distance matrix and symmetric
 * pheromone. The diagonal is zero because a self-edge is never allowed. This is
 * called once at the start of each iteration; construction then only multiplies
 * and accumulates, which keeps the worst case fast.
 *
 * @param output Reused buffer of exactly `n × n` entries, or a new one.
 */
export function buildTransitionWeights(
  instance: TspInstance,
  pheromone: Float64Array,
  alpha: number,
  beta: number,
  output?: Float64Array,
): Float64Array {
  assertExponent(alpha, 'alpha');
  assertExponent(beta, 'beta');

  const size = instance.cityCount;
  const entries = size * size;
  if (pheromone.length !== entries) {
    throw new RangeError(`pheromone must contain exactly ${entries} entries`);
  }
  const weights = output ?? new Float64Array(entries);
  if (weights.length !== entries) {
    throw new RangeError(`weights must contain exactly ${entries} entries`);
  }

  const { data: distances } = instance.distanceMatrix;
  weights.fill(0);
  for (let from = 0; from < size; from += 1) {
    const row = from * size;
    for (let to = 0; to < size; to += 1) {
      if (from === to) {
        continue;
      }
      const index = row + to;
      weights[index] = edgeTransitionWeight(pheromone[index], distances[index], alpha, beta);
    }
  }
  return weights;
}

/**
 * Normalized transition probabilities for the next city.
 *
 * `allowed[i] !== 0` marks a city that may be chosen. Cities already visited
 * are excluded by clearing their mask entry, and the current city is always
 * excluded explicitly. The result lists allowed cities in ascending index
 * order, which makes tests and the Step 3.2 probability fan deterministic.
 *
 * The probabilities are non-negative and sum to 1 within floating-point
 * tolerance. **All-zero (or non-finite) weights fall back to a uniform
 * distribution** over the allowed cities, exactly as required by
 * `docs/stories.md` §2.8. The last entry absorbs rounding so the displayed fan
 * can sum to 1 exactly in most cases.
 *
 * When `options.weights` is supplied it must be the matrix produced by
 * {@link buildTransitionWeights} for the same inputs. Step 3.2 may omit it and
 * get the same numbers from the instance, pheromone, `alpha`, and `beta`.
 */
export function transitionProbabilities(
  instance: TspInstance,
  pheromone: Float64Array,
  currentCity: number,
  allowed: Uint8Array,
  alpha: number,
  beta: number,
  options: TransitionProbabilityOptions = {},
): TransitionProbabilities {
  const size = instance.cityCount;
  assertCityIndex(currentCity, size, 'currentCity');
  assertExponent(alpha, 'alpha');
  assertExponent(beta, 'beta');

  if (allowed.length !== size) {
    throw new RangeError(`allowed must contain exactly ${size} entries`);
  }

  const entries = size * size;
  if (pheromone.length !== entries) {
    throw new RangeError(`pheromone must contain exactly ${entries} entries`);
  }
  const weights = options.weights;
  if (weights !== undefined && weights.length !== entries) {
    throw new RangeError(`weights must contain exactly ${entries} entries`);
  }

  const target = options.output ?? createTransitionProbabilities(size);
  if (target.cities.length < size || target.probabilities.length < size) {
    throw new RangeError('transition output buffers are too small for this instance');
  }

  const { data: distances } = instance.distanceMatrix;
  const { cities, probabilities } = target;
  const row = currentCity * size;

  let count = 0;
  let total = 0;
  let invalid = false;

  for (let city = 0; city < size; city += 1) {
    if (city === currentCity || allowed[city] === 0) {
      continue;
    }

    const index = row + city;
    const weight =
      weights === undefined
        ? edgeTransitionWeight(pheromone[index], distances[index], alpha, beta)
        : weights[index];

    cities[count] = city;
    if (!Number.isFinite(weight) || weight < 0) {
      invalid = true;
      probabilities[count] = 0;
    } else {
      probabilities[count] = weight;
      total += weight;
    }
    count += 1;
  }

  target.count = count;
  if (count === 0) {
    target.uniform = false;
    return target;
  }

  // Non-finite weights and an all-zero total are both treated as "no
  // information" and resolve to the documented uniform fallback. This keeps
  // every returned probability finite, including after rho = 1.
  const uniform = invalid || !(total > 0) || !Number.isFinite(total);
  target.uniform = uniform;

  if (uniform) {
    const probability = 1 / count;
    let running = 0;
    for (let index = 0; index < count - 1; index += 1) {
      probabilities[index] = probability;
      running += probability;
    }
    probabilities[count - 1] = Math.max(0, 1 - running);
    return target;
  }

  let running = 0;
  for (let index = 0; index < count - 1; index += 1) {
    const probability = probabilities[index] / total;
    probabilities[index] = probability;
    running += probability;
  }
  probabilities[count - 1] = Math.max(0, 1 - running);
  return target;
}

/**
 * Normalized Shannon entropy of the pheromone distribution.
 *
 * `p_e = τ_e / Σ_f τ_f`, `H = −Σ p_e ln(p_e) / ln(E)`, with
 * `E = n(n − 1) / 2` unique edges. Uniform pheromone produces 1, all mass on
 * one edge produces 0, and a zero total produces 1 (maximally undifferentiated)
 * as specified in `docs/stories.md` §2.6. Values are clamped to `[0, 1]` so
 * floating-point noise cannot escape the metric's contract.
 *
 * With fewer than three cities there is at most one edge and `ln(E) = 0`.
 * That degenerate case is defined as 1 because the sole edge is uniform by
 * definition; separate `bestLength`/`meanLength` history still shows progress.
 *
 * Non-finite or negative pheromone entries are ignored (treated as zero); the
 * engine never stores them, so this only protects callers that build a matrix
 * by hand.
 */
export function normalizedPheromoneEntropy(instance: TspInstance, pheromone: Float64Array): number {
  const size = instance.cityCount;
  const entries = size * size;
  if (pheromone.length !== entries) {
    throw new RangeError(`pheromone must contain exactly ${entries} entries`);
  }

  const edgeCount = (size * (size - 1)) / 2;
  if (edgeCount <= 1) {
    return 1;
  }

  let total = 0;
  for (let from = 0; from < size; from += 1) {
    const row = from * size;
    for (let to = from + 1; to < size; to += 1) {
      const value = pheromone[row + to];
      if (Number.isFinite(value) && value > 0) {
        total += value;
      }
    }
  }
  if (!(total > 0) || !Number.isFinite(total)) {
    return 1;
  }

  let entropy = 0;
  for (let from = 0; from < size; from += 1) {
    const row = from * size;
    for (let to = from + 1; to < size; to += 1) {
      const value = pheromone[row + to];
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }
      const probability = value / total;
      entropy -= probability * Math.log(probability);
    }
  }

  const normalized = entropy / Math.log(edgeCount);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Math.min(1, Math.max(0, normalized));
}

/** Internal ant state with mutable fields for buffer reuse. */
interface MutableAntSnapshot {
  index: number;
  tour: Int32Array;
  tourLength: number;
  visitedCount: number;
}

/** Internal mutable history point, reused from a fixed pool. */
interface MutableAcoHistoryPoint {
  iteration: number;
  bestLength: number;
  meanLength: number;
}

/** Internal snapshot with mutable fields. Consumers only see the readonly view. */
interface MutableAcoSnapshot {
  iteration: number;
  cityCount: number;
  antCount: number;
  cities: readonly City[];
  explicitCities: boolean;
  distanceMatrix: TspInstance['distanceMatrix'];
  pheromone: Float64Array;
  ants: readonly MutableAntSnapshot[];
  bestTour: readonly number[] | null;
  bestLength: number | null;
  meanLength: number | null;
  entropy: number;
  history: AcoHistory;
  iterationProgress: number;
  iterationsPerSecond: number;
  speed: number;
  params: AcoParams;
}

/** Sanitize presentation speed. Non-finite values become 1×; negatives pause. */
function sanitizeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    return 1;
  }
  return Math.max(0, speed);
}

/** Validate an integer parameter and return it unchanged. */
function assertIntegerParam(label: string, value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be a safe integer in [${min}, ${max}]; received ${value}`);
  }
}

/** Validate a numeric parameter and return it unchanged. */
function assertNumberParam(label: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be a finite number in [${min}, ${max}]; received ${value}`);
  }
}

/** Validate and normalize a parameter object. */
function normalizeParams(params: AcoParams): AcoParams {
  assertIntegerParam(
    'cityCount',
    params.cityCount,
    ACO_LIMITS.cityCount.min,
    ACO_LIMITS.cityCount.max,
  );
  assertIntegerParam('antCount', params.antCount, ACO_LIMITS.antCount.min, ACO_LIMITS.antCount.max);
  assertNumberParam('alpha', params.alpha, ACO_LIMITS.alpha.min, ACO_LIMITS.alpha.max);
  assertNumberParam('beta', params.beta, ACO_LIMITS.beta.min, ACO_LIMITS.beta.max);
  assertNumberParam('rho', params.rho, ACO_LIMITS.rho.min, ACO_LIMITS.rho.max);

  return Object.freeze({
    cityCount: params.cityCount,
    antCount: params.antCount,
    alpha: params.alpha,
    beta: params.beta,
    rho: params.rho,
    speed: sanitizeSpeed(params.speed),
    seed: normalizeSeed(params.seed),
  });
}

/** True when two parameter objects share every structural field. */
function sameStructuralParams(a: AcoParams, b: AcoParams): boolean {
  return (
    a.cityCount === b.cityCount &&
    a.antCount === b.antCount &&
    a.alpha === b.alpha &&
    a.beta === b.beta &&
    a.rho === b.rho &&
    a.seed === b.seed
  );
}

/** Allocate a fixed pool of ant snapshots and tour buffers. */
function createAntSnapshots(antCount: number, cityCount: number): MutableAntSnapshot[] {
  const ants = new Array<MutableAntSnapshot>(antCount);
  for (let index = 0; index < antCount; index += 1) {
    ants[index] = {
      index,
      tour: new Int32Array(cityCount),
      tourLength: 0,
      visitedCount: 0,
    };
  }
  return ants;
}

/**
 * A complete, deterministic Ant System implementation.
 *
 * The constructor and every structural change restart at iteration 0 with the
 * run's seed. Presentation speed can change at any time without a reset.
 *
 * Best length is initialized from the first iteration's fastest ant. The
 * nearest-neighbor baseline is deliberately not injected into this history: the
 * story computes `nearestNeighborTour` separately when it wants to compare the
 * colony with the greedy tour, so "best" always means "best tour an ant has
 * actually built".
 */
export class AcoEngine implements Engine<AcoParams, AcoSnapshot, AcoMetrics> {
  private params: AcoParams;
  private instance: TspInstance;
  private readonly rng: SeededRandom;

  /**
   * Whether the current city set came from {@link setCities} rather than the
   * seeded generator. A seed change keeps an explicit map; a city-count change
   * replaces it with a generated layout.
   */
  private explicitCities = false;

  private pheromone: Float64Array;
  private weights: Float64Array;
  private allowed: Uint8Array;
  private probabilities: TransitionProbabilities;
  private ants: MutableAntSnapshot[];

  private bestTour: readonly number[] | null = null;
  private bestLength: number | null = null;
  private meanLength: number | null = null;
  private entropy = 1;
  private iteration = 0;
  private pendingIterations = 0;
  private droppedIterations = 0;

  /** Fixed pool of history point objects; recording never allocates. */
  private readonly historyPool: MutableAcoHistoryPoint[];
  /** Chronological view, oldest first. References objects from `historyPool`. */
  private readonly historyPoints: MutableAcoHistoryPoint[] = [];
  private readonly historyValue: AcoHistory;

  private readonly snapshotValue: MutableAcoSnapshot;

  /**
   * @throws RangeError if a parameter is outside its documented range.
   */
  constructor(params: AcoParams) {
    const normalized = normalizeParams(params);
    this.params = normalized;
    this.instance = createTspInstance(normalized.seed, normalized.cityCount);
    this.rng = new SeededRandom(normalized.seed);

    const size = this.instance.cityCount;
    const entries = size * size;
    this.pheromone = new Float64Array(entries);
    this.weights = new Float64Array(entries);
    this.allowed = new Uint8Array(size);
    this.probabilities = createTransitionProbabilities(size);
    this.ants = createAntSnapshots(normalized.antCount, size);

    this.historyPool = Array.from({ length: ACO_HISTORY_CAPACITY }, () => ({
      iteration: 0,
      bestLength: 0,
      meanLength: 0,
    }));
    this.historyValue = {
      capacity: ACO_HISTORY_CAPACITY,
      points: this.historyPoints,
    };

    this.snapshotValue = {
      iteration: 0,
      cityCount: size,
      antCount: normalized.antCount,
      cities: this.instance.cities,
      explicitCities: false,
      distanceMatrix: this.instance.distanceMatrix,
      pheromone: this.pheromone,
      ants: this.ants,
      bestTour: null,
      bestLength: null,
      meanLength: null,
      entropy: 1,
      history: this.historyValue,
      iterationProgress: 0,
      iterationsPerSecond: BASE_ITERATIONS_PER_SECOND,
      speed: normalized.speed,
      params: this.params,
    };

    this.restartRun();
  }

  /**
   * Restore iteration 0, the initial pheromone, and the seed's random stream.
   * The current map is kept, including an explicit city set from `setCities`.
   */
  reset(): void {
    this.restartRun();
  }

  /**
   * Apply a complete parameter object.
   *
   * A structural change restarts at iteration 0 and clears history. A pure
   * presentation change (speed) applies immediately. A same-value call is a
   * no-op, so a UI that dispatches every frame cannot accidentally restart.
   */
  setParams(params: AcoParams): void {
    const next = normalizeParams(params);
    if (sameStructuralParams(this.params, next)) {
      this.params = next;
      this.snapshotValue.params = next;
      this.snapshotValue.speed = next.speed;
      return;
    }

    const previous = this.params;
    const cityCountChanged = previous.cityCount !== next.cityCount;
    const seedChanged = previous.seed !== next.seed;
    this.params = next;

    if (cityCountChanged || (seedChanged && !this.explicitCities)) {
      this.instance = createTspInstance(next.seed, next.cityCount);
      if (cityCountChanged) {
        this.explicitCities = false;
      }
    }

    this.rebindProblem();
    this.restartRun();
  }

  /**
   * Replace the city set (the Step 3.5 drag/add/remove editor) and restart.
   *
   * Distances are rebuilt, the run returns to iteration 0, and best/mean
   * history is invalidated. The current seed is kept as the run identity for
   * ant choices, even though an explicit map does not depend on it.
   *
   * @throws RangeError for an empty list, more than 150 cities, or coordinates
   *   outside the normalized unit square.
   */
  setCities(cities: readonly City[]): void {
    if (cities.length > ACO_LIMITS.cityCount.max) {
      throw new RangeError(
        `setCities accepts at most ${ACO_LIMITS.cityCount.max} cities; received ${cities.length}`,
      );
    }

    this.instance = createTspInstanceFromCities(cities, this.params.seed);
    this.explicitCities = true;
    this.params = { ...this.params, cityCount: this.instance.cityCount };
    this.rebindProblem();
    this.restartRun();
  }

  /**
   * Restore the seeded layout for the current seed and city count.
   *
   * This is the lab's "Reset map" action. It drops an explicit map, rebuilds
   * the generated instance, and restarts at iteration 0. The seed and the
   * number of cities are preserved, so a share link reproduces the same
   * seeded map.
   */
  resetMap(): void {
    this.explicitCities = false;
    this.instance = createTspInstance(this.params.seed, this.params.cityCount);
    this.rebindProblem();
    this.restartRun();
  }

  /**
   * Advance by one fixed simulation substep.
   *
   * The engine owns its iteration rate and `speed` multiplier, so the story
   * controller should pass the clock's fixed step at clock speed 1× and let the
   * engine apply the ACO speed. Negative, zero, and non-finite deltas are
   * ignored. Whole iterations run; the fractional remainder is carried.
   */
  step(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return;
    }

    const advance = dtSeconds * this.params.speed * BASE_ITERATIONS_PER_SECOND;
    this.pendingIterations += advance;
    this.trimBacklog();

    const whole = Math.min(
      Math.floor(this.pendingIterations + ITERATION_EPSILON),
      MAX_ITERATIONS_PER_STEP,
    );
    for (let index = 0; index < whole; index += 1) {
      this.stepIteration();
    }

    this.pendingIterations -= whole;
    if (!Number.isFinite(this.pendingIterations) || this.pendingIterations < 0) {
      this.pendingIterations = 0;
    }
    this.publish();
  }

  /**
   * Run exactly one Ant System iteration.
   *
   * This is the deterministic entry point for tests, reduced-motion stepping,
   * and build-time figures. It does not touch the pending-time budget, so a
   * caller can interleave it with `step(dt)` without double-counting time.
   */
  stepIteration(): void {
    const size = this.instance.cityCount;
    this.weights = buildTransitionWeights(
      this.instance,
      this.pheromone,
      this.params.alpha,
      this.params.beta,
      this.weights,
    );

    let minimumLength = Number.POSITIVE_INFINITY;
    let bestAnt = -1;
    let totalLength = 0;

    for (let index = 0; index < this.ants.length; index += 1) {
      const ant = this.ants[index];
      const length = this.constructTour(ant);
      ant.tourLength = length;
      ant.visitedCount = size;
      totalLength += length;
      if (length < minimumLength) {
        minimumLength = length;
        bestAnt = index;
      }
    }

    if (bestAnt >= 0 && (this.bestLength === null || minimumLength < this.bestLength)) {
      this.bestLength = minimumLength;
      this.bestTour = Object.freeze(Array.from(this.ants[bestAnt].tour));
    }
    this.meanLength = totalLength / this.ants.length;

    this.updatePheromone();
    this.entropy = normalizedPheromoneEntropy(this.instance, this.pheromone);
    this.iteration += 1;
    this.recordHistory();
    this.publish();
  }

  /** Return the reusable render snapshot. */
  snapshot(): Readonly<AcoSnapshot> {
    return this.snapshotValue;
  }

  /** Return a fresh low-frequency metrics object. */
  metrics(): Readonly<AcoMetrics> {
    return {
      iteration: this.iteration,
      bestLength: this.bestLength,
      meanLength: this.meanLength,
      entropy: this.entropy,
      history: this.historyPoints.map((point) => ({
        iteration: point.iteration,
        bestLength: point.bestLength,
        meanLength: point.meanLength,
      })),
      antCount: this.ants.length,
      cityCount: this.instance.cityCount,
      pendingIterations: this.pendingIterations,
      droppedIterations: this.droppedIterations,
      degraded: this.droppedIterations > 0,
    };
  }

  /** Clear derived history and restore initial pheromone. Keeps the instance. */
  private restartRun(): void {
    const size = this.instance.cityCount;

    this.rng.reset(this.params.seed);
    this.pheromone.fill(INITIAL_PHEROMONE);
    for (let city = 0; city < size; city += 1) {
      this.pheromone[city * size + city] = 0;
    }
    this.weights.fill(0);

    for (const ant of this.ants) {
      ant.visitedCount = 0;
      ant.tourLength = 0;
    }

    this.iteration = 0;
    this.bestTour = null;
    this.bestLength = null;
    this.meanLength = null;
    this.entropy = 1;
    this.pendingIterations = 0;
    this.droppedIterations = 0;
    this.historyPoints.length = 0;
    this.publish();
  }

  /**
   * Append the just-completed iteration to the bounded history.
   *
   * Objects come from `historyPool`; once the window is full the oldest entry is
   * moved to the end and overwritten. No allocation happens on this path, so
   * recording history cannot add per-frame garbage.
   */
  private recordHistory(): void {
    let point: MutableAcoHistoryPoint;
    if (this.historyPoints.length < ACO_HISTORY_CAPACITY) {
      const pooled = this.historyPool[this.historyPoints.length];
      if (pooled === undefined) return;
      point = pooled;
      this.historyPoints.push(point);
    } else {
      const oldest = this.historyPoints.shift();
      if (oldest === undefined) return;
      point = oldest;
      this.historyPoints.push(point);
    }

    point.iteration = this.iteration;
    point.bestLength = this.bestLength ?? 0;
    point.meanLength = this.meanLength ?? 0;
  }

  /** Reallocate buffers after the city set, ant count, or seed changed. */
  private rebindProblem(): void {
    const size = this.instance.cityCount;
    const entries = size * size;

    if (this.pheromone.length !== entries) {
      this.pheromone = new Float64Array(entries);
      this.weights = new Float64Array(entries);
    }
    if (this.allowed.length !== size) {
      this.allowed = new Uint8Array(size);
      this.probabilities = createTransitionProbabilities(size);
    }
    if (this.ants.length !== this.params.antCount || this.ants[0]?.tour.length !== size) {
      this.ants = createAntSnapshots(this.params.antCount, size);
    }

    this.snapshotValue.cityCount = size;
    this.snapshotValue.antCount = this.params.antCount;
    this.snapshotValue.cities = this.instance.cities;
    this.snapshotValue.explicitCities = this.explicitCities;
    this.snapshotValue.distanceMatrix = this.instance.distanceMatrix;
    this.snapshotValue.pheromone = this.pheromone;
    this.snapshotValue.ants = this.ants;
    this.snapshotValue.params = this.params;
    this.snapshotValue.speed = this.params.speed;
  }

  /** Copy current scalar state into the stable snapshot object. */
  private publish(): void {
    this.snapshotValue.iteration = this.iteration;
    this.snapshotValue.explicitCities = this.explicitCities;
    this.snapshotValue.bestTour = this.bestTour;
    this.snapshotValue.bestLength = this.bestLength;
    this.snapshotValue.meanLength = this.meanLength;
    this.snapshotValue.entropy = this.entropy;
    this.snapshotValue.iterationProgress = this.iterationProgress();
    this.snapshotValue.speed = this.params.speed;
    this.snapshotValue.params = this.params;
  }

  /** Fraction of the next iteration already paid for, in `[0, 1)`. */
  private iterationProgress(): number {
    if (!Number.isFinite(this.pendingIterations) || this.pendingIterations <= 0) {
      return 0;
    }
    const fraction = this.pendingIterations - Math.floor(this.pendingIterations);
    return fraction >= 0 && fraction < 1 ? fraction : 0;
  }

  /**
   * Bound the pending budget and count discarded whole iterations.
   *
   * The fractional remainder survives, so progress toward the next iteration
   * is never lost; only whole backlog beyond the cap is dropped, and the drop is
   * visible through `droppedIterations`.
   */
  private trimBacklog(): void {
    if (!Number.isFinite(this.pendingIterations)) {
      this.droppedIterations += MAX_PENDING_ITERATIONS;
      this.pendingIterations = MAX_PENDING_ITERATIONS;
      return;
    }
    if (this.pendingIterations < 0) {
      this.pendingIterations = 0;
      return;
    }

    const whole = Math.floor(this.pendingIterations);
    if (whole <= MAX_PENDING_ITERATIONS) {
      return;
    }

    this.droppedIterations += whole - MAX_PENDING_ITERATIONS;
    this.pendingIterations = MAX_PENDING_ITERATIONS + (this.pendingIterations - whole);
  }

  /**
   * Build one ant's complete tour, returning its length.
   *
   * The ant starts at `index mod cityCount` (no random draw), then makes
   * `cityCount - 1` choices, each consuming exactly one `SeededRandom` float.
   * Length is accumulated in visit order, including the closing edge, so it
   * matches `tourLength` exactly without re-validating the permutation.
   */
  private constructTour(ant: MutableAntSnapshot): number {
    const size = this.instance.cityCount;
    const tour = ant.tour;

    if (size === 1) {
      tour[0] = 0;
      return 0;
    }

    const start = ant.index % size;
    tour[0] = start;
    this.allowed.fill(1);
    this.allowed[start] = 0;

    const { data: distances } = this.instance.distanceMatrix;
    let current = start;
    let length = 0;

    for (let position = 1; position < size; position += 1) {
      const probabilities = transitionProbabilities(
        this.instance,
        this.pheromone,
        current,
        this.allowed,
        this.params.alpha,
        this.params.beta,
        { weights: this.weights, output: this.probabilities },
      );

      if (probabilities.count === 0) {
        throw new Error('Ant construction has no allowed city before the tour is complete');
      }

      // One draw over the cumulative distribution, as documented. The last
      // candidate absorbs floating-point truncation when the draw is very
      // close to 1.
      const draw = this.rng.randomFloat();
      let chosen = probabilities.cities[probabilities.count - 1];
      let cumulative = 0;
      for (let index = 0; index < probabilities.count; index += 1) {
        cumulative += probabilities.probabilities[index];
        if (draw < cumulative) {
          chosen = probabilities.cities[index];
          break;
        }
      }

      tour[position] = chosen;
      this.allowed[chosen] = 0;
      length += distances[current * size + chosen];
      current = chosen;
    }

    return length + distances[current * size + start];
  }

  /**
   * Apply evaporation and then every ant's deposit.
   *
   * Evaporation runs first for every unique edge and is mirrored, then each
   * used edge receives `Q / L_k` in both directions. A final sanitize pass
   * guarantees non-negative, finite values even if a caller's parameters push
   * a Float64 operation to an extreme.
   */
  private updatePheromone(): void {
    const size = this.instance.cityCount;
    const pheromone = this.pheromone;
    const remaining = 1 - this.params.rho;

    for (let from = 0; from < size; from += 1) {
      const row = from * size;
      for (let to = from + 1; to < size; to += 1) {
        const value = remaining * pheromone[row + to];
        pheromone[row + to] = value;
        pheromone[to * size + from] = value;
      }
    }

    if (size >= 2) {
      for (const ant of this.ants) {
        if (ant.visitedCount !== size) {
          continue;
        }
        const tourLength = ant.tourLength;
        if (!Number.isFinite(tourLength) || tourLength <= 0) {
          continue;
        }
        const deposit = ACO_DEPOSIT_CONSTANT / tourLength;
        if (!(deposit > 0) || !Number.isFinite(deposit)) {
          continue;
        }

        const tour = ant.tour;
        let previous = tour[size - 1];
        for (let position = 0; position < size; position += 1) {
          const city = tour[position];
          pheromone[previous * size + city] += deposit;
          pheromone[city * size + previous] += deposit;
          previous = city;
        }
      }
    }

    this.sanitizePheromone();
  }

  /** Clamp non-finite or negative pheromone to zero and restore symmetry. */
  private sanitizePheromone(): void {
    const size = this.instance.cityCount;
    const pheromone = this.pheromone;

    for (let from = 0; from < size; from += 1) {
      const row = from * size;
      for (let to = from + 1; to < size; to += 1) {
        let value = pheromone[row + to];
        if (!Number.isFinite(value) || value < 0) {
          value = 0;
        }
        pheromone[row + to] = value;
        pheromone[to * size + from] = value;
      }
    }
  }
}
