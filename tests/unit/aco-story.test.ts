import { describe, expect, it } from 'vitest';
import { AcoEngine } from '../../src/engines/aco/engine';
import { createTspInstance } from '../../src/engines/aco/tsp';
import type { AcoParams } from '../../src/engines/aco/types';
import { parseUrlState, serializeUrlState } from '../../src/engines/core/url-state';
import { composeSceneState } from '../../src/lib/scene-composition';
import { ACO_ANNOTATIONS } from '../../src/stories/aco/annotations';
import {
  ACO_CHAPTER_IDS,
  ACO_CHAPTERS,
  ACO_DEFAULTS,
  ACO_SLUG,
  ACO_STORY_PRESETS,
  ACO_URL_PARAMS,
  acoStoryConfig,
} from '../../src/stories/aco/config';
import {
  ACO_CANVAS_LAYER_IDS,
  ACO_SCENE_IDS,
  ACO_SCENES,
  type AcoSceneDefinition,
} from '../../src/stories/aco/scenes';
import {
  ACO_BEST_TOUR_CENTROID,
  ACO_BEST_TOUR_LENGTH,
  ACO_FOCAL_CITY,
  ACO_FOCAL_CITY_INDEX,
  ACO_FOCAL_WORLD,
  acoWorldPoint,
} from '../../src/stories/aco/world';

/** The chapter ↔ scene contract that prose and E2E tests must be able to rely on. */
const EXPECTED_CHAPTERS = [
  ['the-colony', 'The colony', 'colony-overview'],
  ['the-problem', 'The problem', 'tour-problem'],
  ['one-ants-choice', "One ant's choice", 'focal-choice'],
  ['the-probability-rule', 'The probability rule', 'probability-rule'],
  ['leaving-a-trace', 'Leaving a trace', 'deposit'],
  ['forgetting', 'Forgetting', 'evaporation'],
  ['emergence', 'Emergence', 'emergence'],
  ['tuning-the-colony', 'Tuning the colony', 'tuning'],
  ['when-it-fails', 'When it fails', 'limits'],
  ['the-lab', 'The lab', 'lab'],
] as const;

function sceneOf(sceneId: string): AcoSceneDefinition {
  const scene = ACO_SCENES[sceneId as keyof typeof ACO_SCENES];
  if (scene === undefined) throw new Error(`Missing scene "${sceneId}"`);
  return scene;
}

function cameraOf(scene: AcoSceneDefinition): {
  readonly kind: '2d';
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly rotation?: number;
} {
  if (scene.camera.kind !== '2d') throw new Error(`Scene "${scene.id}" must use a 2D camera`);
  return scene.camera;
}

function findPreset(id: string) {
  const preset = ACO_STORY_PRESETS.find((entry) => entry.id === id);
  if (preset === undefined) throw new Error(`Missing preset "${id}"`);
  return preset;
}

describe('ACO chapter and scene map', () => {
  it('declares exactly ten chapters and ten scenes with unique ids', () => {
    expect(ACO_CHAPTERS).toHaveLength(10);
    expect(ACO_SCENE_IDS).toHaveLength(10);
    expect(ACO_SCENE_IDS).toHaveLength(Object.keys(ACO_SCENES).length);

    expect(new Set(ACO_CHAPTERS.map((chapter) => chapter.id)).size).toBe(10);
    expect(new Set(ACO_SCENE_IDS).size).toBe(10);
  });

  it('matches the documented chapter, title, and scene table in order', () => {
    expect(ACO_CHAPTERS.map((chapter) => [chapter.id, chapter.title, chapter.scene])).toEqual(
      EXPECTED_CHAPTERS,
    );
    expect(ACO_CHAPTER_IDS).toEqual(EXPECTED_CHAPTERS.map(([id]) => id));
  });

  it('gives every chapter exactly one existing scene and references each scene once', () => {
    const references = new Map<string, number>();
    for (const chapter of ACO_CHAPTERS) {
      expect(sceneOf(chapter.scene)).toBeDefined();
      references.set(chapter.scene, (references.get(chapter.scene) ?? 0) + 1);
    }

    for (const sceneId of ACO_SCENE_IDS) {
      expect(references.get(sceneId)).toBe(1);
    }
  });

  it('gives every chapter a pseudocode line and two to four reduced-motion steps', () => {
    for (const chapter of ACO_CHAPTERS) {
      expect(chapter.pseudocodeLine).toBeTypeOf('number');
      expect(Number.isInteger(chapter.pseudocodeLine)).toBe(true);
      expect(chapter.pseudocodeLine).toBeGreaterThanOrEqual(0);
      expect(chapter.pseudocodeLine).toBeLessThanOrEqual(9);
      expect(chapter.reducedMotionSteps).toBeGreaterThanOrEqual(2);
      expect(chapter.reducedMotionSteps).toBeLessThanOrEqual(4);
      expect(chapter.tourAct).toBeUndefined();
    }
  });
});

describe('ACO scenes', () => {
  it('declares a finite 2D camera, canonical layers, and labels in every scene', () => {
    for (const sceneId of ACO_SCENE_IDS) {
      const scene = sceneOf(sceneId);
      expect(scene.id).toBe(sceneId);

      const camera = cameraOf(scene);
      expect(Number.isFinite(camera.panX)).toBe(true);
      expect(Number.isFinite(camera.panY)).toBe(true);
      expect(Number.isFinite(camera.zoom)).toBe(true);
      expect(camera.zoom).toBeGreaterThan(0);
      expect(Number.isFinite(camera.rotation ?? 0)).toBe(true);

      expect(scene.layers.map((layer) => layer.id)).toEqual(ACO_CANVAS_LAYER_IDS);
      for (const layer of scene.layers) {
        expect(layer.opacity).toBeGreaterThanOrEqual(0);
        expect(layer.opacity).toBeLessThanOrEqual(1);
      }
      expect(scene.layers.find((layer) => layer.id === 'graph')?.visible).toBe(true);

      expect(scene.labels.length).toBeGreaterThan(0);
      expect(new Set(scene.labels.map((label) => label.id)).size).toBe(scene.labels.length);
      expect(typeof scene.convergenceChart).toBe('boolean');
    }
  });

  it('uses only the canonical canvas layer ids and keeps the chart out of them', () => {
    expect(ACO_CANVAS_LAYER_IDS).toEqual([
      'graph',
      'pheromone',
      'ants',
      'best-tour',
      'probability-fan',
    ]);
  });

  it('resolves every chapter annotation in its own scene and uses the whole catalogue', () => {
    const used = new Set<string>();

    for (const chapter of ACO_CHAPTERS) {
      const scene = sceneOf(chapter.scene);
      const labelIds = new Set(scene.labels.map((label) => label.id));
      const annotations = chapter.annotations ?? [];
      expect(annotations.length).toBeGreaterThan(0);

      for (const annotationId of annotations) {
        expect(ACO_ANNOTATIONS[annotationId]).toBeDefined();
        expect(labelIds.has(annotationId)).toBe(true);
        used.add(annotationId);
      }
    }

    expect([...used].sort()).toEqual(Object.keys(ACO_ANNOTATIONS).sort());
  });

  it('shows the DOM convergence chart only where the narrative calls for it', () => {
    expect(sceneOf('emergence').convergenceChart).toBe(true);
    expect(sceneOf('colony-overview').convergenceChart).toBe(false);
    expect(sceneOf('lab').convergenceChart).toBe(true);
  });
});

describe('ACO camera moves', () => {
  it('frames a real city of the default seed-42/30-city layout', () => {
    const instance = createTspInstance(42, 30);
    const actualFocalCity = instance.cities[ACO_FOCAL_CITY_INDEX];
    expect(actualFocalCity).toEqual(ACO_FOCAL_CITY);

    const focalWorld = acoWorldPoint(actualFocalCity);
    expect(focalWorld.x).toBeCloseTo(ACO_FOCAL_WORLD.x, 12);
    expect(focalWorld.y).toBeCloseTo(ACO_FOCAL_WORLD.y, 12);

    const camera = cameraOf(sceneOf('focal-choice'));
    const distanceToNearestCity = Math.min(
      ...instance.cities.map((city) => {
        const point = acoWorldPoint(city);
        return Math.hypot(point.x - camera.panX, point.y - camera.panY);
      }),
    );
    expect(distanceToNearestCity).toBeLessThan(1e-9);

    const focalLabel = sceneOf('focal-choice').labels.find((label) => label.id === 'focal-city');
    expect(focalLabel?.anchor).toEqual({
      space: 'world2d',
      x: camera.panX,
      y: camera.panY,
    });
  });

  it('includes overview, focal zoom, best-tour follow, and convergence pull-back poses', () => {
    const overview = cameraOf(sceneOf('colony-overview'));
    const focal = cameraOf(sceneOf('focal-choice'));
    const deposit = cameraOf(sceneOf('deposit'));
    const emergence = cameraOf(sceneOf('emergence'));

    // Overview is wider than the focal city; convergence pulls back again.
    expect(focal.zoom).toBeGreaterThan(overview.zoom);
    expect(emergence.zoom).toBeLessThan(deposit.zoom);
    // The best-tour chapters follow the tour centroid, not the origin.
    expect(deposit.panX).toBeCloseTo(acoWorldPoint(ACO_BEST_TOUR_CENTROID).x, 12);
    expect(deposit.panY).toBeCloseTo(acoWorldPoint(ACO_BEST_TOUR_CENTROID).y, 12);
  });

  it('keeps the stored best-tour anchors in sync with the pure engine', () => {
    const engine = new AcoEngine(ACO_DEFAULTS);
    for (let index = 0; index < 40; index += 1) engine.stepIteration();
    const snapshot = engine.snapshot();

    expect(snapshot.bestLength).toBeCloseTo(ACO_BEST_TOUR_LENGTH, 12);
    expect(snapshot.bestTour).not.toBeNull();
    const tour = snapshot.bestTour ?? [];
    const instance = createTspInstance(42, 30);
    const centroid = tour.reduce(
      (total, city) => {
        const point = instance.cities[city];
        return { x: total.x + point.x, y: total.y + point.y };
      },
      { x: 0, y: 0 },
    );
    expect(centroid.x / tour.length).toBeCloseTo(ACO_BEST_TOUR_CENTROID.x, 12);
    expect(centroid.y / tour.length).toBeCloseTo(ACO_BEST_TOUR_CENTROID.y, 12);
  });
});

describe('ACO defaults and presets', () => {
  it('uses exactly the documented default parameters', () => {
    expect(ACO_DEFAULTS).toEqual({
      cityCount: 30,
      antCount: 40,
      alpha: 1,
      beta: 2,
      rho: 0.5,
      speed: 1,
      seed: 42,
    });
    expect(acoStoryConfig.defaults).toEqual(ACO_DEFAULTS);

    const engine = acoStoryConfig.createEngine(ACO_DEFAULTS);
    expect(engine).toBeInstanceOf(AcoEngine);
    expect(engine.snapshot().params).toEqual(ACO_DEFAULTS);
  });

  it('applies the documented preset patches and preserves non-owned parameters', () => {
    const expected = [
      ['balanced', { alpha: 1, beta: 2, rho: 0.5 }],
      ['greedy', { alpha: 0.5, beta: 8, rho: 0.5 }],
      ['stagnant', { alpha: 5, beta: 1, rho: 0.1 }],
      ['forgetful', { alpha: 1, beta: 2, rho: 0.95 }],
    ] as const;

    expect(ACO_STORY_PRESETS.map((preset) => preset.id)).toEqual(expected.map(([id]) => id));

    for (const [id, patch] of expected) {
      const preset = findPreset(id);
      expect(preset.params).toEqual(patch);

      const applied: AcoParams = { ...ACO_DEFAULTS, ...preset.params };
      expect(applied.cityCount).toBe(ACO_DEFAULTS.cityCount);
      expect(applied.antCount).toBe(ACO_DEFAULTS.antCount);
      expect(applied.seed).toBe(ACO_DEFAULTS.seed);
      expect(applied.speed).toBe(ACO_DEFAULTS.speed);
      expect(applied.alpha).toBe(patch.alpha);
      expect(applied.beta).toBe(patch.beta);
      expect(applied.rho).toBe(patch.rho);
    }
  });

  it('declares the engine speed control instead of the clock rate', () => {
    expect(acoStoryConfig.speedControl).toEqual({ kind: 'engine', param: 'speed' });
  });
});

describe('ACO URL schema', () => {
  it('maps every query field to the documented parameter and range', () => {
    expect(ACO_URL_PARAMS.chapter).toEqual({ source: 'fragment' });
    expect(ACO_URL_PARAMS.params.map((param) => param.query)).toEqual([
      'seed',
      'cities',
      'ants',
      'alpha',
      'beta',
      'rho',
      'speed',
    ]);

    const byQuery = new Map(ACO_URL_PARAMS.params.map((param) => [param.query, param]));
    expect(byQuery.get('seed')).toMatchObject({
      kind: 'integer',
      key: 'seed',
      structural: true,
      min: 0,
      max: 4_294_967_295,
    });
    expect(byQuery.get('cities')).toMatchObject({
      kind: 'integer',
      key: 'cityCount',
      structural: true,
      min: 2,
      max: 150,
    });
    expect(byQuery.get('ants')).toMatchObject({
      kind: 'integer',
      key: 'antCount',
      structural: true,
      min: 1,
      max: 200,
    });
    expect(byQuery.get('alpha')).toMatchObject({
      kind: 'number',
      key: 'alpha',
      structural: true,
      min: 0,
      max: 5,
    });
    expect(byQuery.get('beta')).toMatchObject({
      kind: 'number',
      key: 'beta',
      structural: true,
      min: 0,
      max: 10,
    });
    expect(byQuery.get('rho')).toMatchObject({
      kind: 'number',
      key: 'rho',
      structural: true,
      min: 0,
      max: 1,
    });
    expect(byQuery.get('speed')).toMatchObject({
      kind: 'enum',
      key: 'speed',
      structural: false,
      values: [0.5, 1, 2, 4],
    });
  });

  it('omits defaults and emits only non-default values in declaration order', () => {
    const defaultsOnly = serializeUrlState(ACO_URL_PARAMS, ACO_DEFAULTS, 'the-colony', {
      defaults: ACO_DEFAULTS,
      chapterIds: ACO_CHAPTER_IDS,
    });
    expect(defaultsOnly).toEqual({
      query: '',
      fragment: '#the-colony',
      relative: '#the-colony',
    });

    const custom: AcoParams = {
      cityCount: 75,
      antCount: 12,
      alpha: 0,
      beta: 8,
      rho: 1,
      speed: 4,
      seed: 7,
    };
    const serialized = serializeUrlState(ACO_URL_PARAMS, custom, 'emergence', {
      defaults: ACO_DEFAULTS,
      chapterIds: ACO_CHAPTER_IDS,
    });
    expect(serialized.query).toBe('?seed=7&cities=75&ants=12&alpha=0&beta=8&rho=1&speed=4');
    expect(serialized.fragment).toBe('#emergence');
    expect(serialized.relative).toBe(
      '?seed=7&cities=75&ants=12&alpha=0&beta=8&rho=1&speed=4#emergence',
    );
  });

  it('round-trips values and the chapter fragment through parse', () => {
    const custom: AcoParams = {
      cityCount: 2,
      antCount: 200,
      alpha: 5,
      beta: 0,
      rho: 0.25,
      speed: 0.5,
      seed: 0,
    };
    const serialized = serializeUrlState(ACO_URL_PARAMS, custom, 'the-lab', {
      defaults: ACO_DEFAULTS,
      chapterIds: ACO_CHAPTER_IDS,
    });
    const parsed = parseUrlState(ACO_URL_PARAMS, ACO_DEFAULTS, serialized.relative, {
      chapterIds: ACO_CHAPTER_IDS,
    });

    expect(parsed.values).toEqual(custom);
    expect(parsed.explicit).toEqual(custom);
    expect(parsed.chapter).toBe('the-lab');
    expect(parsed.notices).toEqual([]);
  });

  it('follows the existing parser contract for invalid and unknown input', () => {
    const parsed = parseUrlState(
      ACO_URL_PARAMS,
      ACO_DEFAULTS,
      '?cities=1&ants=999&alpha=9&beta=-3&rho=2&speed=3&seed=abc#not-a-chapter',
      { chapterIds: ACO_CHAPTER_IDS },
    );

    expect(parsed.values).toEqual({
      ...ACO_DEFAULTS,
      cityCount: 2,
      antCount: 200,
      alpha: 5,
      beta: 0,
      rho: 1,
    });
    expect(parsed.explicit).toEqual({
      cityCount: 2,
      antCount: 200,
      alpha: 5,
      beta: 0,
      rho: 1,
    });
    expect(parsed.chapter).toBeNull();
    expect(parsed.notices.map((notice) => notice.code)).toEqual(
      expect.arrayContaining(['clamped', 'enum-fallback', 'invalid', 'unknown-chapter']),
    );

    const malformed = parseUrlState(ACO_URL_PARAMS, ACO_DEFAULTS, '?cities=12.5&rho=NaN', {
      chapterIds: ACO_CHAPTER_IDS,
    });
    expect(malformed.values.cityCount).toBe(30);
    expect(malformed.values.rho).toBe(0.5);
    expect(malformed.explicit).toEqual({});
    expect(malformed.notices.every((notice) => notice.code === 'invalid')).toBe(true);
  });

  it('accepts the documented speed enum and keeps the first repeated value', () => {
    const speed = parseUrlState(ACO_URL_PARAMS, ACO_DEFAULTS, '?speed=0.5', {
      chapterIds: ACO_CHAPTER_IDS,
    });
    expect(speed.values.speed).toBe(0.5);
    expect(speed.explicit).toEqual({ speed: 0.5 });

    const repeated = parseUrlState(ACO_URL_PARAMS, ACO_DEFAULTS, '?speed=2&speed=4', {
      chapterIds: ACO_CHAPTER_IDS,
    });
    expect(repeated.values.speed).toBe(2);
    expect(repeated.notices.some((notice) => notice.code === 'duplicate')).toBe(true);
  });
});

describe('ACO determinism and scene settling', () => {
  it('produces identical runs from the default config', () => {
    const run = () => {
      const engine = new AcoEngine(acoStoryConfig.defaults);
      for (let index = 0; index < 12; index += 1) engine.stepIteration();
      return engine;
    };

    const first = run();
    const second = run();
    const a = first.snapshot();
    const b = second.snapshot();

    expect(a.bestTour).toEqual(b.bestTour);
    expect(a.bestLength).toBe(b.bestLength);
    expect(a.meanLength).toBe(b.meanLength);
    expect(a.entropy).toBe(b.entropy);
    expect(Array.from(a.pheromone)).toEqual(Array.from(b.pheromone));
    expect(first.metrics()).toEqual(second.metrics());
  });

  it('is importable without touching the DOM or mutating defaults', async () => {
    expect('window' in globalThis).toBe(false);
    const before = JSON.stringify(ACO_DEFAULTS);
    const module = await import('../../src/stories/aco/config');

    expect(module.acoStoryConfig).toBe(acoStoryConfig);
    expect(module.acoStoryConfig.slug).toBe(ACO_SLUG);
    expect(JSON.stringify(ACO_DEFAULTS)).toBe(before);
    expect('window' in globalThis).toBe(false);
  });

  it('settles every chapter scene into finite, coherent presentation state', () => {
    for (const chapter of ACO_CHAPTERS) {
      const scene = sceneOf(chapter.scene);
      const settled = composeSceneState(scene, chapter.sceneOverrides, 1);

      expect(settled.camera).toEqual(scene.camera);
      expect(settled.labels).toEqual(scene.labels);
      expect(settled.revealProgress).toBe(scene.revealProgress ?? 1);
      expect(settled.layers.map((layer) => layer.opacity)).toEqual(
        scene.layers.map((layer) => layer.opacity),
      );
      expect(settled.layers.map((layer) => layer.id)).toEqual(ACO_CANVAS_LAYER_IDS);
      for (const layer of settled.layers) {
        expect(layer.opacity).toBeGreaterThanOrEqual(0);
        expect(layer.opacity).toBeLessThanOrEqual(1);
      }

      for (const progress of [0, 0.5, 1]) {
        const state = composeSceneState(scene, chapter.sceneOverrides, progress);
        expect(state.camera.kind).toBe('2d');
        if (state.camera.kind !== '2d') throw new Error('Expected a 2D camera');
        expect(Number.isFinite(state.camera.panX)).toBe(true);
        expect(Number.isFinite(state.camera.panY)).toBe(true);
        expect(Number.isFinite(state.camera.zoom)).toBe(true);
        expect(state.camera.zoom).toBeGreaterThan(0);
        expect(Number.isFinite(state.camera.rotation ?? 0)).toBe(true);
        expect(state.revealProgress).toBeGreaterThanOrEqual(0);
        expect(state.revealProgress).toBeLessThanOrEqual(1);

        for (const layer of state.layers) {
          expect(layer.opacity).toBeGreaterThanOrEqual(0);
          expect(layer.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('keeps composition deterministic at intermediate progress', () => {
    for (const chapter of ACO_CHAPTERS) {
      const scene = sceneOf(chapter.scene);
      expect(composeSceneState(scene, chapter.sceneOverrides, 0.42)).toEqual(
        composeSceneState(scene, chapter.sceneOverrides, 0.42),
      );
    }
  });
});
