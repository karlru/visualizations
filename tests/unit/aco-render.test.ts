import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACO_HISTORY_CAPACITY,
  AcoEngine,
  buildTransitionWeights,
} from '../../src/engines/aco/engine';
import { createTspInstance } from '../../src/engines/aco/tsp';
import type { AcoParams, AcoSnapshot } from '../../src/engines/aco/types';
import type { QualityTier } from '../../src/engines/core/types';
import type { Canvas2DLayerFrame } from '../../src/render/canvas2d/Canvas2DRenderer';
import { createAcoLayers } from '../../src/render/canvas2d/layers';
import {
  PHEROMONE_MAX_ALPHA,
  PHEROMONE_MAX_WIDTH_PX,
  PHEROMONE_MIN_ALPHA,
  PHEROMONE_MIN_WIDTH_PX,
  PHEROMONE_REFERENCE_MULTIPLE,
  PHEROMONE_REFERENCE_TAU,
  pheromoneAlpha,
  pheromoneIntensity,
  pheromoneWidthPx,
} from '../../src/render/canvas2d/layers/pheromone';
import type { CanvasTheme } from '../../src/render/canvas2d/theme';
import {
  buildAcoBestTourFigure,
  renderAcoBestTourSvg,
} from '../../src/stories/aco/best-tour-figure';
import { buildProbabilityFan, DEFAULT_FAN_CANDIDATES } from '../../src/stories/aco/probability-fan';
import type { AcoCanvasLayerId } from '../../src/stories/aco/scenes';
import { ACO_FOCAL_CITY_INDEX } from '../../src/stories/aco/world';

const PARAMS: AcoParams = {
  cityCount: 30,
  antCount: 40,
  alpha: 1,
  beta: 2,
  rho: 0.5,
  speed: 1,
  seed: 42,
};

const THEME: CanvasTheme = {
  paper: '#f2efe6',
  paperRaised: '#faf8f2',
  ink: '#141414',
  muted: '#5f5b54',
  stage: '#0b0c0e',
  stageRaised: '#15171b',
  stageInset: '#060708',
  stageInk: '#f2efe6',
  stageMuted: '#9a948a',
  accent: '#e4572e',
  amber: '#ffb25e',
  cool: '#7cf5c4',
  rule: 'rgb(242 239 230 / 18%)',
  focus: '#3a6ea5',
};

/** A call-logging Canvas 2D stand-in. It has no pixels, only operations. */
class StubContext {
  globalAlpha = 1;
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  readonly calls: { readonly name: string; readonly args: readonly unknown[] }[] = [];
  readonly arcs: number[] = [];
  readonly strokes: {
    readonly style: string | CanvasGradient | CanvasPattern;
    readonly width: number;
    readonly alpha: number;
    readonly dash: readonly number[];
  }[] = [];
  readonly fills: string[] = [];
  fillTextCalls = 0;
  strokeTextCalls = 0;
  private dash: readonly number[] = [];
  private readonly stack: {
    globalAlpha: number;
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
    dash: readonly number[];
  }[] = [];

  save(): void {
    this.stack.push({
      globalAlpha: this.globalAlpha,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      dash: this.dash,
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
      this.dash = state.dash;
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
    this.arcs.push(radius);
    this.record('arc', x, y, radius, startAngle, endAngle, counterclockwise);
  }
  fill(): void {
    this.fills.push(String(this.fillStyle));
    this.record('fill');
  }
  stroke(): void {
    this.strokes.push({
      style: this.strokeStyle,
      width: this.lineWidth,
      alpha: this.globalAlpha,
      dash: this.dash,
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
    this.dash = [...segments];
    this.record('setLineDash', ...segments);
  }
  createLinearGradient(): CanvasGradient {
    return { addColorStop: () => undefined } as unknown as CanvasGradient;
  }
  fillText(text: string, x: number, y: number): void {
    this.fillTextCalls += 1;
    this.record('fillText', text, x, y);
  }
  strokeText(text: string, x: number, y: number): void {
    this.strokeTextCalls += 1;
    this.record('strokeText', text, x, y);
  }

  count(name: string): number {
    return this.calls.reduce((total, call) => total + (call.name === name ? 1 : 0), 0);
  }

  private record(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args });
  }
}

interface FrameOptions {
  readonly revealProgress?: number;
  readonly highlight?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly ctx?: StubContext;
  readonly quality?: QualityTier;
}

function createFrame(
  snapshot: Readonly<AcoSnapshot>,
  layerId: AcoCanvasLayerId,
  options: FrameOptions = {},
): { readonly frame: Canvas2DLayerFrame<AcoParams, AcoSnapshot>; readonly ctx: StubContext } {
  const ctx = options.ctx ?? new StubContext();
  const layer = {
    id: layerId,
    visible: options.visible ?? true,
    opacity: options.opacity ?? 1,
  };
  const camera = { kind: '2d' as const, panX: 0, panY: 0, zoom: 84, rotation: 0 };

  return {
    ctx,
    frame: {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      snapshot,
      params: snapshot.params,
      scene: {
        camera,
        layers: [layer],
        highlights: [],
        revealProgress: options.revealProgress ?? 1,
        labels: [],
      },
      camera,
      layer,
      theme: THEME,
      width: 800,
      height: 450,
      dpr: 2,
      revealProgress: options.revealProgress ?? 1,
      highlight: options.highlight ?? 0,
      quality: options.quality ?? 'high',
    },
  };
}

function layerFor(layerId: AcoCanvasLayerId) {
  const layer = createAcoLayers().find((candidate) => candidate.id === layerId);
  if (layer === undefined) throw new Error(`Missing layer ${layerId}`);
  return layer;
}

function runEngine(iterations: number, params: AcoParams = PARAMS): AcoEngine {
  const engine = new AcoEngine(params);
  for (let index = 0; index < iterations; index += 1) engine.stepIteration();
  return engine;
}

describe('pheromone scale', () => {
  it('is zero at zero and strictly monotonic across the documented range', () => {
    expect(pheromoneIntensity(0)).toBe(0);
    expect(pheromoneIntensity(-1)).toBe(0);
    expect(pheromoneIntensity(Number.NaN)).toBe(0);

    const values = [0, 0.01, PHEROMONE_REFERENCE_TAU, 0.5, 1, 2, 3.2];
    let previous = -1;
    for (const value of values) {
      const intensity = pheromoneIntensity(value);
      expect(intensity).toBeGreaterThan(previous);
      expect(intensity).toBeLessThanOrEqual(1);
      previous = intensity;
    }
  });

  it('keeps early uniform and late concentrated trails readable', () => {
    const early = pheromoneIntensity(PHEROMONE_REFERENCE_TAU);
    const late = pheromoneIntensity(1);
    const saturated = pheromoneIntensity(PHEROMONE_REFERENCE_TAU * PHEROMONE_REFERENCE_MULTIPLE);

    expect(early).toBeGreaterThan(0.15);
    expect(early).toBeLessThan(0.3);
    expect(late).toBeGreaterThan(early + 0.4);
    expect(saturated).toBe(1);
    expect(pheromoneIntensity(1e9)).toBe(1);
  });

  it('maps zero to the minimum visible width and alpha', () => {
    expect(pheromoneWidthPx(0)).toBe(PHEROMONE_MIN_WIDTH_PX);
    expect(pheromoneWidthPx(1)).toBe(PHEROMONE_MAX_WIDTH_PX);
    expect(pheromoneAlpha(0)).toBe(PHEROMONE_MIN_ALPHA);
    expect(pheromoneAlpha(1)).toBe(PHEROMONE_MAX_ALPHA);
    expect(PHEROMONE_MIN_WIDTH_PX).toBeGreaterThan(0);
    expect(PHEROMONE_MIN_ALPHA).toBeGreaterThan(0);
  });
});

describe('probability fan', () => {
  const engine = runEngine(3);
  const snapshot = engine.snapshot();
  const fan = buildProbabilityFan(snapshot, snapshot.pheromone, snapshot.params, {
    focalCity: ACO_FOCAL_CITY_INDEX,
    topN: DEFAULT_FAN_CANDIDATES,
  });

  it('names the top N and aggregates every remaining candidate', () => {
    expect(fan.entries).toHaveLength(DEFAULT_FAN_CANDIDATES);
    expect(fan.other.count).toBe(29 - DEFAULT_FAN_CANDIDATES);
    expect(fan.candidateCount).toBe(29);
    expect(fan.entries.every((entry) => entry.city !== ACO_FOCAL_CITY_INDEX)).toBe(true);
  });

  it('sorts descending with a deterministic city tie-break', () => {
    for (let index = 1; index < fan.entries.length; index += 1) {
      const previous = fan.entries[index - 1];
      const current = fan.entries[index];
      if (previous === undefined || current === undefined) continue;
      expect(previous.probability).toBeGreaterThanOrEqual(current.probability);
      if (previous.probability === current.probability) {
        expect(previous.city).toBeLessThan(current.city);
      }
    }
  });

  it('normalizes named candidates plus the other bucket to 1', () => {
    const named = fan.entries.reduce((total, entry) => total + entry.probability, 0);
    expect(named + fan.other.probability).toBeCloseTo(1, 10);
    expect(fan.total).toBeCloseTo(1, 10);
  });

  it('honours a smaller top N and omits the other bucket when all fit', () => {
    const small = buildProbabilityFan(snapshot, snapshot.pheromone, snapshot.params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      topN: 4,
    });
    expect(small.entries).toHaveLength(4);
    expect(small.other.count).toBe(25);
    expect(small.total).toBeCloseTo(1, 10);

    const all = buildProbabilityFan(snapshot, snapshot.pheromone, snapshot.params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      topN: 100,
    });
    expect(all.entries).toHaveLength(29);
    expect(all.other.count).toBe(0);
    expect(all.other.probability).toBe(0);
    expect(all.total).toBeCloseTo(1, 10);
  });

  it('excludes explicit visited cities', () => {
    const visited = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const reduced = buildProbabilityFan(snapshot, snapshot.pheromone, snapshot.params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      visited,
    });
    expect(reduced.candidateCount).toBe(19);
    for (const city of visited) {
      expect(reduced.entries.some((entry) => entry.city === city)).toBe(false);
    }
  });

  it('falls back to the engine uniform distribution when every weight is zero', () => {
    const zero = new Float64Array(PARAMS.cityCount * PARAMS.cityCount);
    const uniform = buildProbabilityFan(snapshot, zero, snapshot.params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      topN: 8,
    });
    expect(uniform.uniform).toBe(true);
    expect(uniform.total).toBeCloseTo(1, 10);
    for (const entry of uniform.entries) {
      expect(entry.probability).toBeCloseTo(1 / 29, 10);
    }
  });

  it('is deterministic for the same inputs', () => {
    const again = buildProbabilityFan(snapshot, snapshot.pheromone, snapshot.params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      topN: DEFAULT_FAN_CANDIDATES,
    });
    expect(again).toEqual(fan);

    // The helper delegates to the same weights the engine builds.
    const weights = buildTransitionWeights(
      {
        seed: 0,
        cityCount: snapshot.cityCount,
        cities: snapshot.cities,
        distanceMatrix: snapshot.distanceMatrix,
      },
      snapshot.pheromone,
      snapshot.params.alpha,
      snapshot.params.beta,
    );
    expect(weights.length).toBe(snapshot.cityCount * snapshot.cityCount);
  });
});

describe('engine convergence history', () => {
  it('records one chronological point per completed iteration', () => {
    const engine = runEngine(5);
    const snapshot = engine.snapshot();
    const metrics = engine.metrics();

    expect(snapshot.history.capacity).toBe(ACO_HISTORY_CAPACITY);
    expect(snapshot.history.points).toHaveLength(5);
    expect(snapshot.history.points.map((point) => point.iteration)).toEqual([1, 2, 3, 4, 5]);
    expect(metrics.history).toHaveLength(5);
    expect(metrics.history).toEqual(
      snapshot.history.points.map((point) => ({
        iteration: point.iteration,
        bestLength: point.bestLength,
        meanLength: point.meanLength,
      })),
    );

    for (let index = 1; index < snapshot.history.points.length; index += 1) {
      const previous = snapshot.history.points[index - 1];
      const current = snapshot.history.points[index];
      if (previous === undefined || current === undefined) continue;
      expect(current.bestLength).toBeLessThanOrEqual(previous.bestLength);
      expect(Number.isFinite(current.meanLength)).toBe(true);
    }
  });

  it('keeps the points array stable and caps the window without allocating', () => {
    const engine = runEngine(0, { ...PARAMS, cityCount: 8, antCount: 4, seed: 1 });
    const snapshot = engine.snapshot();
    const points = snapshot.history.points;
    expect(points).toHaveLength(0);

    for (let index = 0; index < 520; index += 1) engine.stepIteration();

    expect(snapshot.history.points).toBe(points);
    expect(snapshot.history.points).toHaveLength(ACO_HISTORY_CAPACITY);
    expect(snapshot.history.points[0]?.iteration).toBe(9);
    expect(snapshot.history.points[ACO_HISTORY_CAPACITY - 1]?.iteration).toBe(520);
    // Objects are reused from the pool rather than recreated.
    const firstObject = snapshot.history.points[0];
    engine.stepIteration();
    expect(snapshot.history.points[ACO_HISTORY_CAPACITY - 1]).toBe(firstObject);
  });

  it('is deterministic and clears on reset or a structural change', () => {
    const first = runEngine(20, { ...PARAMS, cityCount: 12, antCount: 8, seed: 7 });
    const second = runEngine(20, { ...PARAMS, cityCount: 12, antCount: 8, seed: 7 });
    expect(first.snapshot().history.points).toEqual(second.snapshot().history.points);

    first.reset();
    expect(first.snapshot().history.points).toHaveLength(0);
    expect(first.metrics().history).toEqual([]);

    for (let index = 0; index < 3; index += 1) first.stepIteration();
    first.setParams({ ...PARAMS, cityCount: 12, antCount: 8, seed: 7, rho: 0.25 });
    expect(first.snapshot().history.points).toHaveLength(0);
  });

  it('returns a fresh metrics copy so callers cannot mutate the live history', () => {
    const engine = runEngine(2);
    const metrics = engine.metrics();
    const copy = metrics.history as { iteration: number; bestLength: number; meanLength: number }[];
    copy[0] = { iteration: 999, bestLength: 0, meanLength: 0 };
    expect(engine.snapshot().history.points[0]?.iteration).toBe(1);
  });
});

describe('ACO canvas layers', () => {
  it('draws the city graph and all-pairs edges, revealing a prefix', () => {
    const engine = runEngine(1);
    const layer = layerFor('graph');

    const full = createFrame(engine.snapshot(), 'graph');
    layer.draw(full.frame);
    expect(full.ctx.count('lineTo')).toBe((30 * 29) / 2);
    expect(full.ctx.arcs).toHaveLength(30);
    expect(full.ctx.fillTextCalls).toBe(0);

    const half = createFrame(engine.snapshot(), 'graph', { revealProgress: 0.5 });
    layer.draw(half.frame);
    expect(half.ctx.count('lineTo')).toBe(Math.ceil(((30 * 29) / 2) * 0.5));
    expect(half.ctx.arcs).toHaveLength(15);

    const none = createFrame(engine.snapshot(), 'graph', { revealProgress: 0 });
    layer.draw(none.frame);
    expect(none.ctx.calls).toEqual([]);
  });

  it('draws pheromone with width and alpha from the log scale', () => {
    const early = runEngine(0);
    const layer = layerFor('pheromone');
    const earlyFrame = createFrame(early.snapshot(), 'pheromone');
    layer.draw(earlyFrame.frame);
    const earlyMaxWidth = Math.max(...earlyFrame.ctx.strokes.map((snapshot) => snapshot.width));
    const earlyMaxAlpha = Math.max(...earlyFrame.ctx.strokes.map((snapshot) => snapshot.alpha));

    expect(earlyFrame.ctx.strokes.length).toBeGreaterThan(0);
    expect(earlyMaxWidth).toBeGreaterThan(0);
    expect(earlyMaxAlpha).toBeGreaterThan(0.05);

    const late = runEngine(40);
    const lateFrame = createFrame(late.snapshot(), 'pheromone');
    layer.draw(lateFrame.frame);
    const lateMaxWidth = Math.max(...lateFrame.ctx.strokes.map((snapshot) => snapshot.width));

    expect(lateMaxWidth).toBeGreaterThan(earlyMaxWidth * 1.5);
    expect(lateFrame.ctx.fillTextCalls).toBe(0);
  });

  it('draws ants only after a tour exists, with one trail each', () => {
    const layer = layerFor('ants');

    const fresh = createFrame(runEngine(0).snapshot(), 'ants');
    layer.draw(fresh.frame);
    expect(fresh.ctx.calls).toEqual([]);

    const run = runEngine(1);
    const drawn = createFrame(run.snapshot(), 'ants');
    layer.draw(drawn.frame);
    expect(drawn.ctx.arcs).toHaveLength(40);
    expect(drawn.ctx.count('stroke')).toBeGreaterThanOrEqual(40);
    expect(drawn.ctx.fillTextCalls).toBe(0);
  });

  it('draws the best tour with a halo, a dash pattern, and square markers', () => {
    const layer = layerFor('best-tour');

    const fresh = createFrame(runEngine(0).snapshot(), 'best-tour');
    layer.draw(fresh.frame);
    expect(fresh.ctx.calls).toEqual([]);

    const run = runEngine(1);
    const drawn = createFrame(run.snapshot(), 'best-tour');
    layer.draw(drawn.frame);

    expect(drawn.ctx.count('stroke')).toBe(2);
    expect(drawn.ctx.count('fillRect')).toBe(30);
    const dashes = drawn.ctx.strokes.filter((snapshot) => snapshot.dash.length === 2);
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    expect(dashes[0]?.dash[0]).toBeGreaterThan(0);
    expect(drawn.ctx.fillTextCalls).toBe(0);
  });

  it('draws the probability fan from the same data as the textual alternative', () => {
    const run = runEngine(1);
    const snapshot = run.snapshot();
    const fan = buildProbabilityFan(snapshot, snapshot.pheromone, snapshot.params, {
      focalCity: ACO_FOCAL_CITY_INDEX,
      topN: DEFAULT_FAN_CANDIDATES,
    });
    const layer = layerFor('probability-fan');
    const drawn = createFrame(snapshot, 'probability-fan');
    layer.draw(drawn.frame);

    expect(fan.entries).toHaveLength(8);
    expect(drawn.ctx.arcs.length).toBeGreaterThanOrEqual(fan.entries.length + 2);
    expect(drawn.ctx.fillTextCalls).toBe(0);
    expect(drawn.ctx.strokeTextCalls).toBe(0);
  });

  it('skips every layer when hidden or fully transparent', () => {
    const run = runEngine(2);
    for (const id of ['graph', 'pheromone', 'ants', 'best-tour', 'probability-fan'] as const) {
      const layer = layerFor(id);

      const hidden = createFrame(run.snapshot(), id, { visible: false });
      layer.draw(hidden.frame);
      expect(hidden.ctx.calls, `${id} hidden`).toEqual([]);

      const transparent = createFrame(run.snapshot(), id, { opacity: 0 });
      layer.draw(transparent.frame);
      expect(transparent.ctx.calls, `${id} transparent`).toEqual([]);
    }
  });

  it('reduces rendered ants, trails, edges, and the tour halo at a low tier', () => {
    const run = runEngine(1);
    const snapshot = run.snapshot();

    const highGraph = createFrame(snapshot, 'graph', { quality: 'high' });
    layerFor('graph').draw(highGraph.frame);
    const lowGraph = createFrame(snapshot, 'graph', { quality: 'low' });
    layerFor('graph').draw(lowGraph.frame);
    expect(highGraph.ctx.count('lineTo')).toBe((30 * 29) / 2);
    expect(lowGraph.ctx.count('lineTo')).toBe(Math.ceil((30 * 29) / 2 / 4));

    const highPheromone = createFrame(snapshot, 'pheromone', { quality: 'high' });
    layerFor('pheromone').draw(highPheromone.frame);
    const lowPheromone = createFrame(snapshot, 'pheromone', { quality: 'low' });
    layerFor('pheromone').draw(lowPheromone.frame);
    expect(lowPheromone.ctx.count('lineTo')).toBeLessThan(highPheromone.ctx.count('lineTo'));

    const highAnts = createFrame(snapshot, 'ants', { quality: 'high' });
    layerFor('ants').draw(highAnts.frame);
    const lowAnts = createFrame(snapshot, 'ants', { quality: 'low' });
    layerFor('ants').draw(lowAnts.frame);
    // 40 ants at the high tier; the low tier draws every third ant (14).
    expect(highAnts.ctx.arcs).toHaveLength(40);
    expect(lowAnts.ctx.arcs).toHaveLength(14);
    expect(lowAnts.ctx.arcs.length).toBeLessThan(highAnts.ctx.arcs.length);

    const highTour = createFrame(snapshot, 'best-tour', { quality: 'high' });
    layerFor('best-tour').draw(highTour.frame);
    const lowTour = createFrame(snapshot, 'best-tour', { quality: 'low' });
    layerFor('best-tour').draw(lowTour.frame);
    expect(highTour.ctx.count('stroke')).toBe(2);
    expect(lowTour.ctx.count('stroke')).toBe(1);
  });

  it('never draws text into the canvas', () => {
    const directory = new URL('../../src/render/canvas2d/layers/', import.meta.url);
    for (const file of [
      'graph.ts',
      'pheromone.ts',
      'ants.ts',
      'best-tour.ts',
      'probability-fan.ts',
      'index.ts',
    ]) {
      const source = readFileSync(new URL(file, directory), 'utf8');
      expect(source, file).not.toMatch(/\bfillText\b/);
      expect(source, file).not.toMatch(/\bstrokeText\b/);
    }
  });
});

describe('static best-tour figure', () => {
  it('renders valid, deterministic SVG with a non-empty tour', () => {
    const engine = runEngine(5);
    const snapshot = engine.snapshot();
    if (snapshot.bestTour === null || snapshot.bestLength === null) {
      throw new Error('Expected a best tour');
    }

    const input = {
      cities: snapshot.cities,
      tour: snapshot.bestTour,
      bestLength: snapshot.bestLength,
      meanLength: snapshot.meanLength,
      iteration: snapshot.iteration,
      seed: snapshot.params.seed,
    };
    const first = renderAcoBestTourSvg(input);
    const second = renderAcoBestTourSvg(input);

    expect(first).toBe(second);
    expect(first.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(first.endsWith('</svg>\n')).toBe(true);
    expect(first).toContain('viewBox="0 0 960 600"');
    expect(first).toContain('stroke-dasharray="9 6"');
    expect(first).toContain('Best tour');
    expect(first).toContain('stroke="var(--color-accent-paper)"');
    expect(first).toContain('stroke="var(--color-amber)"');
    expect(first.match(/<path /g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects an empty tour instead of shipping an empty figure', () => {
    expect(() =>
      renderAcoBestTourSvg({
        cities: createTspInstance(42, 30).cities,
        tour: [],
        bestLength: null,
      }),
    ).toThrow(/non-empty/);
  });

  it('builds the exact reference figure twice without drift', () => {
    const first = buildAcoBestTourFigure();
    const second = buildAcoBestTourFigure();

    expect(first).toBe(second);
    expect(first).toContain('data-figure="aco-best-tour"');
    expect(first).toContain('40 iterations');
    expect(first).toContain('seed 42');
  });
});
