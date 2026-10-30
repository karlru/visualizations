/**
 * Shared layer vocabulary for the development stories.
 *
 * The Canvas 2D fixture renderer registers exactly these ids. A scene that
 * names an unknown layer simply has no visible effect, so keeping the list in
 * one module makes a second story config hard to mis-author.
 */

import type { SceneLayer } from '../../render/types';

export const DEV_LAYER_ORDER = ['backdrop', 'graph', 'pheromone', 'ants', 'best-tour'] as const;

export type DevLayerId = (typeof DEV_LAYER_ORDER)[number];

export function devLayers(visible: Partial<Record<DevLayerId, number>>): readonly SceneLayer[] {
  return DEV_LAYER_ORDER.map((id) => {
    const opacity = visible[id];
    return {
      id,
      visible: opacity !== undefined && opacity > 0,
      opacity: opacity ?? 0,
    };
  });
}
