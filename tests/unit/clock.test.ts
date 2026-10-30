import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIXED_STEP_SECONDS,
  DEFAULT_MAX_SUBSTEPS,
  FixedStepClock,
} from '../../src/engines/core/clock';

/**
 * The clock's contract is small but exact: integer step counts, bounded
 * catch-up, retained sub-step remainder, and no accumulation while paused.
 */

const STEP = DEFAULT_FIXED_STEP_SECONDS;

/** Drive a clock with fixed-size frames and return the steps it requested. */
function drive(clock: FixedStepClock, seconds: number, fps: number): number {
  const frames = Math.round(seconds * fps);
  const frameDelta = seconds / frames;
  let steps = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    steps += clock.advance(frameDelta);
  }
  return steps;
}

describe('Frame-rate independence', () => {
  it('produces the same number of fixed steps at 30, 60, and 120 fps', () => {
    const results = [30, 60, 120].map((fps) => {
      const clock = new FixedStepClock();
      const steps = drive(clock, 2, fps);
      return { fps, steps, simulated: clock.simulatedSeconds };
    });

    for (const result of results) {
      expect(result.steps, `${result.fps} fps`).toBe(120);
      expect(result.simulated, `${result.fps} fps`).toBeCloseTo(2, 12);
    }
  });

  it('converges to the same simulated state for other elapsed times', () => {
    for (const seconds of [0.5, 1, 3]) {
      const states = [30, 60, 120].map((fps) => {
        const clock = new FixedStepClock();
        let state = 0;
        let totalSteps = 0;
        const frames = Math.round(seconds * fps);
        const frameDelta = seconds / frames;

        for (let frame = 0; frame < frames; frame += 1) {
          const steps = clock.advance(frameDelta);
          totalSteps += steps;
          for (let i = 0; i < steps; i += 1) {
            state += clock.fixedStepSeconds;
          }
        }

        return { state, totalSteps };
      });

      expect(states[0]?.totalSteps).toBe(states[1]?.totalSteps);
      expect(states[1]?.totalSteps).toBe(states[2]?.totalSteps);
      expect(Math.abs((states[0]?.state ?? 0) - (states[2]?.state ?? 0))).toBeLessThan(1e-9);
      expect(states[0]?.state).toBeCloseTo(seconds, 1);
    }
  });
});

describe('fixed-step accumulator', () => {
  it('exposes documented defaults', () => {
    const clock = new FixedStepClock();

    expect(clock.fixedStepSeconds).toBe(STEP);
    expect(clock.maxSubsteps).toBe(DEFAULT_MAX_SUBSTEPS);
    expect(clock.speed).toBe(1);
    expect(clock.paused).toBe(false);
    expect(clock.simulatedSeconds).toBe(0);
    expect(clock.accumulatorSeconds).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('returns one step for one fixed step and keeps alpha in [0, 1)', () => {
    const clock = new FixedStepClock();

    expect(clock.advance(STEP)).toBe(1);
    expect(clock.simulatedSeconds).toBeCloseTo(STEP, 15);
    expect(clock.accumulatorSeconds).toBeLessThan(STEP);
    expect(clock.alpha).toBeGreaterThanOrEqual(0);
    expect(clock.alpha).toBeLessThan(1);
  });

  it('retains the sub-step remainder across frames', () => {
    const clock = new FixedStepClock({ fixedStepSeconds: 1 });

    expect(clock.advance(0.6)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.6, 12);

    expect(clock.advance(0.5)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0.1, 12);

    expect(clock.advance(0.4)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.5, 12);

    expect(clock.simulatedSeconds).toBe(1);
  });

  it('returns an integer step count', () => {
    const clock = new FixedStepClock();
    for (const delta of [0, 0.001, STEP, STEP * 3.7, 0.25]) {
      expect(Number.isInteger(clock.advance(delta))).toBe(true);
    }
  });

  it('reset() clears the remainder and simulated time but keeps configuration', () => {
    const clock = new FixedStepClock({ fixedStepSeconds: 0.1, speed: 2, paused: true });

    clock.advance(1);
    clock.reset();

    expect(clock.simulatedSeconds).toBe(0);
    expect(clock.accumulatorSeconds).toBe(0);
    expect(clock.alpha).toBe(0);
    expect(clock.speed).toBe(2);
    expect(clock.paused).toBe(true);
    expect(clock.fixedStepSeconds).toBe(0.1);
  });

  it('validates its configuration', () => {
    expect(() => new FixedStepClock({ fixedStepSeconds: 0 })).toThrow(RangeError);
    expect(() => new FixedStepClock({ fixedStepSeconds: -1 })).toThrow(RangeError);
    expect(() => new FixedStepClock({ fixedStepSeconds: Number.NaN })).toThrow(RangeError);
    expect(() => new FixedStepClock({ fixedStepSeconds: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
    expect(() => new FixedStepClock({ maxSubsteps: 0 })).toThrow(RangeError);
    expect(() => new FixedStepClock({ maxSubsteps: 1.5 })).toThrow(RangeError);
    expect(() => new FixedStepClock({ maxSubsteps: Number.NaN })).toThrow(RangeError);
  });
});

describe('catch-up cap and long tab-away gaps', () => {
  it('never returns more than maxSubsteps', () => {
    const clock = new FixedStepClock({ fixedStepSeconds: 0.1, maxSubsteps: 3 });

    expect(clock.advance(1)).toBe(3);
    expect(clock.simulatedSeconds).toBeCloseTo(0.3, 12);
    expect(clock.accumulatorSeconds).toBeLessThan(0.1);
    expect(clock.advance(0)).toBe(0);
  });

  it('caps a 60-second gap and does not replay a backlog', () => {
    const clock = new FixedStepClock();

    const steps = clock.advance(60);

    expect(steps).toBe(DEFAULT_MAX_SUBSTEPS);
    expect(clock.simulatedSeconds).toBeCloseTo(DEFAULT_MAX_SUBSTEPS * STEP, 12);
    expect(clock.accumulatorSeconds).toBeLessThan(STEP);
    expect(clock.advance(0)).toBe(0);
  });

  it('stays bounded across repeated long frames', () => {
    const clock = new FixedStepClock({ fixedStepSeconds: 0.1, maxSubsteps: 3 });

    for (let frame = 0; frame < 100; frame += 1) {
      expect(clock.advance(60)).toBe(3);
      expect(clock.accumulatorSeconds).toBeLessThan(0.1);
    }

    expect(clock.simulatedSeconds).toBeCloseTo(30, 9);
  });

  it('treats overflowing finite deltas as a maximum catch-up frame', () => {
    const clock = new FixedStepClock({ speed: Number.MAX_VALUE });

    expect(clock.advance(Number.MAX_VALUE)).toBe(DEFAULT_MAX_SUBSTEPS);
    expect(clock.simulatedSeconds).toBeCloseTo(DEFAULT_MAX_SUBSTEPS * STEP, 12);
  });

  it('never exceeds maxSubsteps for arbitrary delta sequences', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.double({ min: 0, max: 120, noNaN: true }),
            fc.double({ min: -120, max: 0, noNaN: true }),
            fc.constant(Number.NaN),
            fc.constant(Number.POSITIVE_INFINITY),
            fc.constant(Number.NEGATIVE_INFINITY),
          ),
          { maxLength: 100 },
        ),
        (deltas) => {
          const clock = new FixedStepClock({ fixedStepSeconds: 0.05, maxSubsteps: 4 });

          for (const delta of deltas) {
            const before = clock.simulatedSeconds;
            const steps = clock.advance(delta);

            expect(Number.isInteger(steps)).toBe(true);
            expect(steps).toBeGreaterThanOrEqual(0);
            expect(steps).toBeLessThanOrEqual(4);
            expect(clock.simulatedSeconds - before).toBeCloseTo(steps * 0.05, 10);
            expect(clock.alpha).toBeGreaterThanOrEqual(0);
            expect(clock.alpha).toBeLessThan(1);
          }
        },
      ),
      { numRuns: 100, seed: 20261030 },
    );
  });
});

describe('pause and speed', () => {
  it('pauses advancement and does not accumulate wall time', () => {
    const clock = new FixedStepClock({ fixedStepSeconds: 1 });

    expect(clock.advance(0.4)).toBe(0);
    clock.paused = true;

    expect(clock.advance(10)).toBe(0);
    expect(clock.advance(STEP)).toBe(0);
    expect(clock.accumulatorSeconds).toBeCloseTo(0.4, 12);
    expect(clock.simulatedSeconds).toBe(0);

    clock.paused = false;
    expect(clock.advance(0.6)).toBe(1);
    expect(clock.simulatedSeconds).toBe(1);
  });

  it('resumes without a burst after a long pause', () => {
    const clock = new FixedStepClock({ paused: true });

    expect(clock.advance(60)).toBe(0);

    clock.paused = false;

    expect(clock.advance(STEP)).toBe(1);
    expect(clock.simulatedSeconds).toBeCloseTo(STEP, 15);
  });

  it('doubles simulated time at 2× speed', () => {
    const clock = new FixedStepClock({ maxSubsteps: 64, speed: 2 });

    const steps = drive(clock, 1, 60);

    expect(steps).toBe(120);
    expect(clock.simulatedSeconds).toBeCloseTo(2, 12);
  });

  it('halves simulated time at 0.5× speed', () => {
    const clock = new FixedStepClock({ maxSubsteps: 64, speed: 0.5 });

    const steps = drive(clock, 2, 60);

    expect(steps).toBe(60);
    expect(clock.simulatedSeconds).toBeCloseTo(1, 12);
  });

  it('coerces invalid or non-positive speeds to zero', () => {
    const clock = new FixedStepClock();

    for (const speed of [-2, Number.NaN, Number.POSITIVE_INFINITY, 0]) {
      clock.speed = speed;
      expect(clock.speed).toBe(0);
      expect(clock.advance(1)).toBe(0);
      expect(clock.simulatedSeconds).toBe(0);
    }

    clock.speed = 3;
    expect(clock.speed).toBe(3);
    expect(drive(clock, 1, 60)).toBe(180);
  });
});

describe('invalid deltas', () => {
  it('ignores negative, NaN, and infinite deltas without touching state', () => {
    const clock = new FixedStepClock();

    for (const delta of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -STEP,
      -0,
    ]) {
      expect(clock.advance(delta)).toBe(0);
      expect(clock.accumulatorSeconds).toBe(0);
      expect(clock.simulatedSeconds).toBe(0);
      expect(clock.alpha).toBe(0);
    }
  });
});
