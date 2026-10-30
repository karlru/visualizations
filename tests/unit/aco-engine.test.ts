import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ACO_DEPOSIT_CONSTANT,
  ACO_LIMITS,
  AcoEngine,
  BASE_ITERATIONS_PER_SECOND,
  buildTransitionWeights,
  INITIAL_PHEROMONE,
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
