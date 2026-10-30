/**
 * Pure 2D camera projection.
 *
 * The camera model is defined in `render/types.ts`: `panX`/`panY` identify the
 * world point at the centre of the stage, `zoom` is CSS pixels per world unit,
 * and `rotation` is positive counter-clockwise in radians. World coordinates
 * are y-up (mathematical convention); canvas screen coordinates are y-down.
 *
 * These helpers are deliberately free of DOM and canvas APIs so they can be
 * unit-tested in Node and reused by the label projector, pointer interaction,
 * and the canvas transform without duplicating the sign conventions.
 */

import type { Camera2DState } from '../types';

/** A mutable 2D point. Callers may reuse one instance to avoid allocations. */
export interface MutablePoint {
  x: number;
  y: number;
}

/** A read-only 2D point. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Canvas transform in the same form as `CanvasRenderingContext2D.setTransform`.
 *
 * `a`/`b`/`c`/`d` map a world-space vector to device pixels; `e`/`f` map the
 * world origin. Values already include the device pixel ratio.
 */
export interface CameraMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/** Mutable matrix target for the draw loop. */
export interface MutableCameraMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Small helper so a missing optional rotation is always zero. */
export function cameraRotation(camera: Camera2DState): number {
  return camera.rotation ?? 0;
}

/**
 * Project a world point to stage-local CSS pixels.
 *
 * The result is written into `out` and returned, so a drawing loop can reuse a
 * single point object.
 */
export function projectInto(
  camera: Camera2DState,
  width: number,
  height: number,
  worldX: number,
  worldY: number,
  out: MutablePoint,
): MutablePoint {
  const zoom = camera.zoom;
  const rotation = cameraRotation(camera);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = (worldX - camera.panX) * zoom;
  const dy = (worldY - camera.panY) * zoom;

  out.x = width / 2 + dx * cos - dy * sin;
  // A positive rotation is counter-clockwise in world space; screen y grows
  // downwards, so the rotated y component is subtracted.
  out.y = height / 2 - (dx * sin + dy * cos);
  return out;
}

/** Project a world point, allocating a fresh result. Not for the draw loop. */
export function projectPoint(
  camera: Camera2DState,
  width: number,
  height: number,
  worldX: number,
  worldY: number,
): Point {
  return projectInto(camera, width, height, worldX, worldY, { x: 0, y: 0 });
}

/**
 * Convert a stage-local CSS pixel back to world space.
 *
 * The inverse must restore both pan and rotation, which is what makes pointer
 * interaction (dragging a city, orbiting) independent of the camera pose.
 */
export function unprojectInto(
  camera: Camera2DState,
  width: number,
  height: number,
  screenX: number,
  screenY: number,
  out: MutablePoint,
): MutablePoint {
  const rotation = cameraRotation(camera);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rx = screenX - width / 2;
  const ry = height / 2 - screenY;
  const dx = rx * cos + ry * sin;
  const dy = -rx * sin + ry * cos;

  out.x = camera.panX + dx / camera.zoom;
  out.y = camera.panY + dy / camera.zoom;
  return out;
}

/** Convert a stage-local CSS pixel to world space, allocating a result. */
export function unprojectPoint(
  camera: Camera2DState,
  width: number,
  height: number,
  screenX: number,
  screenY: number,
): Point {
  return unprojectInto(camera, width, height, screenX, screenY, { x: 0, y: 0 });
}

/**
 * Build the canvas transform that maps world coordinates to device pixels.
 *
 * Derivation, with `cx = width / 2`, `cy = height / 2`, `z = zoom`, and
 * `r = rotation`:
 *
 * ```text
 * screenX = cx + z·(dx·cos r − dy·sin r)
 * screenY = cy − z·(dx·sin r + dy·cos r)
 * ```
 *
 * Substituting `dx = x − panX` and `dy = y − panY` gives the affine matrix
 * below. Every term is then multiplied by `dpr`, because the canvas backing
 * store is measured in device pixels while layout is measured in CSS pixels.
 *
 * `dpr` must be positive and finite; callers get it from the capped
 * `computeCanvasSize` helper, never directly from `window.devicePixelRatio`.
 */
export function cameraMatrix(
  camera: Camera2DState,
  width: number,
  height: number,
  dpr: number,
): CameraMatrix {
  return cameraMatrixInto(camera, width, height, dpr, {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    f: 0,
  });
}

/** Write the camera matrix into a caller-owned object. Used by the draw loop. */
export function cameraMatrixInto(
  camera: Camera2DState,
  width: number,
  height: number,
  dpr: number,
  out: MutableCameraMatrix,
): MutableCameraMatrix {
  const zoom = camera.zoom;
  const rotation = cameraRotation(camera);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const a = zoom * cos;
  const b = -zoom * sin;
  const c = -zoom * sin;
  const d = -zoom * cos;
  const e = width / 2 - a * camera.panX - c * camera.panY;
  const f = height / 2 - b * camera.panX - d * camera.panY;

  out.a = a * dpr;
  out.b = b * dpr;
  out.c = c * dpr;
  out.d = d * dpr;
  out.e = e * dpr;
  out.f = f * dpr;
  return out;
}

/**
 * Apply a matrix to a world point. Exported so tests can prove the canvas
 * transform and `projectInto` agree, and so layers that draw in screen space
 * can transform a point without setting the canvas matrix.
 */
export function applyMatrixInto(
  matrix: CameraMatrix,
  x: number,
  y: number,
  out: MutablePoint,
): MutablePoint {
  out.x = matrix.a * x + matrix.c * y + matrix.e;
  out.y = matrix.b * x + matrix.d * y + matrix.f;
  return out;
}
