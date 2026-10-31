/**
 * Quality-tier policy.
 *
 * A quality tier is a **presentation** profile. It caps the backing-store DPR
 * and reduces how much of the simulation is drawn (rendered ant subset, trail
 * samples, pheromone buckets, candidate-edge density, tour halo). It never
 * changes city or ant counts, engine parameters, or the deterministic run
 * identity. See `docs/technology.md` §4.5 and `docs/requirements.md`
 * FR-PERF-08/FR-PERF-12.
 *
 * Detection is a pure function of the hints the reader's browser exposes, so
 * the mapping is unit-tested without a DOM. The controller supplies the hints
 * once on mount; an explicit reader choice always wins over *detection*. A
 * large current workload additionally caps the tier (`capQualityForWorkload`),
 * because drawing 150 cities at high detail cannot meet the frame budget on a
 * phone. That cap is presentation-only and takes effect without a reload.
 */

import type { QualityTier } from '../engines/core/types';

/** Reader choice. `auto` resolves to the detected tier. */
export type QualityPreference = QualityTier | 'auto';

/** Browser hints used for the initial tier. Missing values are unknown, not zero. */
export interface QualityEnvironment {
  readonly coarsePointer?: boolean;
  /** `navigator.hardwareConcurrency`; 0 or undefined means unknown. */
  readonly hardwareConcurrency?: number;
  /** `navigator.deviceMemory` in GiB; 0 or undefined means unknown. */
  readonly deviceMemory?: number;
  /** `navigator.connection.saveData`. */
  readonly saveData?: boolean;
}

/**
 * The presentation budget for one tier.
 *
 * `maxRenderedAnts` is a drawing cap only: the engine still simulates every
 * ant. `edgeStride` samples every Nth candidate edge, so a low-tier 150-city
 * graph paints a sparse deterministic subset rather than the full all-pairs
 * lattice.
 */
export interface QualityProfile {
  readonly tier: QualityTier;
  /** Maximum canvas backing-store ratio. */
  readonly dprCap: number;
  /** Maximum ant dots drawn per frame. */
  readonly maxRenderedAnts: number;
  /** Trail samples per rendered ant; below 2 draws no trail. */
  readonly trailSamples: number;
  /** Active pheromone intensity buckets (out of the cached 20-step ramp). */
  readonly pheromoneBuckets: number;
  /** Draw every Nth candidate edge (1 = every edge). */
  readonly edgeStride: number;
  /** Draw the best-tour halo. The dashed line and markers always remain. */
  readonly tourHalo: boolean;
}

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = Object.freeze({
  high: Object.freeze({
    tier: 'high',
    dprCap: 2,
    maxRenderedAnts: 200,
    trailSamples: 6,
    pheromoneBuckets: 20,
    edgeStride: 1,
    tourHalo: true,
  }),
  medium: Object.freeze({
    tier: 'medium',
    dprCap: 1.5,
    maxRenderedAnts: 48,
    trailSamples: 4,
    pheromoneBuckets: 12,
    edgeStride: 2,
    tourHalo: true,
  }),
  low: Object.freeze({
    tier: 'low',
    dprCap: 1,
    maxRenderedAnts: 16,
    trailSamples: 2,
    pheromoneBuckets: 8,
    edgeStride: 4,
    tourHalo: false,
  }),
});

/** Profile for a tier, with a high-quality fallback for malformed input. */
export function qualityProfile(tier: QualityTier): QualityProfile {
  return QUALITY_PROFILES[tier] ?? QUALITY_PROFILES.high;
}

/** Label used by the visible quality badge and the settings select. */
export function qualityTierLabel(tier: QualityTier): string {
  if (tier === 'low') return 'Low';
  if (tier === 'medium') return 'Medium';
  return 'High';
}

/** Labels for the reader-facing preference control. */
export const QUALITY_PREFERENCE_OPTIONS: readonly {
  readonly value: QualityPreference;
  readonly label: string;
}[] = Object.freeze([
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]);

/**
 * Initial tier from coarse-pointer and hardware hints.
 *
 * Rules, in order:
 * 1. `saveData` or a very small device (≤ 2 logical cores) starts low.
 * 2. A coarse pointer on a constrained device (≤ 4 cores or ≤ 4 GiB) starts low.
 * 3. A coarse pointer, or a constrained device on its own, starts medium.
 * 4. Everything else starts high.
 *
 * Unknown hints are ignored, so a browser that exposes nothing defaults to
 * high; the reader can always choose a lower tier.
 */
export function detectQualityTier(environment: QualityEnvironment): QualityTier {
  const coarse = environment.coarsePointer === true;
  const cores = normaliseHint(environment.hardwareConcurrency);
  const memory = normaliseHint(environment.deviceMemory);
  const constrained = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
  const verySmall = cores > 0 && cores <= 2;

  if (environment.saveData === true || verySmall) return 'low';
  if (coarse && constrained) return 'low';
  if (coarse || constrained) return 'medium';
  return 'high';
}

/** City and ant counts for the current run. Presentation only. */
export interface QualityWorkload {
  readonly cities: number;
  readonly ants: number;
}

/**
 * Workload thresholds at which presentation cost must drop.
 *
 * They are deliberately below the 150-city × 200-ant worst case so the tier
 * changes before the frame budget is exceeded, not after. The default 30 × 40
 * story instance is well under both bands and keeps its detected tier.
 */
export const WORKLOAD_MEDIUM_THRESHOLDS = Object.freeze({ cities: 60, ants: 80 });
export const WORKLOAD_LOW_THRESHOLDS = Object.freeze({ cities: 80, ants: 120 });

/**
 * Presentation ceiling demanded by the current workload.
 *
 * > 80 cities or > 120 ants is low; > 60 cities or > 80 ants is medium;
 * everything else is high. This is a cap on drawing cost only: the engine
 * still simulates every ant and every city.
 */
export function workloadQualityTier(workload: QualityWorkload): QualityTier {
  const cities = normaliseHint(workload.cities);
  const ants = normaliseHint(workload.ants);
  if (cities > WORKLOAD_LOW_THRESHOLDS.cities || ants > WORKLOAD_LOW_THRESHOLDS.ants) {
    return 'low';
  }
  if (cities > WORKLOAD_MEDIUM_THRESHOLDS.cities || ants > WORKLOAD_MEDIUM_THRESHOLDS.ants) {
    return 'medium';
  }
  return 'high';
}

const TIER_RANK: Readonly<Record<QualityTier, number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
});

/**
 * Lower a tier to the workload ceiling.
 *
 * The workload cap is a hard presentation budget, so it applies to an explicit
 * reader choice as well as to `auto`: a 150-city graph is never drawn at high
 * detail even if the reader asked for it. The UI labels the result as reduced
 * so the choice is visible rather than silently ignored.
 */
export function capQualityForWorkload(tier: QualityTier, workload: QualityWorkload): QualityTier {
  const cap = workloadQualityTier(workload);
  return (TIER_RANK[cap] ?? 2) < (TIER_RANK[tier] ?? 2) ? cap : tier;
}

function normaliseHint(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Resolve the reader's preference against the detected tier. */
export function resolveQualityTier(
  preference: QualityPreference,
  detected: QualityTier,
): QualityTier {
  return preference === 'auto' ? detected : preference;
}

/** Parse a stored preference. Missing or unknown values mean `auto`. */
export function parseStoredQualityPreference(value: string | null | undefined): QualityPreference {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'auto';
}

/** Serialize a preference for the safe persistence wrapper. */
export function serializeQualityPreference(preference: QualityPreference): string {
  return preference;
}
