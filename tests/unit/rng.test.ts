import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeSeed, SeededRandom } from '../../src/engines/core/rng';

/**
 * The RNG is a simulation contract, not an implementation detail. These tests
 * pin the exact sequence, the seed normalization rules, the half-open float
 * range, inclusive integer bounds, and the copy/restore API.
 */

const UINT32_RANGE = 0x1_0000_0000;

/**
 * FNV-1a over the four bytes of each float's 32-bit numerator.
 *
 * Floats are `uint32 / 2^32`, so multiplying by 2^32 and flooring recovers the
 * exact integer the generator produced. Hashing 10,000 of them is a compact
 * regression snapshot that fails immediately if the algorithm or seeding
 * changes.
 */
function sequenceHash(values: Iterable<number>): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const bits = Math.floor(value * UINT32_RANGE) >>> 0;
    for (let byte = 0; byte < 4; byte += 1) {
      hash ^= (bits >>> (byte * 8)) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

function take(rng: SeededRandom, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    values.push(rng.randomFloat());
  }
  return values;
}

describe('SeededRandom determinism', () => {
  it('produces the identical sequence for the same seed in fresh instances', () => {
    const first = new SeededRandom(42);
    const second = new SeededRandom(42);

    expect(take(first, 500)).toEqual(take(second, 500));
  });

  it('matches the pinned 10,000-value regression hash for seed 42', () => {
    const rng = new SeededRandom(42);
    const values: number[] = [];
    for (let i = 0; i < 10_000; i += 1) {
      values.push(rng.randomFloat());
    }

    expect(sequenceHash(values)).toBe(0xa82c617d);
  });

  it('starts with the known mulberry32 sequence for seed 42', () => {
    const rng = new SeededRandom(42);

    expect(take(rng, 5)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });

  it('produces different sequences for different seeds in practice', () => {
    const sequences = [1, 2, 3, 42, 43].map((seed) => take(new SeededRandom(seed), 200));
    const unique = new Set(sequences.map((values) => values.join(',')));

    expect(unique.size).toBe(sequences.length);
  });

  it('reproduces the sequence after reset()', () => {
    const rng = new SeededRandom(7);
    const original = take(rng, 100);

    rng.reset();

    expect(take(rng, 100)).toEqual(original);
  });

  it('uses the most recent reset seed as the new default', () => {
    const rng = new SeededRandom(1);
    rng.reset(99);
    const fromNinetyNine = take(rng, 50);

    rng.reset();

    expect(take(rng, 50)).toEqual(fromNinetyNine);
  });

  it('copies and restores state without replaying earlier draws', () => {
    const rng = new SeededRandom(1234);
    take(rng, 25);
    const savedState = rng.state;
    const expectedNext = take(rng, 100);

    rng.reset();
    take(rng, 25);
    rng.restore(savedState);

    expect(rng.state).toBe(savedState);
    expect(take(rng, 100)).toEqual(expectedNext);
  });

  it('clone() continues the same sequence and keeps the reset seed', () => {
    const rng = new SeededRandom(5);
    take(rng, 10);
    const copy = rng.clone();

    expect(copy.state).toBe(rng.state);
    expect(copy.seed).toBe(rng.seed);
    expect(take(copy, 50)).toEqual(take(rng, 50));

    copy.reset();
    const fresh = new SeededRandom(5);
    expect(take(copy, 50)).toEqual(take(fresh, 50));
  });

  it('restore() accepts any number and normalizes it to a 32-bit state', () => {
    const rng = new SeededRandom(3);
    rng.restore(-1);

    expect(rng.state).toBe(normalizeSeed(-1));

    rng.restore(Number.NaN);
    expect(rng.state).toBe(0);
  });
});

describe('seed normalization', () => {
  it('documents zero, negative, large, fractional, and non-finite handling', () => {
    expect(normalizeSeed(0)).toBe(0);
    expect(normalizeSeed(-1)).toBe(4294967295);
    expect(normalizeSeed(2 ** 32)).toBe(0);
    expect(normalizeSeed(2 ** 32 + 2)).toBe(2);
    expect(normalizeSeed(1.9)).toBe(1);
    expect(normalizeSeed(-1.9)).toBe(4294967295);
    expect(normalizeSeed(Number.NaN)).toBe(0);
    expect(normalizeSeed(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeSeed(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('maps normalized-equal seeds to the same sequence', () => {
    expect(take(new SeededRandom(-1), 100)).toEqual(take(new SeededRandom(4294967295), 100));
    expect(take(new SeededRandom(2 ** 32), 100)).toEqual(take(new SeededRandom(0), 100));
    expect(take(new SeededRandom(1.9), 100)).toEqual(take(new SeededRandom(1), 100));
    expect(take(new SeededRandom(Number.NaN), 100)).toEqual(take(new SeededRandom(0), 100));
  });

  it('is deterministic for arbitrary finite integer seeds', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const normalized = normalizeSeed(seed);
        expect(Number.isInteger(normalized)).toBe(true);
        expect(normalized).toBeGreaterThanOrEqual(0);
        expect(normalized).toBeLessThan(UINT32_RANGE);

        expect(take(new SeededRandom(seed), 25)).toEqual(take(new SeededRandom(normalized), 25));
      }),
      { numRuns: 200, seed: 20261030 },
    );
  });
});

describe('randomFloat', () => {
  it('returns values in the half-open interval [0, 1)', () => {
    const rng = new SeededRandom(2026);
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.randomFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('stays in range for arbitrary seeds', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = new SeededRandom(seed);
        for (let i = 0; i < 100; i += 1) {
          const value = rng.randomFloat();
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
      { numRuns: 100, seed: 20261030 },
    );
  });
});

describe('randomInt', () => {
  const ranges = [
    { min: 0, max: 0 },
    { min: 5, max: 5 },
    { min: -7, max: -7 },
    { min: 0, max: 1 },
    { min: -1, max: 1 },
    { min: -10, max: -5 },
    { min: -1000, max: 1000 },
    { min: 0, max: 0xffffffff },
    { min: -2147483648, max: 2147483647 },
  ] as const;

  it('returns integers inside every requested range', () => {
    const rng = new SeededRandom(11);
    for (const { min, max } of ranges) {
      for (let i = 0; i < 1000; i += 1) {
        const value = rng.randomInt(min, max);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
    }
  });

  it('reaches both boundaries and every value of small ranges', () => {
    const rng = new SeededRandom(12);

    for (const [min, max] of [
      [0, 3],
      [-2, 2],
      [10, 12],
    ] as const) {
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i += 1) {
        seen.add(rng.randomInt(min, max));
      }
      expect([...seen].sort((a, b) => a - b)).toEqual(
        Array.from({ length: max - min + 1 }, (_, index) => min + index),
      );
    }
  });

  it('handles a degenerate range without consuming a draw', () => {
    const rng = new SeededRandom(13);
    const before = rng.state;

    expect(rng.randomInt(9, 9)).toBe(9);
    expect(rng.state).toBe(before);
  });

  it('stays in bounds for arbitrary ranges', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (min, span) => {
          const max = min + span;
          const rng = new SeededRandom(min ^ max);
          for (let i = 0; i < 20; i += 1) {
            const value = rng.randomInt(min, max);
            expect(value).toBeGreaterThanOrEqual(min);
            expect(value).toBeLessThanOrEqual(max);
            expect(Number.isInteger(value)).toBe(true);
          }
        },
      ),
      { numRuns: 150, seed: 20261030 },
    );
  });

  it('rejects non-integer, inverted, and oversized ranges', () => {
    const rng = new SeededRandom(14);

    expect(() => rng.randomInt(0.5, 2)).toThrow(RangeError);
    expect(() => rng.randomInt(0, 2.5)).toThrow(RangeError);
    expect(() => rng.randomInt(3, 2)).toThrow(RangeError);
    expect(() => rng.randomInt(Number.NaN, 2)).toThrow(RangeError);
    expect(() => rng.randomInt(0, 2 ** 32)).toThrow(RangeError);
  });
});
