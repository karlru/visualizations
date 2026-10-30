/**
 * Ant System presets from `docs/stories.md` §2.5.
 *
 * A preset patches only the three exploration/exploitation parameters. It never
 * changes the city map, colony size, seed, or presentation speed, so applying a
 * preset is a structural change that restarts the run at iteration 0 with the
 * same map and seed.
 *
 * This module is pure data and has no runtime dependencies; the story config
 * (Step 3.1) can import it without pulling in the engine.
 */

import type { AcoParams } from './types';

/** Stable identifier used by the preset picker and the story URL. */
export type AcoPresetId = 'balanced' | 'greedy' | 'stagnant' | 'forgetful';

/**
 * The parameters a preset owns.
 *
 * These are exactly the structural parameters that define a colony's
 * behaviour on a fixed map. Keeping the patch narrow prevents a preset from
 * unexpectedly replacing the reader's city count, ant count, seed, or speed.
 */
export type AcoPresetPatch = Pick<AcoParams, 'alpha' | 'beta' | 'rho'>;

/** One selectable colony preset. */
export interface AcoPreset {
  /** Stable identifier. */
  readonly id: AcoPresetId;

  /** Short label for the picker. */
  readonly label: string;

  /** One-sentence intent shown beside the picker. */
  readonly description: string;

  /** Values applied to {@link AcoParams} when the preset is chosen. */
  readonly patch: AcoPresetPatch;
}

/**
 * The four release-1 presets, in display order.
 *
 * Values are copied from `docs/stories.md` §2.5 and are asserted by unit tests
 * so the documentation and the implementation cannot drift apart.
 */
export const ACO_PRESETS: readonly AcoPreset[] = Object.freeze([
  Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    description: 'A readable, effective colony: distance and pheromone both matter.',
    patch: Object.freeze({ alpha: 1, beta: 2, rho: 0.5 }),
  }),
  Object.freeze({
    id: 'greedy',
    label: 'Greedy',
    description: 'Distance dominates, so the colony becomes short-sighted.',
    patch: Object.freeze({ alpha: 0.5, beta: 8, rho: 0.5 }),
  }),
  Object.freeze({
    id: 'stagnant',
    label: 'Stagnant',
    description: 'Pheromone dominates and early paths lock in.',
    patch: Object.freeze({ alpha: 5, beta: 1, rho: 0.1 }),
  }),
  Object.freeze({
    id: 'forgetful',
    label: 'Forgetful',
    description: 'Strong evaporation keeps resetting the trails.',
    patch: Object.freeze({ alpha: 1, beta: 2, rho: 0.95 }),
  }),
]);

/** Look up a preset by id. Returns `undefined` for an unknown id. */
export function findAcoPreset(id: string): AcoPreset | undefined {
  return ACO_PRESETS.find((preset) => preset.id === id);
}
