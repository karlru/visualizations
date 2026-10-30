/**
 * Canvas backing-store sizing.
 *
 * Kept pure so the DPR cap and the rounding rule are unit-tested without a
 * browser. `Canvas2DRenderer` calls this on every `ResizeObserver` entry and
 * then writes the result to `canvas.width`/`canvas.height` and its CSS size.
 *
 * Rules:
 * - CSS pixels remain the layout truth; they are never scaled by DPR.
 * - The backing store is `round(CSS size × capped DPR)`, so a 1 CSS px border
 *   does not accumulate fractional device pixels.
 * - The DPR is at least 1 (a zero device ratio is a browser bug, not a reason
 *   to produce an invisible canvas) and at most the requested cap.
 * - A zero or non-finite CSS size produces a zero backing store instead of
 *   throwing. Observers can legitimately report 0×0 while a stage is hidden.
 */

export interface CanvasSize {
  /** CSS width in pixels, sanitized to a finite non-negative number. */
  readonly cssWidth: number;
  /** CSS height in pixels, sanitized to a finite non-negative number. */
  readonly cssHeight: number;
  /** Capped device pixel ratio used for the backing store. */
  readonly dpr: number;
  /** Backing-store width in device pixels, or 0 when CSS width is 0. */
  readonly pixelWidth: number;
  /** Backing-store height in device pixels, or 0 when CSS height is 0. */
  readonly pixelHeight: number;
  /** True when the device ratio exceeded the cap. */
  readonly capped: boolean;
}

const DEFAULT_DPR_CAP = 2;

function sanitizeLength(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeDpr(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function sanitizeCap(value: number): number {
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_DPR_CAP;
}

/**
 * Compute the backing-store size for a CSS box.
 *
 * @param cssWidth Layout width in CSS pixels.
 * @param cssHeight Layout height in CSS pixels.
 * @param dprCap Maximum device pixel ratio. Values below 1 fall back to 2.
 * @param deviceDpr The browser's `window.devicePixelRatio`.
 */
export function computeCanvasSize(
  cssWidth: number,
  cssHeight: number,
  dprCap: number,
  deviceDpr: number,
): CanvasSize {
  const width = sanitizeLength(cssWidth);
  const height = sanitizeLength(cssHeight);
  const cap = sanitizeCap(dprCap);
  const ratio = Math.max(1, sanitizeDpr(deviceDpr));
  const dpr = Math.min(ratio, cap);

  return {
    cssWidth: width,
    cssHeight: height,
    dpr,
    pixelWidth: width > 0 ? Math.max(1, Math.round(width * dpr)) : 0,
    pixelHeight: height > 0 ? Math.max(1, Math.round(height * dpr)) : 0,
    capped: ratio > cap,
  };
}
