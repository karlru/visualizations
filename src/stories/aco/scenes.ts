/**
 * ACO scene map: one settled presentation state per chapter.
 *
 * The story builds from a five-city teaching instance to the full thirty-city
 * colony. Every scene declares a 2D camera, the canonical canvas layers in
 * back-to-front draw order, highlights, reveal progress, and DOM labels. Scroll
 * composition (`composeSceneState`) moves each scene from a pulled-back entry
 * pose to this settled state without touching engine parameters.
 *
 * ### World space
 *
 * Cameras use the story world space from `world.ts`: the normalized unit square
 * scaled by `ACO_WORLD_SCALE` and centred on the origin. The five-city camera is
 * slightly rotated so the map reads as a network rather than a flat row.
 *
 * ### Layers
 *
 * `ACO_CANVAS_LAYER_IDS` is the complete Canvas 2D vocabulary. The four
 * `lesson-*` layers draw the guided opening (a tour, exhaustive enumeration,
 * factorial growth, and one ant's walk) from pure lesson data. Every scene lists
 * all nine layers so draw order never depends on which layers happen to be
 * visible.
 */

import type { AcoParams } from '../../engines/aco/types';
import type { SceneLabel, SceneLayer } from '../../render/types';
import type { SceneDefinition } from '../registry';
import { acoAnnotation, demoCityLabels } from './annotations';
import { ACO_DEMO_FOCAL_WORLD } from './world';

/** Canonical Canvas 2D layer ids, in back-to-front draw order. */
export const ACO_CANVAS_LAYER_IDS = [
  'graph',
  'lesson-growth',
  'lesson-enumerate',
  'lesson-tour',
  'lesson-ant',
  'pheromone',
  'ants',
  'best-tour',
  'probability-fan',
] as const;

export type AcoCanvasLayerId = (typeof ACO_CANVAS_LAYER_IDS)[number];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Build the complete layer list. Omitting an id hides it with opacity `0`, so
 * every scene carries the same entries in the same order.
 */
export function acoLayers(
  visible: Partial<Record<AcoCanvasLayerId, number>>,
): readonly SceneLayer[] {
  return ACO_CANVAS_LAYER_IDS.map((id) => {
    const opacity = clamp01(visible[id] ?? 0);
    return { id, visible: opacity > 0, opacity };
  });
}

/** An ACO scene adds the DOM labels its chapter annotations resolve to. */
export interface AcoSceneDefinition extends SceneDefinition<AcoParams> {
  /** DOM labels; the chapter's annotation ids must resolve here. */
  readonly labels: readonly SceneLabel[];
}

export const ACO_SCENE_IDS = [
  'five-cities',
  'enumerate-tours',
  'factorial-wall',
  'one-ant',
  'deposit',
  'evaporation',
  'two-ants',
  'colony',
  'probability-rule',
  'update-rule',
  'tuning',
  'limits',
  'lab',
] as const;

export type AcoSceneId = (typeof ACO_SCENE_IDS)[number];

/**
 * The five-city camera. A small clockwise rotation turns the seed-42 map from
 * a flat horizontal band into a readable diagonal network; the pan centres the
 * city cloud rather than the empty unit-square origin.
 */
const DEMO_CAMERA = Object.freeze({
  kind: '2d' as const,
  panX: 0.15,
  panY: 0.3,
  zoom: 150,
  rotation: -0.18,
});

function demoCamera(zoom: number, panX = 0.15, panY = 0.3) {
  return { ...DEMO_CAMERA, panX, panY, zoom };
}

function demoLabels(extra: readonly string[] = []): readonly SceneLabel[] {
  return [...extra.map((id) => acoAnnotation(id)), ...demoCityLabels()];
}

/** Every ACO scene, keyed by its stable id. */
export const ACO_SCENES: Readonly<Record<AcoSceneId, AcoSceneDefinition>> = {
  'five-cities': {
    id: 'five-cities',
    camera: demoCamera(150),
    layers: acoLayers({ graph: 1, 'lesson-tour': 1 }),
    highlights: [{ id: 'demo-tour', layerId: 'lesson-tour', intensity: 0.8 }],
    revealProgress: 1,
    labels: demoLabels(['demo-tour', 'demo-home']),
  },
  'enumerate-tours': {
    id: 'enumerate-tours',
    camera: demoCamera(150),
    layers: acoLayers({ graph: 1, 'lesson-enumerate': 1 }),
    highlights: [{ id: 'demo-optimum', layerId: 'lesson-enumerate', intensity: 0.8 }],
    revealProgress: 1,
    labels: demoLabels(['demo-twelve', 'demo-optimum']),
  },
  'factorial-wall': {
    id: 'factorial-wall',
    camera: demoCamera(150),
    layers: acoLayers({ 'lesson-growth': 1 }),
    highlights: [{ id: 'demo-growth', layerId: 'lesson-growth', intensity: 0.7 }],
    revealProgress: 1,
    labels: [acoAnnotation('demo-growth')],
  },
  'one-ant': {
    id: 'one-ant',
    camera: demoCamera(165),
    layers: acoLayers({ graph: 1, 'lesson-ant': 1 }),
    highlights: [{ id: 'demo-one-ant', layerId: 'lesson-ant', intensity: 0.8 }],
    revealProgress: 1,
    labels: demoLabels(['demo-one-ant', 'demo-allowed', 'demo-ant-trail']),
  },
  deposit: {
    id: 'deposit',
    camera: demoCamera(175),
    layers: acoLayers({ graph: 1, pheromone: 0.9, ants: 1, 'best-tour': 0.6 }),
    highlights: [{ id: 'demo-trail', layerId: 'pheromone', intensity: 1 }],
    revealProgress: 1,
    labels: demoLabels(['demo-trail']),
  },
  evaporation: {
    id: 'evaporation',
    camera: demoCamera(165),
    layers: acoLayers({ graph: 1, pheromone: 1, ants: 0.6, 'best-tour': 0.4 }),
    highlights: [{ id: 'demo-fade', layerId: 'pheromone', intensity: 0.8 }],
    revealProgress: 1,
    labels: demoLabels(['demo-fade']),
  },
  'two-ants': {
    id: 'two-ants',
    camera: demoCamera(160),
    layers: acoLayers({ graph: 1, pheromone: 0.85, ants: 1, 'best-tour': 0.7 }),
    highlights: [{ id: 'demo-second-ant', layerId: 'ants', intensity: 0.8 }],
    revealProgress: 1,
    labels: demoLabels(['demo-second-ant']),
  },
  colony: {
    id: 'colony',
    camera: demoCamera(155),
    layers: acoLayers({ graph: 1, pheromone: 1, ants: 0.9, 'best-tour': 1 }),
    highlights: [{ id: 'demo-match', layerId: 'best-tour', intensity: 1 }],
    revealProgress: 1,
    labels: demoLabels(['demo-colony', 'demo-match']),
  },
  'probability-rule': {
    id: 'probability-rule',
    camera: demoCamera(150, ACO_DEMO_FOCAL_WORLD.x, ACO_DEMO_FOCAL_WORLD.y),
    layers: acoLayers({
      graph: 1,
      pheromone: 0.5,
      ants: 0.25,
      'best-tour': 0.2,
      'probability-fan': 1,
    }),
    highlights: [{ id: 'probability-fan', layerId: 'probability-fan', intensity: 1 }],
    revealProgress: 1,
    labels: demoLabels(['transition-weight', 'distance-weight']),
  },
  'update-rule': {
    id: 'update-rule',
    camera: demoCamera(160),
    layers: acoLayers({ graph: 1, pheromone: 1, ants: 0.8, 'best-tour': 0.9 }),
    highlights: [{ id: 'update-rule', layerId: 'pheromone', intensity: 0.8 }],
    revealProgress: 1,
    labels: demoLabels(['deposit-rule', 'update-rule']),
  },
  tuning: {
    id: 'tuning',
    camera: { kind: '2d', panX: 0, panY: 0, zoom: 84, rotation: 0 },
    layers: acoLayers({ graph: 1, pheromone: 0.8, ants: 0.55, 'best-tour': 0.7 }),
    highlights: [{ id: 'balanced-preset', layerId: 'pheromone', intensity: 0.7 }],
    revealProgress: 0.95,
    labels: [
      acoAnnotation('balanced-preset'),
      acoAnnotation('greedy-preset'),
      acoAnnotation('best-tour'),
    ],
  },
  limits: {
    id: 'limits',
    camera: { kind: '2d', panX: -0.2, panY: -0.1, zoom: 138, rotation: 0 },
    layers: acoLayers({ graph: 1, pheromone: 0.55, ants: 0.35, 'best-tour': 0.6 }),
    highlights: [{ id: 'local-optimum', layerId: 'best-tour', intensity: 0.6 }],
    revealProgress: 1,
    labels: [acoAnnotation('local-optimum'), acoAnnotation('heuristic-limit')],
  },
  lab: {
    id: 'lab',
    camera: { kind: '2d', panX: 0, panY: 0, zoom: 100, rotation: 0 },
    layers: acoLayers({
      graph: 1,
      pheromone: 0.75,
      ants: 0.7,
      'best-tour': 0.8,
      'probability-fan': 0.4,
    }),
    highlights: [{ id: 'colony-graph', layerId: 'graph', intensity: 0.4 }],
    revealProgress: 1,
    labels: [acoAnnotation('lab-controls'), acoAnnotation('share-run')],
  },
};
