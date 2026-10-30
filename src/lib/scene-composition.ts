/**
 * Deterministic scene composition for the story controller.
 *
 * A chapter names a base scene and may narrow it with presentation overrides.
 * Scroll progress then moves the presentation from a pulled-back entry pose to
 * the settled scene. This module is pure: it never reads the DOM, time, or
 * randomness, and it never touches engine parameters. The same chapter and
 * progress always produce the same `SceneState`, which is what lets reverse
 * scrolling, deep links, and tests converge on the same state.
 *
 * Scroll owns presentation only (`docs/technology.md` §4.4). Simulation time
 * remains in the fixed-step clock and engine.
 */

import type { CameraState, HighlightTarget, SceneLayer, SceneState } from '../render/types';
import type { SceneDefinition } from '../stories/registry';
import type { ChapterSceneOverrides } from './chapter-metadata';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

/** Calm ease-out used for entry progress. Monotonic and deterministic. */
export function easeOutCubic(progress: number): number {
  const t = clamp01(progress);
  const inverse = 1 - t;
  return 1 - inverse * inverse * inverse;
}

function composeCamera(camera: CameraState, amount: number): CameraState {
  if (camera.kind === '2d') {
    const rotation = camera.rotation ?? 0;
    // The entry pose looks slightly further out and asks the reader to lean in.
    return {
      kind: '2d',
      panX: lerp(camera.panX + 0.35, camera.panX, amount),
      panY: lerp(camera.panY - 0.2, camera.panY, amount),
      zoom: lerp(camera.zoom * 0.84, camera.zoom, amount),
      rotation: lerp(rotation - 0.05, rotation, amount),
    };
  }

  // Pull the camera back along its view vector and widen the field of view on
  // entry. Both endpoints are absolute poses, so a camera director never needs
  // renderer-specific orbit state.
  const distanceX = camera.position.x - camera.target.x;
  const distanceY = camera.position.y - camera.target.y;
  const distanceZ = camera.position.z - camera.target.z;

  return {
    kind: '3d',
    position: {
      x: lerp(camera.target.x + distanceX * 1.08, camera.position.x, amount),
      y: lerp(camera.target.y + distanceY * 1.08, camera.position.y, amount),
      z: lerp(camera.target.z + distanceZ * 1.08, camera.position.z, amount),
    },
    target: { ...camera.target },
    up: { ...camera.up },
    fov: lerp(camera.fov + 4, camera.fov, amount),
  };
}

function composeLayers(layers: readonly SceneLayer[], amount: number): readonly SceneLayer[] {
  return layers.map((layer) => ({
    id: layer.id,
    visible: layer.visible,
    // Keep the declared opacity at the settled end; fade in gently on entry.
    opacity: clamp01(layer.opacity) * (0.55 + 0.45 * amount),
  }));
}

function composeHighlights(
  highlights: readonly HighlightTarget[],
  amount: number,
): readonly HighlightTarget[] {
  return highlights.map((highlight) => ({
    ...highlight,
    intensity: clamp01(highlight.intensity ?? 1) * (0.35 + 0.65 * amount),
  }));
}

/**
 * Compose the scene for one chapter at a given progress.
 *
 * `progress` is clamped to [0, 1]. Presentation overrides win over the base
 * scene; their camera is the settled pose. No engine parameter is read or
 * written.
 */
export function composeSceneState<P extends object>(
  scene: SceneDefinition<P>,
  overrides: ChapterSceneOverrides | undefined,
  progress: number,
): SceneState {
  const amount = easeOutCubic(progress);
  const targetCamera = overrides?.camera ?? scene.camera;
  const targetReveal = clamp01(overrides?.revealProgress ?? scene.revealProgress ?? 1);

  return {
    camera: composeCamera(targetCamera, amount),
    layers: composeLayers(overrides?.layers ?? scene.layers, amount),
    highlights: composeHighlights(overrides?.highlights ?? scene.highlights ?? [], amount),
    revealProgress: targetReveal * (0.35 + 0.65 * amount),
    labels: overrides?.labels ?? scene.labels ?? [],
  };
}
