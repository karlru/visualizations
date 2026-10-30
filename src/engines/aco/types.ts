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
