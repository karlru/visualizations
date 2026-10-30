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
import { devLayers as layers } from './scene-layers';

export const devStoryConfig = defineStoryConfig<SmokeParams, SmokeSnapshot, SmokeMetrics>({
  slug: 'story-smoke',
  rendererId: 'canvas2d',
  createEngine: (params) => new SmokeEngine(params),
  // Defaults are the single source of starting values. `speed` is the engine's
  // internal time scale (chapters may override it); the stage Speed control is
  // the clock's playback rate and is deliberately not part of the shared run
  // identity, so it has no URL field.
  defaults: { speed: 1, orbit: 1, trails: true, seed: 20_261_030, variant: 'orbit' },
  presets: [
    {
      id: 'default',
      label: 'Default',
      description: 'The fixture at its designed rate.',
      params: { speed: 1, orbit: 1, trails: true },
    },
    {
      id: 'brisk',
      label: 'Brisk',
      description: 'A faster, wider orbit for control testing.',
      params: { speed: 2, orbit: 1.35, trails: true },
    },
    {
      id: 'sparse',
      label: 'Sparse',
      description: 'A tight orbit without trail lines.',
      params: { speed: 1, orbit: 0.65, trails: false },
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
      reducedMotionSteps: 2,
      sceneOverrides: {
        revealProgress: 0.75,
      },
    },
    {
      id: 'the-turn',
      title: 'The turn',
      scene: 'drift',
      reducedMotionSteps: 3,
      sceneOverrides: {
        camera: { kind: '2d', panX: -0.3, panY: -0.1, zoom: 155, rotation: 0.3 },
        revealProgress: 0.9,
      },
    },
    {
      id: 'pulling-back',
      title: 'Pulling back',
      scene: 'wide',
      reducedMotionSteps: 2,
      sceneOverrides: {
        params: { speed: 1.25 },
      },
    },
  ],
  urlParams: {
    // Query fields follow docs/requirements.md §2.6.1. Seed and variant define
    // the run; orbit and trails are presentation state. Defaults are omitted
    // from canonical URLs, so the default share is the chapter fragment alone.
    params: [
      {
        kind: 'integer',
        key: 'seed',
        query: 'seed',
        structural: true,
        min: 0,
        max: 4_294_967_295,
        label: 'Seed',
      },
      {
        kind: 'number',
        key: 'orbit',
        query: 'orbit',
        structural: false,
        min: 0.4,
        max: 2.4,
        step: 0.05,
        label: 'Orbit radius',
      },
      {
        kind: 'enum',
        key: 'variant',
        query: 'variant',
        structural: true,
        values: ['orbit', 'spiral'] as const,
        label: 'Variant',
      },
      {
        kind: 'boolean',
        key: 'trails',
        query: 'trails',
        structural: false,
        label: 'Ant trails',
      },
    ],
    chapter: { source: 'fragment' },
  },
  // The variant is the fixture's structural run identity; presets change the
  // orbit and trails but must not silently switch the generated path shape.
  presetKeeps: ['variant'],
});
