/**
 * Traveling salesman model contracts for the ant colony optimization story.
 *
 * A {@link TspInstance} is a static problem: an ordered city list and a
 * precomputed distance matrix. It contains no ants, pheromone, iteration, or
 * randomness state. The Ant System engine (Step 2.2) owns the mutable
 * simulation and reads this model.
 *
 * City identity is its **index** in {@link TspInstance.cities}. Tours store
 * indices, never city objects, so a city edit can rebuild the instance without
 * rewriting tours by identity. The edge from the last city back to the first
 * is implicit and is never stored in a tour.
 *
 * Engines are pure TypeScript; see `src/engines/core/types.ts`. This module
 * must not import DOM, Svelte, Astro, Three.js, renderer, or story code.
 */

import type { Seed } from '../core/types';

/**
 * A city in normalized problem space.
 *
 * `x` and `y` are in the closed interval `[0, 1]`. The renderer maps that unit
 * square onto the stage with its own margin, so the model never stores pixels.
 */
export interface City {
  readonly x: number;
  readonly y: number;
}

/**
 * City indices in visit order.
 *
 * A valid tour is a permutation of `0 .. cityCount - 1`; see
 * {@link TourValidation}. The return to `tour[0]` is implicit.
 */
export type Tour = readonly number[];

/**
 * A symmetric Euclidean distance matrix.
 *
 * `data` is row-major with `size × size` entries: the distance from city `i`
 * to city `j` is `data[i * size + j]`. The diagonal is zero. Off-diagonal
 * distances are at least `DISTANCE_EPSILON`, so a coincident or near-coincident
 * pair still has a finite, non-zero distance and `1 / distance` cannot be
 * infinite.
 *
 * The buffer is shared, not copied, for performance. Consumers must treat it as
 * read-only; the accessor is the checked public path.
 */
export interface DistanceMatrix {
  /** Number of cities, equal to the width and height of `data`. */
  readonly size: number;

  /** Row-major `size × size` distances. Treat as read-only. */
  readonly data: Float64Array;

  /**
   * Read the distance from `from` to `to`.
   *
   * @throws RangeError if either index is not an integer in
   *   `[0, size - 1]`.
   */
  distance(from: number, to: number): number;
}

/** A static traveling salesman problem instance. */
export interface TspInstance {
  /** Normalized seed that produced the city set. Explicit city lists keep it as run identity. */
  readonly seed: Seed;

  /** Number of cities; equal to `cities.length` and `distanceMatrix.size`. */
  readonly cityCount: number;

  /** Cities in index order. Frozen; the array index is the city identity. */
  readonly cities: readonly City[];

  /** Precomputed distances between every pair of cities. */
  readonly distanceMatrix: DistanceMatrix;
}

/**
 * Result of {@link validateTour}.
 *
 * Validation failures are normal data, not exceptions: a UI can show the
 * reason, and a test can assert the exact code. Each failure carries the
 * details needed to explain it without parsing the message.
 */
export type TourValidation =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: 'wrong-length';
      readonly expected: number;
      readonly actual: number;
      readonly message: string;
    }
  | {
      readonly valid: false;
      readonly code: 'out-of-range';
      readonly position: number;
      readonly city: number;
      readonly message: string;
    }
  | {
      readonly valid: false;
      readonly code: 'duplicate-city';
      readonly position: number;
      readonly city: number;
      readonly message: string;
    };

/**
 * Parameters for one Ant System run.
 *
 * `cityCount`, `antCount`, `alpha`, `beta`, `rho`, and `seed` are **structural**:
 * changing any of them restarts the run at iteration 0 and clears the best and
 * mean history. `speed` is **presentation** state: it changes how many
 * iterations a simulated second produces and is applied without a reset.
 *
 * The deposit constant `Q` is not a parameter in release 1; the engine exports
 * it as the fixed `ACO_DEPOSIT_CONSTANT`.
 *
 * The UI admits 2–150 cities and 1–200 ants. The engine itself accepts one
 * city so edge-case tests can exercise a degenerate problem.
 */
export interface AcoParams {
  /** Number of cities in a generated layout. Structural; 1–150. */
  readonly cityCount: number;

  /** Number of ants per iteration. Structural; 1–200. */
  readonly antCount: number;

  /** Pheromone weight α. Structural; 0–5. */
  readonly alpha: number;

  /** Distance weight β. Structural; 0–10. */
  readonly beta: number;

  /** Evaporation rate ρ. Structural; 0–1. */
  readonly rho: number;

  /** Iterations per simulated second multiplier. Presentation only; >= 0. */
  readonly speed: number;

  /** Reproducible run identity. Structural. */
  readonly seed: Seed;
}

/**
 * One completed iteration in the convergence history.
 *
 * `bestLength` is the best tour found up to and including this iteration, so the
 * series is non-increasing. `meanLength` is the mean of this iteration's tours.
 * Both are in the same normalized problem units as {@link AcoSnapshot.bestLength}.
 */
export interface AcoHistoryPoint {
  /** Completed iteration number, starting at 1. */
  readonly iteration: number;

  /** Best tour length found so far at this iteration. */
  readonly bestLength: number;

  /** Mean tour length of this iteration. */
  readonly meanLength: number;
}

/**
 * A bounded, chronological best/mean history for the convergence chart.
 *
 * The engine retains at most `capacity` points (512 in release 1). The array is
 * stable and mutated in place: the convergence chart may hold the reference and
 * read it at UI frequency, but must not mutate it. Once the cap is reached the
 * oldest point is dropped, so `points[0]` is the oldest retained iteration and
 * `points[points.length - 1]` is the newest.
 */
export interface AcoHistory {
  /** Maximum retained points; fixed for the engine's lifetime. */
  readonly capacity: number;

  /** Chronological points, oldest first. Length is at most `capacity`. */
  readonly points: readonly AcoHistoryPoint[];
}

/**
 * Per-ant data for one rendered frame.
 *
 * The engine completes a whole tour per ant in one iteration. The renderer
 * animates that tour with {@link AcoSnapshot.iterationProgress}: tour position
 * is `iterationProgress × cityCount`, and the ant is interpolated between
 * consecutive cities, wrapping from the last city back to the first. No
 * sub-iteration simulation state is stored, so the same buffer serves the whole
 * interval and the engine allocates nothing per frame.
 *
 * `tour` is reused between iterations. Consumers must read it immediately and
 * must not mutate it. Before the first iteration, `visitedCount` is 0 and the
 * buffer contents are unspecified.
 */
export interface AcoAntSnapshot {
  /** Ant index, 0 to `antCount - 1`. */
  readonly index: number;

  /** City indices of the most recently completed tour; length is `cityCount`. */
  readonly tour: Int32Array;

  /** Length of `tour` in normalized problem units, including the return edge. */
  readonly tourLength: number;

  /** `cityCount` after a completed iteration; 0 before the first iteration. */
  readonly visitedCount: number;
}

/**
 * A cheap, reusable render view of the Ant System.
 *
 * The snapshot object and every array in it are shared buffers. Repeated calls
 * return the same object, and stepping or resetting mutates it in place:
 * **renderers must not retain or mutate any part of it**. Keeping the
 * references stable is what lets the renderer avoid copying the city graph and
 * the `n × n` pheromone matrix every frame.
 *
 * The only fields that are replaced rather than mutated are `bestTour` (a
 * frozen copy, replaced only when a strictly shorter tour is found),
 * `params`, and—on a structural change—`cities`, `distanceMatrix`,
 * `pheromone`, and `ants`.
 */
export interface AcoSnapshot {
  /** Completed iterations since the last reset; starts at 0. */
  readonly iteration: number;

  /** Current city count, equal to `cities.length`. */
  readonly cityCount: number;

  /** Current ant count, equal to `ants.length`. */
  readonly antCount: number;

  /** The problem's cities in index order. Stable for a fixed city set. */
  readonly cities: readonly City[];

  /** Precomputed symmetric distances. Stable for a fixed city set. */
  readonly distanceMatrix: Readonly<DistanceMatrix>;

  /**
   * Symmetric row-major `cityCount × cityCount` pheromone, `τ_ij` at
   * `i * cityCount + j`. The diagonal is zero because a self-edge is never an
   * edge. Values are non-negative and finite; with `ρ = 1` an unused edge may
   * be exactly zero, which the renderer maps to a minimum visible width.
   */
  readonly pheromone: Float64Array;

  /** One entry per ant, in ant index order. Stable for a fixed ant count. */
  readonly ants: readonly AcoAntSnapshot[];

  /** Best tour found since the last reset, or `null` before iteration 0 finishes. */
  readonly bestTour: readonly number[] | null;

  /** Length of `bestTour`, or `null`. Non-increasing since the last reset. */
  readonly bestLength: number | null;

  /** Mean of the most recent iteration's tour lengths, or `null` at iteration 0. */
  readonly meanLength: number | null;

  /** Normalized pheromone entropy in `[0, 1]`; see `docs/stories.md` §2.6. */
  readonly entropy: number;

  /**
   * Bounded best/mean history, one point per completed iteration.
   *
   * The history object and its `points` array are stable and updated in place,
   * so the convergence chart can read them without a per-frame copy. A reset or
   * structural parameter change clears the history.
   */
  readonly history: AcoHistory;

  /**
   * Simulated-time fraction accumulated toward the next iteration, in `[0, 1)`.
   * Presentation only. At 1 the engine has already run the iteration and the
   * fraction has wrapped.
   */
  readonly iterationProgress: number;

  /** Base iteration rate before the `speed` multiplier. */
  readonly iterationsPerSecond: number;

  /** Current presentation speed multiplier. */
  readonly speed: number;

  /** The full parameter object the run is using. Stable until `setParams`. */
  readonly params: AcoParams;
}

/**
 * Low-frequency values for the HUD and the polite live region.
 *
 * Unlike the snapshot, metrics are a fresh plain object and may allocate. The
 * story controller reads them on chapter entry, pause, replay, parameter
 * changes, and a slow milestone timer — never once per animation frame.
 */
export interface AcoMetrics {
  /** Completed iterations since the last reset. */
  readonly iteration: number;

  /** Best tour length since the last reset, or `null`. */
  readonly bestLength: number | null;

  /** Mean tour length of the most recent iteration, or `null`. */
  readonly meanLength: number | null;

  /** Normalized pheromone entropy in `[0, 1]`. */
  readonly entropy: number;

  /**
   * Fresh copy of the bounded best/mean history, oldest first.
   *
   * Metrics may allocate; callers should read this on chapter entry, pause,
   * replay, a parameter change, or a slow timer — never once per frame.
   */
  readonly history: readonly AcoHistoryPoint[];

  /** Colony size. */
  readonly antCount: number;

  /** Problem size. */
  readonly cityCount: number;

  /** Whole or fractional iterations waiting to run. */
  readonly pendingIterations: number;

  /** Whole iterations discarded by the backlog cap since the last reset. */
  readonly droppedIterations: number;

  /** True when the backlog cap discarded work since the last reset. */
  readonly degraded: boolean;
}
