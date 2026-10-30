import { describe, expect, it } from 'vitest';
import { AcoEngine } from '../../src/engines/aco/engine';
import { createTspInstance } from '../../src/engines/aco/tsp';
import {
  acoCameraPresets,
  bestTourCamera,
  convergenceCamera,
  focusCityCamera,
  overviewCamera,
} from '../../src/stories/aco/camera';
import { ACO_DEFAULTS } from '../../src/stories/aco/config';
import {
  ACO_MAP_MAX_CITIES,
  ACO_MAP_MIN_CITIES,
  ACO_MAP_NUDGE_STEP,
  clampUnit,
  isEditableCityCount,
  suggestCityPoint,
  validateMapEdit,
  worldToCities,
  worldToCity,
} from '../../src/stories/aco/map';
import { acoWorldPoint } from '../../src/stories/aco/world';
import { loadStoryModule } from '../../src/stories/loader';

async function acoRuntime() {
  const module = await loadStoryModule('ant-colony-optimization');
  return { module, runtime: module.createRuntime() };
}

function runIterations(runtime: { step(deltaSeconds: number): void }, count: number): void {
  // The lab advances through the controller's fixed-step clock. One simulated
  // second is exactly one Ant System iteration at the default speed.
  for (let index = 0; index < count; index += 1) runtime.step(1);
}

describe('ACO lab camera presets', () => {
  it('computes finite, positive framing for every preset from the live snapshot', () => {
    const engine = new AcoEngine(ACO_DEFAULTS);
    for (let index = 0; index < 12; index += 1) engine.stepIteration();
    const presets = acoCameraPresets(engine.snapshot());

    expect(presets.map((preset) => preset.id)).toEqual([
      'overview',
      'focus-city',
      'best-tour',
      'convergence',
    ]);

    for (const preset of presets) {
      expect(preset.camera.kind).toBe('2d');
      if (preset.camera.kind !== '2d') throw new Error('Expected a 2D camera');
      expect(Number.isFinite(preset.camera.panX)).toBe(true);
      expect(Number.isFinite(preset.camera.panY)).toBe(true);
      expect(Number.isFinite(preset.camera.zoom)).toBe(true);
      expect(preset.camera.zoom).toBeGreaterThan(0);
    }
  });

  it('frames the live best-tour centroid and bounds rather than a fixed anchor', () => {
    const engine = new AcoEngine(ACO_DEFAULTS);
    for (let index = 0; index < 40; index += 1) engine.stepIteration();
    const snapshot = engine.snapshot();
    const tour = snapshot.bestTour ?? [];
    expect(tour.length).toBe(snapshot.cityCount);

    const points = tour.map((city) => acoWorldPoint(snapshot.cities[city] ?? { x: 0, y: 0 }));
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const camera = bestTourCamera(snapshot);
    if (camera.kind !== '2d') throw new Error('Expected a 2D camera');
    expect(camera.panX).toBeCloseTo((minX + maxX) / 2, 10);
    expect(camera.panY).toBeCloseTo((minY + maxY) / 2, 10);
  });

  it('focuses a real city, including a two-city map', () => {
    const small = createTspInstance(42, 2);
    const snapshot = {
      cityCount: small.cityCount,
      cities: small.cities,
      bestTour: null,
    };
    const camera = focusCityCamera(snapshot);
    if (camera.kind !== '2d') throw new Error('Expected a 2D camera');
    // City 17 is the narrative focus for large maps; small maps use their last
    // valid index so the preset never frames empty space.
    const expected = acoWorldPoint(small.cities[1] ?? { x: 0.5, y: 0.5 });
    expect(camera.panX).toBeCloseTo(expected.x, 12);
    expect(camera.panY).toBeCloseTo(expected.y, 12);

    // The overview and convergence presets stay finite even before a best tour.
    expect(overviewCamera(snapshot).kind).toBe('2d');
    expect(convergenceCamera(snapshot).kind).toBe('2d');
  });
});

describe('ACO map editing helpers', () => {
  it('clamps pointer coordinates to the unit square and preserves coincident cities', () => {
    expect(clampUnit(-3)).toBe(0);
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(Number.NaN)).toBe(0);

    const far = worldToCity({ x: 1000, y: -1000 });
    expect(far.x).toBe(1);
    expect(far.y).toBe(0);

    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 3 },
    ];
    const validation = validateMapEdit(points);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const cities = worldToCities(validation.points);
    expect(cities[0]).toEqual(cities[1]);
    expect(cities[2]?.x).toBeCloseTo(2 / 6 + 0.5, 12);
    expect(cities[2]?.y).toBe(1);

    // Coincident cities still get a finite, non-zero engine distance.
    const engine = new AcoEngine({ ...ACO_DEFAULTS, cityCount: 2 });
    const instance = createTspInstance(42, 2);
    const coincident = worldToCities([
      acoWorldPoint(instance.cities[0] ?? { x: 0, y: 0 }),
      acoWorldPoint(instance.cities[0] ?? { x: 0, y: 0 }),
    ]);
    engine.setCities(coincident);
    const distance = engine.snapshot().distanceMatrix.distance(0, 1);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(0);
  });

  it('accepts collinear cities and validates the UI city limits', () => {
    const collinear = [
      { x: -2, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(validateMapEdit(collinear).ok).toBe(true);

    expect(isEditableCityCount(ACO_MAP_MIN_CITIES)).toBe(true);
    expect(isEditableCityCount(ACO_MAP_MAX_CITIES)).toBe(true);
    expect(isEditableCityCount(ACO_MAP_MIN_CITIES - 1)).toBe(false);
    expect(isEditableCityCount(ACO_MAP_MAX_CITIES + 1)).toBe(false);
    expect(isEditableCityCount(2.5)).toBe(false);

    const tooFew = validateMapEdit([{ x: 0, y: 0 }]);
    expect(tooFew).toMatchObject({ ok: false, code: 'too-few-cities' });
    const tooMany = validateMapEdit(
      Array.from({ length: ACO_MAP_MAX_CITIES + 1 }, (_value, index) => ({
        x: index / ACO_MAP_MAX_CITIES,
        y: 0,
      })),
    );
    expect(tooMany).toMatchObject({ ok: false, code: 'too-many-cities' });
  });

  it('suggests a deterministic point that stays inside the map', () => {
    const cities = createTspInstance(42, 8).cities;
    const first = suggestCityPoint(cities);
    expect(suggestCityPoint(cities)).toEqual(first);
    expect(Number.isFinite(first.x)).toBe(true);
    expect(Number.isFinite(first.y)).toBe(true);
    expect(Math.abs(first.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(first.y)).toBeLessThanOrEqual(3);
    expect(ACO_MAP_NUDGE_STEP).toBeGreaterThan(0);
  });
});

describe('ACO lab runtime seams', () => {
  it('samples auxiliary history, fan, summary, camera, and map from the engine', async () => {
    const { module, runtime } = await acoRuntime();
    try {
      expect(module.view.lab).toBe('aco');
      runIterations(runtime, 3);

      const metrics = runtime.metrics({ simulatedSeconds: 3, steps: 180 });
      const auxiliary = runtime.auxiliary();
      expect(auxiliary).not.toBeNull();
      if (auxiliary === null) return;

      expect(auxiliary.history.length).toBe(3);
      expect(auxiliary.fan?.total).toBeCloseTo(1, 10);
      expect(auxiliary.fan?.entries.length).toBe(8);
      expect(auxiliary.cameraPresets).toHaveLength(4);
      expect(auxiliary.map?.points).toHaveLength(30);
      expect(auxiliary.map?.custom).toBe(false);
      expect(auxiliary.summary).toContain(
        metrics.find((item) => item.id === 'best-length')?.value ?? '—',
      );
      expect(auxiliary.summary).toContain(
        `after ${metrics.find((item) => item.id === 'iteration')?.value}`,
      );
      expect(auxiliary.summary).toContain('Best tour:');
    } finally {
      runtime.dispose();
    }
  });

  it('moves, adds, and removes cities; every edit restarts at iteration 0', async () => {
    const { runtime } = await acoRuntime();
    try {
      const map = runtime.map();
      expect(map).not.toBeNull();
      if (map === null) return;

      runIterations(runtime, 2);
      expect(runtime.metrics({ simulatedSeconds: 2, steps: 120 })[0]?.value).toBe('2');

      const before = map.getView();
      const moved = { x: before.points[0]?.x ?? 0, y: (before.points[0]?.y ?? 0) + 0.5 };
      map.setPoint(0, moved);

      const afterMove = map.getView();
      expect(afterMove.custom).toBe(true);
      expect(afterMove.points[0]?.x).toBeCloseTo(moved.x, 12);
      expect(afterMove.points[0]?.y).toBeCloseTo(moved.y, 12);
      expect(runtime.metrics({ simulatedSeconds: 0, steps: 0 })[0]?.value).toBe('0');
      expect(runtime.auxiliary()?.map?.custom).toBe(true);

      map.addPoint();
      expect(map.getView().points).toHaveLength(31);
      expect(runtime.params.cityCount).toBe(31);

      map.removePoint(0);
      expect(map.getView().points).toHaveLength(30);
      expect(runtime.params.cityCount).toBe(30);

      // Removing down to the UI minimum is refused.
      while (map.getView().points.length > ACO_MAP_MIN_CITIES) {
        map.removePoint(0);
      }
      expect(map.getView().points).toHaveLength(ACO_MAP_MIN_CITIES);
      expect(map.getView().canRemove).toBe(false);
      map.removePoint(0);
      expect(map.getView().points).toHaveLength(ACO_MAP_MIN_CITIES);
    } finally {
      runtime.dispose();
    }
  });

  it('restores the seeded map and keeps the bag coherent for later edits', async () => {
    const { runtime } = await acoRuntime();
    try {
      const map = runtime.map();
      if (map === null) throw new Error('Missing map runtime');

      map.addPoint();
      map.addPoint();
      expect(runtime.params.cityCount).toBe(32);

      // A later structural change must not silently regenerate an explicit map
      // with a stale city count from the parameter bag.
      runtime.setParams({ antCount: 12 });
      expect(runtime.auxiliary()?.map?.custom).toBe(true);
      expect(runtime.auxiliary()?.map?.points).toHaveLength(32);

      map.reset();
      expect(map.getView().custom).toBe(false);
      expect(map.getView().points).toHaveLength(32);
      expect(runtime.params.cityCount).toBe(32);

      const seeded = createTspInstance(ACO_DEFAULTS.seed, 32).cities;
      expect(map.getView().points).toEqual(
        seeded.map((city) => {
          const point = acoWorldPoint(city);
          return { x: point.x, y: point.y };
        }),
      );
    } finally {
      runtime.dispose();
    }
  });

  it('treats speed as presentation and α/β/ρ as structural', async () => {
    const { runtime } = await acoRuntime();
    try {
      runIterations(runtime, 2);
      const before = runtime.metrics({ simulatedSeconds: 2, steps: 120 });

      runtime.setParams({ speed: 4 });
      expect(runtime.metrics({ simulatedSeconds: 2, steps: 120 })).toEqual(before);

      runtime.setParams({ alpha: 0 });
      expect(runtime.metrics({ simulatedSeconds: 0, steps: 0 })[0]?.value).toBe('0');
    } finally {
      runtime.dispose();
    }
  });

  it('supports the documented edge cases through the same parameter bag', async () => {
    const { runtime } = await acoRuntime();
    try {
      runtime.setParams({ cityCount: 2, antCount: 1, alpha: 0, beta: 0, rho: 1 });
      runIterations(runtime, 4);
      const metrics = runtime.metrics({ simulatedSeconds: 4, steps: 240 });
      const auxiliary = runtime.auxiliary();
      expect(metrics.find((item) => item.id === 'cities')?.value).toBe('2');
      expect(metrics.find((item) => item.id === 'ants')?.value).toBe('1');
      expect(auxiliary?.fan?.total).toBeCloseTo(1, 10);
      expect(auxiliary?.summary).toMatch(/Best tour/);
    } finally {
      runtime.dispose();
    }
  });
});
