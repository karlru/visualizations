/**
 * Ant Colony Optimization story module.
 *
 * Binds the ACO config to the real `AcoEngine` (through the config factory), the
 * complete Canvas 2D layer set, and the colony metric/structural describers.
 * The StoryController sees only `StoryModuleView` and `StoryRuntime`.
 */

import type { AcoEngine } from '../../engines/aco/engine';
import type { AcoMetrics, AcoParams, AcoSnapshot } from '../../engines/aco/types';
import { Canvas2DRenderer } from '../../render/canvas2d/Canvas2DRenderer';
import { createAcoLayers } from '../../render/canvas2d/layers';
import {
  createStoryModule,
  type StoryAuxiliaryView,
  type StoryMetric,
  type StoryModuleHooks,
} from '../runtime';
import { acoCameraPresets } from './camera';
import { acoStoryConfig } from './config';
import {
  ACO_MAP_MAX_CITIES,
  ACO_MAP_MIN_CITIES,
  ACO_MAP_NUDGE_STEP,
  citiesToWorld,
  suggestCityPoint,
  validateMapEdit,
  worldToCities,
} from './map';
import { buildProbabilityFan, DEFAULT_FAN_CANDIDATES } from './probability-fan';
import { ACO_FOCAL_CITY_INDEX } from './world';

function formatLength(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(3);
}

/** Compact, readable route description for the lab's text summary. */
function describeTour(tour: readonly number[] | null): string {
  if (tour === null || tour.length === 0) {
    return 'No best tour yet; one appears after the first completed iteration.';
  }
  if (tour.length <= 10) {
    return `Best tour: ${tour.join(' → ')} → back to ${tour[0]}.`;
  }
  const head = tour.slice(0, 6).join(' → ');
  const tail = tour.slice(-2).join(' → ');
  return `Best tour: ${head} → … → ${tail} → back to ${tour[0]}.`;
}

/**
 * One sentence for the lab. It uses the same formatters as the metric rows, so
 * the text summary and the visible metrics cannot disagree.
 */
function describeSummary(metrics: Readonly<AcoMetrics>, tour: readonly number[] | null): string {
  if (metrics.bestLength === null) {
    return `No completed iteration yet. ${metrics.antCount} ants are ready on ${metrics.cityCount} cities; the best and mean lengths appear after the first iteration.`;
  }
  const iterations = metrics.iteration === 1 ? 'iteration' : 'iterations';
  return `Best tour ${formatLength(metrics.bestLength)} after ${metrics.iteration} ${iterations}; mean ${formatLength(metrics.meanLength)}; diversity ${metrics.entropy.toFixed(3)}; ${metrics.cityCount} cities; ${metrics.antCount} ants. ${describeTour(tour)}`;
}

export const acoStoryHooks: StoryModuleHooks<AcoParams, AcoSnapshot, AcoMetrics> = {
  lab: 'aco',

  createRenderer: () =>
    new Canvas2DRenderer<AcoParams, AcoSnapshot>({
      layers: createAcoLayers({
        focalCity: ACO_FOCAL_CITY_INDEX,
        topN: DEFAULT_FAN_CANDIDATES,
      }),
      dprCap: 2,
    }),

  describeMetrics: ({ metrics }): readonly StoryMetric[] => [
    { id: 'iteration', label: 'Iteration', value: String(metrics.iteration) },
    { id: 'best-length', label: 'Best length', value: formatLength(metrics.bestLength) },
    { id: 'mean-length', label: 'Mean length', value: formatLength(metrics.meanLength) },
    { id: 'entropy', label: 'Diversity', value: metrics.entropy.toFixed(3) },
    { id: 'ants', label: 'Ants', value: String(metrics.antCount) },
    { id: 'cities', label: 'Cities', value: String(metrics.cityCount) },
  ],

  describeStructural: (params) => ({
    cityCount: params.cityCount,
    antCount: params.antCount,
    alpha: params.alpha,
    beta: params.beta,
    rho: params.rho,
  }),

  auxiliary: ({ metrics, snapshot }): StoryAuxiliaryView => {
    const cityCount = snapshot.cityCount;
    const focalCity = Math.min(ACO_FOCAL_CITY_INDEX, Math.max(0, cityCount - 1));
    // A one-city instance has no next city to rank; the UI never creates one,
    // but the engine supports it for edge-case tests.
    const fan =
      cityCount > 1
        ? buildProbabilityFan(
            snapshot,
            snapshot.pheromone,
            { alpha: snapshot.params.alpha, beta: snapshot.params.beta },
            { focalCity, topN: DEFAULT_FAN_CANDIDATES },
          )
        : null;

    return {
      history: metrics.history,
      fan,
      tour: snapshot.bestTour === null ? null : [...snapshot.bestTour],
      summary: describeSummary(metrics, snapshot.bestTour),
      cameraPresets: acoCameraPresets(snapshot),
      map: {
        points: citiesToWorld(snapshot.cities),
        custom: snapshot.explicitCities,
        canAdd: cityCount < ACO_MAP_MAX_CITIES,
        canRemove: cityCount > ACO_MAP_MIN_CITIES,
        nudgeStep: ACO_MAP_NUDGE_STEP,
      },
      health: {
        droppedIterations: metrics.droppedIterations,
        degraded: metrics.degraded,
      },
    };
  },

  map: {
    minPoints: ACO_MAP_MIN_CITIES,
    maxPoints: ACO_MAP_MAX_CITIES,
    nudgeStep: ACO_MAP_NUDGE_STEP,
    read: (snapshot) => citiesToWorld(snapshot.cities),
    suggest: (snapshot) => suggestCityPoint(snapshot.cities),
    write: (engine, points) => {
      const validation = validateMapEdit(points);
      if (!validation.ok) throw new RangeError(validation.message);
      const aco = engine as AcoEngine;
      aco.setCities(worldToCities(validation.points));
      return aco.snapshot().params;
    },
    reset: (engine) => {
      const aco = engine as AcoEngine;
      aco.resetMap();
      return aco.snapshot().params;
    },
    isCustom: (snapshot) => snapshot.explicitCities,
  },
};

export const acoStoryModule = createStoryModule(acoStoryConfig, acoStoryHooks);
