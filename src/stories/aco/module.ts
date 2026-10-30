/**
 * Ant Colony Optimization story module.
 *
 * Binds the ACO config to the real `AcoEngine` (through the config factory), the
 * complete Canvas 2D layer set, and the colony metric/structural describers.
 * The StoryController sees only `StoryModuleView` and `StoryRuntime`.
 */

import type { AcoMetrics, AcoParams, AcoSnapshot } from '../../engines/aco/types';
import { Canvas2DRenderer } from '../../render/canvas2d/Canvas2DRenderer';
import { createAcoLayers } from '../../render/canvas2d/layers';
import { createStoryModule, type StoryMetric, type StoryModuleHooks } from '../runtime';
import { acoStoryConfig } from './config';
import { DEFAULT_FAN_CANDIDATES } from './probability-fan';
import { ACO_FOCAL_CITY_INDEX } from './world';

function formatLength(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(3);
}

export const acoStoryHooks: StoryModuleHooks<AcoParams, AcoSnapshot, AcoMetrics> = {
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
};

export const acoStoryModule = createStoryModule(acoStoryConfig, acoStoryHooks);
