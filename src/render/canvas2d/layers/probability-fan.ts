/**
 * Probability-fan layer for the focal ant's next-city choice.
 *
 * The data comes from `stories/aco/probability-fan.ts`, which calls the engine's
 * exported `transitionProbabilities`. The same object feeds the DOM ranked
 * alternative, so the arcs and the text cannot describe different probabilities.
 *
 * Visual encoding:
 *
 * - one arc per named candidate, aimed from the focal city toward that city;
 * - arc span and width grow with probability;
 * - a faint guide line keeps the destination legible when the arc is short;
 * - the explicit "other (Σ)" bucket is a dashed ring segment, since it has no
 *   single destination.
 *
 * The fan is rebuilt only when the iteration, pheromone buffer, city set, α/β,
 * focal city, or top N changes. Paused frames reuse the cached object.
 */

import type { AcoParams, AcoSnapshot, City } from '../../../engines/aco/types';
import {
  buildProbabilityFan,
  DEFAULT_FAN_CANDIDATES,
  type ProbabilityFan,
} from '../../../stories/aco/probability-fan';
import { ACO_FOCAL_CITY_INDEX, ACO_WORLD_SCALE } from '../../../stories/aco/world';
import type { Canvas2DLayer, Canvas2DLayerFrame } from '../Canvas2DRenderer';
import { drawArc, drawLine, FULL_CIRCLE, type StrokeStyle } from '../primitives';
import { clamp01, layerVisible, pixelsToWorld } from './common';

export interface ProbabilityFanLayerOptions {
  /** Focal city index; defaults to the story's focal city. */
  readonly focalCity?: number;
  /** Named candidates before the "other" bucket; defaults to 8. */
  readonly topN?: number;
}

export function createProbabilityFanLayer(
  options: ProbabilityFanLayerOptions = {},
): Canvas2DLayer<AcoParams, AcoSnapshot> {
  const preferredFocalCity = options.focalCity ?? ACO_FOCAL_CITY_INDEX;
  const topN = options.topN ?? DEFAULT_FAN_CANDIDATES;

  let fan: ProbabilityFan | null = null;
  let cacheCities: readonly City[] | null = null;
  let cachePheromone: Float64Array | null = null;
  let cacheIteration = -1;
  let cacheAlpha = Number.NaN;
  let cacheBeta = Number.NaN;

  const guideStyle: StrokeStyle = { color: '', width: 0.8, alpha: 0.2, cap: 'butt' };
  const arcStyle: StrokeStyle = { color: '', width: 2, alpha: 0.6, cap: 'round' };
  const ringStyle: StrokeStyle = { color: '', width: 1.4, alpha: 0.75, cap: 'butt' };
  const otherDash: number[] = [4, 3];
  const otherStyle: StrokeStyle = {
    color: '',
    width: 2,
    alpha: 0.5,
    dash: otherDash,
    cap: 'butt',
  };

  return {
    id: 'probability-fan',
    draw(frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>): void {
      if (!layerVisible(frame.layer)) return;

      const snapshot = frame.snapshot;
      const params = snapshot.params;
      if (snapshot.cityCount < 2 || snapshot.cities.length < 2) return;
      const focalCity = Math.min(preferredFocalCity, snapshot.cityCount - 1);
      const stale =
        fan === null ||
        cacheCities !== snapshot.cities ||
        cachePheromone !== snapshot.pheromone ||
        cacheIteration !== snapshot.iteration ||
        cacheAlpha !== params.alpha ||
        cacheBeta !== params.beta;

      if (stale) {
        fan = buildProbabilityFan(
          snapshot,
          snapshot.pheromone,
          { alpha: params.alpha, beta: params.beta },
          { focalCity, topN },
        );
        cacheCities = snapshot.cities;
        cachePheromone = snapshot.pheromone;
        cacheIteration = snapshot.iteration;
        cacheAlpha = params.alpha;
        cacheBeta = params.beta;
      }
      if (fan === null) return;

      const reveal = clamp01(frame.revealProgress);
      if (reveal <= 0) return;

      const city = snapshot.cities[fan.currentCity];
      if (city === undefined) return;
      const focalX = (city.x - 0.5) * ACO_WORLD_SCALE;
      const focalY = (city.y - 0.5) * ACO_WORLD_SCALE;

      const zoom = frame.camera.zoom;
      const highlight = clamp01(frame.highlight);
      const revealAlpha = 0.3 + 0.7 * reveal;

      ringStyle.color = frame.theme.stageMuted;
      ringStyle.width = pixelsToWorld(1.4 + highlight * 0.8, zoom);
      ringStyle.alpha = 0.65 * revealAlpha;
      drawArc(frame.ctx, focalX, focalY, pixelsToWorld(9, zoom), 0, FULL_CIRCLE, ringStyle);

      guideStyle.color = frame.theme.stageMuted;
      guideStyle.width = pixelsToWorld(0.8 + highlight * 0.4, zoom);
      arcStyle.color = frame.theme.focus;

      for (const entry of fan.entries) {
        const dx = entry.x - focalX;
        const dy = entry.y - focalY;
        const angle = Math.atan2(dy, dx);
        const probability = clamp01(entry.probability);
        const span = 0.07 + probability * Math.PI * 1.4;
        const distance = Math.hypot(dx, dy);
        const radius = Math.min(0.45 + probability * 3.2, Math.max(0.2, distance * 0.6));

        guideStyle.alpha = (0.1 + probability * 0.6) * revealAlpha;
        drawLine(frame.ctx, focalX, focalY, entry.x, entry.y, guideStyle);

        arcStyle.width = pixelsToWorld(1.5 + probability * 22 * (1 + highlight * 0.3), zoom);
        arcStyle.alpha = Math.min(1, (0.28 + probability * 2.4) * revealAlpha);
        drawArc(frame.ctx, focalX, focalY, radius, angle - span, angle + span, arcStyle);
      }

      if (fan.other.count > 0 && fan.other.probability > 0) {
        const span = Math.min(Math.PI * 1.6, fan.other.probability * Math.PI * 1.6);
        otherDash[0] = pixelsToWorld(4, zoom);
        otherDash[1] = pixelsToWorld(3, zoom);
        otherStyle.color = frame.theme.stageMuted;
        otherStyle.width = pixelsToWorld(2 + highlight * 0.8, zoom);
        otherStyle.alpha = 0.55 * revealAlpha;
        drawArc(
          frame.ctx,
          focalX,
          focalY,
          pixelsToWorld(9, zoom) + pixelsToWorld(5, zoom),
          -Math.PI / 2 - span / 2,
          -Math.PI / 2 + span / 2,
          otherStyle,
        );
      }
    },
  };
}
