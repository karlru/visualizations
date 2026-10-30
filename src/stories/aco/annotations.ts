/**
 * Annotation catalogue for the Ant Colony Optimization story.
 *
 * Every entry is a `SceneLabel` with a stable id. Chapters name annotation ids;
 * each scene includes the catalogue entries its chapter uses (plus a HUD label
 * that is allowed to exist outside the catalogue). Labels are DOM overlays, not
 * canvas text, so they stay selectable and available to assistive technology.
 *
 * Anchors use the story world space from `world.ts`. City-anchored labels point
 * at real cities of the default seed-42 layout; the HUD-style labels for the
 * chart, presets, and lab controls use stage-local screen coordinates.
 */

import type { SceneLabel } from '../../render/types';
import { ACO_FOCAL_WORLD, acoWorldPoint } from './world';

const world = (x: number, y: number): { readonly x: number; readonly y: number } =>
  acoWorldPoint({ x, y });

/** All story annotations, keyed by their stable id. */
export const ACO_ANNOTATIONS: Readonly<Record<string, SceneLabel>> = Object.freeze({
  'colony-map': {
    id: 'colony-map',
    text: '30 cities · no leader, no map',
    anchor: { space: 'world2d', ...world(0.003842951962724328, 0.47078192373737693) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 1,
  },
  'colony-ants': {
    id: 'colony-ants',
    text: '40 ants · one shared environment',
    anchor: { space: 'world2d', ...world(0.03743921360000968, 0.05139273451641202) },
    offset: { x: 12, y: 16 },
    align: 'start',
    priority: 1,
  },
  'candidate-tour': {
    id: 'candidate-tour',
    text: 'A tour visits every city once',
    anchor: { space: 'world2d', ...world(0.20951048866845667, 0.30362963443621993) },
    offset: { x: -12, y: -18 },
    align: 'end',
    priority: 1,
  },
  'return-edge': {
    id: 'return-edge',
    text: '…then returns to the start',
    anchor: { space: 'world2d', ...world(0.927839900366962, 0.08796802558936179) },
    offset: { x: -12, y: 16 },
    align: 'end',
    priority: 1,
  },
  'focal-city': {
    id: 'focal-city',
    text: 'Focal city · the ant is here',
    anchor: { space: 'world2d', ...ACO_FOCAL_WORLD },
    offset: { x: 14, y: -22 },
    align: 'start',
    priority: 2,
  },
  'allowed-neighbours': {
    id: 'allowed-neighbours',
    text: 'Only unvisited cities are allowed',
    anchor: { space: 'world2d', ...world(0.24517467361874878, 0.6456944046076387) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 1,
  },
  'pheromone-weight': {
    id: 'pheromone-weight',
    text: 'τ^α rewards trails that worked',
    anchor: { space: 'world2d', ...ACO_FOCAL_WORLD },
    offset: { x: 14, y: -58 },
    align: 'start',
    priority: 1,
  },
  'distance-weight': {
    id: 'distance-weight',
    text: 'η^β rewards short edges',
    anchor: { space: 'world2d', ...world(0.20951048866845667, 0.30362963443621993) },
    offset: { x: 12, y: 16 },
    align: 'start',
    priority: 1,
  },
  'deposit-edge': {
    id: 'deposit-edge',
    text: 'Every used edge gains Q / Lₖ',
    anchor: { space: 'world2d', ...world(0.5079962892923504, 0.2041900979820639) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 1,
  },
  'shorter-tour-deposit': {
    id: 'shorter-tour-deposit',
    text: 'Shorter tour → more pheromone per edge',
    anchor: { space: 'world2d', ...world(0.6866120179183781, 0.6106208984274418) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 1,
  },
  'evaporating-edge': {
    id: 'evaporating-edge',
    text: 'Unused trails fade by (1 − ρ)',
    anchor: { space: 'world2d', ...world(0.17481389874592423, 0.5265925421845168) },
    offset: { x: -12, y: -18 },
    align: 'end',
    priority: 1,
  },
  'remaining-trail': {
    id: 'remaining-trail',
    text: 'Used trails survive and grow',
    anchor: { space: 'world2d', ...world(0.6011037519201636, 0.44829055899754167) },
    offset: { x: 12, y: 16 },
    align: 'start',
    priority: 1,
  },
  'best-tour': {
    id: 'best-tour',
    text: 'Best tour so far',
    anchor: { space: 'world2d', ...world(0.6011037519201636, 0.44829055899754167) },
    offset: { x: 12, y: -18 },
    align: 'start',
    priority: 2,
  },
  'convergence-chart': {
    id: 'convergence-chart',
    text: 'Best and mean length over iterations',
    anchor: { space: 'screen', x: 18, y: 104 },
    align: 'start',
    priority: 1,
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
