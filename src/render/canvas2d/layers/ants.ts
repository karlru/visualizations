/**
 * Ant layer: moving dots with a short trail.
 *
 * The engine completes a whole tour per ant in one iteration and exposes
 * `iterationProgress` in `[0, 1)`. This layer maps that fraction onto the ant's
 * tour: position `p × cityCount` between consecutive cities, wrapping from the
 * last city back to the first. Nothing is simulated here, so the dots can run
 * at display rate without touching engine state or allocating per frame.
 *
 * Ants with `visitedCount === 0` have no tour yet and are skipped. Dots are
 * batched into one `drawPoints` call; trails reuse one short point buffer.
 * Labels remain DOM overlays; no text is drawn.
 */

import type { AcoParams, AcoSnapshot, City } from '../../../engines/aco/types';
import { ACO_WORLD_SCALE } from '../../../stories/aco/world';
import type { Canvas2DLayer, Canvas2DLayerFrame } from '../Canvas2DRenderer';
import type { MutablePoint } from '../camera';
import { drawPoints, drawPolyline, type PointStyle, type StrokeStyle } from '../primitives';
import { clamp01, layerVisible, pixelsToWorld } from './common';

/** Number of samples in the short trail behind an ant. */
const TRAIL_SAMPLES = 6;
/** Trail length as a fraction of one iteration. */
const TRAIL_SPAN = 0.07;
/** Ant dot radius in CSS pixels. */
const ANT_RADIUS_PX = 2.4;
const ANT_STROKE_PX = 1;
const TRAIL_WIDTH_PX = 1.4;

function buildCityPoints(cities: readonly City[]): MutablePoint[] {
  const points = new Array<MutablePoint>(cities.length);
  for (let index = 0; index < cities.length; index += 1) {
    const city = cities[index];
    points[index] =
      city === undefined
        ? { x: 0, y: 0 }
        : {
            x: (city.x - 0.5) * ACO_WORLD_SCALE,
            y: (city.y - 0.5) * ACO_WORLD_SCALE,
          };
  }
  return points;
}

/**
 * Write the ant's position at `fraction` of the current tour into `out`.
 * The tour closes implicitly from the last city back to the first.
 */
export function antPositionAt(
  cityPoints: readonly MutablePoint[],
  tour: Int32Array,
  fraction: number,
  out: MutablePoint,
): void {
  const count = cityPoints.length;
  if (count === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  if (count === 1) {
    const only = cityPoints[0];
    out.x = only?.x ?? 0;
    out.y = only?.y ?? 0;
    return;
  }

  const wrapped = fraction - Math.floor(fraction);
  const position = (Number.isFinite(wrapped) ? wrapped : 0) * count;
  let index = Math.floor(position);
  if (index >= count) index = count - 1;
  const t = Math.max(0, Math.min(1, position - index));

  const fromCity = tour[index];
  const toCity = tour[(index + 1) % count];
  const from = fromCity === undefined ? undefined : cityPoints[fromCity];
  const to = toCity === undefined ? undefined : cityPoints[toCity];
  if (from === undefined || to === undefined) {
    out.x = 0;
    out.y = 0;
    return;
  }

  out.x = from.x + (to.x - from.x) * t;
  out.y = from.y + (to.y - from.y) * t;
}

export function createAntsLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  let cityPoints: MutablePoint[] | null = null;
  let citiesRef: readonly City[] | null = null;

  const antPoints: MutablePoint[] = [];
  const trailPoints: MutablePoint[] = Array.from({ length: TRAIL_SAMPLES }, () => ({
    x: 0,
    y: 0,
  }));

  const dotStyle: PointStyle = {
    radius: ANT_RADIUS_PX,
    fill: '',
    stroke: '',
    strokeWidth: ANT_STROKE_PX,
  };
  const trailStyle: StrokeStyle = {
    color: '',
    width: TRAIL_WIDTH_PX,
    alpha: 0.34,
  };

  return {
    id: 'ants',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;

      const snapshot = frame.snapshot;
      if (citiesRef !== snapshot.cities || cityPoints === null) {
        citiesRef = snapshot.cities;
        cityPoints = buildCityPoints(snapshot.cities);
      }

      const reveal = clamp01(frame.revealProgress);
      if (reveal <= 0) return;

      const ants = snapshot.ants;
      const visibleAnts = Math.min(ants.length, Math.ceil(ants.length * reveal));
      if (visibleAnts === 0) return;

      // Grow the reusable dot buffer only when the colony size grows.
      if (antPoints.length < visibleAnts) {
        while (antPoints.length < visibleAnts) antPoints.push({ x: 0, y: 0 });
      } else if (antPoints.length > visibleAnts) {
        antPoints.length = visibleAnts;
      }

      const progress = snapshot.iterationProgress;
      const highlight = clamp01(frame.highlight);
      const zoom = frame.camera.zoom;

      trailStyle.color = frame.theme.amber;
      trailStyle.width = pixelsToWorld(TRAIL_WIDTH_PX + highlight * 0.5, zoom);
      trailStyle.alpha = 0.28 + highlight * 0.2;

      let drawn = 0;
      for (let index = 0; index < visibleAnts; index += 1) {
        const ant = ants[index];
        if (ant === undefined || ant.visitedCount === 0) continue;
        const dot = antPoints[drawn];
        if (dot === undefined) continue;

        for (let sample = 0; sample < TRAIL_SAMPLES; sample += 1) {
          const point = trailPoints[sample];
          if (point === undefined) continue;
          const back = ((TRAIL_SAMPLES - 1 - sample) / (TRAIL_SAMPLES - 1)) * TRAIL_SPAN;
          antPositionAt(cityPoints, ant.tour, progress - back, point);
        }
        drawPolyline(frame.ctx, trailPoints, trailStyle, false);

        antPositionAt(cityPoints, ant.tour, progress, dot);
        drawn += 1;
      }

      if (drawn === 0) return;
      dotStyle.radius = pixelsToWorld(ANT_RADIUS_PX + highlight * 0.9, zoom);
      dotStyle.strokeWidth = pixelsToWorld(ANT_STROKE_PX, zoom);
      dotStyle.fill = frame.theme.stageInk;
      dotStyle.stroke = frame.theme.stage;
      drawPoints(frame.ctx, antPoints, dotStyle, drawn);
    },
  };
}
