import { describe, expect, it } from 'vitest';
import {
  capQualityForWorkload,
  detectQualityTier,
  parseStoredQualityPreference,
  QUALITY_PREFERENCE_OPTIONS,
  QUALITY_PROFILES,
  qualityProfile,
  qualityTierLabel,
  resolveQualityTier,
  serializeQualityPreference,
  WORKLOAD_LOW_THRESHOLDS,
  WORKLOAD_MEDIUM_THRESHOLDS,
  workloadQualityTier,
} from '../../src/lib/quality';

describe('quality tier detection', () => {
  it('starts high on a capable fine-pointer device', () => {
    expect(
      detectQualityTier({ coarsePointer: false, hardwareConcurrency: 8, deviceMemory: 8 }),
    ).toBe('high');
  });

  it('starts medium on a coarse pointer even with capable hardware', () => {
    expect(
      detectQualityTier({ coarsePointer: true, hardwareConcurrency: 8, deviceMemory: 8 }),
    ).toBe('medium');
  });

  it('starts medium on a constrained fine-pointer device', () => {
    expect(
      detectQualityTier({ coarsePointer: false, hardwareConcurrency: 4, deviceMemory: 8 }),
    ).toBe('medium');
    expect(
      detectQualityTier({ coarsePointer: false, hardwareConcurrency: 8, deviceMemory: 4 }),
    ).toBe('medium');
  });

  it('starts low on a coarse pointer with constrained hardware', () => {
    expect(
      detectQualityTier({ coarsePointer: true, hardwareConcurrency: 4, deviceMemory: 8 }),
    ).toBe('low');
    expect(
      detectQualityTier({ coarsePointer: true, hardwareConcurrency: 8, deviceMemory: 4 }),
    ).toBe('low');
  });

  it('starts low for save-data or very small devices', () => {
    expect(
      detectQualityTier({ coarsePointer: false, hardwareConcurrency: 16, saveData: true }),
    ).toBe('low');
    expect(detectQualityTier({ coarsePointer: false, hardwareConcurrency: 2 })).toBe('low');
  });

  it('ignores unknown hints instead of treating them as zero', () => {
    expect(detectQualityTier({})).toBe('high');
    expect(detectQualityTier({ hardwareConcurrency: Number.NaN, deviceMemory: 0 })).toBe('high');
  });
});

describe('quality profile mapping', () => {
  it('resolves the reader preference, with auto following detection', () => {
    expect(resolveQualityTier('auto', 'low')).toBe('low');
    expect(resolveQualityTier('auto', 'high')).toBe('high');
    expect(resolveQualityTier('high', 'low')).toBe('high');
    expect(resolveQualityTier('low', 'high')).toBe('low');
  });

  it('reduces presentation cost monotonically from high to low', () => {
    const high = QUALITY_PROFILES.high;
    const medium = QUALITY_PROFILES.medium;
    const low = QUALITY_PROFILES.low;

    expect(high.dprCap).toBe(2);
    expect(high.dprCap).toBeGreaterThan(medium.dprCap);
    expect(medium.dprCap).toBeGreaterThan(low.dprCap);
    expect(low.dprCap).toBeGreaterThanOrEqual(1);

    expect(high.maxRenderedAnts).toBeGreaterThan(medium.maxRenderedAnts);
    expect(medium.maxRenderedAnts).toBeGreaterThan(low.maxRenderedAnts);
    expect(high.trailSamples).toBeGreaterThan(medium.trailSamples);
    expect(medium.trailSamples).toBeGreaterThan(low.trailSamples);
    expect(high.pheromoneBuckets).toBeGreaterThan(medium.pheromoneBuckets);
    expect(medium.pheromoneBuckets).toBeGreaterThan(low.pheromoneBuckets);
    expect(high.edgeStride).toBe(1);
    expect(medium.edgeStride).toBeGreaterThan(1);
    expect(low.edgeStride).toBeGreaterThan(medium.edgeStride);
    expect(low.tourHalo).toBe(false);
  });

  it('falls back to the high profile for malformed input', () => {
    expect(qualityProfile('bogus' as never)).toBe(QUALITY_PROFILES.high);
    expect(qualityTierLabel('high')).toBe('High');
    expect(qualityTierLabel('medium')).toBe('Medium');
    expect(qualityTierLabel('low')).toBe('Low');
  });

  it('offers Auto plus all three explicit tiers', () => {
    expect(QUALITY_PREFERENCE_OPTIONS.map((option) => option.value)).toEqual([
      'auto',
      'high',
      'medium',
      'low',
    ]);
  });
});

describe('workload quality cap', () => {
  it('leaves the default 30 × 40 instance at its detected tier', () => {
    expect(workloadQualityTier({ cities: 30, ants: 40 })).toBe('high');
    expect(capQualityForWorkload('high', { cities: 30, ants: 40 })).toBe('high');
  });

  it('drops to medium above 60 cities or 80 ants', () => {
    expect(workloadQualityTier({ cities: 61, ants: 40 })).toBe('medium');
    expect(workloadQualityTier({ cities: 30, ants: 81 })).toBe('medium');
    // Thresholds are strict: exactly at the boundary keeps the next tier up.
    expect(workloadQualityTier({ cities: 60, ants: 80 })).toBe('high');
  });

  it('drops to low at the 150 × 200 worst case', () => {
    expect(
      workloadQualityTier({
        cities: WORKLOAD_LOW_THRESHOLDS.cities + 1,
        ants: WORKLOAD_LOW_THRESHOLDS.ants + 1,
      }),
    ).toBe('low');
    expect(workloadQualityTier({ cities: 150, ants: 200 })).toBe('low');
    expect(workloadQualityTier({ cities: WORKLOAD_MEDIUM_THRESHOLDS.cities + 1, ants: 40 })).toBe(
      'medium',
    );
  });

  it('caps an explicit high choice but never raises a lower one', () => {
    expect(capQualityForWorkload('high', { cities: 150, ants: 200 })).toBe('low');
    expect(capQualityForWorkload('medium', { cities: 150, ants: 200 })).toBe('low');
    expect(capQualityForWorkload('low', { cities: 30, ants: 40 })).toBe('low');
    expect(capQualityForWorkload('medium', { cities: 30, ants: 40 })).toBe('medium');
  });

  it('treats missing or malformed counts as zero instead of forcing a drop', () => {
    expect(workloadQualityTier({ cities: 0, ants: 0 })).toBe('high');
    expect(workloadQualityTier({ cities: Number.NaN, ants: 0 })).toBe('high');
  });
});

describe('quality preference parsing', () => {
  it('round-trips every explicit tier and treats unknown stored values as auto', () => {
    for (const value of ['auto', 'high', 'medium', 'low'] as const) {
      expect(serializeQualityPreference(value)).toBe(value);
      expect(parseStoredQualityPreference(value)).toBe(value);
    }
    expect(parseStoredQualityPreference(null)).toBe('auto');
    expect(parseStoredQualityPreference('ultra')).toBe('auto');
  });
});
