/**
 * ACO scene map: one settled presentation state per chapter.
 *
 * Every scene declares a 2D camera, the canonical canvas layers in back-to-front
 * draw order, highlights, reveal progress, DOM labels, and whether the DOM
 * convergence chart is visible. Scroll composition (`composeSceneState`) then
 * moves each scene from a pulled-back entry pose to this settled state without
 * touching engine parameters.
 *
 * ### World space
 *
 * Cameras use the story world space from `world.ts`: the normalized unit square
 * scaled by `ACO_WORLD_SCALE` and centred on the origin. `zoom` is CSS pixels
 * per world unit. The renderer maps a city with `acoWorldPoint`.
 *
 * ### Layers
 *
 * `ACO_CANVAS_LAYER_IDS` is the complete Canvas 2D vocabulary: `graph`,
 * `pheromone`, `ants`, `best-tour`, and `probability-fan`. Every scene lists all
 * five so draw order never depends on which layers happen to be visible.
 * `graph` is visible in every scene; the others fade between 0 and 1.
 *
 * The convergence chart is deliberately **not** a canvas layer. It is an
 * SVG/DOM component owned by the stage chrome, so its visibility is a
 * story-level presentation field (`convergenceChart`) rather than a renderer
 * layer. Step 3.2 renders the chart; Step 3.3 reads the field from the scene.
 */

import type { AcoParams } from '../../engines/aco/types';
import type { SceneLabel, SceneLayer } from '../../render/types';
import type { SceneDefinition } from '../registry';
import { acoAnnotation } from './annotations';
import { ACO_BEST_TOUR_WORLD, ACO_FOCAL_WORLD } from './world';

/** Canonical Canvas 2D layer ids, in back-to-front draw order. */
export const ACO_CANVAS_LAYER_IDS = [
  'graph',
  'pheromone',
  'ants',
  'best-tour',
  'probability-fan',
] as const;

export type AcoCanvasLayerId = (typeof ACO_CANVAS_LAYER_IDS)[number];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Build the complete layer list. Omitting an id hides it with opacity `0`, so
 * every scene carries the same five entries in the same order.
 */
export function acoLayers(
  visible: Partial<Record<AcoCanvasLayerId, number>>,
): readonly SceneLayer[] {
  return ACO_CANVAS_LAYER_IDS.map((id) => {
    const opacity = clamp01(visible[id] ?? 0);
    return { id, visible: opacity > 0, opacity };
  });
}

function hudLabel(sceneId: string, number: string, title: string): SceneLabel {
  return {
    id: `hud-${sceneId}`,
    text: `${number} · ${title}`,
    anchor: { space: 'screen', x: 18, y: 58 },
    priority: 2,
  };
}

/**
 * An ACO scene adds one story-level presentation field to the shared contract:
 * `convergenceChart` selects visibility of the DOM chart that Step 3.2 builds.
 * It is not a renderer layer and never reaches `SceneState.layers`.
 */
export interface AcoSceneDefinition extends SceneDefinition<AcoParams> {
  /** DOM labels; the chapter's annotation ids must resolve here. */
  readonly labels: readonly SceneLabel[];
  readonly convergenceChart: boolean;
}

export const ACO_SCENE_IDS = [
  'colony-overview',
  'tour-problem',
  'focal-choice',
  'probability-rule',
  'deposit',
  'evaporation',
  'emergence',
  'tuning',
  'limits',
  'lab',
] as const;

export type AcoSceneId = (typeof ACO_SCENE_IDS)[number];

/** Every ACO scene, keyed by its stable id. */
export const ACO_SCENES: Readonly<Record<AcoSceneId, AcoSceneDefinition>> = {
  'colony-overview': {
    id: 'colony-overview',
    camera: { kind: '2d', panX: 0, panY: 0, zoom: 96, rotation: 0 },
    layers: acoLayers({ graph: 1, pheromone: 0.25, ants: 0.9 }),
    highlights: [{ id: 'colony-ants', layerId: 'ants', intensity: 0.8 }],
    revealProgress: 0.9,
    labels: [
      acoAnnotation('colony-map'),
      acoAnnotation('colony-ants'),
      hudLabel('colony-overview', '01', 'the colony'),
    ],
    convergenceChart: false,
  },
  'tour-problem': {
    id: 'tour-problem',
    camera: { kind: '2d', panX: 0, panY: 0, zoom: 108, rotation: 0 },
    layers: acoLayers({ graph: 1, pheromone: 0.15, ants: 0.25, 'best-tour': 0.8 }),
    highlights: [{ id: 'candidate-tour', layerId: 'best-tour', intensity: 0.8 }],
    revealProgress: 1,
    labels: [
      acoAnnotation('candidate-tour'),
      acoAnnotation('return-edge'),
      hudLabel('tour-problem', '02', 'the problem'),
    ],
    convergenceChart: false,
  },
  'focal-choice': {
    id: 'focal-choice',
    camera: {
      kind: '2d',
      panX: ACO_FOCAL_WORLD.x,
      panY: ACO_FOCAL_WORLD.y,
      zoom: 320,
      rotation: 0,
    },
    layers: acoLayers({ graph: 1, pheromone: 0.55, ants: 0.35, 'probability-fan': 1 }),
    highlights: [{ id: 'focal-city', layerId: 'graph', intensity: 1 }],
    revealProgress: 1,
    labels: [
      acoAnnotation('focal-city'),
      acoAnnotation('allowed-neighbours'),
      hudLabel('focal-choice', '03', "one ant's choice"),
    ],
    convergenceChart: false,
  },
  'probability-rule': {
    id: 'probability-rule',
    camera: {
      kind: '2d',
      panX: ACO_FOCAL_WORLD.x,
      panY: ACO_FOCAL_WORLD.y,
      zoom: 230,
      rotation: 0,
    },
    layers: acoLayers({
      graph: 1,
      pheromone: 0.7,
      ants: 0.25,
      'best-tour': 0.2,
      'probability-fan': 1,
    }),
    highlights: [{ id: 'probability-fan', layerId: 'probability-fan', intensity: 1 }],
    revealProgress: 1,
    labels: [
      acoAnnotation('pheromone-weight'),
      acoAnnotation('distance-weight'),
      hudLabel('probability-rule', '04', 'the probability rule'),
    ],
    convergenceChart: false,
  },
  deposit: {
    id: 'deposit',
    camera: {
      kind: '2d',
      panX: ACO_BEST_TOUR_WORLD.x,
      panY: ACO_BEST_TOUR_WORLD.y,
      zoom: 120,
      rotation: 0,
    },
    layers: acoLayers({ graph: 1, pheromone: 0.85, ants: 0.8, 'best-tour': 0.65 }),
    highlights: [{ id: 'deposit', layerId: 'pheromone', intensity: 1 }],
    revealProgress: 1,
    labels: [
      acoAnnotation('deposit-edge'),
      acoAnnotation('shorter-tour-deposit'),
      hudLabel('deposit', '05', 'leaving a trace'),
    ],
    convergenceChart: false,
  },
  evaporation: {
    id: 'evaporation',
    camera: {
      kind: '2d',
      panX: ACO_BEST_TOUR_WORLD.x,
      panY: ACO_BEST_TOUR_WORLD.y,
      zoom: 112,
      rotation: 0,
    },
    layers: acoLayers({ graph: 1, pheromone: 0.5, ants: 0.5, 'best-tour': 0.5 }),
    highlights: [{ id: 'evaporation', layerId: 'pheromone', intensity: 0.8 }],
    revealProgress: 1,
    labels: [
      acoAnnotation('evaporating-edge'),
      acoAnnotation('remaining-trail'),
      hudLabel('evaporation', '06', 'forgetting'),
    ],
    convergenceChart: false,
  },
  emergence: {
    id: 'emergence',
    camera: { kind: '2d', panX: 0, panY: 0, zoom: 84, rotation: 0 },
    layers: acoLayers({ graph: 1, pheromone: 1, ants: 0.65, 'best-tour': 1 }),
    highlights: [{ id: 'best-tour', layerId: 'best-tour', intensity: 1 }],
    revealProgress: 1,
    labels: [
      acoAnnotation('best-tour'),
      acoAnnotation('convergence-chart'),
      hudLabel('emergence', '07', 'emergence'),
    ],
    convergenceChart: true,
  },
  tuning: {
    id: 'tuning',
    camera: { kind: '2d', panX: 0, panY: 0, zoom: 92, rotation: 0 },
    layers: acoLayers({ graph: 1, pheromone: 0.8, ants: 0.55, 'best-tour': 0.7 }),
    highlights: [{ id: 'colony-parameters', layerId: 'pheromone', intensity: 0.7 }],
    revealProgress: 0.95,
    labels: [
      acoAnnotation('balanced-preset'),
      acoAnnotation('greedy-preset'),
      hudLabel('tuning', '08', 'tuning the colony'),
    ],
    convergenceChart: true,
  },
  limits: {
    id: 'limits',
    camera: { kind: '2d', panX: -0.2, panY: -0.1, zoom: 138, rotation: 0 },
    layers: acoLayers({ graph: 1, pheromone: 0.55, ants: 0.35, 'best-tour': 0.6 }),
    highlights: [{ id: 'local-optimum', layerId: 'best-tour', intensity: 0.6 }],
    revealProgress: 1,
    labels: [
      acoAnnotation('local-optimum'),
      acoAnnotation('heuristic-limit'),
      hudLabel('limits', '09', 'when it fails'),
    ],
    convergenceChart: true,
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
    labels: [
      acoAnnotation('lab-controls'),
      acoAnnotation('share-run'),
      hudLabel('lab', '10', 'the lab'),
    ],
    convergenceChart: true,
  },
};
