/**
 * Annotation catalogue for the Ant Colony Optimization story.
 *
 * Every entry is a `SceneLabel` with a stable id. Chapters name annotation ids;
 * each scene includes the catalogue entries its chapter uses. Labels are DOM
 * overlays, not canvas text, so they stay selectable and available to assistive
 * technology.
 *
 * The opening chapters use the fixed five-city teaching map; the tuning, limits,
 * and lab chapters use the default seed-42 thirty-city map. Anchors are in the
 * story world space from `world.ts`, except the compact screen-positioned HUD
 * notes used beside the chart and the lab controls.
 */

import type { SceneLabel } from '../../render/types';
import { ACO_DEMO_WORLD, acoWorldPoint } from './world';

const world = (x: number, y: number): { readonly x: number; readonly y: number } =>
  acoWorldPoint({ x, y });

/** All story annotations, keyed by their stable id. */
export const ACO_ANNOTATIONS: Readonly<Record<string, SceneLabel>> = Object.freeze({
  // ── Five-city teaching map ────────────────────────────────────────────
  'demo-tour': {
    id: 'demo-tour',
    text: 'One complete round trip',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[0] ?? world(0.5, 0.5)) },
    offset: { x: 12, y: -20 },
    align: 'start',
    priority: 2,
  },
  'demo-home': {
    id: 'demo-home',
    text: 'Start and finish here',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[0] ?? world(0.5, 0.5)) },
    offset: { x: -12, y: 18 },
    align: 'end',
    priority: 1,
  },
  'demo-twelve': {
    id: 'demo-twelve',
    text: '12 different round trips',
    anchor: { space: 'world2d', x: -1.7, y: 1.55 },
    offset: { x: 0, y: -14 },
    align: 'start',
    priority: 1,
  },
  'demo-optimum': {
    id: 'demo-optimum',
    text: 'Shortest: 1.617',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[3] ?? world(0.5, 0.5)) },
    offset: { x: -12, y: -20 },
    align: 'end',
    priority: 2,
  },
  'demo-growth': {
    id: 'demo-growth',
    text: 'Every new city multiplies the choices',
    anchor: { space: 'world2d', x: -1.7, y: 1.55 },
    offset: { x: 0, y: -14 },
    align: 'start',
    priority: 1,
  },
  'demo-one-ant': {
    id: 'demo-one-ant',
    text: 'One ant, one step at a time',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[0] ?? world(0.5, 0.5)) },
    offset: { x: 12, y: 18 },
    align: 'start',
    priority: 2,
  },
  'demo-allowed': {
    id: 'demo-allowed',
    text: 'Only unvisited cities are allowed',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[1] ?? world(0.5, 0.5)) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 1,
  },
  'demo-ant-trail': {
    id: 'demo-ant-trail',
    text: 'The ant leaves a trail behind it',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[4] ?? world(0.5, 0.5)) },
    offset: { x: -12, y: 18 },
    align: 'end',
    priority: 1,
  },
  'demo-trail': {
    id: 'demo-trail',
    text: 'A shorter tour leaves a stronger trail',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[3] ?? world(0.5, 0.5)) },
    offset: { x: -12, y: 18 },
    align: 'end',
    priority: 1,
  },
  'demo-fade': {
    id: 'demo-fade',
    text: 'Unused trails fade each round',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[2] ?? world(0.5, 0.5)) },
    offset: { x: 12, y: 18 },
    align: 'start',
    priority: 1,
  },
  'demo-second-ant': {
    id: 'demo-second-ant',
    text: 'A second ant reads the trail',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[1] ?? world(0.5, 0.5)) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 1,
  },
  'demo-colony': {
    id: 'demo-colony',
    text: '8 ants · one shared trail',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[4] ?? world(0.5, 0.5)) },
    offset: { x: -12, y: -18 },
    align: 'end',
    priority: 1,
  },
  'demo-match': {
    id: 'demo-match',
    text: 'The colony found the same 1.617 tour',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[2] ?? world(0.5, 0.5)) },
    offset: { x: 12, y: -20 },
    align: 'start',
    priority: 2,
  },
  'transition-weight': {
    id: 'transition-weight',
    text: 'τ^α rewards trails that worked',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[0] ?? world(0.5, 0.5)) },
    offset: { x: 14, y: -58 },
    align: 'start',
    priority: 1,
  },
  'distance-weight': {
    id: 'distance-weight',
    text: 'η^β rewards short edges',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[4] ?? world(0.5, 0.5)) },
    offset: { x: -12, y: 20 },
    align: 'end',
    priority: 1,
  },
  'deposit-rule': {
    id: 'deposit-rule',
    text: 'Every used edge gains Q / L',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[3] ?? world(0.5, 0.5)) },
    offset: { x: -12, y: -20 },
    align: 'end',
    priority: 1,
  },
  'update-rule': {
    id: 'update-rule',
    text: 'Evaporate, then deposit',
    anchor: { space: 'world2d', ...(ACO_DEMO_WORLD[2] ?? world(0.5, 0.5)) },
    offset: { x: 12, y: 18 },
    align: 'start',
    priority: 1,
  },

  // ── Thirty-city chapters ──────────────────────────────────────────────
  'best-tour': {
    id: 'best-tour',
    text: 'Best tour so far',
    anchor: { space: 'world2d', ...world(0.6011037519201636, 0.44829055899754167) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 2,
  },
  'balanced-preset': {
    id: 'balanced-preset',
    text: 'Balanced · α 1, β 2, ρ 0.5',
    anchor: { space: 'screen', x: 18, y: 96 },
    align: 'start',
    priority: 1,
  },
  'greedy-preset': {
    id: 'greedy-preset',
    text: 'Greedy · α 0.5, β 8, ρ 0.5',
    anchor: { space: 'screen', x: 18, y: 128 },
    align: 'start',
    priority: 1,
  },
  'local-optimum': {
    id: 'local-optimum',
    text: 'A short tour can still be a dead end',
    anchor: { space: 'world2d', ...world(0.20951048866845667, 0.30362963443621993) },
    offset: { x: -12, y: -18 },
    align: 'end',
    priority: 1,
  },
  'heuristic-limit': {
    id: 'heuristic-limit',
    text: 'A heuristic · no shortest-tour guarantee',
    anchor: { space: 'world2d', ...world(0.003842951962724328, 0.47078192373737693) },
    offset: { x: 12, y: 16 },
    align: 'start',
    priority: 1,
  },
  'lab-controls': {
    id: 'lab-controls',
    text: 'Drag cities · change the colony',
    anchor: { space: 'screen', x: 18, y: 96 },
    align: 'start',
    priority: 1,
  },
  'share-run': {
    id: 'share-run',
    text: 'Share the seed and parameters',
    anchor: { space: 'screen', x: 18, y: 128 },
    align: 'start',
    priority: 1,
  },
});

/**
 * Resolve an annotation id, throwing on an authoring typo. Scene data is built
 * at module load, so a missing id fails immediately in unit tests instead of
 * producing a chapter with no label.
 */
export function acoAnnotation(id: string): SceneLabel {
  const annotation = ACO_ANNOTATIONS[id];
  if (annotation === undefined) {
    throw new Error(`Unknown ACO annotation "${id}".`);
  }
  return annotation;
}

/** Five numbered city labels for the five-city teaching map. */
export function demoCityLabels(): readonly SceneLabel[] {
  return ACO_DEMO_WORLD.map((point, index) => ({
    id: `demo-city-${index}`,
    text: String(index + 1),
    anchor: { space: 'world2d', x: point.x, y: point.y },
    offset: { x: 9, y: -10 },
    align: 'start',
    priority: 1,
  }));
}
