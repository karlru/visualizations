/**
 * Allocation-conscious Canvas 2D primitives.
 *
 * Layers use these instead of open-coding paths so line widths, alpha, dash
 * patterns, and gradient fills stay consistent. Every function:
 *
 * - accepts positional geometry and a caller-owned style object;
 * - never creates arrays, point objects, or style objects per frame;
 * - saves and restores the context, so a layer cannot leak `globalAlpha` or a
 *   transform into the next layer;
 * - draws no text. Labels are DOM elements owned by the renderer.
 *
 * `Canvas2DPrimitiveContext` is the narrow surface the primitives touch. A real
 * `CanvasRenderingContext2D` satisfies it structurally, and unit tests can use a
 * call-logging stub without a browser.
 */

import type { Point } from './camera';

/** The canvas methods used by the primitives. */
export interface Canvas2DPrimitiveContext {
  globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  setLineDash(segments: readonly number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
}

/** A colour stop for a cached gradient. Create the array once, outside draw. */
export interface GradientStop {
  readonly offset: number;
  readonly color: string;
}

export interface StrokeStyle {
  /** Mutable so a layer can cache one style object and retheme it per frame. */
  color: string | CanvasGradient;
  /** Width in world units (the renderer's camera transform scales it to CSS px). */
  width: number;
  alpha?: number;
  dash?: readonly number[];
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
}

export interface FillStyle {
  fill: string | CanvasGradient;
  alpha?: number;
  stroke?: string | CanvasGradient;
  strokeWidth?: number;
}

export interface PointStyle {
  radius: number;
  fill: string | CanvasGradient;
  alpha?: number;
  stroke?: string | CanvasGradient;
  strokeWidth?: number;
  /** `circle` is the default; `square` encodes meaning without relying on colour. */
  shape?: 'circle' | 'square';
}

const TAU = Math.PI * 2;

function applyStroke(ctx: Canvas2DPrimitiveContext, style: StrokeStyle): void {
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = style.cap ?? 'round';
  ctx.lineJoin = style.join ?? 'round';
  ctx.setLineDash(style.dash ?? NO_DASH);
}

function applyAlpha(ctx: Canvas2DPrimitiveContext, alpha: number | undefined): void {
  // Compose with the layer alpha rather than replacing it: each primitive
  // saves the context first, so `globalAlpha` here still carries the layer's
  // opacity from Canvas2DRenderer.
  const layerAlpha = ctx.globalAlpha;
  ctx.globalAlpha = layerAlpha * (alpha === undefined ? 1 : Math.max(0, Math.min(1, alpha)));
}

/** Shared empty dash array; avoids allocating `[]` on every primitive call. */
const NO_DASH: readonly number[] = [];

/** Draw a single straight line. Width is in world units. */
export function drawLine(
  ctx: Canvas2DPrimitiveContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: StrokeStyle,
): void {
  ctx.save();
  applyAlpha(ctx, style.alpha);
  applyStroke(ctx, style);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw many independent line segments with one path and one stroke.
 *
 * `segments` is a flat `[x1, y1, x2, y2, …]` buffer and only the first
 * `segmentCount` entries are read. This is the all-pairs candidate-edge path:
 * one `beginPath`/`stroke` pair instead of one save/restore per edge keeps a
 * 150-city graph within budget, and it allocates nothing.
 */
export function drawSegments(
  ctx: Canvas2DPrimitiveContext,
  segments: Float64Array,
  segmentCount: number,
  style: StrokeStyle,
  startSegment = 0,
): void {
  if (segmentCount <= 0) return;
  const total = Math.floor(segments.length / 4);
  const start = Math.max(0, Math.floor(startSegment));
  const limit = Math.min(segmentCount, total - start);
  if (limit <= 0) return;

  ctx.save();
  applyAlpha(ctx, style.alpha);
  applyStroke(ctx, style);
  ctx.beginPath();
  for (let index = 0; index < limit; index += 1) {
    const offset = (start + index) * 4;
    const x1 = segments[offset];
    const y1 = segments[offset + 1];
    const x2 = segments[offset + 2];
    const y2 = segments[offset + 3];
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      continue;
    }
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw connected segments through `points`. With `closed`, the last point joins
 * the first. `points` is read in place; no intermediate array is built.
 * `count` limits how many leading points are used, so a reveal can show a
 * prefix without allocating a slice.
 */
export function drawPolyline(
  ctx: Canvas2DPrimitiveContext,
  points: readonly Point[],
  style: StrokeStyle,
  closed = false,
  count = points.length,
): void {
  const limit = Math.min(points.length, Math.max(0, Math.floor(count)));
  if (limit < 2) return;

  ctx.save();
  applyAlpha(ctx, style.alpha);
  applyStroke(ctx, style);
  ctx.beginPath();
  const first = points[0];
  if (first === undefined) {
    ctx.restore();
    return;
  }
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < limit; index += 1) {
    const point = points[index];
    if (point !== undefined) ctx.lineTo(point.x, point.y);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Draw a closed outline through the points. */
export function drawPolygon(
  ctx: Canvas2DPrimitiveContext,
  points: readonly Point[],
  style: FillStyle,
): void {
  if (points.length < 3) return;

  ctx.save();
  applyAlpha(ctx, style.alpha);
  ctx.fillStyle = style.fill;
  ctx.beginPath();
  const first = points[0];
  if (first === undefined) {
    ctx.restore();
    return;
  }
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined) ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fill();
  if (style.stroke !== undefined) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth ?? 1;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw one arc centred at `x`/`y`. Width is in world units. A full circle is
 * `startAngle = 0, endAngle = TAU`.
 */
export function drawArc(
  ctx: Canvas2DPrimitiveContext,
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  style: StrokeStyle,
  counterclockwise = false,
): void {
  if (!(radius > 0)) return;

  ctx.save();
  applyAlpha(ctx, style.alpha);
  applyStroke(ctx, style);
  ctx.beginPath();
  ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise);
  ctx.stroke();
  ctx.restore();
}

/** Fill a circle (or a rounded dot) without creating a gradient. */
export function fillCircle(
  ctx: Canvas2DPrimitiveContext,
  x: number,
  y: number,
  radius: number,
  style: FillStyle,
): void {
  if (!(radius > 0)) return;

  ctx.save();
  applyAlpha(ctx, style.alpha);
  ctx.fillStyle = style.fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  if (style.stroke !== undefined) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth ?? 1;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw many points with one path and one fill. This is the primitive the ACO
 * ant and city layers use: per-point `fill()` calls are the expensive part, not
 * per-point `arc()` calls.
 *
 * `count` limits how many leading points are drawn, which lets a reveal
 * animation show a prefix without slicing (and allocating) a new array.
 */
export function drawPoints(
  ctx: Canvas2DPrimitiveContext,
  points: readonly Point[],
  style: PointStyle,
  count = points.length,
): void {
  const limit = Math.min(points.length, Math.max(0, Math.floor(count)));
  if (limit === 0 || !(style.radius > 0)) return;

  ctx.save();
  applyAlpha(ctx, style.alpha);
  ctx.fillStyle = style.fill;

  if (style.shape === 'square') {
    const size = style.radius * 2;
    for (let index = 0; index < limit; index += 1) {
      const point = points[index];
      if (point === undefined) continue;
      ctx.fillRect(point.x - style.radius, point.y - style.radius, size, size);
    }
  } else {
    ctx.beginPath();
    for (let index = 0; index < limit; index += 1) {
      const point = points[index];
      if (point === undefined) continue;
      ctx.moveTo(point.x + style.radius, point.y);
      ctx.arc(point.x, point.y, style.radius, 0, TAU);
    }
    ctx.fill();
  }

  if (style.stroke !== undefined) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth ?? 1;
    if (style.shape === 'square') {
      const size = style.radius * 2;
      for (let index = 0; index < limit; index += 1) {
        const point = points[index];
        if (point === undefined) continue;
        ctx.strokeRect(point.x - style.radius, point.y - style.radius, size, size);
      }
    } else {
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Fill an axis-aligned rectangle with a colour or an already-built gradient. */
export function fillRect(
  ctx: Canvas2DPrimitiveContext,
  x: number,
  y: number,
  width: number,
  height: number,
  style: FillStyle,
): void {
  if (!(width > 0) || !(height > 0)) return;

  ctx.save();
  applyAlpha(ctx, style.alpha);
  ctx.fillStyle = style.fill;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

/**
 * Build a linear gradient. Callers cache the result and rebuild it only when
 * the stage size or scene changes; it is not a per-frame helper.
 */
export function createLinearGradient(
  ctx: Canvas2DPrimitiveContext,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: readonly GradientStop[],
): CanvasGradient {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const stop of stops) {
    gradient.addColorStop(stop.offset, stop.color);
  }
  return gradient;
}

/**
 * Fill a circle with a cached gradient. Useful for the soft glow behind a
 * scene focal point without drawing into an offscreen buffer.
 */
export function fillCircleGradient(
  ctx: Canvas2DPrimitiveContext,
  x: number,
  y: number,
  radius: number,
  gradient: CanvasGradient,
  alpha = 1,
): void {
  if (!(radius > 0)) return;

  ctx.save();
  applyAlpha(ctx, alpha);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** The full turn in radians, exported so layers do not redefine it. */
export const FULL_CIRCLE = TAU;
