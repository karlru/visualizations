import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyMatrixInto,
  cameraMatrix,
  cameraRotation,
  type MutablePoint,
  projectInto,
  projectPoint,
  unprojectPoint,
} from '../../src/render/canvas2d/camera';
import {
  type Canvas2DPrimitiveContext,
  createLinearGradient,
  drawArc,
  drawLine,
  drawPoints,
  drawPolyline,
  FULL_CIRCLE,
  fillCircle,
  fillCircleGradient,
  fillRect,
  type GradientStop,
  type PointStyle,
  type StrokeStyle,
} from '../../src/render/canvas2d/primitives';
import { computeCanvasSize } from '../../src/render/canvas2d/sizing';
import {
  CANVAS_THEME_TOKENS,
  type CanvasTheme,
  themeFromStyle,
} from '../../src/render/canvas2d/theme';

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/**
 * A call-logging stand-in for CanvasRenderingContext2D. It deliberately has
 * no pixel output: the unit under test is the sequence of canvas operations,
 * the transform math, and alpha composition.
 */
class StubContext implements Canvas2DPrimitiveContext {
  globalAlpha = 1;
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  readonly calls: Call[] = [];
  readonly gradientStops: { offset: number; color: string }[][] = [];
  readonly strokeSnapshots: {
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    globalAlpha: number;
  }[] = [];
  private readonly stack: {
    globalAlpha: number;
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
  }[] = [];

  save(): void {
    this.stack.push({
      globalAlpha: this.globalAlpha,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
    });
    this.record('save');
  }
  restore(): void {
    const state = this.stack.pop();
    if (state !== undefined) {
      this.globalAlpha = state.globalAlpha;
      this.fillStyle = state.fillStyle;
      this.strokeStyle = state.strokeStyle;
      this.lineWidth = state.lineWidth;
      this.lineCap = state.lineCap;
      this.lineJoin = state.lineJoin;
    }
    this.record('restore');
  }
  beginPath(): void {
    this.record('beginPath');
  }
  closePath(): void {
    this.record('closePath');
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.record('lineTo', x, y);
  }
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void {
    this.record('arc', x, y, radius, startAngle, endAngle, counterclockwise);
  }
  fill(): void {
    this.record('fill');
  }
  stroke(): void {
    this.strokeSnapshots.push({
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
    });
    this.record('stroke');
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    this.record('fillRect', x, y, width, height);
  }
  strokeRect(x: number, y: number, width: number, height: number): void {
    this.record('strokeRect', x, y, width, height);
  }
  setLineDash(segments: readonly number[]): void {
    this.record('setLineDash', ...segments);
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    this.record('createLinearGradient', x0, y0, x1, y1);
    const stops: { offset: number; color: string }[] = [];
    this.gradientStops.push(stops);
    return {
      addColorStop(offset: number, color: string): void {
        stops.push({ offset, color });
      },
    } as unknown as CanvasGradient;
  }

  names(): string[] {
    return this.calls.map((call) => call.name);
  }

  private record(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args });
  }
}

const lineStyle: StrokeStyle = { color: '#e4572e', width: 2, alpha: 0.5, dash: [4, 2] };

describe('2D camera', () => {
  it('projects the pan point to the stage centre', () => {
    const camera = { kind: '2d', panX: 4, panY: -2, zoom: 3, rotation: 0.4 } as const;
    const point = projectPoint(camera, 800, 600, 4, -2);

    expect(point.x).toBeCloseTo(400, 10);
    expect(point.y).toBeCloseTo(300, 10);
  });

  it('scales world units by the zoom and flips the screen y axis', () => {
    const camera = { kind: '2d', panX: 0, panY: 0, zoom: 2 } as const;

    expect(projectPoint(camera, 100, 100, 1, 0)).toEqual({ x: 52, y: 50 });
    expect(projectPoint(camera, 100, 100, 0, 1)).toEqual({ x: 50, y: 48 });
  });

  it('treats a positive rotation as counter-clockwise', () => {
    const camera = { kind: '2d', panX: 0, panY: 0, zoom: 1, rotation: Math.PI / 2 } as const;
    const point = projectPoint(camera, 100, 100, 1, 0);

    // +x world becomes up on screen (smaller y), not down.
    expect(point.x).toBeCloseTo(50, 10);
    expect(point.y).toBeCloseTo(49, 10);
  });

  it('round-trips world → screen → world with pan, zoom, and rotation', () => {
    const cameras = [
      { kind: '2d', panX: 0, panY: 0, zoom: 1 },
      { kind: '2d', panX: -3.5, panY: 2.25, zoom: 40 },
      { kind: '2d', panX: 12, panY: -7, zoom: 0.35, rotation: 1.234 },
    ] as const;
    const worlds = [
      { x: 0, y: 0 },
      { x: 1, y: -1 },
      { x: -8.5, y: 3.2 },
    ] as const;

    for (const camera of cameras) {
      for (const world of worlds) {
        const screen = projectPoint(camera, 640, 360, world.x, world.y);
        const roundTrip = unprojectPoint(camera, 640, 360, screen.x, screen.y);
        expect(roundTrip.x).toBeCloseTo(world.x, 9);
        expect(roundTrip.y).toBeCloseTo(world.y, 9);
      }
    }
  });

  it('writes into a reusable point without allocating a new one', () => {
    const camera = { kind: '2d', panX: 0, panY: 0, zoom: 1 } as const;
    const out: MutablePoint = { x: 0, y: 0 };

    const returned = projectInto(camera, 100, 100, 3, 4, out);

    expect(returned).toBe(out);
    expect(out).toEqual({ x: 53, y: 46 });
  });

  it('matches the canvas matrix, including DPR', () => {
    const camera = { kind: '2d', panX: 1.5, panY: -2, zoom: 3.25, rotation: 0.37 } as const;
    const matrix = cameraMatrix(camera, 640, 360, 2);
    const screen = projectPoint(camera, 640, 360, 2.2, -0.5);
    const device = applyMatrixInto(matrix, 2.2, -0.5, { x: 0, y: 0 });

    expect(device.x).toBeCloseTo(screen.x * 2, 9);
    expect(device.y).toBeCloseTo(screen.y * 2, 9);
  });

  it('defaults a missing rotation to zero', () => {
    expect(cameraRotation({ kind: '2d', panX: 0, panY: 0, zoom: 1 })).toBe(0);
  });
});

describe('canvas sizing', () => {
  it('caps DPR and rounds the backing store to device pixels', () => {
    const size = computeCanvasSize(800, 450, 2, 3);

    expect(size).toEqual({
      cssWidth: 800,
      cssHeight: 450,
      dpr: 2,
      pixelWidth: 1600,
      pixelHeight: 900,
      capped: true,
    });
  });

  it('keeps fractional device ratios exact to the nearest pixel', () => {
    const size = computeCanvasSize(801, 451, 2, 1.5);

    expect(size.dpr).toBe(1.5);
    expect(size.pixelWidth).toBe(1202);
    expect(size.pixelHeight).toBe(677);
    expect(size.capped).toBe(false);
  });

  it('handles 0×0 and invalid sizes without throwing', () => {
    expect(computeCanvasSize(0, 0, 2, 2)).toMatchObject({
      pixelWidth: 0,
      pixelHeight: 0,
      dpr: 2,
    });
    expect(computeCanvasSize(Number.NaN, -20, 2, 2)).toMatchObject({
      cssWidth: 0,
      cssHeight: 0,
      pixelWidth: 0,
      pixelHeight: 0,
    });
  });

  it('falls back to a usable cap and a minimum ratio of 1', () => {
    expect(computeCanvasSize(10, 10, 0.5, 3).dpr).toBe(2);
    expect(computeCanvasSize(10, 10, 2, 0).dpr).toBe(1);
  });
});

describe('canvas theme', () => {
  it('maps every canvas colour to a token defined in tokens.css', () => {
    const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

    for (const token of Object.values(CANVAS_THEME_TOKENS)) {
      expect(token.startsWith('--color-'), token).toBe(true);
      expect(css, `${token} must exist in tokens.css`).toContain(`${token}:`);
    }
    expect(Object.keys(CANVAS_THEME_TOKENS)).toHaveLength(14);
  });

  it('reads a theme from any style-like source', () => {
    const values = new Map<string, string>();
    let index = 0;
    for (const token of Object.values(CANVAS_THEME_TOKENS)) {
      values.set(token, `colour-${index}`);
      index += 1;
    }

    const theme = themeFromStyle({ getPropertyValue: (property) => values.get(property) ?? '' });
    const keys = Object.keys(CANVAS_THEME_TOKENS) as (keyof CanvasTheme)[];
    for (const key of keys) {
      expect(theme[key]).toMatch(/^colour-\d+$/);
    }
  });

  it('fails loudly when a token has not loaded', () => {
    expect(() => themeFromStyle({ getPropertyValue: () => '' })).toThrow(/empty/);
  });
});

describe('canvas primitives', () => {
  it('draws a line with style and restores the context', () => {
    const ctx = new StubContext();

    drawLine(ctx, 0, 0, 10, 5, lineStyle);

    expect(ctx.names()).toEqual([
      'save',
      'setLineDash',
      'beginPath',
      'moveTo',
      'lineTo',
      'stroke',
      'restore',
    ]);
    expect(ctx.strokeSnapshots).toEqual([
      { strokeStyle: lineStyle.color, lineWidth: 2, globalAlpha: 0.5 },
    ]);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('composes primitive alpha with layer alpha', () => {
    const ctx = new StubContext();
    ctx.globalAlpha = 0.5;

    drawLine(ctx, 0, 0, 1, 1, { color: '#fff', width: 1, alpha: 0.5 });

    expect(ctx.strokeSnapshots[0]?.globalAlpha).toBe(0.25);
    expect(ctx.globalAlpha).toBe(0.5);
    expect(ctx.names()[0]).toBe('save');
    expect(ctx.names().at(-1)).toBe('restore');
  });

  it('batches points into one fill path', () => {
    const ctx = new StubContext();
    const style: PointStyle = { radius: 2, fill: '#fff' };

    drawPoints(
      ctx,
      [
        { x: 1, y: 1 },
        { x: 4, y: 4 },
        { x: 8, y: 2 },
      ],
      style,
    );

    expect(ctx.names().filter((name) => name === 'arc')).toHaveLength(3);
    expect(ctx.names().filter((name) => name === 'fill')).toHaveLength(1);
    expect(ctx.names()).not.toContain('fillRect');
  });

  it('uses square points as a non-colour encoding', () => {
    const ctx = new StubContext();
    const style: PointStyle = { radius: 2, fill: '#fff', shape: 'square', stroke: '#000' };

    drawPoints(
      ctx,
      [
        { x: 1, y: 1 },
        { x: 4, y: 4 },
      ],
      style,
    );

    expect(ctx.names().filter((name) => name === 'fillRect')).toHaveLength(2);
    expect(ctx.names().filter((name) => name === 'strokeRect')).toHaveLength(2);
  });

  it('draws a closed polyline without building an intermediate array', () => {
    const ctx = new StubContext();

    drawPolyline(
      ctx,
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      lineStyle,
      true,
    );

    expect(ctx.names().filter((name) => name === 'lineTo')).toHaveLength(2);
    expect(ctx.names()).toContain('closePath');
    expect(ctx.names().filter((name) => name === 'stroke')).toHaveLength(1);
  });

  it('draws arcs and filled circles', () => {
    const arcContext = new StubContext();
    drawArc(arcContext, 0, 0, 3, 0, FULL_CIRCLE, { color: '#fff', width: 1 });
    expect(arcContext.names()).toContain('arc');

    const circleContext = new StubContext();
    fillCircle(circleContext, 1, 2, 3, { fill: '#fff', stroke: '#000' });
    expect(circleContext.names().filter((name) => name === 'fill')).toHaveLength(1);
    expect(circleContext.names().filter((name) => name === 'stroke')).toHaveLength(1);
  });

  it('creates cached gradients and fills a rectangle with them', () => {
    const ctx = new StubContext();
    const stops: readonly GradientStop[] = [
      { offset: 0, color: '#000' },
      { offset: 1, color: '#fff' },
    ];
    const gradient = createLinearGradient(ctx, 0, 0, 10, 10, stops);

    fillRect(ctx, 0, 0, 10, 10, { fill: gradient, alpha: 0.25 });
    fillCircleGradient(ctx, 5, 5, 5, gradient, 0.5);

    expect(ctx.names().filter((name) => name === 'createLinearGradient')).toHaveLength(1);
    expect(ctx.gradientStops[0]).toEqual([
      { offset: 0, color: '#000' },
      { offset: 1, color: '#fff' },
    ]);
    expect(ctx.names().filter((name) => name === 'fillRect')).toHaveLength(1);
  });

  it('skips empty geometry without touching the context', () => {
    const ctx = new StubContext();

    drawPoints(ctx, [], { radius: 1, fill: '#fff' });
    drawArc(ctx, 0, 0, 0, 0, 1, { color: '#fff', width: 1 });
    fillRect(ctx, 0, 0, 0, 10, { fill: '#fff' });

    expect(ctx.calls).toEqual([]);
  });
});
