/**
 * Camera framing presets for the ACO lab.
 *
 * Presets are computed from the live snapshot, never from hardcoded chapter
 * anchors: the overview and convergence buttons frame every current city, the
 * focus button frames a real city, and the best-tour button frames the current
 * best tour. That keeps custom maps and newly found tours meaningful.
 *
 * The module is pure math: it returns plain camera data and never touches the
 * renderer. `StoryController` applies a chosen camera as a presentation
 * override, which is cleared on chapter entry so the narrative owns the camera
 * again.
 */

import type { AcoSnapshot, City } from '../../engines/aco/types';
import type { StoryCameraPreset } from '../runtime';
import { acoWorldPoint } from './world';

/** Preferred zoom for a single-city focus. */
const FOCUS_ZOOM = 320;
/** Target world span fitted by the overview and best-tour frames. */
const FIT_PIXELS = 560;
/** Minimum and maximum generated zooms, in CSS pixels per world unit. */
const MIN_FIT_ZOOM = 56;
const MAX_FIT_ZOOM = 360;

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly centerX: number;
  readonly centerY: number;
}

function boundsOf(points: readonly { readonly x: number; readonly y: number }[]): Bounds {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function fitZoom(bounds: Bounds): number {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 0.25);
  const raw = FIT_PIXELS / (span * 1.15);
  if (!Number.isFinite(raw) || raw <= 0) return MIN_FIT_ZOOM;
  return Math.min(MAX_FIT_ZOOM, Math.max(MIN_FIT_ZOOM, raw));
}

function worldPoints(cities: readonly City[]): readonly { x: number; y: number }[] {
  return cities.map((city) => acoWorldPoint(city));
}

/** Frame all cities with a little breathing room. */
export function overviewCamera(snapshot: Pick<AcoSnapshot, 'cities'>): StoryCameraPreset['camera'] {
  const bounds = boundsOf(worldPoints(snapshot.cities));
  return {
    kind: '2d',
    panX: bounds.centerX,
    panY: bounds.centerY,
    zoom: fitZoom(bounds),
    rotation: 0,
  };
}

/** Frame the focal city at a readable zoom without requiring a pointer. */
export function focusCityCamera(
  snapshot: Pick<AcoSnapshot, 'cities' | 'cityCount'>,
): StoryCameraPreset['camera'] {
  const fallback = { kind: '2d' as const, panX: 0, panY: 0, zoom: FOCUS_ZOOM, rotation: 0 };
  if (snapshot.cityCount <= 0 || snapshot.cities.length === 0) return fallback;

  // City 17 is the narrative's focal city; small maps fall back to city 0.
  const index = Math.min(17, snapshot.cityCount - 1);
  const city = snapshot.cities[index];
  if (city === undefined) return fallback;
  const point = acoWorldPoint(city);
  return { kind: '2d', panX: point.x, panY: point.y, zoom: FOCUS_ZOOM, rotation: 0 };
}

/** Frame the current best tour, falling back to every city before iteration 1. */
export function bestTourCamera(
  snapshot: Pick<AcoSnapshot, 'cities' | 'bestTour'>,
): StoryCameraPreset['camera'] {
  const tour = snapshot.bestTour;
  const tourCities =
    tour === null || tour.length === 0
      ? snapshot.cities
      : tour
          .map((city) => snapshot.cities[city])
          .filter((city): city is City => city !== undefined);
  const bounds = boundsOf(worldPoints(tourCities.length > 0 ? tourCities : snapshot.cities));
  return {
    kind: '2d',
    panX: bounds.centerX,
    panY: bounds.centerY,
    zoom: fitZoom(bounds) * 1.15,
    rotation: 0,
  };
}

/** Pull back to the whole map for reading the convergence chart. */
export function convergenceCamera(
  snapshot: Pick<AcoSnapshot, 'cities'>,
): StoryCameraPreset['camera'] {
  const bounds = boundsOf(worldPoints(snapshot.cities));
  return {
    kind: '2d',
    panX: bounds.centerX,
    panY: bounds.centerY,
    zoom: fitZoom(bounds) * 0.9,
    rotation: 0,
  };
}

/** The four keyboard-operable framing presets, in display order. */
export function acoCameraPresets(
  snapshot: Pick<AcoSnapshot, 'cities' | 'cityCount' | 'bestTour'>,
): readonly StoryCameraPreset[] {
  return Object.freeze([
    Object.freeze({
      id: 'overview',
      label: 'Overview',
      camera: overviewCamera(snapshot),
    }),
    Object.freeze({
      id: 'focus-city',
      label: 'Focus city',
      camera: focusCityCamera(snapshot),
    }),
    Object.freeze({
      id: 'best-tour',
      label: 'Best tour',
      camera: bestTourCamera(snapshot),
    }),
    Object.freeze({
      id: 'convergence',
      label: 'Convergence',
      camera: convergenceCamera(snapshot),
    }),
  ]);
}
