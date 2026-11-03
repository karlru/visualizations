/**
 * Canvas lesson layers for the Ant Colony Optimization opening.
 *
 * These layers draw the deterministic teaching sequence before the formal
 * algorithm appears: a single round trip, exhaustive enumeration, the factorial
 * growth of the search space, and one ant choosing its way around the map.
 * They read pure data from `stories/aco/lesson.ts` and the TSP model; they never
 * run the Ant System or mutate engine state.
 *
 * As with every canvas layer, no text is painted here. Counts, lengths, and
 * names live in the DOM lesson overlay or the prose. Geometry is cached per
 * city set and the draw path allocates nothing per frame.
 */

import type { AcoParams, AcoSnapshot, City } from '../../../engines/aco/types';
import {
  ACO_LESSON_GROWTH_STAGES,
  ACO_LESSON_ONE_ANT_STEPS,
  ACO_LESSON_ONE_ANT_TOUR,
  ACO_LESSON_TOURS,
  bestTourIndexUpTo,
  enumerationFraction,
  enumerationStep,
  growthStageFraction,
  growthStageIndex,
  lessonProgress,
  oneAntStepIndex,
} from '../../../stories/aco/lesson';
import { ACO_WORLD_SCALE } from '../../../stories/aco/world';
import type { Canvas2DLayer, Canvas2DLayerFrame } from '../Canvas2DRenderer';
import type { MutablePoint } from '../camera';
import {
  drawArc,
  drawLine,
  drawPoints,
  drawPolyline,
  drawSegments,
  type FillStyle,
  fillCircle,
  type PointStyle,
  type StrokeStyle,
} from '../primitives';
import { clamp01, layerVisible, pixelsToWorld } from './common';

const TOUR_WIDTH_PX = 2.5;
const TOUR_HALO_PX = 6.5;
const TOUR_DASH_ON_PX = 9;
const TOUR_DASH_OFF_PX = 6;
const CITY_MARKER_PX = 3.2;
const ANT_RADIUS_PX = 3.2;
const HOME_RING_PX = 8;
const CANDIDATE_RING_PX = 5.5;

function worldPoint(city: City): MutablePoint {
  return {
    x: (city.x - 0.5) * ACO_WORLD_SCALE,
    y: (city.y - 0.5) * ACO_WORLD_SCALE,
  };
}

function buildCityPoints(cities: readonly City[]): MutablePoint[] {
  const points = new Array<MutablePoint>(cities.length);
  for (let index = 0; index < cities.length; index += 1) {
    const city = cities[index];
    points[index] = city === undefined ? { x: 0, y: 0 } : worldPoint(city);
  }
  return points;
}

function buildTourPoints(
  cityPoints: readonly MutablePoint[],
  order: readonly number[],
): MutablePoint[] {
  const points = new Array<MutablePoint>(order.length + 1);
  for (let index = 0; index < order.length; index += 1) {
    const city = order[index];
    const point = city === undefined ? undefined : cityPoints[city];
    points[index] = point === undefined ? { x: 0, y: 0 } : { x: point.x, y: point.y };
  }
  const first = points[0];
  points[order.length] = first === undefined ? { x: 0, y: 0 } : { x: first.x, y: first.y };
  return points;
}

/** Draw the completed part of a closed tour plus a partially walked leg. */
function drawTourProgress(
  frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>,
  points: readonly MutablePoint[],
  progressLegs: number,
  style: StrokeStyle,
  scratch: MutablePoint,
): void {
  const maxLegs = Math.max(0, points.length - 1);
  const clamped = Math.max(0, Math.min(maxLegs, progressLegs));
  const completed = Math.floor(clamped);
  if (completed > 0) {
    drawPolyline(frame.ctx, points, style, false, completed + 1);
  }
  const fraction = clamped - completed;
  if (fraction <= 0 || completed >= maxLegs) return;
  const from = points[completed];
  const to = points[completed + 1];
  if (from === undefined || to === undefined) return;
  scratch.x = from.x + (to.x - from.x) * fraction;
  scratch.y = from.y + (to.y - from.y) * fraction;
  drawLine(frame.ctx, from.x, from.y, scratch.x, scratch.y, style);
}

function antPoint(points: readonly MutablePoint[], progressLegs: number, out: MutablePoint): void {
  const maxLegs = Math.max(0, points.length - 1);
  if (maxLegs === 0) {
    out.x = points[0]?.x ?? 0;
    out.y = points[0]?.y ?? 0;
    return;
  }
  const clamped = Math.max(0, Math.min(maxLegs, progressLegs));
  const completed = Math.min(maxLegs - 1, Math.floor(clamped));
  const fraction = clamped - completed;
  const from = points[completed];
  const to = points[completed + 1];
  if (from === undefined || to === undefined) {
    out.x = 0;
    out.y = 0;
    return;
  }
  out.x = from.x + (to.x - from.x) * fraction;
  out.y = from.y + (to.y - from.y) * fraction;
}

function drawHomeRing(
  frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>,
  point: MutablePoint,
  zoom: number,
): void {
  const style: StrokeStyle = {
    color: frame.theme.amber,
    width: pixelsToWorld(1.4, zoom),
    alpha: 0.82,
  };
  drawArc(frame.ctx, point.x, point.y, pixelsToWorld(HOME_RING_PX, zoom), 0, Math.PI * 2, style);
}

function drawTourMarkers(
  frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>,
  points: readonly MutablePoint[],
  zoom: number,
  count = points.length - 1,
): void {
  const style: PointStyle = {
    radius: pixelsToWorld(CITY_MARKER_PX, zoom),
    fill: frame.theme.amber,
    stroke: frame.theme.stage,
    strokeWidth: pixelsToWorld(1, zoom),
    shape: 'square',
  };
  drawPoints(frame.ctx, points, style, Math.max(0, count));
}

export function createLessonTourLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  let citiesRef: readonly City[] | null = null;
  let cityPoints: MutablePoint[] | null = null;
  let tourPoints: MutablePoint[] | null = null;
  const scratch: MutablePoint = { x: 0, y: 0 };
  const ant: MutablePoint = { x: 0, y: 0 };

  const lineStyle: StrokeStyle = { color: '', width: 1, alpha: 1, cap: 'round', join: 'round' };
  const antStyle: FillStyle = { fill: '', stroke: '', strokeWidth: 1 };

  return {
    id: 'lesson-tour',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;
      const snapshot = frame.snapshot;
      if (snapshot.cityCount < 2) return;

      if (citiesRef !== snapshot.cities || cityPoints === null) {
        citiesRef = snapshot.cities;
        cityPoints = buildCityPoints(snapshot.cities);
        tourPoints = buildTourPoints(cityPoints, ACO_LESSON_ONE_ANT_TOUR);
      }
      if (tourPoints === null || cityPoints === null) return;

      const progress = lessonProgress(frame.revealProgress);
      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);

      lineStyle.color = frame.theme.accent;
      lineStyle.width = pixelsToWorld(TOUR_WIDTH_PX + highlight * 0.8, zoom);
      lineStyle.alpha = 0.95;
      drawTourProgress(
        frame,
        tourPoints,
        progress * ACO_LESSON_ONE_ANT_TOUR.length,
        lineStyle,
        scratch,
      );

      const home = cityPoints[0];
      if (home !== undefined) drawHomeRing(frame, home, zoom);

      antPoint(tourPoints, progress * ACO_LESSON_ONE_ANT_TOUR.length, ant);
      antStyle.fill = frame.theme.stageInk;
      antStyle.stroke = frame.theme.stage;
      antStyle.strokeWidth = pixelsToWorld(1, zoom);
      fillCircle(frame.ctx, ant.x, ant.y, pixelsToWorld(ANT_RADIUS_PX, zoom), antStyle);
    },
  };
}

export function createLessonEnumerateLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  let citiesRef: readonly City[] | null = null;
  let cityPoints: MutablePoint[] | null = null;
  let currentPaths: MutablePoint[][] | null = null;
  const scratch: MutablePoint = { x: 0, y: 0 };

  const currentStyle: StrokeStyle = { color: '', width: 1, alpha: 1, cap: 'round', join: 'round' };
  const bestHaloStyle: StrokeStyle = {
    color: '',
    width: 1,
    alpha: 0.32,
    cap: 'round',
    join: 'round',
  };
  const bestDash: number[] = [1, 1];
  const bestLineStyle: StrokeStyle = {
    color: '',
    width: 1,
    alpha: 1,
    dash: bestDash,
    cap: 'butt',
    join: 'round',
  };

  return {
    id: 'lesson-enumerate',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;
      const snapshot = frame.snapshot;
      if (snapshot.cityCount < 2) return;

      if (citiesRef !== snapshot.cities || cityPoints === null) {
        citiesRef = snapshot.cities;
        cityPoints = buildCityPoints(snapshot.cities);
        currentPaths = ACO_LESSON_TOURS.map((tour) =>
          buildTourPoints(cityPoints as MutablePoint[], tour.order),
        );
      }
      if (currentPaths === null || cityPoints === null) return;

      const progress = lessonProgress(frame.revealProgress);
      const step = enumerationStep(progress);
      const fraction = enumerationFraction(progress);
      const current = currentPaths[step];
      const bestIndex = bestTourIndexUpTo(step);
      const best = currentPaths[bestIndex];
      if (current === undefined || best === undefined) return;

      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);

      // Current candidate: a solid accent line drawing itself.
      currentStyle.color = frame.theme.accent;
      currentStyle.width = pixelsToWorld(TOUR_WIDTH_PX + highlight * 0.8, zoom);
      currentStyle.alpha = 0.95;
      drawTourProgress(frame, current, fraction * (current.length - 1), currentStyle, scratch);

      // Best so far: halo + dashed line + square markers, same encoding as the
      // best-tour layer, so it survives grayscale and colour-vision differences.
      bestHaloStyle.color = frame.theme.amber;
      bestHaloStyle.width = pixelsToWorld(TOUR_HALO_PX + highlight * 1.5, zoom);
      bestHaloStyle.alpha = 0.3;
      drawPolyline(frame.ctx, best, bestHaloStyle, false, best.length);

      bestDash[0] = pixelsToWorld(TOUR_DASH_ON_PX, zoom);
      bestDash[1] = pixelsToWorld(TOUR_DASH_OFF_PX, zoom);
      bestLineStyle.color = frame.theme.amber;
      bestLineStyle.width = pixelsToWorld(2.2, zoom);
      drawPolyline(frame.ctx, best, bestLineStyle, false, best.length);
      drawTourMarkers(frame, best, zoom);
    },
  };
}

interface GrowthGeometry {
  readonly cityCount: number;
  readonly points: MutablePoint[];
  readonly edgeCoords: Float64Array;
  readonly edgeCount: number;
}

function buildGrowthGeometry(cities: readonly City[]): GrowthGeometry {
  const points = buildCityPoints(cities);
  const edgeCount = (cities.length * (cities.length - 1)) / 2;
  const edgeCoords = new Float64Array(edgeCount * 4);
  let offset = 0;
  for (let from = 0; from < points.length; from += 1) {
    const start = points[from];
    if (start === undefined) continue;
    for (let to = from + 1; to < points.length; to += 1) {
      const end = points[to];
      if (end === undefined) continue;
      edgeCoords[offset] = start.x;
      edgeCoords[offset + 1] = start.y;
      edgeCoords[offset + 2] = end.x;
      edgeCoords[offset + 3] = end.y;
      offset += 4;
    }
  }
  return { cityCount: cities.length, points, edgeCoords, edgeCount };
}

const GROWTH_GEOMETRY: readonly GrowthGeometry[] = ACO_LESSON_GROWTH_STAGES.map((stage) =>
  buildGrowthGeometry(stage.cities),
);

export function createLessonGrowthLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  const edgeStyle: StrokeStyle = { color: '', width: 0.8, alpha: 0.18, cap: 'butt' };
  const cityStyle: PointStyle = { radius: 3.2, fill: '', stroke: '', strokeWidth: 1.2 };

  return {
    id: 'lesson-growth',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;
      const progress = lessonProgress(frame.revealProgress);
      const index = growthStageIndex(progress);
      const fraction = growthStageFraction(progress);
      const current = GROWTH_GEOMETRY[index];
      const previous = index > 0 ? GROWTH_GEOMETRY[index - 1] : undefined;
      if (current === undefined) return;

      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);

      // Previous stage stays faint under the new one, so growth reads as nodes
      // being added rather than a hard cut.
      if (previous !== undefined) {
        edgeStyle.color = frame.theme.stageMuted;
        edgeStyle.width = pixelsToWorld(0.6, zoom);
        edgeStyle.alpha = 0.1 + 0.08 * (1 - fraction);
        drawSegments(frame.ctx, previous.edgeCoords, previous.edgeCount, edgeStyle, 0, 2);
        cityStyle.radius = pixelsToWorld(2.4, zoom);
        cityStyle.fill = frame.theme.stageMuted;
        cityStyle.stroke = frame.theme.stage;
        cityStyle.strokeWidth = pixelsToWorld(1, zoom);
        drawPoints(frame.ctx, previous.points, cityStyle, previous.cityCount);
      }

      edgeStyle.color = frame.theme.cool;
      edgeStyle.width = pixelsToWorld(0.8 + highlight * 0.3, zoom);
      edgeStyle.alpha = 0.12 + 0.16 * fraction;
      drawSegments(frame.ctx, current.edgeCoords, current.edgeCount, edgeStyle, 0, 2);

      cityStyle.radius = pixelsToWorld(3.2 + highlight * 0.6, zoom);
      cityStyle.fill = frame.theme.stageInk;
      cityStyle.stroke = frame.theme.stage;
      cityStyle.strokeWidth = pixelsToWorld(1.2, zoom);
      drawPoints(frame.ctx, current.points, cityStyle, current.cityCount);
    },
  };
}

export function createLessonAntLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  let citiesRef: readonly City[] | null = null;
  let cityPoints: MutablePoint[] | null = null;
  let tourPoints: MutablePoint[] | null = null;
  const scratch: MutablePoint = { x: 0, y: 0 };
  const ant: MutablePoint = { x: 0, y: 0 };

  const pathStyle: StrokeStyle = { color: '', width: 1, alpha: 1, cap: 'round', join: 'round' };
  const candidateStyle: StrokeStyle = { color: '', width: 0.8, alpha: 0.25, cap: 'round' };
  const ringStyle: StrokeStyle = { color: '', width: 1, alpha: 0.35 };
  const antStyle: FillStyle = { fill: '', stroke: '', strokeWidth: 1 };

  return {
    id: 'lesson-ant',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;
      const snapshot = frame.snapshot;
      if (snapshot.cityCount < 2) return;

      if (citiesRef !== snapshot.cities || cityPoints === null) {
        citiesRef = snapshot.cities;
        cityPoints = buildCityPoints(snapshot.cities);
        tourPoints = buildTourPoints(cityPoints, ACO_LESSON_ONE_ANT_TOUR);
      }
      if (cityPoints === null || tourPoints === null) return;

      const progress = lessonProgress(frame.revealProgress);
      const step = oneAntStepIndex(progress);
      const legs = progress * ACO_LESSON_ONE_ANT_STEPS.length;
      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);

      // Completed path up to the current leg.
      pathStyle.color = frame.theme.accent;
      pathStyle.width = pixelsToWorld(TOUR_WIDTH_PX + highlight * 0.8, zoom);
      pathStyle.alpha = 0.95;
      drawTourProgress(frame, tourPoints, legs, pathStyle, scratch);

      const choice = ACO_LESSON_ONE_ANT_STEPS[step];
      if (choice !== undefined) {
        const from = cityPoints[choice.currentCity];
        if (from !== undefined) {
          for (const candidate of choice.candidates) {
            const to = cityPoints[candidate.city];
            if (to === undefined) continue;
            const isChosen = candidate.city === choice.chosenCity;
            candidateStyle.color = isChosen ? frame.theme.amber : frame.theme.stageMuted;
            candidateStyle.width = pixelsToWorld(
              isChosen ? 2.2 : 0.9 + candidate.probability * 1.2,
              zoom,
            );
            candidateStyle.alpha = isChosen ? 0.9 : 0.18 + candidate.probability * 0.4;
            drawLine(frame.ctx, from.x, from.y, to.x, to.y, candidateStyle);

            ringStyle.color = isChosen ? frame.theme.amber : frame.theme.stageMuted;
            ringStyle.width = pixelsToWorld(isChosen ? 1.4 : 0.9, zoom);
            ringStyle.alpha = isChosen ? 0.8 : 0.28;
            drawArc(
              frame.ctx,
              to.x,
              to.y,
              pixelsToWorld(CANDIDATE_RING_PX, zoom),
              0,
              Math.PI * 2,
              ringStyle,
            );
          }
        }
      }

      antPoint(tourPoints, legs, ant);
      antStyle.fill = frame.theme.stageInk;
      antStyle.stroke = frame.theme.stage;
      antStyle.strokeWidth = pixelsToWorld(1, zoom);
      fillCircle(frame.ctx, ant.x, ant.y, pixelsToWorld(ANT_RADIUS_PX, zoom), antStyle);

      const home = cityPoints[0];
      if (home !== undefined) drawHomeRing(frame, home, zoom);
    },
  };
}
