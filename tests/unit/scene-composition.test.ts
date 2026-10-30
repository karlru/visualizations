import { describe, expect, it } from 'vitest';
import {
  parseChapterSceneOverrides,
  serializeChapterSceneOverrides,
} from '../../src/lib/chapter-metadata';
import { composeSceneState, easeOutCubic } from '../../src/lib/scene-composition';
import type { SceneDefinition, SceneOverrides } from '../../src/stories/registry';

interface TestParams {
  readonly speed: number;
}

const scene: SceneDefinition<TestParams> = {
  id: 'overview',
  camera: { kind: '2d', panX: -0.8, panY: -0.9, zoom: 120, rotation: 0.2 },
  layers: [
    { id: 'graph', visible: true, opacity: 0.8 },
    { id: 'ants', visible: true, opacity: 1 },
    { id: 'tour', visible: false, opacity: 0.4 },
  ],
  highlights: [{ id: 'focal', layerId: 'ants', intensity: 0.8 }],
  revealProgress: 0.9,
  labels: [
    {
      id: 'focal-label',
      text: 'focal city',
      anchor: { space: 'world2d', x: -0.8, y: -0.9 },
    },
  ],
};

describe('scene composition', () => {
  it('settles on the declared scene at progress 1', () => {
    const state = composeSceneState(scene, undefined, 1);

    expect(state.camera).toEqual(scene.camera);
    expect(state.layers.map((layer) => layer.opacity)).toEqual([0.8, 1, 0.4]);
    expect(state.layers.map((layer) => layer.visible)).toEqual([true, true, false]);
    expect(state.highlights[0]?.intensity).toBeCloseTo(0.8, 10);
    expect(state.revealProgress).toBeCloseTo(0.9, 10);
    expect(state.labels).toBe(scene.labels);
  });

  it('starts from a deterministic pulled-back entry pose', () => {
    const entry = composeSceneState(scene, undefined, 0);

    expect(entry.camera.kind).toBe('2d');
    if (entry.camera.kind !== '2d') throw new Error('Expected a 2D camera');
    expect(entry.camera.zoom).toBeCloseTo(120 * 0.84, 10);
    expect(entry.camera.panX).toBeCloseTo(-0.8 + 0.35, 10);
    expect(entry.camera.panY).toBeCloseTo(-0.9 - 0.2, 10);
    expect(entry.camera.rotation).toBeCloseTo(0.2 - 0.05, 10);
    expect(entry.revealProgress).toBeCloseTo(0.9 * 0.35, 10);
    expect(entry.layers[0]?.opacity).toBeCloseTo(0.8 * 0.55, 10);
    expect(entry.highlights[0]?.intensity).toBeCloseTo(0.8 * 0.35, 10);
  });

  it('clamps progress and is deterministic', () => {
    const below = composeSceneState(scene, undefined, -3);
    const zero = composeSceneState(scene, undefined, 0);
    const above = composeSceneState(scene, undefined, 9);
    const one = composeSceneState(scene, undefined, 1);

    expect(below).toEqual(zero);
    expect(above).toEqual(one);
    expect(composeSceneState(scene, undefined, 0.42)).toEqual(
      composeSceneState(scene, undefined, 0.42),
    );
  });

  it('applies chapter presentation overrides over the base scene', () => {
    const overrides = {
      camera: { kind: '2d', panX: 1, panY: 2, zoom: 200, rotation: -0.4 },
      layers: [{ id: 'only', visible: true, opacity: 0.5 }],
      highlights: [{ id: 'only', intensity: 0.25 }],
      revealProgress: 0.5,
      labels: [],
    } satisfies SceneOverrides<TestParams>;

    const state = composeSceneState(scene, overrides, 1);

    expect(state.camera).toEqual(overrides.camera);
    expect(state.layers).toEqual([{ id: 'only', visible: true, opacity: 0.5 }]);
    expect(state.highlights).toEqual([{ id: 'only', intensity: 0.25 }]);
    expect(state.revealProgress).toBeCloseTo(0.5, 10);
    expect(state.labels).toEqual([]);
  });

  it('interpolates a 3D camera pose without renderer-specific state', () => {
    const scene3d: SceneDefinition<TestParams> = {
      id: 'cloud',
      camera: {
        kind: '3d',
        position: { x: 2, y: 3, z: 4 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        fov: 50,
      },
      layers: [{ id: 'points', visible: true, opacity: 1 }],
    };

    const entry = composeSceneState(scene3d, undefined, 0);
    const settled = composeSceneState(scene3d, undefined, 1);

    expect(settled.camera).toEqual(scene3d.camera);
    if (entry.camera.kind !== '3d') throw new Error('Expected a 3D camera');
    expect(entry.camera.position.x).toBeCloseTo(2 * 1.08, 10);
    expect(entry.camera.position.y).toBeCloseTo(3 * 1.08, 10);
    expect(entry.camera.position.z).toBeCloseTo(4 * 1.08, 10);
    expect(entry.camera.fov).toBeCloseTo(54, 10);
  });

  it('uses a monotonic ease-out curve', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe('chapter metadata', () => {
  it('parses and clamps presentation metadata', () => {
    const parsed = parseChapterSceneOverrides(
      JSON.stringify({
        camera: { kind: '2d', panX: 1, panY: 2, zoom: 90, rotation: 0.3 },
        layers: [{ id: 'graph', visible: true, opacity: 4 }, { id: 'bad' }],
        highlights: [{ id: 'graph', intensity: 2 }],
        revealProgress: -1,
        labels: [
          {
            id: 'label',
            text: 'A label',
            anchor: { space: 'screen', x: 12, y: 18 },
            offset: { x: 4, y: -4 },
            align: 'end',
            priority: 2,
          },
        ],
      }),
    );

    expect(parsed.camera).toEqual({
      kind: '2d',
      panX: 1,
      panY: 2,
      zoom: 90,
      rotation: 0.3,
    });
    expect(parsed.layers).toEqual([{ id: 'graph', visible: true, opacity: 1 }]);
    expect(parsed.highlights).toEqual([{ id: 'graph', intensity: 1 }]);
    expect(parsed.revealProgress).toBe(0);
    expect(parsed.labels?.[0]).toEqual({
      id: 'label',
      text: 'A label',
      anchor: { space: 'screen', x: 12, y: 18 },
      offset: { x: 4, y: -4 },
      align: 'end',
      priority: 2,
    });
  });

  it('ignores malformed JSON and invalid fields', () => {
    expect(parseChapterSceneOverrides('{not json')).toEqual({});
    expect(parseChapterSceneOverrides('null')).toEqual({});
    expect(parseChapterSceneOverrides('{"camera":{"kind":"2d","zoom":-1}}')).toEqual({});
    expect(parseChapterSceneOverrides('{"revealProgress":"half"}')).toEqual({});
  });

  it('serializes only presentation fields, never engine parameters', () => {
    const overrides: SceneOverrides<TestParams> = {
      camera: { kind: '2d', panX: 0, panY: 0, zoom: 100 },
      revealProgress: 2,
      params: { speed: 4 },
    };

    const serialized = serializeChapterSceneOverrides(overrides);
    expect(serialized).toBeDefined();
    const parsed: unknown = JSON.parse(serialized ?? '{}');
    expect(parsed).toEqual({
      camera: { kind: '2d', panX: 0, panY: 0, zoom: 100 },
      revealProgress: 1,
    });
  });
});
