/**
 * Second development engine, used to prove that the story runtime is reusable.
 *
 * It implements the same engine contract and snapshot shape as the orbit
 * fixture, but its motion is a deterministic square-wave pulse. The renderer
 * sees the same presentation fields, so the second story reuses the Canvas 2D
 * renderer without changing `StoryController`.
 *
 * Determinism matters more than realism here: chapter entry resets the engine,
 * and the same seed/structural parameters always produce the same frame at the
 * same fixed step.
 */

import type { Engine } from '../../engines/core/types';
import type { SmokeMetrics, SmokeParams, SmokeSnapshot } from './canvas-smoke-engine';

const MIN_ORBIT = 0.4;
const MAX_ORBIT = 2.4;
const PULSE_STEPS = 8;

function sanitizeOrbit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ORBIT, Math.max(MIN_ORBIT, value));
}

export class PulseEngine implements Engine<SmokeParams, SmokeSnapshot, SmokeMetrics> {
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
    this.snapshotValue.orbit = this.params.orbit;
  }

  step(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;

    const rate = this.params.variant === 'spiral' ? 1.15 : 0.85;
    this.time += dtSeconds * this.params.speed * rate;
    this.steps += 1;

    const cycle = this.time * PULSE_STEPS;
    this.snapshotValue.time = this.time;
    this.snapshotValue.phase = cycle % (Math.PI * 2);
    this.snapshotValue.pulse = Math.abs((((cycle % 2) + 2) % 2) - 1);
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
