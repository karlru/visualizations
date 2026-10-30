import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createTspInstance,
  createTspInstanceFromCities,
  DISTANCE_EPSILON,
  nearestNeighborTour,
  tourLength,
  validateTour,
} from '../../src/engines/aco/tsp';
import type { City, Tour, TspInstance } from '../../src/engines/aco/types';

/**
 * The TSP model is the geometry contract the Ant System relies on. These tests
 * pin seeded layout determinism, distance symmetry and clamping, the implicit
 * return edge, tour validation reasons, and the greedy baseline. They are pure
 * and DOM-free, and all seeds are fixed.
 */

const SQUARE: readonly City[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function fromCities(cities: readonly City[], seed = 0): TspInstance {
  return createTspInstanceFromCities(cities, seed);
}

function matrixValues(instance: TspInstance): number[] {
  return Array.from(instance.distanceMatrix.data);
}

/** Assert that a tour is invalid and return the failure for inspection. */
function failure(instance: TspInstance, tour: Tour) {
  const result = validateTour(instance, tour);
  if (result.valid) {
    throw new Error('Expected the tour to be rejected');
  }
  return result;
}

describe('seeded city layout', () => {
  it('produces identical cities and distances for the same seed', () => {
    const first = createTspInstance(42, 30);
    const second = createTspInstance(42, 30);

    expect(first.cities).toEqual(second.cities);
    expect(matrixValues(first)).toEqual(matrixValues(second));
    expect(first.seed).toBe(42);
    expect(first.cityCount).toBe(30);
  });

  it('returns independent instances rather than shared frozen objects', () => {
    const first = createTspInstance(42, 10);
    const second = createTspInstance(42, 10);

    expect(first).not.toBe(second);
    expect(first.cities).not.toBe(second.cities);
    expect(first.distanceMatrix.data).not.toBe(second.distanceMatrix.data);
  });

  it('produces different layouts for different seeds', () => {
    expect(matrixValues(createTspInstance(1, 30))).not.toEqual(
      matrixValues(createTspInstance(2, 30)),
    );
  });

  it('keeps every generated coordinate inside the unit square', () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      for (const count of [1, 2, 3, 30, 150]) {
        const instance = createTspInstance(seed, count);
        expect(instance.cities).toHaveLength(count);

        for (const city of instance.cities) {
          expect(city.x).toBeGreaterThanOrEqual(0);
          expect(city.x).toBeLessThanOrEqual(1);
          expect(city.y).toBeGreaterThanOrEqual(0);
          expect(city.y).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('copies and freezes an explicit city list', () => {
    const input = [
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.7 },
    ];
    const instance = fromCities(input);

    input[0].x = 0.9;

    expect(instance.cities[0]).toEqual({ x: 0.2, y: 0.3 });
    expect(instance.cities[0]).not.toBe(input[0]);
    expect(Object.isFrozen(instance.cities)).toBe(true);
    expect(Object.isFrozen(instance.cities[0])).toBe(true);
    expect(Object.isFrozen(instance.distanceMatrix)).toBe(true);
  });

  it('normalizes the run-identity seed', () => {
    expect(createTspInstance(1.9, 2).seed).toBe(1);
    expect(createTspInstance(-1, 2).seed).toBe(4294967295);
    expect(fromCities(SQUARE, Number.NaN).seed).toBe(0);
  });

  it('rejects unusable city counts with a clear RangeError', () => {
    for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createTspInstance(42, count)).toThrow(RangeError);
    }
  });

  it('rejects an empty or out-of-bounds explicit city list', () => {
    expect(() => fromCities([])).toThrow(RangeError);
    expect(() => fromCities([{ x: -0.1, y: 0.5 }])).toThrow(RangeError);
    expect(() => fromCities([{ x: 0.5, y: 1.1 }])).toThrow(RangeError);
    expect(() => fromCities([{ x: Number.NaN, y: 0.5 }])).toThrow(RangeError);
    expect(() => fromCities([{ x: 0.5, y: Number.POSITIVE_INFINITY }])).toThrow(RangeError);
  });
});

describe('distance matrix', () => {
  it('is symmetric with a zero diagonal', () => {
    const instance = createTspInstance(42, 30);
    const { size } = instance.distanceMatrix;

    for (let from = 0; from < size; from += 1) {
      for (let to = 0; to < size; to += 1) {
        expect(instance.distanceMatrix.distance(from, to)).toBe(
          instance.distanceMatrix.distance(to, from),
        );
        if (from === to) {
          expect(instance.distanceMatrix.distance(from, to)).toBe(0);
        }
      }
    }
  });

  it('matches known Euclidean distances', () => {
    const instance = fromCities([
      { x: 0, y: 0 },
      { x: 0.6, y: 0.8 },
      { x: 0.25, y: 0 },
    ]);

    expect(instance.distanceMatrix.distance(0, 1)).toBeCloseTo(1, 12);
    expect(instance.distanceMatrix.distance(0, 2)).toBeCloseTo(0.25, 12);
    expect(instance.distanceMatrix.distance(1, 2)).toBeCloseTo(Math.hypot(0.35, 0.8), 12);
  });

  it('throws for non-integer or out-of-range accessor indices', () => {
    const instance = fromCities(SQUARE);

    expect(() => instance.distanceMatrix.distance(-1, 0)).toThrow(RangeError);
    expect(() => instance.distanceMatrix.distance(0, 4)).toThrow(RangeError);
    expect(() => instance.distanceMatrix.distance(0.5, 0)).toThrow(RangeError);
    expect(() => instance.distanceMatrix.distance(0, Number.NaN)).toThrow(RangeError);
  });

  it('clamps coincident cities to the documented epsilon', () => {
    const instance = fromCities([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);

    expect(instance.distanceMatrix.distance(0, 1)).toBe(DISTANCE_EPSILON);
    expect(instance.distanceMatrix.distance(0, 2)).toBe(1);
    expect(instance.distanceMatrix.distance(1, 2)).toBe(1);
  });

  it('clamps near-coincident cities that fall below the epsilon', () => {
    const instance = fromCities([
      { x: 0.5, y: 0.5 },
      { x: 0.5 + 1e-9, y: 0.5 },
    ]);

    expect(instance.distanceMatrix.distance(0, 1)).toBe(DISTANCE_EPSILON);
  });

  it('stays symmetric and bounded for arbitrary layouts', () => {
    const cityArb = fc
      .record({
        x: fc.integer({ min: 0, max: 100 }),
        y: fc.integer({ min: 0, max: 100 }),
      })
      .map(({ x, y }) => ({ x: x / 100, y: y / 100 }));

    fc.assert(
      fc.property(fc.array(cityArb, { minLength: 1, maxLength: 12 }), (cities) => {
        const instance = fromCities(cities);
        const { size } = instance.distanceMatrix;

        for (let from = 0; from < size; from += 1) {
          expect(instance.distanceMatrix.distance(from, from)).toBe(0);
          for (let to = 0; to < size; to += 1) {
            const distance = instance.distanceMatrix.distance(from, to);
            expect(Number.isFinite(distance)).toBe(true);
            expect(distance).toBe(instance.distanceMatrix.distance(to, from));
            if (from !== to) {
              expect(distance).toBeGreaterThanOrEqual(DISTANCE_EPSILON);
            }
          }
        }
      }),
      { numRuns: 80, seed: 20261030 },
    );
  });
});

describe('tour length', () => {
  it('includes the return edge', () => {
    const instance = fromCities(SQUARE);

    // Three unit edges around the square plus the closing edge would be 3
    // without the return; the contract is 4.
    expect(tourLength(instance, [0, 1, 2, 3])).toBeCloseTo(4, 12);
  });

  it('adds the closing edge on a non-square triangle', () => {
    const instance = fromCities([
      { x: 0, y: 0 },
      { x: 0.3, y: 0.4 },
      { x: 0.6, y: 0 },
    ]);

    // 0 → 1 = 0.5, 1 → 2 = 0.5, 2 → 0 = 0.6; the open path would be 1.
    expect(tourLength(instance, [0, 1, 2])).toBeCloseTo(1.6, 12);
  });

  it('is unchanged by rotation and reversal for symmetric distances', () => {
    const instance = createTspInstance(42, 20);
    const tour = nearestNeighborTour(instance);
    const expected = tourLength(instance, tour);

    for (let offset = 0; offset < tour.length; offset += 1) {
      const rotated = [...tour.slice(offset), ...tour.slice(0, offset)];
      expect(tourLength(instance, rotated)).toBeCloseTo(expected, 12);
    }

    const reversed = [...tour].reverse();
    expect(tourLength(instance, reversed)).toBeCloseTo(expected, 12);
  });

  it('handles one and two cities without crashing', () => {
    const one = createTspInstance(42, 1);
    expect(one.distanceMatrix.distance(0, 0)).toBe(0);
    expect(tourLength(one, [0])).toBe(0);

    const two = fromCities([
      { x: 0, y: 0 },
      { x: 0.25, y: 0 },
    ]);
    expect(two.distanceMatrix.distance(0, 1)).toBe(0.25);
    expect(tourLength(two, [0, 1])).toBeCloseTo(0.5, 12);
    expect(tourLength(two, [1, 0])).toBeCloseTo(0.5, 12);
  });

  it('rejects invalid tours instead of returning a meaningless number', () => {
    const instance = fromCities(SQUARE);

    expect(() => tourLength(instance, [0, 1, 2])).toThrow(RangeError);
    expect(() => tourLength(instance, [0, 1, 1, 3])).toThrow(RangeError);
    expect(() => tourLength(instance, [0, 1, 2, 4])).toThrow(RangeError);
  });
});

describe('tour validation', () => {
  it('accepts every permutation of the city set', () => {
    const instance = fromCities(SQUARE);

    for (const tour of [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
    ]) {
      expect(validateTour(instance, tour)).toEqual({ valid: true });
    }
  });

  it('rejects a tour that misses a city as a wrong length', () => {
    const result = failure(fromCities(SQUARE), [0, 1, 2]);

    expect(result.code).toBe('wrong-length');
    expect(result.message).toContain('expected exactly 4');
    if (result.code === 'wrong-length') {
      expect(result.expected).toBe(4);
      expect(result.actual).toBe(3);
    }
  });

  it('rejects empty and over-long tours as a wrong length', () => {
    const instance = fromCities(SQUARE);

    expect(failure(instance, []).code).toBe('wrong-length');
    expect(failure(instance, [0, 1, 2, 3, 0]).code).toBe('wrong-length');
  });

  it('rejects a city visited twice and names the city and position', () => {
    const result = failure(fromCities(SQUARE), [0, 1, 1, 2]);

    expect(result.code).toBe('duplicate-city');
    expect(result.message).toContain('revisits city 1');
    if (result.code === 'duplicate-city') {
      expect(result.city).toBe(1);
      expect(result.position).toBe(2);
    }
  });

  it('rejects out-of-range and non-integer city indices', () => {
    const instance = fromCities(SQUARE);

    for (const [tour, city, position] of [
      [[0, 1, 2, 4], 4, 3],
      [[-1, 1, 2, 3], -1, 0],
      [[0, 1, 2, 3.5], 3.5, 3],
    ] as const) {
      const result = failure(instance, tour);
      expect(result.code).toBe('out-of-range');
      expect(result.message).toContain(`position ${position}`);
      expect(result.message).toContain(`[0, ${instance.cityCount - 1}]`);
      if (result.code === 'out-of-range') {
        expect(result.city).toBe(city);
        expect(result.position).toBe(position);
      }
    }
  });

  it('validates one-city and two-city tours', () => {
    const one = createTspInstance(42, 1);
    expect(validateTour(one, [0])).toEqual({ valid: true });
    expect(failure(one, []).code).toBe('wrong-length');
    expect(failure(one, [1]).code).toBe('out-of-range');

    const two = createTspInstance(42, 2);
    expect(validateTour(two, [0, 1])).toEqual({ valid: true });
    expect(validateTour(two, [1, 0])).toEqual({ valid: true });
    expect(failure(two, [0, 0]).code).toBe('duplicate-city');
  });

  it('agrees with a reference permutation check for arbitrary tours', () => {
    const instance = createTspInstance(9, 5);

    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -2, max: 6 }), { minLength: 0, maxLength: 7 }),
        (tour) => {
          const expected =
            tour.length === 5 &&
            new Set(tour).size === 5 &&
            tour.every((city) => city >= 0 && city < 5);

          expect(validateTour(instance, tour).valid).toBe(expected);
        },
      ),
      { numRuns: 200, seed: 20261030 },
    );
  });
});

describe('nearest-neighbor tour', () => {
  it('follows the closest unvisited city at every step', () => {
    const instance = fromCities([
      { x: 0, y: 0 },
      { x: 0.9, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0.2, y: 0 },
    ]);

    expect(nearestNeighborTour(instance)).toEqual([0, 2, 3, 1]);
  });

  it('breaks equal-distance ties toward the lower city index', () => {
    const instance = fromCities([
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0, y: 0.1 },
    ]);

    expect(nearestNeighborTour(instance, 0)).toEqual([0, 1, 2]);
  });

  it('honors the requested start city', () => {
    const instance = fromCities([
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0, y: 0.1 },
    ]);

    expect(nearestNeighborTour(instance, 1)).toEqual([1, 0, 2]);
  });

  it('handles one and two cities', () => {
    expect(nearestNeighborTour(createTspInstance(42, 1))).toEqual([0]);

    const two = createTspInstance(42, 2);
    expect(nearestNeighborTour(two)).toEqual([0, 1]);
    expect(nearestNeighborTour(two, 1)).toEqual([1, 0]);
  });

  it('always returns a valid frozen tour with a finite length', () => {
    for (const count of [1, 2, 3, 5, 10, 30]) {
      for (const seed of [0, 1, 42, 4294967295]) {
        const instance = createTspInstance(seed, count);
        const tour = nearestNeighborTour(instance);

        expect(validateTour(instance, tour)).toEqual({ valid: true });
        expect(Object.isFrozen(tour)).toBe(true);
        expect(Number.isFinite(tourLength(instance, tour))).toBe(true);
        expect(tourLength(instance, tour)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('does not depend on the instance seed for a fixed city set', () => {
    expect(nearestNeighborTour(fromCities(SQUARE, 1))).toEqual(
      nearestNeighborTour(fromCities(SQUARE, 2)),
    );
  });

  it('picks a closest unvisited city for arbitrary layouts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 1, max: 8 }),
        (seed, count) => {
          const instance = createTspInstance(seed, count);
          const start = seed % count;
          const tour = nearestNeighborTour(instance, start);

          expect(tour[0]).toBe(start);
          const visited = new Set<number>([start]);

          for (let position = 1; position < tour.length; position += 1) {
            const previous = tour[position - 1];
            const chosen = tour[position];

            let nearest = Number.POSITIVE_INFINITY;
            for (let candidate = 0; candidate < count; candidate += 1) {
              if (visited.has(candidate)) {
                continue;
              }
              nearest = Math.min(nearest, instance.distanceMatrix.distance(previous, candidate));
            }

            expect(instance.distanceMatrix.distance(previous, chosen)).toBe(nearest);
            visited.add(chosen);
          }
        },
      ),
      { numRuns: 100, seed: 20261030 },
    );
  });

  it('rejects an invalid start city', () => {
    const instance = fromCities(SQUARE);

    expect(() => nearestNeighborTour(instance, -1)).toThrow(RangeError);
    expect(() => nearestNeighborTour(instance, 4)).toThrow(RangeError);
    expect(() => nearestNeighborTour(instance, 0.5)).toThrow(RangeError);
  });
});

describe('coincident cities', () => {
  it('keeps a two-city coincident instance finite and measurable', () => {
    const instance = fromCities([
      { x: 0.3, y: 0.7 },
      { x: 0.3, y: 0.7 },
    ]);
    const tour = nearestNeighborTour(instance);
    const length = tourLength(instance, tour);

    expect(instance.distanceMatrix.distance(0, 1)).toBe(DISTANCE_EPSILON);
    expect(validateTour(instance, tour)).toEqual({ valid: true });
    expect(Number.isFinite(length)).toBe(true);
    expect(length).toBeCloseTo(2 * DISTANCE_EPSILON, 18);
  });

  it('keeps an all-coincident instance finite with no NaN or Infinity', () => {
    const point = { x: 0.5, y: 0.5 };
    const instance = fromCities([point, point, point, point]);

    for (const value of instance.distanceMatrix.data) {
      expect(Number.isFinite(value)).toBe(true);
    }

    const length = tourLength(instance, [0, 1, 2, 3]);
    expect(Number.isFinite(length)).toBe(true);
    expect(length).toBeCloseTo(4 * DISTANCE_EPSILON, 18);
  });

  it('keeps a one-city instance finite', () => {
    const instance = createTspInstance(42, 1);

    for (const value of instance.distanceMatrix.data) {
      expect(Number.isFinite(value)).toBe(true);
    }

    expect(tourLength(instance, [0])).toBe(0);
  });
});
