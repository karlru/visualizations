/**
 * The complete ACO Canvas 2D layer set, in back-to-front draw order.
 *
 * Story scenes name these ids through `ACO_CANVAS_LAYER_IDS`; the renderer draws
 * only the layers the active scene marks visible. The convergence chart is not
 * here: it is an SVG/DOM component (`components/story/ConvergenceChart.svelte`).
 */

import type { AcoParams, AcoSnapshot } from '../../../engines/aco/types';
import type { Canvas2DLayer } from '../Canvas2DRenderer';
import { createAntsLayer } from './ants';
import { createBestTourLayer } from './best-tour';
import { createGraphLayer } from './graph';
import { createPheromoneLayer } from './pheromone';
import { createProbabilityFanLayer, type ProbabilityFanLayerOptions } from './probability-fan';

export type AcoLayerOptions = ProbabilityFanLayerOptions;

/**
 * Build one instance of every ACO layer.
 *
 * Layer factories own their reusable buffers and style objects. Create this set
 * once per renderer, not per frame.
 */
export function createAcoLayers(
  options: AcoLayerOptions = {},
): readonly Canvas2DLayer<AcoParams, AcoSnapshot>[] {
  return [
    createGraphLayer(),
    createPheromoneLayer(),
    createAntsLayer(),
    createBestTourLayer(),
    createProbabilityFanLayer(options),
  ];
}
