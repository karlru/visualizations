/**
 * Second development story configuration.
 *
 * This is a complete `StoryConfig` with its own engine (`PulseEngine`), scenes,
 * chapter map, defaults, presets, and URL schema. The page that renders it uses
 * the same `StoryController` as `/dev/story-smoke`; no controller internals
 * change. It is the proof that a new story is added by supplying a config and a
 * page, not by editing the runtime.
 *
 * The fixture shares the Canvas 2D renderer's snapshot contract, so it reuses
 * `rendererId: 'canvas2d'` without a new renderer. Phase 2 and Phase 3 introduce
 * their own engines and layer sets behind the same config boundary.
 */

import { defineStoryConfig } from '../registry';
import type { SmokeMetrics, SmokeParams, SmokeSnapshot } from './canvas-smoke-engine';
import { PulseEngine } from './pulse-engine';
import { devLayers as layers } from './scene-layers';

export const pulseStoryConfig = defineStoryConfig<SmokeParams, SmokeSnapshot, SmokeMetrics>({
  slug: 'pulse-smoke',
  rendererId: 'canvas2d',
  createEngine: (params) => new PulseEngine(params),
  // Distinct defaults from `/dev/story-smoke`: the structural variant changes
  // the pulse rate, the seed identifies the run, and trail lines start hidden.
  defaults: { speed: 1, orbit: 0.9, trails: false, seed: 4_242, variant: 'spiral' },
  presets: [
    {
      id: 'default',
      label: 'Default',
      description: 'The pulse fixture at its designed rate.',
      params: { speed: 1, orbit: 0.9, trails: false },
    },
    {
      id: 'bright',
      label: 'Bright',
      description: 'A wider, faster pulse with trail lines.',
      params: { speed: 1.6, orbit: 1.45, trails: true },
    },
    {
      id: 'quiet',
      label: 'Quiet',
      description: 'A narrow pulse without trail lines.',
      params: { speed: 0.8, orbit: 0.5, trails: false },
    },
  ],
  scenes: {
    'pulse-overview': {
      id: 'pulse-overview',
      camera: { kind: '2d', panX: 0, panY: 0, zoom: 68, rotation: 0 },
      layers: layers({ backdrop: 0.55, graph: 0.75, pheromone: 0.5, ants: 1, 'best-tour': 0.35 }),
      highlights: [{ id: 'focal-city', layerId: 'pheromone', intensity: 0.6 }],
      revealProgress: 0.9,
      labels: [
        {
          id: 'pulse-focal',
          text: 'focal city · pulse source',
          anchor: { space: 'world2d', x: -0.8, y: -0.9 },
          offset: { x: 10, y: -20 },
        },
        {
          id: 'pulse-overview-hud',
          text: 'pulse chapter 01 · overview',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
    'pulse-closeup': {
      id: 'pulse-closeup',
      camera: { kind: '2d', panX: -0.8, panY: -0.9, zoom: 172, rotation: 0 },
      layers: layers({ backdrop: 0.4, graph: 0.5, pheromone: 1, ants: 1, 'best-tour': 0.2 }),
      highlights: [{ id: 'focal-city', layerId: 'pheromone', intensity: 1 }],
      revealProgress: 1,
      labels: [
        {
          id: 'pulse-closeup-hud',
          text: 'pulse chapter 02 · close-up',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
    'pulse-drift': {
      id: 'pulse-drift',
      camera: { kind: '2d', panX: -0.2, panY: -0.1, zoom: 136, rotation: -0.22 },
      layers: layers({ backdrop: 0.5, graph: 0.7, pheromone: 0.75, ants: 1, 'best-tour': 0.55 }),
      highlights: [{ id: 'ants', layerId: 'ants', intensity: 0.8 }],
      revealProgress: 1,
      labels: [
        {
          id: 'pulse-drift-hud',
          text: 'pulse chapter 03 · the interval',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
    'pulse-wide': {
      id: 'pulse-wide',
      camera: { kind: '2d', panX: 0, panY: 0, zoom: 54, rotation: 0 },
      layers: layers({ backdrop: 0.6, graph: 1, pheromone: 0.25, ants: 0.8, 'best-tour': 1 }),
      highlights: [{ id: 'graph', layerId: 'graph', intensity: 0.55 }],
      revealProgress: 1,
      labels: [
        {
          id: 'pulse-wide-hud',
          text: 'pulse chapter 04 · the return',
          anchor: { space: 'screen', x: 18, y: 58 },
          priority: 2,
        },
      ],
    },
  },
  chapters: [
    {
      id: 'the-pulse',
      title: 'The pulse',
      scene: 'pulse-overview',
      reducedMotionSteps: 3,
    },
    {
      id: 'the-interval',
      title: 'The interval',
      scene: 'pulse-closeup',
      reducedMotionSteps: 2,
      sceneOverrides: { revealProgress: 0.8 },
    },
    {
      id: 'the-lattice',
      title: 'The lattice',
      scene: 'pulse-drift',
      reducedMotionSteps: 3,
      sceneOverrides: { revealProgress: 0.92 },
    },
    {
      id: 'the-return',
      title: 'The return',
      scene: 'pulse-wide',
      reducedMotionSteps: 2,
      sceneOverrides: { params: { speed: 1.1 } },
    },
  ],
  urlParams: {
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
  // Keep the reader's structural variant across preset changes.
  presetKeeps: ['variant'],
});
