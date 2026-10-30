/**
 * Development-only engine for the Canvas 2D stage fixture.
 *
 * It is intentionally tiny: the point of the fixture is the renderer and stage
 * lifecycle, not a second algorithm. The snapshot object is reused on every
 * call so the smoke page also exercises the "renderer must not depend on a
 * freshly allocated snapshot" rule from Step 1.1.
 */

import type { Engine } from '../../engines/core/types';

export interface SmokeParams {
  readonly speed: number;
}

export interface SmokeSnapshot {
  readonly time: number;
  readonly phase: number;
  readonly pulse: number;
}

export interface SmokeMetrics {
  readonly simulatedSeconds: number;
}

export class SmokeEngine implements Engine<SmokeParams, SmokeSnapshot, SmokeMetrics> {
  private params: SmokeParams;
  private time = 0;
  private readonly snapshotValue = { time: 0, phase: 0, pulse: 0 };

  constructor(params: SmokeParams) {
    this.params = params;
  }

  reset(): void {
    this.time = 0;
    this.snapshotValue.time = 0;
    this.snapshotValue.phase = 0;
    this.snapshotValue.pulse = 0;
  }

  setParams(params: SmokeParams): void {
    this.params = params;
  }

  step(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    this.time += dtSeconds * this.params.speed;
    this.snapshotValue.time = this.time;
    this.snapshotValue.phase = this.time * 0.9;
    this.snapshotValue.pulse = 0.5 + 0.5 * Math.sin(this.time * 1.4);
  }

  snapshot(): Readonly<SmokeSnapshot> {
    return this.snapshotValue;
  }

  metrics(): Readonly<SmokeMetrics> {
    return { simulatedSeconds: this.time };
  }
}
