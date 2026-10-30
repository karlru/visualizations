/**
 * Pure map-editing helpers for the ACO lab.
 *
 * The engine and the URL contract work in the normalized unit square, while the
 * canvas overlay works in ACO world space (`world.ts`). These helpers are the
 * only place that converts between the two, clamps pointer coordinates, and
 * enforces the UI's 2–150 city limits. The engine's distance clamp still handles
 * coincident cities, so dropping one city on another is allowed.
 *
 * The module is pure data and math: no DOM, Svelte, or renderer imports.
 */

import type { City } from '../../engines/aco/types';
import type { StoryMapPoint } from '../runtime';
import { ACO_WORLD_SCALE, acoWorldPoint } from './world';

/** UI map limits from `docs/stories.md` §2.5 and `docs/requirements.md` §2.6.1. */
export const ACO_MAP_MIN_CITIES = 2;
export const ACO_MAP_MAX_CITIES = 150;

/** One arrow-key nudge is 1% of the normalized unit square in world space. */
export const ACO_MAP_NUDGE_STEP = ACO_WORLD_SCALE / 100;

/** Clamp a coordinate into the closed unit interval. */
export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Convert one ACO world-space point (or a partly typed point) to a city. */
export function worldToCity(point: Pick<StoryMapPoint, 'x' | 'y'>): City {
  return Object.freeze({
    x: clampUnit(point.x / ACO_WORLD_SCALE + 0.5),
    y: clampUnit(point.y / ACO_WORLD_SCALE + 0.5),
  });
}

/** Project engine cities into the renderer's world space. */
export function citiesToWorld(cities: readonly City[]): readonly StoryMapPoint[] {
  return cities.map((city) => {
    const point = acoWorldPoint(city);
    return Object.freeze({ x: point.x, y: point.y });
  });
}

/** Convert overlay points back into clamped engine cities. */
export function worldToCities(points: readonly StoryMapPoint[]): readonly City[] {
  return points.map(worldToCity);
}

/** Clamp a world-space overlay point to the unit square. */
export function clampWorldPoint(point: StoryMapPoint): StoryMapPoint {
  const city = worldToCity(point);
  const world = acoWorldPoint(city);
  return Object.freeze({ x: world.x, y: world.y });
}

/** True when the edited map has a legal UI city count. */
export function isEditableCityCount(count: number): boolean {
  return Number.isInteger(count) && count >= ACO_MAP_MIN_CITIES && count <= ACO_MAP_MAX_CITIES;
}

/**
 * Deterministic placement for the "Add city" action.
 *
 * A new city lands on a small golden-angle spiral around the map centre, so
 * repeated additions never stack exactly on top of each other. It is clamped to
 * the unit square and is independent of the seeded RNG, which keeps the run's
 * random stream untouched until the next iteration.
 */
export function suggestCityPoint(cities: readonly City[]): StoryMapPoint {
  const count = cities.length;
  const index = Math.max(0, count);
  const angle = index * 2.399963229728653;
  const radius = 0.12 + 0.24 * ((index % 9) / 8);
  const normalized = {
    x: clampUnit(0.5 + Math.cos(angle) * radius),
    y: clampUnit(0.5 + Math.sin(angle) * radius),
  };
  return Object.freeze(acoWorldPoint(normalized));
}

/**
 * Normalize a point list for an edit.
 *
 * Coordinates are clamped to the unit square; coincident cities are preserved
 * because the engine's distance epsilon is the documented way to handle them.
 * Count violations are returned rather than thrown so the caller can disable an
 * action without parsing an exception.
 */
export type MapEditValidation =
  | { readonly ok: true; readonly points: readonly StoryMapPoint[] }
  | {
      readonly ok: false;
      readonly code: 'too-few-cities' | 'too-many-cities';
      readonly message: string;
    };

export function validateMapEdit(points: readonly StoryMapPoint[]): MapEditValidation {
  if (points.length < ACO_MAP_MIN_CITIES) {
    return {
      ok: false,
      code: 'too-few-cities',
      message: `A colony needs at least ${ACO_MAP_MIN_CITIES} cities.`,
    };
  }
  if (points.length > ACO_MAP_MAX_CITIES) {
    return {
      ok: false,
      code: 'too-many-cities',
      message: `A colony can have at most ${ACO_MAP_MAX_CITIES} cities.`,
    };
  }
  return { ok: true, points: points.map(clampWorldPoint) };
}
