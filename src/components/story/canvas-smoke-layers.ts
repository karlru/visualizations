/**
 * Development layers for `/dev/canvas-smoke`.
 *
 * These are not ACO production layers; Step 3.2 replaces them with graph,
 * pheromone, ant, best-tour, and probability-fan layers. They exist to prove
 * that the renderer's camera, layer ordering, visibility/opacity, primitives,
 * gradients, DOM labels, and moving snapshot path all work together.
 *
 * The factory owns every mutable buffer and style object it needs. The draw
 * callbacks do not create arrays, points, styles, or gradients per frame; the
 * gradient is rebuilt only when the stage size or theme changes.
 */

import type { Canvas2DLayer, Canvas2DLayerFrame } from '../../render/canvas2d/Canvas2DRenderer';
import type { MutablePoint, Point } from '../../render/canvas2d/camera';
import {
  createLinearGradient,
  drawArc,
  drawLine,
  drawPoints,
  drawPolyline,
  type FillStyle,
  FULL_CIRCLE,
  fillRect,
  type GradientStop,
  type PointStyle,
  type StrokeStyle,
} from '../../render/canvas2d/primitives';
import type { SceneState } from '../../render/types';
import type { SmokeParams, SmokeSnapshot } from '../../stories/dev/canvas-smoke-engine';

/** Twelve fixed cities in a compact world-space field. */
const CITIES: readonly Point[] = [
  { x: -3.1, y: -1.7 },
  { x: -1.8, y: -2.4 },
  { x: -0.2, y: -2.1 },
  { x: 1.4, y: -2.5 },
  { x: 3.2, y: -1.6 },
  { x: 2.4, y: -0.1 },
  { x: 0.7, y: -0.4 },
  { x: -0.8, y: -0.9 },
  { x: -2.6, y: -0.3 },
  { x: -3.3, y: 1.4 },
  { x: -1.4, y: 2.1 },
  { x: 0.4, y: 1.2 },
  { x: 2.1, y: 1.9 },
  { x: 3.3, y: 1.1 },
];

const EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 5],
  [3, 13],
  [6, 11],
  [7, 10],
  [1, 8],
  [0, 9],
  [2, 7],
  [4, 12],
];

function city(index: number): Point {
  const point = CITIES[index];
  if (point === undefined) {
    throw new Error(`Smoke fixture is missing city ${index}.`);
  }
  return point;
}

const FOCAL_CITY = city(7);
const TOUR: readonly Point[] = [
  city(0),
  city(3),
  city(5),
  city(13),
  city(12),
  city(10),
  city(8),
  city(1),
  city(0),
];

const LABEL_CAMERA = {
  kind: '2d',
  panX: 0,
  panY: 0,
  zoom: 74,
  rotation: 0,
} as const;

/** Static presentation scene. Layer visibility can be toggled by the harness. */
export function createSmokeScene(options: {
  readonly showPheromone: boolean;
  readonly showGraph: boolean;
}): SceneState {
  return {
    camera: LABEL_CAMERA,
    layers: [
      { id: 'backdrop', visible: true, opacity: 1 },
      { id: 'graph', visible: options.showGraph, opacity: 0.9 },
      { id: 'pheromone', visible: options.showPheromone, opacity: 0.7 },
      { id: 'ants', visible: true, opacity: 1 },
      { id: 'best-tour', visible: true, opacity: 1 },
    ],
    highlights: [{ id: 'graph', layerId: 'graph', intensity: 0.4 }],
    revealProgress: 1,
    labels: [
      {
        id: 'focal-city',
        text: 'focal city · α',
        anchor: { space: 'world2d', x: FOCAL_CITY.x, y: FOCAL_CITY.y },
        offset: { x: 8, y: -18 },
      },
      {
        id: 'pheromone',
        text: 'pheromone trail',
        anchor: { space: 'world2d', x: city(11).x, y: city(11).y },
        offset: { x: 8, y: 14 },
      },
      {
        id: 'tour',
        text: 'best tour',
        anchor: { space: 'world2d', x: city(13).x, y: city(13).y },
        offset: { x: -8, y: -18 },
        align: 'end',
        priority: 2,
      },
      {
        id: 'hud',
        text: 'DOM label · gsap.ticker',
        anchor: { space: 'screen', x: 18, y: 16 },
        priority: 3,
      },
    ],
  };
}

export function createSmokeLayers(): readonly Canvas2DLayer<SmokeParams, SmokeSnapshot>[] {
  return [backdropLayer(), graphLayer(), pheromoneLayer(), antsLayer(), bestTourLayer()];
}

function backdropLayer(): Canvas2DLayer<SmokeParams, SmokeSnapshot> {
  let gradient: CanvasGradient | null = null;
  let gradientWidth = 0;
  let gradientHeight = 0;
  let gradientStage = '';

  const style: FillStyle = { fill: '', alpha: 0.5 };

  return {
    id: 'backdrop',
    draw(frame: Canvas2DLayerFrame<SmokeParams, SmokeSnapshot>): void {
      if (
        gradient === null ||
        gradientWidth !== frame.width ||
        gradientHeight !== frame.height ||
        gradientStage !== frame.theme.stage
      ) {
        const stops: readonly GradientStop[] = [
          { offset: 0, color: frame.theme.cool },
          { offset: 0.45, color: frame.theme.stageRaised },
          { offset: 1, color: frame.theme.stage },
        ];
        gradient = createLinearGradient(frame.ctx, 0, 0, frame.width, frame.height, stops);
        gradientWidth = frame.width;
        gradientHeight = frame.height;
        gradientStage = frame.theme.stage;
      }

      frame.ctx.save();
      frame.ctx.setTransform(frame.dpr, 0, 0, frame.dpr, 0, 0);
      style.fill = gradient;
      style.alpha = 0.16;
      fillRect(frame.ctx, 0, 0, frame.width, frame.height, style);
      frame.ctx.restore();
    },
  };
}

function graphLayer(): Canvas2DLayer<SmokeParams, SmokeSnapshot> {
  const edgeStyle: StrokeStyle = { color: '', width: 0.018, alpha: 0.35 };
  const focusEdgeStyle: StrokeStyle = { color: '', width: 0.03, alpha: 0.8 };
  const cityStyle: PointStyle = { radius: 0.085, fill: '', stroke: '', strokeWidth: 0.012 };

  return {
    id: 'graph',
    draw(frame: Canvas2DLayerFrame<SmokeParams, SmokeSnapshot>): void {
      edgeStyle.color = frame.theme.stageMuted;
      focusEdgeStyle.color = frame.theme.cool;
      for (let index = 0; index < EDGES.length; index += 1) {
        const edge = EDGES[index];
        if (edge === undefined) continue;
        const from = CITIES[edge[0]];
        const to = CITIES[edge[1]];
        if (from === undefined || to === undefined) continue;
        const style = index % 5 === 0 ? focusEdgeStyle : edgeStyle;
        drawLine(frame.ctx, from.x, from.y, to.x, to.y, style);
      }

      cityStyle.fill = frame.theme.stageInk;
      cityStyle.stroke = frame.theme.stage;
      drawPoints(frame.ctx, CITIES, cityStyle);
    },
  };
}

function pheromoneLayer(): Canvas2DLayer<SmokeParams, SmokeSnapshot> {
  const style: StrokeStyle = { color: '', width: 0.035, alpha: 0.55, cap: 'butt' };
  const inner: StrokeStyle = { color: '', width: 0.018, alpha: 0.7, dash: [0.08, 0.06] };

  return {
    id: 'pheromone',
    draw(frame: Canvas2DLayerFrame<SmokeParams, SmokeSnapshot>): void {
      style.color = frame.theme.cool;
      inner.color = frame.theme.amber;
      const scale = frame.snapshot.orbit;
      const pulse = (1.15 + frame.snapshot.pulse * 0.28) * scale;
      drawArc(frame.ctx, FOCAL_CITY.x, FOCAL_CITY.y, pulse, 0, FULL_CIRCLE, style);
      drawArc(frame.ctx, FOCAL_CITY.x, FOCAL_CITY.y, pulse * 1.55, -1.1, 1.4, inner);
      drawArc(frame.ctx, FOCAL_CITY.x, FOCAL_CITY.y, pulse * 1.55, 2.1, 3.5, inner);
    },
  };
}

function antsLayer(): Canvas2DLayer<SmokeParams, SmokeSnapshot> {
  const ants: MutablePoint[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const style: PointStyle = { radius: 0.11, fill: '', stroke: '', strokeWidth: 0.02 };
  const trailStyle: StrokeStyle = { color: '', width: 0.025, alpha: 0.5 };

  return {
    id: 'ants',
    draw(frame: Canvas2DLayerFrame<SmokeParams, SmokeSnapshot>): void {
      const phase = frame.snapshot.phase;
      const scale = frame.snapshot.orbit;
      for (let index = 0; index < ants.length; index += 1) {
        const ant = ants[index];
        if (ant === undefined) continue;
        const angle = phase + (index * FULL_CIRCLE) / ants.length;
        ant.x = FOCAL_CITY.x + Math.cos(angle) * 1.7 * scale;
        ant.y = FOCAL_CITY.y + Math.sin(angle) * 1.15 * scale;
      }

      if (frame.params.trails) {
        trailStyle.color = frame.theme.amber;
        for (let index = 0; index < ants.length; index += 1) {
          const ant = ants[index];
          if (ant === undefined) continue;
          drawLine(frame.ctx, FOCAL_CITY.x, FOCAL_CITY.y, ant.x, ant.y, trailStyle);
        }
      }

      style.fill = frame.theme.amber;
      style.stroke = frame.theme.stage;
      drawPoints(frame.ctx, ants, style);
    },
  };
}

function bestTourLayer(): Canvas2DLayer<SmokeParams, SmokeSnapshot> {
  const tourStyle: StrokeStyle = {
    color: '',
    width: 0.045,
    alpha: 0.95,
    dash: [0.16, 0.1],
  };
  const markerStyle: PointStyle = {
    radius: 0.05,
    fill: '',
    shape: 'square',
    stroke: '',
    strokeWidth: 0.01,
  };

  return {
    id: 'best-tour',
    draw(frame: Canvas2DLayerFrame<SmokeParams, SmokeSnapshot>): void {
      tourStyle.color = frame.theme.amber;
      markerStyle.fill = frame.theme.amber;
      markerStyle.stroke = frame.theme.stage;
      drawPolyline(frame.ctx, TOUR, tourStyle, false);
      drawPoints(frame.ctx, TOUR, markerStyle);
    },
  };
}
