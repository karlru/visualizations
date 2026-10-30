/**
 * Shared helpers for the ACO Canvas 2D layers.
 *
 * Layer style widths are chosen in CSS pixels and divided by the camera zoom so
 * a hairline stays a hairline at every camera framing. Nothing here allocates
 * per frame; callers own their buffers and style objects.
 */

import type { SceneLayer } from '../../types';

/** True when the renderer would call this layer's draw callback. */
export function layerVisible(layer: SceneLayer): boolean {
  return layer.visible && layer.opacity > 0;
}

/** Convert a CSS-pixel width into world units for the current camera. */
export function pixelsToWorld(pixels: number, zoom: number): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return pixels / safeZoom;
}

/** Clamp a presentation value to `[0, 1]`. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
