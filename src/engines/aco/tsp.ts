/**
 * Traveling salesman problem construction and geometry.
 *
 * The model is deliberately small and deterministic. A city set is either
 * generated from a seed or supplied explicitly (the lab's editable map), and
 * both paths produce the same immutable {@link TspInstance}. Distances are
 * Euclidean in the normalized unit square and are precomputed once, because
 * the Ant System evaluates them for every candidate next city.
 *
 * This module imports only `src/engines/core/**`; it has no DOM, renderer, or
 * story dependency.
 */

import { normalizeSeed, SeededRandom } from '../core/rng';
import type { Seed } from '../core/types';
import type { City, DistanceMatrix, Tour, TourValidation, TspInstance } from './types';

/**
 * Smallest permitted off-diagonal distance.
 *
 * Coincident (and near-coincident) cities are clamped to this value. The
 * distance heuristic in Step 2.2 is `η = 1 / d`, so a zero distance would
 * produce `Infinity` and then `NaN` in a normalized transition probability.
 * With `1e-6`, `η` is at most `1e6`, which stays finite even after raising it
 * to the maximum `β` of 10. The clamp is far below the smallest visible gap in
 * a 150-city layout, so it never changes a meaningful tour comparison.
 */
export const DISTANCE_EPSILON = 1e-6;

/** Validate one coordinate pair and copy it into a frozen city. */
function copyCity(city: City, index: number): City {
  if (!Number.isFinite(city.x) || !Number.isFinite(city.y)) {
    throw new RangeError(`city[${index}] coordinates must be finite numbers`);
  }
  if (city.x < 0 || city.x > 1 || city.y < 0 || city.y > 1) {
    throw new RangeError(
      `city[${index}] must lie inside the normalized unit square [0, 1] × [0, 1]`,
    );
  }
  return Object.freeze({ x: city.x, y: city.y });
}

/** Throw a precise error when a distance index is not a city index. */
function assertCityIndex(index: number, size: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    throw new RangeError(`${label} must be an integer city index in [0, ${size - 1}]`);
  }
}

/**
 * Build the symmetric row-major distance matrix.
 *
 * The diagonal stays zero because a city is never adjacent to itself in a
 * tour. Every distinct pair is stored twice, which makes the matrix symmetric
 * by construction and lets the renderer and engine read either direction.
 */
function buildDistanceMatrix(cities: readonly City[]): DistanceMatrix {
  const size = cities.length;
  const data = new Float64Array(size * size);

  for (let from = 0; from < size; from += 1) {
    const a = cities[from];
    for (let to = from + 1; to < size; to += 1) {
      const b = cities[to];
      const raw = Math.hypot(a.x - b.x, a.y - b.y);
      const distance = Math.max(raw, DISTANCE_EPSILON);
      data[from * size + to] = distance;
      data[to * size + from] = distance;
    }
  }

  const matrix: DistanceMatrix = {
    size,
    data,
    distance(from, to) {
      assertCityIndex(from, size, 'from');
      assertCityIndex(to, size, 'to');
      return data[from * size + to];
    },
  };

  return Object.freeze(matrix);
}

/**
 * Build an instance from an explicit city list.
 *
 * This is the path for the lab's dragged, added, and removed cities (Step
 * 3.5). The list order is the city identity and the input objects are copied,
 * so later pointer edits cannot mutate an instance that is already in use.
 *
 * @param cities One or more cities in the normalized unit square. An empty list
 *   throws rather than constructing a degenerate zero-city problem.
 * @param seed Run-identity seed. It does not affect coordinates here; it is
 *   retained so a share URL can reproduce the run's provenance.
 * @throws RangeError for an empty list, non-finite coordinates, or coordinates
 *   outside `[0, 1]`.
 */
export function createTspInstanceFromCities(cities: readonly City[], seed: Seed = 0): TspInstance {
  if (cities.length === 0) {
    throw new RangeError('A TSP instance requires at least one city');
  }

  const frozenCities = Object.freeze(cities.map(copyCity));

  return Object.freeze({
    seed: normalizeSeed(seed),
    cityCount: frozenCities.length,
    cities: frozenCities,
    distanceMatrix: buildDistanceMatrix(frozenCities),
  });
}

/**
 * Generate a seeded layout in the normalized unit square.
 *
 * Each city consumes two consecutive `SeededRandom` floats: `x`, then `y`.
 * Same seed and count always produce the same cities and the same matrix;
 * different seeds produce different layouts in practice. One and two cities
 * are valid. Zero, negative, fractional, and non-finite counts throw because
 * they cannot describe a problem.
 *
 * @throws RangeError if `cityCount` is not a safe integer greater than zero.
 */
export function createTspInstance(seed: Seed, cityCount: number): TspInstance {
  if (!Number.isSafeInteger(cityCount) || cityCount < 1) {
    throw new RangeError(`cityCount must be a safe integer >= 1; received ${cityCount}`);
  }

  const rng = new SeededRandom(seed);
  const cities: City[] = [];
  for (let index = 0; index < cityCount; index += 1) {
    cities.push(Object.freeze({ x: rng.randomFloat(), y: rng.randomFloat() }));
  }

  return createTspInstanceFromCities(cities, rng.seed);
}

/** The single shared success result; valid tours need no per-call allocation. */
const VALID_TOUR: TourValidation = Object.freeze({ valid: true });

/**
 * Check that a tour visits every city exactly once.
 *
 * A missing city almost always shows up as a wrong length, because a valid
 * tour of `n` cities has exactly `n` entries. With the length correct,
 * revisiting a city necessarily means another city is missing, so the
 * duplicate check is the missing-city check.
 *
 * Validation failures are returned, not thrown. The reason codes
 * (`wrong-length`, `out-of-range`, `duplicate-city`) let the UI and tests react
 * without parsing prose, while `message` is ready to display.
 *
 * @param instance The problem the tour belongs to.
 * @param tour City indices in visit order; the return edge is implicit.
 */
export function validateTour(instance: TspInstance, tour: Tour): TourValidation {
  const cityCount = instance.cityCount;

  if (tour.length !== cityCount) {
    return {
      valid: false,
      code: 'wrong-length',
      expected: cityCount,
      actual: tour.length,
      message: `Tour has ${tour.length} cities; expected exactly ${cityCount}.`,
    };
  }

  for (let position = 0; position < tour.length; position += 1) {
    const city = tour[position];
    if (!Number.isInteger(city) || city < 0 || city >= cityCount) {
      return {
        valid: false,
        code: 'out-of-range',
        position,
        city,
        message: `Tour position ${position} must be an integer city index in [0, ${cityCount - 1}].`,
      };
    }
  }

  const seen = new Uint8Array(cityCount);
  for (let position = 0; position < tour.length; position += 1) {
    const city = tour[position];
    if (seen[city] === 1) {
      return {
        valid: false,
        code: 'duplicate-city',
        position,
        city,
        message: `Tour position ${position} revisits city ${city}.`,
      };
    }
    seen[city] = 1;
  }

  return VALID_TOUR;
}

/**
 * Total Euclidean length of a tour, including the edge back to the start.
 *
 * The return edge is added once at the end; it is never stored in the tour.
 * A one-city tour has no edges and therefore length zero. The matrix is read
 * row-major for speed.
 *
 * @throws RangeError if the tour is invalid. Call {@link validateTour} first
 *   when invalid input is normal (for example, a tour parsed from user input).
 */
export function tourLength(instance: TspInstance, tour: Tour): number {
  const validation = validateTour(instance, tour);
  if (!validation.valid) {
    throw new RangeError(`Cannot measure an invalid tour: ${validation.message}`);
  }

  const size = instance.cityCount;
  if (size < 2) {
    return 0;
  }

  const { data } = instance.distanceMatrix;
  let total = 0;
  let previous = tour[0];
  for (let position = 1; position < size; position += 1) {
    const city = tour[position];
    total += data[previous * size + city];
    previous = city;
  }

  return total + data[previous * size + tour[0]];
}

/**
 * Build a deterministic nearest-neighbor tour.
 *
 * Starting at `startCity`, each step moves to the closest unvisited city. Ties
 * are broken by the lower city index because candidates are scanned in
 * ascending order with a strict comparison. The baseline is the greedy result
 * the story compares against the colony; it consumes no random numbers and is
 * not affected by the instance seed.
 *
 * Complexity is `O(n²)` and the returned tour is frozen.
 *
 * @param startCity First city, an integer in `[0, cityCount - 1]`. Defaults to
 *   city `0`.
 * @throws RangeError if `startCity` is not a valid city index.
 */
export function nearestNeighborTour(instance: TspInstance, startCity = 0): Tour {
  const size = instance.cityCount;
  assertCityIndex(startCity, size, 'startCity');

  const { data } = instance.distanceMatrix;
  const visited = new Uint8Array(size);
  const tour = new Array<number>(size);

  let current = startCity;
  visited[current] = 1;
  tour[0] = current;

  for (let position = 1; position < size; position += 1) {
    const rowOffset = current * size;
    let nextCity = -1;
    let nextDistance = Number.POSITIVE_INFINITY;

    for (let candidate = 0; candidate < size; candidate += 1) {
      if (visited[candidate] === 1) {
        continue;
      }
      const distance = data[rowOffset + candidate];
      if (distance < nextDistance) {
        nextDistance = distance;
        nextCity = candidate;
      }
    }

    current = nextCity;
    visited[current] = 1;
    tour[position] = current;
  }

  return Object.freeze(tour);
}
