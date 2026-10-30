/**
 * Shared runtime hooks for the two development fixtures.
 *
 * Both fixture configs use the same parameter, snapshot, and metrics types, so
 * one hook set is enough. It owns the concrete Canvas 2D renderer and the
 * fixture-specific metric rows; the controller never imports either.
 */

import { createSmokeLayers } from '../../components/story/canvas-smoke-layers';
import { Canvas2DRenderer } from '../../render/canvas2d/Canvas2DRenderer';
import type { StoryMetric, StoryModuleHooks } from '../runtime';
import type { SmokeMetrics, SmokeParams, SmokeSnapshot } from './canvas-smoke-engine';

export const FIXTURE_STAGE_DESCRIPTION =
  'A deterministic simulation whose camera, visible layers, and highlights follow the active chapter. The canvas is decorative; chapter prose and stage labels carry the meaning.';

export function createFixtureHooks(): StoryModuleHooks<SmokeParams, SmokeSnapshot, SmokeMetrics> {
  return {
    createRenderer: () =>
      new Canvas2DRenderer<SmokeParams, SmokeSnapshot>({
        layers: createSmokeLayers(),
        dprCap: 2,
      }),

    describeMetrics: ({ params, context }): readonly StoryMetric[] => [
      {
        id: 'sim-time',
        label: 'Simulated time',
        value: `${context.simulatedSeconds.toFixed(1)} s`,
      },
      {
        id: 'steps',
        label: 'Fixed steps',
        value: String(context.steps),
      },
      {
        id: 'orbit',
        label: 'Orbit radius',
        value: `${params.orbit.toFixed(2)} ×`,
      },
      {
        id: 'seed',
        label: 'Seed',
        value: String(params.seed),
      },
    ],

    describeStructural: (params) => ({ variant: params.variant }),

    controlPanel: 'fixture',
  };
}
