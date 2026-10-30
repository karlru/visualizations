/**
 * World-space convention for the Ant Colony Optimization stage.
 *
 * The engine works in a normalized unit square (`City.x`/`City.y` in `[0, 1]`).
 * A renderer needs a camera-friendly world space, so this module fixes the map
 * once for the whole story: the unit square is scaled by
 * {@link ACO_WORLD_SCALE} and centred on the origin. A normalized city
 * `(0.5, 0.5)` is world `(0, 0)`; the default 30-city map spans roughly
 * `[-3, 3] × [-3, 3]`.
 *
 * Scene cameras and `world2d` label anchors use this space directly, so a
 * Canvas 2D renderer only needs to apply the camera transform from
 * `render/types.ts` (`zoom` CSS px per world unit). No per-city pixel layout is
 * stored in story data, and no renderer-specific field is introduced.
 *
 * The focal city, the best-tour centroid, and the map constants below are
 * frozen values from the **default run** (`seed 42`, 30 cities). Unit tests
 * regenerate the layout with the pure TSP model and assert that these anchors
 * still land on a real city and inside the real best-tour cluster. If the city
 * generator ever changes, the test fails instead of silently framing empty
 * space.
 *
 * This module is pure data and helper math: it imports only engine types.
 */

import type { City } from '../../engines/aco/types';

/** World units across the normalized unit square. */
export const ACO_WORLD_SCALE = 6;

/** Project a normalized engine city into ACO world space. */
export function acoWorldPoint(city: Pick<City, 'x' | 'y'>): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: (city.x - 0.5) * ACO_WORLD_SCALE,
    y: (city.y - 0.5) * ACO_WORLD_SCALE,
  };
}

/**
 * Index of the city the "One ant's choice" camera frames.
 *
 * City 17 sits near the middle of the default layout, so a zoomed shot still
 * shows several allowed destinations around it.
 */
export const ACO_FOCAL_CITY_INDEX = 17;

/** Normalized coordinates of {@link ACO_FOCAL_CITY_INDEX} for seed 42. */
export const ACO_FOCAL_CITY: City = Object.freeze({
  x: 0.3194617456756532,
  y: 0.44989572861231863,
});

/** Focal city in world space; the focal-camera `panX`/`panY`. */
export const ACO_FOCAL_WORLD = Object.freeze(acoWorldPoint(ACO_FOCAL_CITY));

/**
 * Normalized centroid of the best tour after 40 Ant System iterations of the
 * default run. Used to frame the deposit and evaporation chapters, where the
 * camera follows the reinforced path rather than the whole map.
 */
export const ACO_BEST_TOUR_CENTROID: City = Object.freeze({
  x: 0.4730729055978979,
  y: 0.4510789548046887,
});

/** Best-tour centroid in world space. */
export const ACO_BEST_TOUR_WORLD = Object.freeze(acoWorldPoint(ACO_BEST_TOUR_CENTROID));

/**
 * Default-run best-tour length after 40 iterations, in normalized problem
 * units. Kept beside the centroid so the camera anchors and the story's
 * canonical reference figure are versioned together.
 */
export const ACO_BEST_TOUR_LENGTH = 4.907463921770822;

/** Default-run mean tour length after 40 iterations. */
export const ACO_MEAN_TOUR_LENGTH = 6.3764047115459075;
