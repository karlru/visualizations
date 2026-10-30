/**
 * Best-tour layer.
 *
 * The best tour is deliberately encoded three ways so it survives a grayscale
 * print or a colour-vision deficiency:
 *
 * 1. a wide, soft **halo**;
 * 2. a thinner **dashed** line on top;
 * 3. **square** markers on the visited cities.
 *
 * The tour closes from the last city back to the first. The numeric length is
 * not painted here: it belongs to the DOM summary and live region.
 *
 * Geometry is rebuilt only when the frozen `bestTour` reference or the city set
 * changes. Dash lengths are kept in CSS pixels and written into one reusable
 * array each frame, so no per-frame garbage is produced.
 */

import type { AcoParams, AcoSnapshot, City } from '../../../engines/aco/types';
import { ACO_WORLD_SCALE } from '../../../stories/aco/world';
import type { Canvas2DLayer, Canvas2DLayerFrame } from '../Canvas2DRenderer';
import type { MutablePoint } from '../camera';
import { drawPoints, drawPolyline, type PointStyle, type StrokeStyle } from '../primitives';
import { clamp01, layerVisible, pixelsToWorld } from './common';

/** Halo and dashed-line widths in CSS pixels. */
const HALO_WIDTH_PX = 6.5;
const DASH_WIDTH_PX = 2.4;
/** Dash pattern in CSS pixels; a different rhythm, not just a different hue. */
const DASH_ON_PX = 9;
const DASH_OFF_PX = 6;
const MARKER_RADIUS_PX = 2.8;

function buildTourPoints(cities: readonly City[], tour: readonly number[]): MutablePoint[] | null {
  if (tour.length === 0) return null;
  const points = new Array<MutablePoint>(tour.length + 1);
  for (let index = 0; index < tour.length; index += 1) {
    const cityIndex = tour[index];
    const city = cityIndex === undefined ? undefined : cities[cityIndex];
    if (city === undefined) return null;
    points[index] = {
      x: (city.x - 0.5) * ACO_WORLD_SCALE,
      y: (city.y - 0.5) * ACO_WORLD_SCALE,
    };
  }
  const first = points[0];
  points[tour.length] = first === undefined ? { x: 0, y: 0 } : { x: first.x, y: first.y };
  return points;
}

export function createBestTourLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  let citiesRef: readonly City[] | null = null;
  let tourRef: readonly number[] | null = null;
  let tourPoints: MutablePoint[] | null = null;

  const dash: number[] = [DASH_ON_PX, DASH_OFF_PX];
  const haloStyle: StrokeStyle = {
    color: '',
    width: HALO_WIDTH_PX,
    alpha: 0.32,
    cap: 'round',
    join: 'round',
  };
  const lineStyle: StrokeStyle = {
    color: '',
    width: DASH_WIDTH_PX,
    alpha: 1,
    dash,
    cap: 'butt',
    join: 'round',
  };
  const markerStyle: PointStyle = {
    radius: MARKER_RADIUS_PX,
    fill: '',
    shape: 'square',
    stroke: '',
    strokeWidth: 1,
  };

  return {
    id: 'best-tour',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;

      const snapshot = frame.snapshot;
      const bestTour = snapshot.bestTour;
      if (bestTour === null) return;

      if (citiesRef !== snapshot.cities || tourRef !== bestTour || tourPoints === null) {
        citiesRef = snapshot.cities;
        tourRef = bestTour;
        tourPoints = buildTourPoints(snapshot.cities, bestTour);
      }
      if (tourPoints === null) return;

      const reveal = clamp01(frame.revealProgress);
      if (reveal <= 0) return;

      const segments = Math.min(bestTour.length, Math.ceil(bestTour.length * reveal));
      if (segments <= 0) return;
      const pointCount = segments + 1;

      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);

      haloStyle.color = frame.theme.amber;
      haloStyle.width = pixelsToWorld(HALO_WIDTH_PX + highlight * 2, zoom);
      haloStyle.alpha = 0.26 + highlight * 0.18;
      drawPolyline(frame.ctx, tourPoints, haloStyle, false, pointCount);

      dash[0] = pixelsToWorld(DASH_ON_PX, zoom);
      dash[1] = pixelsToWorld(DASH_OFF_PX, zoom);
      lineStyle.color = frame.theme.accent;
      lineStyle.width = pixelsToWorld(DASH_WIDTH_PX + highlight * 0.8, zoom);
      lineStyle.alpha = 0.95;
      drawPolyline(frame.ctx, tourPoints, lineStyle, false, pointCount);

      markerStyle.radius = pixelsToWorld(MARKER_RADIUS_PX + highlight * 0.8, zoom);
      markerStyle.strokeWidth = pixelsToWorld(1, zoom);
      markerStyle.fill = frame.theme.amber;
      markerStyle.stroke = frame.theme.stage;
      drawPoints(frame.ctx, tourPoints, markerStyle, segments);
    },
  };
}
