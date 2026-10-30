/**
 * Deterministic pseudo-random numbers for simulation use.
 *
 * The generator is **mulberry32**. Its entire state is one unsigned 32-bit
 * integer, and every operation is a 32-bit integer operation (`Math.imul`,
 * `|`, `^`, `>>>`). JavaScript specifies those operations exactly, so the same
 * seed produces the same sequence in every conforming engine, in Node, in the
 * browser, and in a Web Worker. It never calls `Math.random`, `Date`, or any
 * browser API, and the hot path allocates nothing.
 *
 * The state advances by adding an odd constant modulo 2^32, so it visits all
 * 2^32 states before repeating. Each output applies a mixing function to the
 * new state. This is ample for simulation jitter (city placement, ant choices)
 * but it is **not** a cryptographic generator and must not be used for
 * secrets.
 *
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */

import type { Seed } from './types';

/** Number of distinct values returned by the underlying 32-bit generator. */
const UINT32_RANGE = 0x1_0000_0000;

/** The odd additive constant that gives mulberry32 its full 2^32 state cycle. */
const STATE_INCREMENT = 0x6d2b79f5;

/**
 * Convert any number to a valid unsigned 32-bit generator state.
 *
 * The conversion is deterministic and documented:
 *
 * | Input | Normalized state |
 * |---|---|
 * | `0` | `0` (valid; the generator leaves it on the first step) |
 * | `-1` | `4294967295` (negative values wrap modulo 2^32) |
 * | `4294967298` | `2` (values at or above 2^32 wrap modulo 2^32) |
 * | `1.9` | `1` (non-integers truncate toward zero) |
 * | `-1.9` | `4294967295` (truncates to -1, then wraps) |
 * | `NaN`, `Infinity`, `-Infinity` | `0` |
 *
 * The result is always in `[0, 2^32 - 1]`. Two inputs that normalize to the
 * same state (for example `-1` and `4294967295`) produce the same sequence.
 */
export function normalizeSeed(seed: Seed): number {
  if (!Number.isFinite(seed)) {
    return 0;
  }
  // `Math.trunc` makes the documented truncation explicit; `>>> 0` performs
  // the modulo-2^32 wrap and returns an unsigned value.
  return Math.trunc(seed) >>> 0;
}

/**
 * A small, deterministic, seedable random number generator.
 *
 * ```ts
 * const rng = new SeededRandom(42);
 * const jitter = rng.randomFloat(); // [0, 1)
 * const city = rng.randomInt(0, 29); // 0..29 inclusive
 * ```
 *
 * To copy a run's randomness without replaying it, save {@link state} and
 * restore it with {@link restore}; to replay from the beginning, call
 * {@link reset}. `clone` copies both the current state and the reset seed.
 */
export class SeededRandom {
  /** The seed most recently supplied to the constructor or `reset`. */
  private initialSeed: number;

  /** Current unsigned 32-bit generator state. */
  private currentState: number;

  /**
   * @param seed Any finite integer. See {@link normalizeSeed} for the exact
   *   handling of zero, negative, large, fractional, and non-finite inputs.
   */
  constructor(seed: Seed = 0) {
    this.initialSeed = normalizeSeed(seed);
    this.currentState = this.initialSeed;
  }

  /** The normalized seed that `reset()` without arguments returns to. */
  get seed(): number {
    return this.initialSeed;
  }

  /**
   * The raw unsigned 32-bit state.
   *
   * This value is a complete, copyable snapshot of the generator: saving it
   * and passing it to {@link restore} continues the exact same sequence.
   */
  get state(): number {
    return this.currentState;
  }

  /**
   * Restore the starting sequence.
   *
   * @param seed Seed to use from now on. When omitted, the generator returns
   *   to the seed supplied at construction or to the most recent `reset`.
   *   Passing a seed also becomes the new default for later `reset()` calls.
   */
  reset(seed: Seed = this.initialSeed): void {
    this.initialSeed = normalizeSeed(seed);
    this.currentState = this.initialSeed;
  }

  /**
   * Resume from a raw state previously read from {@link state}.
   *
   * Does not change the reset seed. The state is normalized with
   * {@link normalizeSeed}, so non-finite or out-of-range values still produce
   * a valid generator state.
   */
  restore(state: number): void {
    this.currentState = normalizeSeed(state);
  }

  /**
   * Return the next value in `[0, 1)`.
   *
   * The value is `uint32 / 2^32`, so it can be exactly `0` but never `1`.
   * Allocation-free.
   */
  randomFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /**
   * Return an integer in `[minInclusive, maxInclusive]`, inclusive at both
   * ends.
   *
   * Mapping uses rejection sampling: a 32-bit draw is discarded when it falls
   * in the final incomplete block of the range. This removes the small modulo
   * bias of a plain `draw % span` mapping while keeping the expected number of
   * draws below two. Both ends are reachable whenever the range is at most
   * 2^32 values. Allocation-free.
   *
   * @throws RangeError if either bound is not an integer, if
   *   `minInclusive > maxInclusive`, or if the range contains more than 2^32
   *   integers (a single 32-bit draw cannot cover it without bias).
   */
  randomInt(minInclusive: number, maxInclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
      throw new RangeError('randomInt bounds must be integers');
    }
    if (minInclusive > maxInclusive) {
      throw new RangeError('randomInt requires minInclusive <= maxInclusive');
    }
    if (minInclusive === maxInclusive) {
      return minInclusive;
    }

    const span = maxInclusive - minInclusive + 1;
    if (!Number.isSafeInteger(span) || span > UINT32_RANGE) {
      throw new RangeError('randomInt range must contain at most 2^32 integers');
    }

    // Reject the largest `2^32 % span` values so every remainder appears the
    // same number of times. When span divides 2^32, limit is 2^32 and nothing
    // is rejected.
    const limit = UINT32_RANGE - (UINT32_RANGE % span);
    let value = this.nextUint32();
    while (value >= limit) {
      value = this.nextUint32();
    }
    return minInclusive + (value % span);
  }

  /** Copy the generator, including its current position and reset seed. */
  clone(): SeededRandom {
    const copy = new SeededRandom(this.initialSeed);
    copy.currentState = this.currentState;
    return copy;
  }

  /** Advance the mulberry32 state and return one unsigned 32-bit value. */
  private nextUint32(): number {
    const state = (this.currentState + STATE_INCREMENT) >>> 0;
    this.currentState = state;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return (mixed ^ (mixed >>> 14)) >>> 0;
  }
}
