/**
 * Development-only engine for the Canvas 2D stage fixture.
 *
 * It is intentionally tiny: the point of the fixture is the renderer and stage
 * lifecycle, not a second algorithm. The snapshot object is reused on every
 * call so the smoke page also exercises the "renderer must not depend on a
 * freshly allocated snapshot" rule from Step 1.1.
 *
 * Step 1.6 adds two harmless presentation parameters so the controls page can
 * demonstrate live changes without inventing a second simulation:
 *
 * - `orbit` scales the ant orbit around the focal city (0.4 … 2.4).
 * - `trails` shows or hides the ant-to-city trail lines (renderer-only).
 *
 * `seed` identifies the run. This fixture has no randomness, but the parameter
 * is kept in the typed object so the seed control exercises the same contract
 * the ACO and RANDU stories will use. Changing it is a reader action that
 * restarts the run; the controller owns that reset.
 *
 * Step 1.8 adds `variant` as a structural string enum. The fixture renders the
 * same orbit for both values; the field exists so the URL contract can be
 * exercised end-to-end with a real enum, exactly as RANDU's generator will be.
 */

import type { Engine } from '../../engines/core/types';

/** Structural run variant. Both values are deterministic. */
export type SmokeVariant = 'orbit' | 'spiral';

export interface SmokeParams {
  readonly speed: number;
  /** Orbit radius multiplier. Presentation only; deterministic per step. */
  readonly orbit: number;
  /** Whether ant trail lines are drawn. Renderer presentation only. */
  readonly trails: boolean;
  /** Reproducible run identity. Unused by this fixture; still typed. */
  readonly seed: number;
  /** Structural enum used to exercise URL state and chapter restarts. */
  readonly variant: SmokeVariant;
}

export interface SmokeSnapshot {
  readonly time: number;
  readonly phase: number;
  readonly pulse: number;
  readonly orbit: number;
}

export interface SmokeMetrics {
  readonly simulatedSeconds: number;
  readonly steps: number;
  readonly orbit: number;
}

const MIN_ORBIT = 0.4;
const MAX_ORBIT = 2.4;

function sanitizeOrbit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ORBIT, Math.max(MIN_ORBIT, value));
}

export class SmokeEngine implements Engine<SmokeParams, SmokeSnapshot, SmokeMetrics> {
  private params: SmokeParams;
  private time = 0;
  private steps = 0;
  private readonly snapshotValue = { time: 0, phase: 0, pulse: 0, orbit: 1 };

  constructor(params: SmokeParams) {
    this.params = { ...params, orbit: sanitizeOrbit(params.orbit) };
    this.snapshotValue.orbit = this.params.orbit;
  }

  reset(): void {
    this.time = 0;
    this.steps = 0;
    this.snapshotValue.time = 0;
    this.snapshotValue.phase = 0;
    this.snapshotValue.pulse = 0;
    this.snapshotValue.orbit = this.params.orbit;
  }

  setParams(params: SmokeParams): void {
    this.params = { ...params, orbit: sanitizeOrbit(params.orbit) };
    // Presentation changes must be visible immediately, even while paused.
    this.snapshotValue.orbit = this.params.orbit;
  }

  step(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    this.time += dtSeconds * this.params.speed;
    this.steps += 1;
    this.snapshotValue.time = this.time;
    this.snapshotValue.phase = this.time * 0.9;
    this.snapshotValue.pulse = 0.5 + 0.5 * Math.sin(this.time * 1.4);
    this.snapshotValue.orbit = this.params.orbit;
  }

  snapshot(): Readonly<SmokeSnapshot> {
    return this.snapshotValue;
  }

  metrics(): Readonly<SmokeMetrics> {
    return {
      simulatedSeconds: this.time,
      steps: this.steps,
      orbit: this.params.orbit,
    };
  }
}
