/**
 * Development story configuration.
 *
 * This is a real `StoryConfig`, not a test-only shortcut: it exercises the same
 * engine factory, defaults, scenes, chapter map, and fragment contract that the
 * ACO and RANDU stories will use. The engine is the small orbit fixture from
 * `/dev/canvas-smoke`, so a single moving object makes scene and camera changes
 * easy to see.
 *
 * The config is pure data plus a pure engine factory. It deliberately does not
 * import a renderer; the Svelte island chooses and constructs the renderer.
 */

import { defineStoryConfig } from '../registry';
import {
  SmokeEngine,
  type SmokeMetrics,
  type SmokeParams,
  type SmokeSnapshot,
} from './canvas-smoke-engine';

const LAYER_ORDER = ['backdrop', 'graph', 'pheromone', 'ants', 'best-tour'] as const;

type DevLayerId = (typeof LAYER_ORDER)[number];

function layers(
  visible: Partial<Record<DevLayerId, number>>,
): readonly { id: string; visible: boolean; opacity: number }[] {
  return LAYER_ORDER.map((id) => {
    const opacity = visible[id];
    return {
      id,
      visible: opacity !== undefined && opacity > 0,
      opacity: opacity ?? 0,
    };
  });
}

export const devStoryConfig = defineStoryConfig<SmokeParams, SmokeSnapshot, SmokeMetrics>({
  slug: 'story-smoke',
  rendererId: 'canvas2d',
  createEngine: (params) => new SmokeEngine(params),
  defaults: { speed: 1 },
  presets: [
    {
      id: 'default',
      label: 'Default',
      description: 'The fixture at its designed rate.',
      params: {},
    },
    {
      id: 'brisk',
      label: 'Brisk',
      description: 'A faster orbit for control testing.',
      params: { speed: 2 },
    },
  ],
  scenes: {
    overview: {
      id: 'overview',
      camera: { kind: '2d', panX: 0, panY: 0, zoom: 78, rotation: 0 },
      layers: layers({ backdrop: 0.5, graph: 0.9, pheromone: 0.55, ants: 1, 'best-tour': 0.6 }),
      highlights: [{ id: 'focal-city', layerId: 'pheromone', intensity: 0.7 }],
      revealProgress: 0.92,
      labels: [
        {
          id: 'focal-city',
          text: 'focal city · the moving object',
          anchor: { space: 'world2d', x: -0.8, y: -0.9 },
          offset: { x: 10, y: -20 },
        },
        {
          id: 'overview-hud',
          text: 'chapter 01 · overview',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
    closeup: {
      id: 'closeup',
      camera: { kind: '2d', panX: -0.8, panY: -0.9, zoom: 186, rotation: 0 },
      layers: layers({ backdrop: 0.35, graph: 0.55, pheromone: 1, ants: 1, 'best-tour': 0.3 }),
      highlights: [{ id: 'focal-city', layerId: 'pheromone', intensity: 1 }],
      revealProgress: 1,
      labels: [
        {
          id: 'closeup-hud',
          text: 'chapter 02 · close-up',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
    drift: {
      id: 'drift',
      camera: { kind: '2d', panX: -0.2, panY: -0.2, zoom: 142, rotation: 0.2 },
      layers: layers({ backdrop: 0.45, graph: 0.8, pheromone: 0.8, ants: 1, 'best-tour': 0.7 }),
      highlights: [{ id: 'best-tour', layerId: 'best-tour', intensity: 0.85 }],
      revealProgress: 1,
      labels: [
        {
          id: 'drift-tour',
          text: 'best tour · invariant across the turn',
          anchor: { space: 'world2d', x: 3.3, y: 1.1 },
          offset: { x: -10, y: -20 },
          align: 'end',
        },
        {
          id: 'drift-hud',
          text: 'chapter 03 · the turn',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
    wide: {
      id: 'wide',
      camera: { kind: '2d', panX: 0, panY: 0, zoom: 58, rotation: 0 },
      layers: layers({ backdrop: 0.6, graph: 1, pheromone: 0.3, ants: 0.8, 'best-tour': 1 }),
      highlights: [{ id: 'graph', layerId: 'graph', intensity: 0.6 }],
      revealProgress: 1,
      labels: [
        {
          id: 'wide-hud',
          text: 'chapter 04 · pulling back',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
  },
  chapters: [
    {
      id: 'the-moving-point',
      title: 'The moving point',
      scene: 'overview',
      reducedMotionSteps: 3,
    },
    {
      id: 'a-closer-look',
      title: 'A closer look',
      scene: 'closeup',
      sceneOverrides: {
        revealProgress: 0.75,
      },
    },
    {
      id: 'the-turn',
      title: 'The turn',
      scene: 'drift',
      sceneOverrides: {
        camera: { kind: '2d', panX: -0.3, panY: -0.1, zoom: 155, rotation: 0.3 },
        revealProgress: 0.9,
      },
    },
    {
      id: 'pulling-back',
      title: 'Pulling back',
      scene: 'wide',
      sceneOverrides: {
        params: { speed: 1.25 },
      },
    },
  ],
  urlParams: {
    params: [],
    chapter: { source: 'fragment' },
  },
});
