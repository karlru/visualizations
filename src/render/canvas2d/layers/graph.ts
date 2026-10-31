/**
 * City graph layer: cities plus faint all-pairs candidate edges.
 *
 * `FR-ACO-05` requires all-pairs candidate edges, not just the tour or the
 * nearest-neighbour graph, so every unique city pair is a candidate. The layer
 * builds that geometry once per city set (not per frame), draws the edges as
 * one batched path, and reveals a deterministic prefix as `revealProgress`
 * advances.
 *
 * Cities use the story world space from `stories/aco/world.ts` (normalized unit
 * square × 6, centred on the origin); the renderer's camera transform is the
 * only pixel mapping. No text is drawn here — labels are DOM overlays.
 */

import type { AcoParams, AcoSnapshot, City } from '../../../engines/aco/types';
import { qualityProfile } from '../../../lib/quality';
import { ACO_WORLD_SCALE } from '../../../stories/aco/world';
import type { Canvas2DLayer, Canvas2DLayerFrame } from '../Canvas2DRenderer';
import type { MutablePoint } from '../camera';
import { drawPoints, drawSegments, type PointStyle, type StrokeStyle } from '../primitives';
import { clamp01, layerVisible, pixelsToWorld } from './common';

/** Faint all-pairs edge width in CSS pixels. */
const EDGE_WIDTH_PX = 0.8;
/** City radius in CSS pixels. */
const CITY_RADIUS_PX = 3.4;
const CITY_STROKE_PX = 1.4;

interface Geometry {
  readonly cities: readonly City[];
  readonly cityPoints: MutablePoint[];
  readonly edgeCoords: Float64Array;
  readonly edgeCount: number;
}

function buildGeometry(cities: readonly City[]): Geometry {
  const count = cities.length;
  const edgeCount = (count * (count - 1)) / 2;
  const cityPoints = new Array<MutablePoint>(count);
  for (let index = 0; index < count; index += 1) {
    const city = cities[index];
    if (city === undefined) {
      cityPoints[index] = { x: 0, y: 0 };
      continue;
    }
    cityPoints[index] = {
      x: (city.x - 0.5) * ACO_WORLD_SCALE,
      y: (city.y - 0.5) * ACO_WORLD_SCALE,
    };
  }

  const edgeCoords = new Float64Array(edgeCount * 4);
  let offset = 0;
  for (let from = 0; from < count; from += 1) {
    const start = cityPoints[from];
    if (start === undefined) continue;
    for (let to = from + 1; to < count; to += 1) {
      const end = cityPoints[to];
      if (end === undefined) continue;
      edgeCoords[offset] = start.x;
      edgeCoords[offset + 1] = start.y;
      edgeCoords[offset + 2] = end.x;
      edgeCoords[offset + 3] = end.y;
      offset += 4;
    }
  }

  return { cities, cityPoints, edgeCoords, edgeCount };
}

export function createGraphLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  let geometry: Geometry | null = null;

  const edgeStyle: StrokeStyle = {
    color: '',
    width: EDGE_WIDTH_PX,
    alpha: 0.2,
    cap: 'butt',
  };
  const cityStyle: PointStyle = {
    radius: CITY_RADIUS_PX,
    fill: '',
    stroke: '',
    strokeWidth: CITY_STROKE_PX,
  };

  return {
    id: 'graph',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;

      const snapshot = frame.snapshot;
      if (geometry === null || geometry.cities !== snapshot.cities) {
        geometry = buildGeometry(snapshot.cities);
      }
      const reveal = clamp01(frame.revealProgress);
      if (reveal <= 0) return;

      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);
      const profile = qualityProfile(frame.quality ?? 'high');

      edgeStyle.color = frame.theme.stageMuted;
      edgeStyle.width = pixelsToWorld(EDGE_WIDTH_PX + highlight * 0.35, zoom);
      edgeStyle.alpha = 0.16 + highlight * 0.1;

      const visibleEdges = Math.min(geometry.edgeCount, Math.ceil(geometry.edgeCount * reveal));
      // A low tier samples the deterministic edge order instead of building a
      // second buffer. The all-pairs model and the city set are unchanged.
      drawSegments(frame.ctx, geometry.edgeCoords, visibleEdges, edgeStyle, 0, profile.edgeStride);

      const visibleCities = Math.min(
        geometry.cityPoints.length,
        Math.ceil(snapshot.cityCount * reveal),
      );
      cityStyle.radius = pixelsToWorld(CITY_RADIUS_PX + highlight * 1.2, zoom);
      cityStyle.strokeWidth = pixelsToWorld(CITY_STROKE_PX, zoom);
      cityStyle.fill = frame.theme.stageInk;
      cityStyle.stroke = frame.theme.stage;
      drawPoints(frame.ctx, geometry.cityPoints, cityStyle, visibleCities);
    },
  };
}
