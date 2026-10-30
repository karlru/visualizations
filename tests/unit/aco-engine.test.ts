import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ACO_DEPOSIT_CONSTANT,
  ACO_LIMITS,
  AcoEngine,
  BASE_ITERATIONS_PER_SECOND,
  buildTransitionWeights,
  INITIAL_PHEROMONE,
  MAX_ITERATIONS_PER_STEP,
  MAX_PENDING_ITERATIONS,
  normalizedPheromoneEntropy,
  transitionProbabilities,
} from '../../src/engines/aco/engine';
import { ACO_PRESETS } from '../../src/engines/aco/presets';
import {
  createTspInstance,
  createTspInstanceFromCities,
  tourLength,
  validateTour,
} from '../../src/engines/aco/tsp';
import type { AcoParams } from '../../src/engines/aco/types';

/**
 * Ant System engine tests for the Step 2.2 contract.
 *
 * These tests are deliberately focused on the engine: tour validity,
 * normalized transition probabilities, the uniform fallback, pheromone bounds
 * (including rho = 1), best-length monotonicity, the entropy formula, run
 * determinism, structural-versus-presentation resets, snapshot reuse, and the
 * fixed-step iteration budget. Step 2.3 expands the property, invariants, and
 * edge-case matrix; every seed here is fixed so the file is fast and
 * repeatable.
 *
 * ACO invariant matrix from `docs/requirements.md` §4.1 (test names below):
 *
 * | Invariant | Test |
 * |---|---|
 * | ACO-INV-01 | `ACO-INV-01: constructs a permutation tour and closes it for arbitrary layouts` |
 * | ACO-INV-02 | `ACO-INV-02: transition probabilities are non-negative and sum to 1` |
 * | ACO-INV-03 | `ACO-INV-03: pheromone stays non-negative and finite for all valid parameters` |
 * | ACO-INV-04 | `ACO-INV-04: rho = 1 clears every unused edge before deposit` |
 * | ACO-INV-05 | `ACO-INV-05: a fixed run identity reproduces tours, pheromone, and metrics` |
 * | ACO-INV-06 | `ACO-INV-06: the best length never increases and the best tour is retained` |
 * | ACO-INV-07 | `ACO-INV-07: coincident cities and zero weights stay finite with a uniform fallback` |
 * | ACO-INV-08 | `ACO-INV-08: entropy is 1 for uniform pheromone and 0 for a single edge` |
 */

const DEFAULTS: AcoParams = {
  cityCount: 30,
  antCount: 40,
  alpha: 1,
  beta: 2,
  rho: 0.5,
  speed: 1,
  seed: 42,
};

function params(overrides: Partial<AcoParams> = {}): AcoParams {
  return { ...DEFAULTS, ...overrides };
}

function engineWith(overrides: Partial<AcoParams> = {}): AcoEngine {
  return new AcoEngine(params(overrides));
}

function run(engine: AcoEngine, iterations: number): AcoEngine {
  for (let index = 0; index < iterations; index += 1) {
    engine.stepIteration();
  }
  return engine;
}

function instanceFor(overrides: Partial<AcoParams> = {}) {
  const value = params(overrides);
  return createTspInstance(value.seed, value.cityCount);
}

function allowedMask(size: number, blocked: readonly number[] = []): Uint8Array {
  const mask = new Uint8Array(size);
  mask.fill(1);
  for (const city of blocked) {
    mask[city] = 0;
  }
  return mask;
}

function uniformPheromone(size: number, value = 1): Float64Array {
  const matrix = new Float64Array(size * size);
  for (let from = 0; from < size; from += 1) {
    for (let to = 0; to < size; to += 1) {
      if (from !== to) {
        matrix[from * size + to] = value;
      }
    }
  }
  return matrix;
}

function assertFinitePheromone(engine: AcoEngine): void {
  for (const value of engine.snapshot().pheromone) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
}

function assertValidTours(engine: AcoEngine, instance = instanceFor()): void {
  for (const ant of engine.snapshot().ants) {
    const tour = Array.from(ant.tour);
    expect(validateTour(instance, tour)).toEqual({ valid: true });
    expect(ant.visitedCount).toBe(instance.cityCount);
    expect(Number.isFinite(ant.tourLength)).toBe(true);
    expect(ant.tourLength).toBeCloseTo(tourLength(instance, tour), 12);
  }
}

function tourList(engine: AcoEngine): number[][] {
  return engine.snapshot().ants.map((ant) => Array.from(ant.tour));
}

/** Both directed keys for every undirected edge in a closed tour. */
function usedEdgeSet(tour: readonly number[], size: number): Set<number> {
  const used = new Set<number>();
  for (let position = 0; position < tour.length; position += 1) {
    const from = tour[position];
    const to = tour[(position + 1) % tour.length];
    used.add(from * size + to);
    used.add(to * size + from);
  }
  return used;
}

describe('parameters, constants, and presets', () => {
  it('fixes Q at 1 and starts from a small positive pheromone', () => {
    expect(ACO_DEPOSIT_CONSTANT).toBe(1);
    expect(INITIAL_PHEROMONE).toBeGreaterThan(0);
    expect(Number.isFinite(INITIAL_PHEROMONE)).toBe(true);
    expect(BASE_ITERATIONS_PER_SECOND).toBeGreaterThan(0);
    expect(MAX_ITERATIONS_PER_STEP).toBeGreaterThanOrEqual(1);
    expect(MAX_PENDING_ITERATIONS).toBeGreaterThanOrEqual(MAX_ITERATIONS_PER_STEP);
  });

  it('publishes the documented preset values from docs/stories.md §2.5', () => {
    expect(ACO_PRESETS.map((preset) => preset.id)).toEqual([
      'balanced',
      'greedy',
      'stagnant',
      'forgetful',
    ]);

    const expected = {
      balanced: { alpha: 1, beta: 2, rho: 0.5 },
      greedy: { alpha: 0.5, beta: 8, rho: 0.5 },
      stagnant: { alpha: 5, beta: 1, rho: 0.1 },
      forgetful: { alpha: 1, beta: 2, rho: 0.95 },
    };

    for (const preset of ACO_PRESETS) {
      expect(preset.patch).toEqual(expected[preset.id]);
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it('rejects parameters outside the documented engine ranges', () => {
    expect(() => engineWith({ cityCount: 0 })).toThrow(RangeError);
    expect(() => engineWith({ cityCount: ACO_LIMITS.cityCount.max + 1 })).toThrow(RangeError);
    expect(() => engineWith({ antCount: 0 })).toThrow(RangeError);
    expect(() => engineWith({ antCount: ACO_LIMITS.antCount.max + 1 })).toThrow(RangeError);
    expect(() => engineWith({ alpha: -0.1 })).toThrow(RangeError);
    expect(() => engineWith({ alpha: 5.1 })).toThrow(RangeError);
    expect(() => engineWith({ beta: -0.1 })).toThrow(RangeError);
    expect(() => engineWith({ beta: 10.1 })).toThrow(RangeError);
    expect(() => engineWith({ rho: -0.1 })).toThrow(RangeError);
    expect(() => engineWith({ rho: 1.1 })).toThrow(RangeError);
  });

  it('normalizes the seed and sanitizes presentation speed', () => {
    const engine = engineWith({ seed: 1.9, speed: Number.NaN });
    expect(engine.snapshot().params.seed).toBe(1);
    expect(engine.snapshot().speed).toBe(1);

    const paused = engineWith({ speed: -2 });
    expect(paused.snapshot().speed).toBe(0);
  });
});

describe('initialization', () => {
  it('starts at iteration 0 with uniform pheromone and no history', () => {
    const engine = engineWith();
    const snapshot = engine.snapshot();

    expect(snapshot.iteration).toBe(0);
    expect(snapshot.bestTour).toBeNull();
    expect(snapshot.bestLength).toBeNull();
    expect(snapshot.meanLength).toBeNull();
    expect(snapshot.entropy).toBe(1);
    expect(snapshot.iterationProgress).toBe(0);
    expect(snapshot.iterationsPerSecond).toBe(BASE_ITERATIONS_PER_SECOND);

    const size = snapshot.cityCount;
    for (let from = 0; from < size; from += 1) {
      for (let to = 0; to < size; to += 1) {
        const value = snapshot.pheromone[from * size + to];
        if (from === to) {
          expect(value).toBe(0);
        } else {
          expect(value).toBe(INITIAL_PHEROMONE);
        }
      }
    }
  });

  it('handles the one-city initialization without NaN or Infinity', () => {
    const engine = engineWith({ cityCount: 1 });
    const snapshot = engine.snapshot();

    expect(snapshot.cityCount).toBe(1);
    expect(snapshot.pheromone).toHaveLength(1);
    expect(snapshot.pheromone[0]).toBe(0);
    expect(snapshot.entropy).toBe(1);
    expect(snapshot.bestLength).toBeNull();
  });
});

describe('transition probabilities', () => {
  it('normalizes over the allowed cities and lists them in ascending order', () => {
    const instance = instanceFor({ cityCount: 6 });
    const size = instance.cityCount;
    const pheromone = uniformPheromone(size);
    const allowed = allowedMask(size, [2, 4]);
    const result = transitionProbabilities(instance, pheromone, 1, allowed, 1, 2);

    expect(result.count).toBe(3);
    expect(Array.from(result.cities.slice(0, result.count))).toEqual([0, 3, 5]);
    expect(result.uniform).toBe(false);

    let sum = 0;
    for (let index = 0; index < result.count; index += 1) {
      const probability = result.probabilities[index];
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(probability)).toBe(true);
      sum += probability;
    }
    expect(sum).toBeCloseTo(1, 12);
  });

  it('falls back to a uniform distribution when every weight is zero', () => {
    const instance = instanceFor({ cityCount: 5 });
    const size = instance.cityCount;
    const pheromone = new Float64Array(size * size);
    const allowed = allowedMask(size);
    const result = transitionProbabilities(instance, pheromone, 2, allowed, 1, 2);

    expect(result.uniform).toBe(true);
    expect(result.count).toBe(4);

    let sum = 0;
    for (let index = 0; index < result.count; index += 1) {
      expect(result.probabilities[index]).toBeCloseTo(1 / 4, 12);
      sum += result.probabilities[index];
    }
    expect(sum).toBeCloseTo(1, 12);
  });

  it('falls back to a uniform distribution when a weight is not finite', () => {
    const instance = instanceFor({ cityCount: 4 });
    const size = instance.cityCount;
    const pheromone = uniformPheromone(size);
    const weights = new Float64Array(size * size);
    weights.fill(Number.POSITIVE_INFINITY);
    const result = transitionProbabilities(instance, pheromone, 0, allowedMask(size), 1, 2, {
      weights,
    });

    expect(result.uniform).toBe(true);
    for (let index = 0; index < result.count; index += 1) {
      expect(Number.isFinite(result.probabilities[index])).toBe(true);
    }
  });

  it('returns no candidates when the allowed set excludes every other city', () => {
    const instance = instanceFor({ cityCount: 3 });
    const allowed = new Uint8Array(instance.cityCount);
    const result = transitionProbabilities(
      instance,
      uniformPheromone(instance.cityCount),
      1,
      allowed,
      1,
      2,
    );

    expect(result.count).toBe(0);
    expect(result.uniform).toBe(false);
  });

  it('ignores pheromone when alpha is zero', () => {
    const instance = instanceFor({ cityCount: 6 });
    const size = instance.cityCount;
    const first = transitionProbabilities(
      instance,
      uniformPheromone(size, 0.1),
      0,
      allowedMask(size),
      0,
      2,
    );
    const second = transitionProbabilities(
      instance,
      uniformPheromone(size, 1000),
      0,
      allowedMask(size),
      0,
      2,
    );

    expect(Array.from(first.probabilities.slice(0, first.count))).toEqual(
      Array.from(second.probabilities.slice(0, second.count)),
    );
  });

  it('ignores distance when beta is zero on uniform pheromone', () => {
    const instance = instanceFor({ cityCount: 6 });
    const result = transitionProbabilities(
      instance,
      uniformPheromone(instance.cityCount),
      0,
      allowedMask(instance.cityCount),
      1,
      0,
    );

    for (let index = 0; index < result.count; index += 1) {
      expect(result.probabilities[index]).toBeCloseTo(1 / result.count, 12);
    }
  });

  it('matches the default computation when handed precomputed weights', () => {
    const instance = instanceFor({ cityCount: 8 });
    const size = instance.cityCount;
    const pheromone = uniformPheromone(size, 0.3);
    const weights = buildTransitionWeights(instance, pheromone, 1.5, 2.5);
    const allowed = allowedMask(size, [3]);

    const direct = transitionProbabilities(instance, pheromone, 2, allowed, 1.5, 2.5);
    const cached = transitionProbabilities(instance, pheromone, 2, allowed, 1.5, 2.5, {
      weights,
    });

    expect(Array.from(cached.cities.slice(0, cached.count))).toEqual(
      Array.from(direct.cities.slice(0, direct.count)),
    );
    expect(Array.from(cached.probabilities.slice(0, cached.count))).toEqual(
      Array.from(direct.probabilities.slice(0, direct.count)),
    );
  });

  it('returns finite non-negative probabilities that sum to one for arbitrary data', () => {
    const instance = instanceFor({ cityCount: 5 });
    const size = instance.cityCount;

    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 100, noNaN: true }), {
          minLength: size * size,
          maxLength: size * size,
        }),
        fc.integer({ min: 0, max: size - 1 }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (values, current, alpha, beta) => {
          const pheromone = Float64Array.from(values);
          for (let city = 0; city < size; city += 1) {
            pheromone[city * size + city] = 0;
          }
          const result = transitionProbabilities(
            instance,
            pheromone,
            current,
            allowedMask(size),
            alpha,
            beta,
          );

          expect(result.count).toBe(size - 1);
          let sum = 0;
          for (let index = 0; index < result.count; index += 1) {
            expect(Number.isFinite(result.probabilities[index])).toBe(true);
            expect(result.probabilities[index]).toBeGreaterThanOrEqual(0);
            sum += result.probabilities[index];
          }
          expect(sum).toBeCloseTo(1, 12);
        },
      ),
      { numRuns: 60, seed: 20261030 },
    );
  });
});

describe('tour construction and pheromone update', () => {
  it('constructs one valid tour per ant and records its exact length', () => {
    for (const overrides of [
      {},
      { cityCount: 2, antCount: 1 },
      { cityCount: 5, antCount: 3 },
      { cityCount: 30, antCount: 40 },
      { antCount: 1 },
    ]) {
      const engine = run(engineWith(overrides), 2);
      assertValidTours(engine, instanceFor(overrides));
    }
  });

  it('applies evaporation and deposits proportional to inverse tour length', () => {
    const settings = params({ cityCount: 12, antCount: 6, rho: 0.5 });
    const engine = run(new AcoEngine(settings), 1);
    const snapshot = engine.snapshot();
    const size = snapshot.cityCount;

    const expected = uniformPheromone(size, (1 - settings.rho) * INITIAL_PHEROMONE);
    for (const ant of snapshot.ants) {
      const deposit = ACO_DEPOSIT_CONSTANT / ant.tourLength;
      for (let position = 0; position < size; position += 1) {
        const from = ant.tour[position];
        const to = ant.tour[(position + 1) % size];
        expected[from * size + to] += deposit;
        expected[to * size + from] += deposit;
      }
    }

    for (let from = 0; from < size; from += 1) {
      for (let to = 0; to < size; to += 1) {
        expect(snapshot.pheromone[from * size + to]).toBeCloseTo(expected[from * size + to], 12);
      }
    }
  });

  it('keeps pheromone symmetric, non-negative, and finite including rho = 1', () => {
    const settings = params({ cityCount: 12, antCount: 3, rho: 1 });
    const engine = run(new AcoEngine(settings), 3);
    const snapshot = engine.snapshot();
    const size = snapshot.cityCount;

    assertFinitePheromone(engine);
    for (let from = 0; from < size; from += 1) {
      for (let to = 0; to < size; to += 1) {
        expect(snapshot.pheromone[from * size + to]).toBe(snapshot.pheromone[to * size + from]);
      }
    }

    // With three ants on twelve cities many edges are unused, so full
    // evaporation must leave them at exactly zero.
    let zeroEdges = 0;
    for (let from = 0; from < size; from += 1) {
      for (let to = from + 1; to < size; to += 1) {
        if (snapshot.pheromone[from * size + to] === 0) {
          zeroEdges += 1;
        }
      }
    }
    expect(zeroEdges).toBeGreaterThan(0);

    // The next iteration must still construct valid tours from zeroed edges.
    engine.stepIteration();
    assertValidTours(engine, instanceFor(settings));
    assertFinitePheromone(engine);
  });

  it('stays finite and valid across repeated evaporating updates', () => {
    for (const overrides of [
      { rho: 0 },
      { rho: 0.5 },
      { rho: 0.95 },
      { rho: 1 },
      { alpha: 0, beta: 10 },
      { alpha: 5, beta: 0 },
      { alpha: 0, beta: 0 },
    ]) {
      const engine = run(engineWith(overrides), 20);
      assertFinitePheromone(engine);
      assertValidTours(engine, instanceFor(overrides));
    }
  });
});
describe('entropy metric', () => {
  it('is 1 for uniform pheromone and 1 for a zero total', () => {
    const instance = createTspInstance(1, 4);
    const size = instance.cityCount;

    expect(normalizedPheromoneEntropy(instance, uniformPheromone(size, 0.7))).toBeCloseTo(1, 12);
    expect(normalizedPheromoneEntropy(instance, new Float64Array(size * size))).toBe(1);
  });

  it('is 0 when all pheromone mass sits on one edge', () => {
    const instance = createTspInstance(1, 4);
    const size = instance.cityCount;
    const pheromone = new Float64Array(size * size);
    pheromone[0 * size + 1] = 5;
    pheromone[1 * size + 0] = 5;

    expect(normalizedPheromoneEntropy(instance, pheromone)).toBeCloseTo(0, 12);
  });

  it('matches the known three-edge distribution', () => {
    const instance = createTspInstance(1, 3);
    const size = instance.cityCount;
    const pheromone = new Float64Array(size * size);
    pheromone[0 * size + 1] = 1;
    pheromone[1 * size + 0] = 1;
    pheromone[0 * size + 2] = 1;
    pheromone[2 * size + 0] = 1;
    // The third edge is zero.

    const expected = Math.log(2) / Math.log(3);
    expect(normalizedPheromoneEntropy(instance, pheromone)).toBeCloseTo(expected, 12);
  });

  it('stays inside [0, 1] for arbitrary distributions', () => {
    const instance = createTspInstance(3, 6);
    const size = instance.cityCount;

    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 100, noNaN: true }), {
          minLength: size * size,
          maxLength: size * size,
        }),
        (values) => {
          const pheromone = Float64Array.from(values);
          for (let city = 0; city < size; city += 1) {
            pheromone[city * size + city] = 0;
          }
          const entropy = normalizedPheromoneEntropy(instance, pheromone);
          expect(entropy).toBeGreaterThanOrEqual(0);
          expect(entropy).toBeLessThanOrEqual(1);
          expect(Number.isFinite(entropy)).toBe(true);
        },
      ),
      { numRuns: 80, seed: 20261030 },
    );
  });

  it('defines the degenerate one- and two-city cases as 1', () => {
    const one = createTspInstance(1, 1);
    expect(normalizedPheromoneEntropy(one, new Float64Array(1))).toBe(1);

    const two = createTspInstance(1, 2);
    expect(normalizedPheromoneEntropy(two, uniformPheromone(2))).toBe(1);
  });
});

describe('iteration metrics', () => {
  it('initializes best from the first iteration and never increases it', () => {
    const engine = engineWith({ cityCount: 25, antCount: 20 });
    run(engine, 1);

    const first = engine.snapshot();
    const firstLengths = first.ants.map((ant) => ant.tourLength);
    expect(first.bestLength).toBeCloseTo(Math.min(...firstLengths), 12);
    expect(first.meanLength).toBeCloseTo(
      firstLengths.reduce((sum, value) => sum + value, 0) / firstLengths.length,
      12,
    );
    expect(first.iteration).toBe(1);

    let previousBest = first.bestLength as number;
    for (let iteration = 0; iteration < 30; iteration += 1) {
      engine.stepIteration();
      const current = engine.snapshot();
      expect(current.bestLength).not.toBeNull();
      expect(current.bestLength as number).toBeLessThanOrEqual(previousBest);

      const lengths = current.ants.map((ant) => ant.tourLength);
      expect(current.bestLength as number).toBeLessThanOrEqual(Math.min(...lengths));
      expect(current.meanLength).toBeCloseTo(
        lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
        12,
      );
      previousBest = current.bestLength as number;
    }
  });

  it('reports entropy in [0, 1] after every iteration', () => {
    const engine = engineWith({ cityCount: 15, antCount: 10 });
    for (let iteration = 0; iteration < 20; iteration += 1) {
      engine.stepIteration();
      const entropy = engine.snapshot().entropy;
      expect(entropy).toBeGreaterThanOrEqual(0);
      expect(entropy).toBeLessThanOrEqual(1);
      expect(Number.isFinite(entropy)).toBe(true);
    }
  });

  it('exposes metrics without advancing the simulation', () => {
    const engine = run(engineWith(), 3);
    const first = engine.metrics();
    const second = engine.metrics();

    expect(second).toEqual(first);
    expect(second.iteration).toBe(3);
    expect(second.cityCount).toBe(DEFAULTS.cityCount);
    expect(second.antCount).toBe(DEFAULTS.antCount);
    expect(second.bestLength).not.toBeNull();
    expect(second.meanLength).not.toBeNull();
    expect(second.entropy).toBeGreaterThanOrEqual(0);
    expect(second.entropy).toBeLessThanOrEqual(1);
    expect(second.degraded).toBe(false);
    expect(second.droppedIterations).toBe(0);

    engine.snapshot();
    expect(engine.metrics()).toEqual(first);
  });
});

describe('determinism', () => {
  it('produces identical tours, lengths, pheromone, and metrics for one run identity', () => {
    const settings = params({ cityCount: 18, antCount: 9, seed: 1234 });
    const first = run(new AcoEngine(settings), 10);
    const second = run(new AcoEngine(settings), 10);

    expect(tourList(second)).toEqual(tourList(first));
    expect(second.metrics()).toEqual(first.metrics());
    expect(Array.from(second.snapshot().pheromone)).toEqual(Array.from(first.snapshot().pheromone));
  });

  it('reproduces a run exactly after reset', () => {
    const engine = engineWith({ cityCount: 16, antCount: 7 });
    run(engine, 6);
    const expected = {
      tours: tourList(engine),
      metrics: engine.metrics(),
      pheromone: Array.from(engine.snapshot().pheromone),
    };

    run(engine, 4);
    engine.reset();

    expect(engine.snapshot().iteration).toBe(0);
    expect(engine.snapshot().bestLength).toBeNull();
    expect(engine.snapshot().pheromone[1]).toBe(INITIAL_PHEROMONE);

    run(engine, 6);
    expect(tourList(engine)).toEqual(expected.tours);
    expect(engine.metrics()).toEqual(expected.metrics);
    expect(Array.from(engine.snapshot().pheromone)).toEqual(expected.pheromone);
  });

  it('starts a different run when the seed changes', () => {
    const first = run(engineWith({ seed: 1 }), 3);
    const second = run(engineWith({ seed: 2 }), 3);

    expect(second.snapshot().cities).not.toEqual(first.snapshot().cities);
    expect(second.metrics()).not.toEqual(first.metrics());
  });
});
describe('fixed-step time budget', () => {
  it('carries the fractional remainder instead of dropping it', () => {
    const engine = engineWith({ speed: 1 });

    engine.step(0.4);
    expect(engine.snapshot().iteration).toBe(0);
    expect(engine.snapshot().iterationProgress).toBeCloseTo(0.4, 12);

    engine.step(0.6);
    expect(engine.snapshot().iteration).toBe(1);
    expect(engine.snapshot().iterationProgress).toBeCloseTo(0, 12);

    engine.reset();
    for (let index = 0; index < 10; index += 1) {
      engine.step(0.15);
    }
    expect(engine.snapshot().iteration).toBe(1);
    expect(engine.snapshot().iterationProgress).toBeCloseTo(0.5, 9);
  });

  it('ignores invalid deltas and pauses at speed zero', () => {
    const engine = engineWith();
    engine.step(Number.NaN);
    engine.step(Number.POSITIVE_INFINITY);
    engine.step(-1);
    engine.step(0);
    expect(engine.snapshot().iteration).toBe(0);

    engine.setParams(params({ speed: 0 }));
    engine.step(10);
    expect(engine.snapshot().iteration).toBe(0);
    expect(engine.snapshot().iterationProgress).toBe(0);
  });

  it('applies the speed multiplier without resetting the run', () => {
    const fast = engineWith({ speed: 4 });
    fast.step(0.3);
    expect(fast.snapshot().iteration).toBe(1);

    const slow = engineWith({ speed: 1 });
    slow.step(0.3);
    expect(slow.snapshot().iteration).toBe(0);
  });

  it('does not double-count direct stepIteration calls against the clock budget', () => {
    const engine = engineWith();
    engine.step(0.5);
    expect(engine.snapshot().iterationProgress).toBeCloseTo(0.5, 12);

    engine.stepIteration();
    expect(engine.snapshot().iteration).toBe(1);
    expect(engine.snapshot().iterationProgress).toBeCloseTo(0.5, 12);

    engine.step(0.5);
    expect(engine.snapshot().iteration).toBe(2);
    expect(engine.snapshot().iterationProgress).toBeCloseTo(0, 12);
  });

  it('reaches the same state at 30, 60, and 120 fps', () => {
    for (const speed of [1, 4]) {
      const states = [30, 60, 120].map((fps) => {
        const engine = engineWith({ cityCount: 14, antCount: 8, speed });
        const frames = Math.round(fps * 12.5);
        for (let frame = 0; frame < frames; frame += 1) {
          engine.step(1 / fps);
        }
        return engine;
      });

      const expectedIterations = Math.floor(12.5 * speed * BASE_ITERATIONS_PER_SECOND);
      for (const state of states) {
        expect(state.snapshot().iteration).toBe(expectedIterations);
        expect(state.metrics().droppedIterations).toBe(0);
      }

      expect(tourList(states[1])).toEqual(tourList(states[0]));
      expect(tourList(states[2])).toEqual(tourList(states[0]));

      const reference = states[0].metrics();
      for (const state of states.slice(1)) {
        const metrics = state.metrics();
        expect(metrics.iteration).toBe(reference.iteration);
        expect(metrics.bestLength).toBe(reference.bestLength);
        expect(metrics.meanLength).toBe(reference.meanLength);
        expect(metrics.entropy).toBe(reference.entropy);
        expect(metrics.droppedIterations).toBe(0);
        // The sub-iteration remainder differs only by floating-point
        // accumulation error from stepping at a different frame rate.
        expect(metrics.pendingIterations).toBeCloseTo(reference.pendingIterations, 9);
      }

      expect(Array.from(states[1].snapshot().pheromone)).toEqual(
        Array.from(states[0].snapshot().pheromone),
      );
      expect(Array.from(states[2].snapshot().pheromone)).toEqual(
        Array.from(states[0].snapshot().pheromone),
      );
    }
  });
});
describe('structural and presentation changes', () => {
  it('does not reset for a same-value setParams call or a speed change', () => {
    const engine = run(engineWith(), 3);
    const before = engine.metrics();

    engine.setParams(params());
    expect(engine.metrics()).toEqual(before);

    engine.setParams(params({ speed: 4 }));
    expect(engine.snapshot().iteration).toBe(3);
    expect(engine.snapshot().bestLength).toBe(before.bestLength);
    expect(engine.snapshot().speed).toBe(4);
    expect(engine.metrics().pendingIterations).toBe(before.pendingIterations);
  });

  it('restarts at iteration 0 and clears history for every structural parameter', () => {
    const changes: Partial<AcoParams>[] = [
      { antCount: 12 },
      { alpha: 0 },
      { beta: 0 },
      { rho: 1 },
      { seed: 7 },
      { cityCount: 20 },
    ];

    for (const change of changes) {
      const engine = run(engineWith(), 3);
      expect(engine.snapshot().iteration).toBe(3);
      engine.setParams(params(change));

      expect(engine.snapshot().iteration).toBe(0);
      expect(engine.snapshot().bestLength).toBeNull();
      expect(engine.snapshot().bestTour).toBeNull();
      expect(engine.snapshot().meanLength).toBeNull();
      expect(engine.snapshot().entropy).toBe(1);
      expect(engine.metrics().pendingIterations).toBe(0);
    }
  });

  it('rebuilds the city set from setCities and invalidates best/mean history', () => {
    const engine = run(engineWith({ cityCount: 10 }), 3);
    const cities = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ];

    engine.setCities(cities);

    expect(engine.snapshot().cityCount).toBe(3);
    expect(engine.snapshot().cities).toEqual(cities);
    expect(engine.snapshot().iteration).toBe(0);
    expect(engine.snapshot().bestLength).toBeNull();
    expect(engine.snapshot().meanLength).toBeNull();
    expect(engine.snapshot().pheromone).toHaveLength(9);

    run(engine, 2);
    assertValidTours(engine, createTspInstanceFromCities(cities));
  });

  it('keeps an explicit city set when only the seed changes', () => {
    const cities = [
      { x: 0.1, y: 0.1 },
      { x: 0.7, y: 0.2 },
      { x: 0.4, y: 0.8 },
      { x: 0.9, y: 0.9 },
    ];
    const engine = new AcoEngine(params({ cityCount: 4, seed: 11 }));
    engine.setCities(cities);
    run(engine, 2);

    engine.setParams(params({ cityCount: 4, seed: 12 }));

    expect(engine.snapshot().cities).toEqual(cities);
    expect(engine.snapshot().params.seed).toBe(12);
    expect(engine.snapshot().iteration).toBe(0);
  });

  it('replaces an explicit city set when the city count changes', () => {
    const engine = new AcoEngine(params({ cityCount: 4 }));
    engine.setCities([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
      { x: 0.2, y: 0.8 },
    ]);

    engine.setParams(params({ cityCount: 6 }));

    expect(engine.snapshot().cityCount).toBe(6);
    expect(engine.snapshot().cities).toEqual(createTspInstance(DEFAULTS.seed, 6).cities);
  });
});
describe('parameter edge cases', () => {
  const cases: Array<{ name: string; overrides: Partial<AcoParams> }> = [
    { name: 'alpha = 0', overrides: { alpha: 0 } },
    { name: 'beta = 0', overrides: { beta: 0 } },
    { name: 'rho = 1', overrides: { rho: 1 } },
    { name: 'one ant', overrides: { antCount: 1 } },
    { name: 'two cities', overrides: { cityCount: 2, antCount: 2 } },
    { name: 'one city', overrides: { cityCount: 1, antCount: 3 } },
    { name: 'alpha = beta = 0', overrides: { alpha: 0, beta: 0 } },
  ];

  for (const testCase of cases) {
    it(`runs ${testCase.name} without NaN, Infinity, or empty tours`, () => {
      const engine = run(engineWith(testCase.overrides), 8);
      const snapshot = engine.snapshot();

      assertFinitePheromone(engine);
      expect(snapshot.iteration).toBe(8);
      expect(snapshot.bestLength).not.toBeNull();
      expect(Number.isFinite(snapshot.bestLength as number)).toBe(true);
      expect(Number.isFinite(snapshot.meanLength as number)).toBe(true);
      expect(snapshot.entropy).toBeGreaterThanOrEqual(0);
      expect(snapshot.entropy).toBeLessThanOrEqual(1);

      const instance = instanceFor(testCase.overrides);
      for (const ant of snapshot.ants) {
        const tour = Array.from(ant.tour);
        expect(tour).toHaveLength(instance.cityCount);
        expect(validateTour(instance, tour)).toEqual({ valid: true });
      }
    });
  }

  it('handles collinear cities', () => {
    const engine = engineWith({ antCount: 5, seed: 0 });
    engine.setCities([
      { x: 0, y: 0.5 },
      { x: 0.2, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.8, y: 0.5 },
      { x: 1, y: 0.5 },
    ]);

    run(engine, 10);

    assertFinitePheromone(engine);
    assertValidTours(
      engine,
      createTspInstanceFromCities([
        { x: 0, y: 0.5 },
        { x: 0.2, y: 0.5 },
        { x: 0.4, y: 0.5 },
        { x: 0.6, y: 0.5 },
        { x: 0.8, y: 0.5 },
        { x: 1, y: 0.5 },
      ]),
    );
  });

  it('handles coincident cities with finite distances and tours', () => {
    const point = { x: 0.5, y: 0.5 };
    const cities = [point, point, point, point];
    const engine = run(engineWith({ antCount: 4 }), 2);
    engine.setCities(cities);

    run(engine, 5);

    assertFinitePheromone(engine);
    const instance = createTspInstanceFromCities(cities);
    for (const ant of engine.snapshot().ants) {
      expect(validateTour(instance, Array.from(ant.tour))).toEqual({ valid: true });
      expect(Number.isFinite(ant.tourLength)).toBe(true);
    }
    expect(Number.isFinite(engine.metrics().meanLength as number)).toBe(true);
  });

  it('builds a deterministic nearest-neighbor baseline for comparison outside the engine', () => {
    // The engine initializes best from the first iteration's minimum; the
    // greedy baseline is a separate model helper and is not injected into
    // best-length history.
    const settings = params({ cityCount: 20, antCount: 10 });
    const engine = run(new AcoEngine(settings), 1);
    const first = engine.snapshot();
    const minimum = Math.min(...first.ants.map((ant) => ant.tourLength));

    expect(first.bestLength).toBeCloseTo(minimum, 12);
  });

  it('accepts the smallest and largest permitted ant counts', () => {
    for (const antCount of [ACO_LIMITS.antCount.min, ACO_LIMITS.antCount.max]) {
      const engine = run(engineWith({ cityCount: 6, antCount }), 2);
      expect(engine.snapshot().ants).toHaveLength(antCount);
      assertFinitePheromone(engine);
    }
  });
});
describe('render snapshot', () => {
  it('returns the same object and stable buffers across frames', () => {
    const engine = engineWith({ cityCount: 9, antCount: 4 });
    const snapshot = engine.snapshot();
    const cities = snapshot.cities;
    const matrix = snapshot.distanceMatrix;
    const pheromone = snapshot.pheromone;
    const ants = snapshot.ants;
    const tour = ants[0].tour;

    engine.stepIteration();
    const next = engine.snapshot();

    expect(next).toBe(snapshot);
    expect(next.cities).toBe(cities);
    expect(next.distanceMatrix).toBe(matrix);
    expect(next.pheromone).toBe(pheromone);
    expect(next.ants).toBe(ants);
    expect(next.ants[0].tour).toBe(tour);
    expect(next.ants[0].visitedCount).toBe(9);
    expect(next.iteration).toBe(1);
    expect(next.bestTour).not.toBeNull();
  });

  it('keeps the snapshot object stable across a presentation change', () => {
    const engine = engineWith();
    const snapshot = engine.snapshot();
    engine.setParams(params({ speed: 2 }));

    expect(engine.snapshot()).toBe(snapshot);
    expect(snapshot.speed).toBe(2);
    expect(snapshot.params.speed).toBe(2);
  });

  it('exposes enough data for ant animation without extra copies', () => {
    const engine = run(engineWith({ cityCount: 7, antCount: 3 }), 1);
    const snapshot = engine.snapshot();

    expect(snapshot.iterationProgress).toBeGreaterThanOrEqual(0);
    expect(snapshot.iterationProgress).toBeLessThan(1);
    for (const ant of snapshot.ants) {
      expect(ant.tour).toHaveLength(7);
      expect(ant.visitedCount).toBe(7);
      expect(ant.tourLength).toBeGreaterThan(0);
    }
    expect(snapshot.bestTour?.length).toBe(7);
  });
});
describe('workload cap and backlog', () => {
  it('caps iterations per step and counts dropped backlog', () => {
    const engine = engineWith();
    engine.step(100);

    const metrics = engine.metrics();
    expect(metrics.iteration).toBe(MAX_ITERATIONS_PER_STEP);
    expect(metrics.pendingIterations).toBeLessThanOrEqual(MAX_PENDING_ITERATIONS);
    expect(metrics.droppedIterations).toBeGreaterThan(0);
    expect(metrics.degraded).toBe(true);

    for (let call = 0; call < 20; call += 1) {
      const before = engine.snapshot().iteration;
      engine.step(1 / 60);
      expect(engine.snapshot().iteration - before).toBeLessThanOrEqual(MAX_ITERATIONS_PER_STEP);
      expect(engine.metrics().pendingIterations).toBeLessThanOrEqual(MAX_PENDING_ITERATIONS);
    }
  });

  it('preserves the fractional remainder when the whole backlog is trimmed', () => {
    const engine = engineWith();
    engine.step(10.4);

    const metrics = engine.metrics();
    expect(metrics.iteration).toBe(MAX_ITERATIONS_PER_STEP);
    expect(metrics.droppedIterations).toBe(10 - MAX_PENDING_ITERATIONS);
    expect(metrics.pendingIterations).toBeCloseTo(
      MAX_PENDING_ITERATIONS - MAX_ITERATIONS_PER_STEP + 0.4,
      12,
    );
    expect(engine.snapshot().iterationProgress).toBeCloseTo(0.4, 12);
  });

  it('does not spiral: a long gap is bounded, not replayed forever', () => {
    const engine = engineWith();
    engine.step(3600);

    expect(engine.metrics().pendingIterations).toBeLessThanOrEqual(MAX_PENDING_ITERATIONS);
    const dropped = engine.metrics().droppedIterations;
    expect(dropped).toBeGreaterThan(3000);

    for (let call = 0; call < 10; call += 1) {
      engine.step(1 / 60);
    }
    expect(engine.metrics().droppedIterations).toBe(dropped);
    expect(engine.metrics().pendingIterations).toBeLessThanOrEqual(MAX_PENDING_ITERATIONS);
  });
});

describe('known small instances', () => {
  it('plans both two-city tours with the hand-computed doubled distance', () => {
    const cities = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0 },
    ];
    const engine = engineWith({ cityCount: 2, antCount: 2, seed: 7 });
    engine.setCities(cities);
    engine.stepIteration();

    const instance = createTspInstanceFromCities(cities);
    const tours = engine.snapshot().ants.map((ant) => Array.from(ant.tour));

    // Ant k starts at city k mod n, and a two-city instance has no choice, so
    // both tours are known without inspecting the random stream.
    expect(tours).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(tourLength(instance, [0, 1])).toBeCloseTo(0.5, 12);
    expect(engine.snapshot().bestLength).toBeCloseTo(0.5, 12);
    expect(engine.snapshot().meanLength).toBeCloseTo(0.5, 12);
  });

  it('gives the optimal square tour the hand-computed perimeter', () => {
    const cities = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const instance = createTspInstanceFromCities(cities);
    const engine = engineWith({ cityCount: 4, antCount: 3, seed: 11 });
    engine.setCities(cities);

    // From city 0 the candidates are 1 away (cities 1 and 3) and sqrt(2) away
    // (city 2). With equal pheromone and beta = 2 the weights are 1, 0.5, 1,
    // so the probabilities are exactly 0.4, 0.2, 0.4.
    const first = transitionProbabilities(
      instance,
      uniformPheromone(4, 0.1),
      0,
      allowedMask(4),
      1,
      2,
    );
    expect(Array.from(first.cities.slice(0, first.count))).toEqual([1, 2, 3]);
    expect(first.probabilities[0]).toBeCloseTo(0.4, 12);
    expect(first.probabilities[1]).toBeCloseTo(0.2, 12);
    expect(first.probabilities[2]).toBeCloseTo(0.4, 12);

    engine.stepIteration();
    const snapshot = engine.snapshot();
    const bestTour = snapshot.bestTour as readonly number[];

    expect(snapshot.bestLength).toBeCloseTo(4, 12);
    expect(validateTour(instance, bestTour)).toEqual({ valid: true });
    expect(tourLength(instance, bestTour)).toBeCloseTo(4, 12);

    // Every reported ant length must match the same closed-tour measure.
    const lengths = snapshot.ants.map((ant) => tourLength(instance, Array.from(ant.tour)));
    for (const [index, ant] of snapshot.ants.entries()) {
      expect(ant.tourLength).toBeCloseTo(lengths[index], 12);
    }
    expect(snapshot.meanLength).toBeCloseTo(
      lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
      12,
    );
  });

  it('uses the triangle perimeter because every three-city tour uses all edges', () => {
    const cities = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.4 },
      { x: 0.6, y: 0 },
    ];
    const instance = createTspInstanceFromCities(cities);
    const perimeter =
      instance.distanceMatrix.distance(0, 1) +
      instance.distanceMatrix.distance(1, 2) +
      instance.distanceMatrix.distance(2, 0);
    expect(perimeter).toBeCloseTo(1.6, 12);

    const engine = engineWith({ cityCount: 3, antCount: 5, seed: 3 });
    engine.setCities(cities);
    engine.stepIteration();

    expect(engine.snapshot().bestLength).toBeCloseTo(1.6, 12);
    expect(engine.snapshot().meanLength).toBeCloseTo(1.6, 12);
    for (const ant of engine.snapshot().ants) {
      expect(ant.tourLength).toBeCloseTo(1.6, 12);
    }
  });

  it('assigns hand-computed probabilities for controlled distance and pheromone', () => {
    // Distance-only case: equal pheromone and beta = 1, so p is proportional
    // to 1 / d. The candidates are 0.1 and 0.9 away, giving exactly 0.9/0.1.
    const collinear = createTspInstanceFromCities([
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0.9, y: 0 },
    ]);
    const distanceDriven = transitionProbabilities(
      collinear,
      uniformPheromone(3, 1),
      0,
      allowedMask(3),
      1,
      1,
    );
    expect(Array.from(distanceDriven.cities.slice(0, distanceDriven.count))).toEqual([1, 2]);
    expect(distanceDriven.probabilities[0]).toBeCloseTo(0.9, 12);
    expect(distanceDriven.probabilities[1]).toBeCloseTo(0.1, 12);

    // Pheromone-only case: beta = 0 and equal distances, so p is proportional
    // to tau.
    const symmetric = createTspInstanceFromCities([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0, y: 0.5 },
    ]);
    const pheromone = new Float64Array(9);
    pheromone[0 * 3 + 1] = 0.2;
    pheromone[1 * 3 + 0] = 0.2;
    pheromone[0 * 3 + 2] = 0.8;
    pheromone[2 * 3 + 0] = 0.8;
    const pheromoneDriven = transitionProbabilities(
      symmetric,
      pheromone,
      0,
      allowedMask(3),
      1,
      0,
    );
    expect(pheromoneDriven.probabilities[0]).toBeCloseTo(0.2, 12);
    expect(pheromoneDriven.probabilities[1]).toBeCloseTo(0.8, 12);
  });
});
