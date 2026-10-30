/**
 * Pheromone layer: edge width *and* opacity encode `τ_ij`.
 *
 * ### The scale
 *
 * Pheromone spans several orders of magnitude after evaporation concentrates a
 * trail. A linear map would leave the early uniform colony invisible (every
 * edge is `τ₀ = 0.1`) and a linear map against the late maximum would flatten
 * everything else. The layer therefore uses a log scale anchored to the known
 * initial value:
 *
 * ```text
 * t = ln(1 + τ / τ₀) / ln(1 + 32)      clamped to [0, 1]
 * ```
 *
 * At the first iteration every edge is `t ≈ 0.20`; a reinforced edge at
 * `τ = 1` is `t ≈ 0.69`; `τ ≥ 3.2` saturates. Width and alpha both interpolate
 * from a minimum to a maximum, so the early lattice is faint but present and a
 * late trail is visibly wider and brighter. `τ = 0` (possible with `ρ = 1`)
 * maps to the documented minimum visible width, never to nothing.
 *
 * Edges are bucketed by intensity and drawn as one batched path per bucket.
 * That keeps a 150-city map at twenty stroke calls instead of 11,175 and
 * allocates nothing per frame. Colours come from a ramp cached per theme; text
 * never enters the canvas.
 */

import { color, type RGBColor } from 'd3-color';
import { INITIAL_PHEROMONE } from '../../../engines/aco/engine';
import type { AcoParams, AcoSnapshot, City } from '../../../engines/aco/types';
import { ACO_WORLD_SCALE } from '../../../stories/aco/world';
import type { Canvas2DLayer, Canvas2DLayerFrame } from '../Canvas2DRenderer';
import { drawSegments, type StrokeStyle } from '../primitives';
import { clamp01, layerVisible, pixelsToWorld } from './common';

/** Anchors the log scale to the engine's documented initial pheromone. */
export const PHEROMONE_REFERENCE_TAU = INITIAL_PHEROMONE;

/** Saturating multiple of `τ₀`; values at or above this map to 1. */
export const PHEROMONE_REFERENCE_MULTIPLE = 32;

/** Number of cached colour/intensity buckets. */
export const PHEROMONE_BUCKETS = 20;

/** Minimum visible width in CSS pixels. Zero pheromone still gets this. */
export const PHEROMONE_MIN_WIDTH_PX = 0.75;
export const PHEROMONE_MAX_WIDTH_PX = 5.5;
export const PHEROMONE_MIN_ALPHA = 0.06;
export const PHEROMONE_MAX_ALPHA = 0.72;

const LOG_REFERENCE = Math.log1p(PHEROMONE_REFERENCE_MULTIPLE);

/** Normalize one pheromone value to `[0, 1]` on the documented log scale. */
export function pheromoneIntensity(pheromone: number): number {
  if (!Number.isFinite(pheromone) || pheromone <= 0) return 0;
  const ratio = pheromone / PHEROMONE_REFERENCE_TAU;
  const value = Math.log1p(ratio) / LOG_REFERENCE;
  return Math.max(0, Math.min(1, value));
}

/** Width in CSS pixels for an intensity in `[0, 1]`. */
export function pheromoneWidthPx(intensity: number): number {
  const value = clamp01(intensity);
  return PHEROMONE_MIN_WIDTH_PX + (PHEROMONE_MAX_WIDTH_PX - PHEROMONE_MIN_WIDTH_PX) * value;
}

/** Stroke alpha for an intensity in `[0, 1]`. */
export function pheromoneAlpha(intensity: number): number {
  const value = clamp01(intensity);
  return PHEROMONE_MIN_ALPHA + (PHEROMONE_MAX_ALPHA - PHEROMONE_MIN_ALPHA) * value;
}

interface Geometry {
  readonly cities: readonly City[];
  readonly coords: Float64Array;
  readonly pheromoneIndex: Int32Array;
  readonly edgeCount: number;
}

function buildGeometry(cities: readonly City[]): Geometry {
  const size = cities.length;
  const edgeCount = (size * (size - 1)) / 2;
  const coords = new Float64Array(edgeCount * 4);
  const pheromoneIndex = new Int32Array(edgeCount);

  let offset = 0;
  for (let from = 0; from < size; from += 1) {
    const start = cities[from];
    if (start === undefined) continue;
    const startX = (start.x - 0.5) * ACO_WORLD_SCALE;
    const startY = (start.y - 0.5) * ACO_WORLD_SCALE;
    for (let to = from + 1; to < size; to += 1) {
      const end = cities[to];
      if (end === undefined) continue;
      coords[offset] = startX;
      coords[offset + 1] = startY;
      coords[offset + 2] = (end.x - 0.5) * ACO_WORLD_SCALE;
      coords[offset + 3] = (end.y - 0.5) * ACO_WORLD_SCALE;
      pheromoneIndex[offset / 4] = from * size + to;
      offset += 4;
    }
  }

  return { cities, coords, pheromoneIndex, edgeCount };
}

function buildRamp(from: string, to: string, steps: number): string[] {
  const start = color(from) as RGBColor | null;
  const end = color(to) as RGBColor | null;
  if (start === null || end === null) {
    return new Array<string>(steps).fill(to);
  }

  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  const ramp = new Array<string>(steps);
  for (let index = 0; index < steps; index += 1) {
    const t = steps === 1 ? 0 : index / (steps - 1);
    const r = start.r + (end.r - start.r) * t;
    const g = start.g + (end.g - start.g) * t;
    const b = start.b + (end.b - start.b) * t;
    ramp[index] = `#${channel(r)}${channel(g)}${channel(b)}`;
  }
  return ramp;
}

export function createPheromoneLayer(): Canvas2DLayer<AcoParams, AcoSnapshot> {
  let geometry: Geometry | null = null;
  let ramp: string[] = [];
  let rampFrom = '';
  let rampTo = '';

  // Reused per-frame bucket buffers. Sized once per city set.
  let sortedCoords = new Float64Array(0);
  let edgeBucket = new Uint8Array(0);
  const bucketCounts = new Int32Array(PHEROMONE_BUCKETS);
  const bucketOffsets = new Int32Array(PHEROMONE_BUCKETS);
  const writeOffsets = new Int32Array(PHEROMONE_BUCKETS);

  const style: StrokeStyle = { color: '', width: 1, alpha: 0.5, cap: 'butt' };

  return {
    id: 'pheromone',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;

      const snapshot = frame.snapshot;
      if (geometry === null || geometry.cities !== snapshot.cities) {
        geometry = buildGeometry(snapshot.cities);
        sortedCoords = new Float64Array(geometry.edgeCount * 4);
        edgeBucket = new Uint8Array(geometry.edgeCount);
      }
      const reveal = clamp01(frame.revealProgress);
      if (reveal <= 0 || geometry.edgeCount === 0) return;

      if (rampFrom !== frame.theme.stageMuted || rampTo !== frame.theme.cool) {
        rampFrom = frame.theme.stageMuted;
        rampTo = frame.theme.cool;
        ramp = buildRamp(rampFrom, rampTo, PHEROMONE_BUCKETS);
      }

      const pheromone = snapshot.pheromone;
      const counts = bucketCounts;
      counts.fill(0);

      // Pass 1: classify each edge into an intensity bucket.
      for (let edge = 0; edge < geometry.edgeCount; edge += 1) {
        const index = geometry.pheromoneIndex[edge];
        const value = index === undefined ? 0 : pheromone[index];
        const bucket =
          value === undefined
            ? 0
            : Math.min(
                PHEROMONE_BUCKETS - 1,
                Math.floor(pheromoneIntensity(value) * (PHEROMONE_BUCKETS - 1) + 0.5),
              );
        edgeBucket[edge] = bucket;
        counts[bucket] = (counts[bucket] ?? 0) + 1;
      }

      // Prefix offsets for a stable counting sort into `sortedCoords`.
      let offset = 0;
      for (let bucket = 0; bucket < PHEROMONE_BUCKETS; bucket += 1) {
        bucketOffsets[bucket] = offset;
        offset += counts[bucket] ?? 0;
      }

      writeOffsets.set(bucketOffsets);
      for (let edge = 0; edge < geometry.edgeCount; edge += 1) {
        const bucket = edgeBucket[edge] ?? 0;
        const target = writeOffsets[bucket] ?? 0;
        const source = edge * 4;
        const destination = target * 4;
        sortedCoords[destination] = geometry.coords[source] ?? 0;
        sortedCoords[destination + 1] = geometry.coords[source + 1] ?? 0;
        sortedCoords[destination + 2] = geometry.coords[source + 2] ?? 0;
        sortedCoords[destination + 3] = geometry.coords[source + 3] ?? 0;
        writeOffsets[bucket] = target + 1;
      }

      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);
      const revealAlpha = 0.25 + 0.75 * reveal;

      for (let bucket = 0; bucket < PHEROMONE_BUCKETS; bucket += 1) {
        const count = counts[bucket] ?? 0;
        if (count === 0) continue;
        const intensity = bucket / (PHEROMONE_BUCKETS - 1);
        style.color = ramp[bucket] ?? frame.theme.cool;
        style.width = pixelsToWorld(pheromoneWidthPx(intensity) * (1 + highlight * 0.35), zoom);
        style.alpha = Math.min(1, pheromoneAlpha(intensity) * revealAlpha * (1 + highlight * 0.3));
        drawSegments(frame.ctx, sortedCoords, count, style, bucketOffsets[bucket] ?? 0);
      }
    },
  };
}
