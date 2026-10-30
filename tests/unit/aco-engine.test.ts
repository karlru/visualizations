import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ACO_DEPOSIT_CONSTANT,
  ACO_LIMITS,
  AcoEngine,
  BASE_ITERATIONS_PER_SECOND,
  buildTransitionWeights,
  INITIAL_PHEROMONE,
  normalizedPheromoneEntropy,
  transitionProbabilities,
} from '../../src/engines/aco/engine';
import { ACO_PRESETS } from '../../src/engines/aco/presets';
import { createTspInstance, tourLength, validateTour } from '../../src/engines/aco/tsp';
import type { AcoParams } from '../../src/engines/aco/types';

/**
 * Ant System engine tests for the Step 2.2 contract.
 *
 * These tests are deliberately focused on the engine: tour validity,
 * normalized transition probabilities, the uniform fallback, pheromone bounds
 * (including rho = 1), best-length monotonicity, the entropy formula, run
 * determinism, structural-versus-presentation resets, snapshot reuse, and the
 * fixed-step iteration budget. Step 2.3 expands the property and edge-case
 * matrix; every seed here is fixed so the file is fast and repeatable.
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

describe('parameters, constants, and presets', () => {
  it('fixes Q at 1 and starts from a small positive pheromone', () => {
    expect(ACO_DEPOSIT_CONSTANT).toBe(1);
    expect(INITIAL_PHEROMONE).toBeGreaterThan(0);
    expect(Number.isFinite(INITIAL_PHEROMONE)).toBe(true);
    expect(BASE_ITERATIONS_PER_SECOND).toBeGreaterThan(0);
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
