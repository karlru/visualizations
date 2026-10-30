/**
 * Fixed-timestep simulation clock.
 *
 * The clock owns wall-clock bookkeeping only: it converts an arbitrary frame
 * delta into a whole number of fixed simulation steps, retains the unused
 * remainder for the next frame, and exposes an interpolation alpha. It has no
 * DOM or timer dependency, so the story controller can drive it from the GSAP
 * ticker, a test can drive it manually, and a Worker can drive it the same way.
 *
 * The caller owns the step loop:
 *
 * ```ts
 * const clock = new FixedStepClock();
 *
 * function frame(wallDeltaSeconds: number): void {
 *   const steps = clock.advance(wallDeltaSeconds);
 *   for (let i = 0; i < steps; i += 1) {
 *     engine.step(clock.fixedStepSeconds);
 *   }
 *   // `clock.alpha` interpolates between the previous and current simulation
 *   // states for rendering; it is always in [0, 1).
 * }
 * ```
 *
 * `advance` returns a step count instead of accepting a callback so tests and
 * hosts can choose how to batch work (for example, post a message per step to
 * a Worker) without the clock owning a callback allocation.
 */

/** Default simulation step: 60 Hz. */
export const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;

/**
 * Default catch-up limit: eight 60 Hz steps (about 133 ms of simulation).
 * This covers a missed frame or two on a 120 Hz display while bounding the
 * work a single frame can trigger.
 */
export const DEFAULT_MAX_SUBSTEPS = 8;

/**
 * Absorbs floating-point accumulation error at a step boundary. It is 1 ns,
 * far smaller than any real frame, and prevents a sum such as 0.9999999999999999
 * from losing a whole 16.7 ms step.
 */
const STEP_EPSILON_SECONDS = 1e-9;

/** Configuration accepted by {@link FixedStepClock}. */
export interface FixedStepClockOptions {
  /** Seconds per fixed simulation step. Must be finite and positive. */
  readonly fixedStepSeconds?: number;
  /** Maximum steps `advance` may return for one frame. Must be an integer >= 1. */
  readonly maxSubsteps?: number;
  /** Simulated seconds per wall second. Defaults to 1. */
  readonly speed?: number;
  /** Start paused. Defaults to false. */
  readonly paused?: boolean;
}

/**
 * Convert a speed request to a safe value.
 *
 * Negative, `NaN`, and infinite values become `0` (no advancement). A speed of
 * zero is treated like a paused clock but is a distinct control: the pause flag
 * is for the reader's play/pause button, while speed is a presentation
 * multiplier.
 */
function sanitizeSpeed(speed: number): number {
  return Number.isFinite(speed) && speed > 0 ? speed : 0;
}

/**
 * A fixed-timestep accumulator.
 *
 * ### Remainder and catch-up
 *
 * Each `advance(delta)` adds `delta × speed` to an accumulator, returns the
 * number of whole fixed steps available, and retains the sub-step remainder.
 * `alpha` is that remainder divided by the fixed step, in `[0, 1)`.
 *
 * A frame can never return more than `maxSubsteps`. When the accumulator holds
 * more than that (a long tab-away gap, a breakpoint, a slow device), the clock
 * runs the allowed steps and **drops every whole step beyond the cap**, keeping
 * only the sub-step fraction. Simulated time therefore advances by at most
 * `maxSubsteps × fixedStepSeconds` per call and a backlog cannot spiral into a
 * permanent catch-up loop.
 *
 * ### Pause and speed
 *
 * While paused, `advance` returns 0 and ignores its delta completely, so time
 * spent paused never accumulates. Resuming starts from the same sub-step
 * remainder that existed when the clock was paused. Speed scales simulated
 * time: at 2×, one wall second yields two simulated seconds.
 *
 * ### Invalid deltas
 *
 * Negative, `NaN`, and infinite deltas are ignored and return 0. A finite delta
 * that overflows when multiplied by the speed is treated as a maximum
 * catch-up frame. No input can make the clock return a non-integer, a negative
 * count, or more than `maxSubsteps`.
 */
export class FixedStepClock {
  /** Seconds per fixed simulation step. */
  readonly fixedStepSeconds: number;

  /** Maximum number of steps returned by one `advance` call. */
  readonly maxSubsteps: number;

  private speedValue: number;
  private pausedValue: boolean;
  private accumulatorSecondsValue = 0;
  private simulatedSecondsValue = 0;

  constructor(options: FixedStepClockOptions = {}) {
    const fixedStepSeconds = options.fixedStepSeconds ?? DEFAULT_FIXED_STEP_SECONDS;
    if (!Number.isFinite(fixedStepSeconds) || fixedStepSeconds <= 0) {
      throw new RangeError('fixedStepSeconds must be a finite positive number');
    }

    const maxSubsteps = options.maxSubsteps ?? DEFAULT_MAX_SUBSTEPS;
    if (!Number.isSafeInteger(maxSubsteps) || maxSubsteps < 1) {
      throw new RangeError('maxSubsteps must be a safe integer >= 1');
    }

    this.fixedStepSeconds = fixedStepSeconds;
    this.maxSubsteps = maxSubsteps;
    this.speedValue = sanitizeSpeed(options.speed ?? 1);
    this.pausedValue = options.paused ?? false;
  }

  /** Simulated seconds per wall second. Invalid values are coerced to 0. */
  get speed(): number {
    return this.speedValue;
  }

  set speed(speed: number) {
    this.speedValue = sanitizeSpeed(speed);
  }

  /** When true, `advance` returns 0 and does not accumulate time. */
  get paused(): boolean {
    return this.pausedValue;
  }

  set paused(paused: boolean) {
    this.pausedValue = paused;
  }

  /**
   * Unused sub-step time, in seconds. Always less than `fixedStepSeconds`
   * after `advance` returns. Exposed for diagnostics and tests.
   */
  get accumulatorSeconds(): number {
    return this.accumulatorSecondsValue;
  }

  /** Total simulated time actually stepped, in seconds. */
  get simulatedSeconds(): number {
    return this.simulatedSecondsValue;
  }

  /**
   * Fraction of a fixed step elapsed since the last step, in `[0, 1)`.
   * Renderers may use it to interpolate between the previous and current
   * simulation snapshots.
   */
  get alpha(): number {
    const ratio = this.accumulatorSecondsValue / this.fixedStepSeconds;
    if (!(ratio > 0)) {
      return 0;
    }
    return ratio < 1 ? ratio : 1 - Number.EPSILON;
  }

  /**
   * Advance wall time and return the number of fixed steps to run.
   *
   * The caller runs that many steps with `fixedStepSeconds`. The sub-step
   * remainder is retained for the next call; excess time beyond
   * `maxSubsteps` is discarded as documented on the class.
   */
  advance(wallDeltaSeconds: number): number {
    if (this.pausedValue || this.speedValue <= 0) {
      return 0;
    }
    if (!Number.isFinite(wallDeltaSeconds) || wallDeltaSeconds <= 0) {
      return 0;
    }

    const scaledDelta = wallDeltaSeconds * this.speedValue;
    if (!Number.isFinite(scaledDelta)) {
      // Finite inputs whose product overflows are still a maximum catch-up
      // frame, not an infinite number of steps.
      this.accumulatorSecondsValue = 0;
      this.simulatedSecondsValue += this.maxSubsteps * this.fixedStepSeconds;
      return this.maxSubsteps;
    }

    const step = this.fixedStepSeconds;
    const total = this.accumulatorSecondsValue + scaledDelta;

    if (!Number.isFinite(total)) {
      this.accumulatorSecondsValue = 0;
      this.simulatedSecondsValue += this.maxSubsteps * step;
      return this.maxSubsteps;
    }

    this.accumulatorSecondsValue = total;
    const availableSteps = Math.floor((total + STEP_EPSILON_SECONDS) / step);

    if (availableSteps > this.maxSubsteps) {
      // Drop all unprocessed whole steps; keep only the sub-step fraction so
      // alpha stays meaningful and the next frame starts fresh.
      this.accumulatorSecondsValue = total % step;
      this.simulatedSecondsValue += this.maxSubsteps * step;
      return this.maxSubsteps;
    }

    if (availableSteps <= 0) {
      return 0;
    }

    this.accumulatorSecondsValue = total - availableSteps * step;
    if (this.accumulatorSecondsValue < 0) {
      // The epsilon may have completed a step when total was a hair short.
      this.accumulatorSecondsValue = 0;
    }
    this.simulatedSecondsValue += availableSteps * step;
    return availableSteps;
  }

  /**
   * Clear accumulated remainder and simulated time. Speed and pause state are
   * configuration and are preserved.
   */
  reset(): void {
    this.accumulatorSecondsValue = 0;
    this.simulatedSecondsValue = 0;
  }
}
