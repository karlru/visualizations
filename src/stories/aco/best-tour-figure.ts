/**
 * Deterministic static best-tour figure for article / no-JavaScript mode.
 *
 * `scripts/build-figures.mjs` runs the pure `AcoEngine` with the story defaults
 * and a fixed iteration count, then calls this renderer. The output is a
 * standalone SVG with no timestamps, randomness, locale-dependent formatting,
 * or external references, so two builds are byte-identical.
 *
 * The figure is written to `src/assets/figures/aco-best-tour.svg` and imported
 * inline by the MDX article. Inline SVG keeps the figure in the no-JS HTML,
 * allows the page's own typography and colour tokens to apply, and avoids an
 * extra request. `Figure.astro` (Step 3.3) can also read the file directly.
 *
 * The visual encodings match the canvas layer: all-pairs candidate edges are
 * faint, the best tour has a wide solid halo plus a dashed accent line, and
 * square city markers keep the path legible in grayscale.
 */

import { AcoEngine } from '../../engines/aco/engine';
import type { City } from '../../engines/aco/types';
import { ACO_DEFAULTS } from './config';

export interface AcoBestTourFigureInput {
  /** Cities in normalized `[0, 1]²` problem space. */
  readonly cities: readonly City[];

  /** Best tour as city indices, without the repeated start city. */
  readonly tour: readonly number[];

  /** Best tour length in normalized problem units. */
  readonly bestLength: number | null;

  /** Mean length of the final iteration, for the caption. */
  readonly meanLength?: number | null;

  /** Completed iterations shown by the caption. */
  readonly iteration?: number;

  /** Run seed shown by the caption. */
  readonly seed?: number;

  readonly width?: number;
  readonly height?: number;
}

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 600;
const MARGIN = 56;

/** Default-run reference point used by the story camera anchors. */
export const ACO_FIGURE_ITERATIONS = 40;

/** Format a number with a fixed, locale-independent precision. */
function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(digits);
}

function project(
  city: City,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  const innerWidth = width - 2 * MARGIN;
  const innerHeight = height - 2 * MARGIN;
  return {
    x: MARGIN + city.x * innerWidth,
    // SVG y grows downwards; the problem's y grows upwards.
    y: MARGIN + (1 - city.y) * innerHeight,
  };
}

/**
 * Render the complete SVG document. Throws when the tour is empty or contains
 * an out-of-range city, so a broken figure fails the build instead of shipping
 * an empty frame.
 */
export function renderAcoBestTourSvg(input: AcoBestTourFigureInput): string {
  const width = input.width ?? DEFAULT_WIDTH;
  const height = input.height ?? DEFAULT_HEIGHT;
  const cities = input.cities;
  const tour = input.tour;

  if (cities.length === 0) {
    throw new Error('ACO best-tour figure needs at least one city.');
  }
  if (tour.length === 0) {
    throw new Error('ACO best-tour figure needs a non-empty best tour.');
  }

  const points = new Array<{ readonly x: number; readonly y: number }>(cities.length);
  for (let index = 0; index < cities.length; index += 1) {
    const city = cities[index];
    if (city === undefined) throw new Error(`Missing city ${index}.`);
    points[index] = project(city, width, height);
  }

  const cityCount = cities.length;
  const edgeParts: string[] = [];
  for (let from = 0; from < cityCount; from += 1) {
    const start = points[from];
    if (start === undefined) continue;
    for (let to = from + 1; to < cityCount; to += 1) {
      const end = points[to];
      if (end === undefined) continue;
      edgeParts.push(`M${fmt(start.x)} ${fmt(start.y)}L${fmt(end.x)} ${fmt(end.y)}`);
    }
  }

  const tourParts: string[] = [];
  for (let index = 0; index < tour.length; index += 1) {
    const cityIndex = tour[index];
    const point = cityIndex === undefined ? undefined : points[cityIndex];
    if (point === undefined) {
      throw new Error(`Best tour references missing city ${String(cityIndex)}.`);
    }
    tourParts.push(`${index === 0 ? 'M' : 'L'}${fmt(point.x)} ${fmt(point.y)}`);
  }
  const firstTourCity = tour[0];
  const firstPoint = firstTourCity === undefined ? undefined : points[firstTourCity];
  if (firstPoint === undefined) {
    throw new Error('Best tour has no start city.');
  }
  tourParts.push(`L${fmt(firstPoint.x)} ${fmt(firstPoint.y)}Z`);
  const tourPath = tourParts.join('');

  const markers: string[] = [];
  for (let index = 0; index < tour.length; index += 1) {
    const cityIndex = tour[index];
    const point = cityIndex === undefined ? undefined : points[cityIndex];
    if (point === undefined) continue;
    markers.push(
      `<rect x="${fmt(point.x - 4)}" y="${fmt(point.y - 4)}" width="8" height="8" fill="var(--color-accent-paper)" stroke="var(--color-paper)" stroke-width="1.5" />`,
    );
  }

  const bestText =
    input.bestLength === null || !Number.isFinite(input.bestLength)
      ? 'no tour yet'
      : `best ${fmt(input.bestLength)}`;
  const meanText =
    input.meanLength === null ||
    input.meanLength === undefined ||
    !Number.isFinite(input.meanLength)
      ? ''
      : ` · mean ${fmt(input.meanLength)}`;
  const iterationText =
    input.iteration === undefined ? '' : ` · ${String(input.iteration)} iterations`;
  const seedText = input.seed === undefined ? '' : ` · seed ${String(input.seed)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="aco-figure-title aco-figure-desc" data-figure="aco-best-tour">
  <title id="aco-figure-title">Best tour found by the ant colony</title>
  <desc id="aco-figure-desc">A city map with ${cityCount} cities, faint candidate edges, and the best tour drawn as a wide halo with a dashed accent line and square city markers. ${bestText}${meanText}${iterationText}${seedText}.</desc>
  <rect width="${width}" height="${height}" fill="var(--color-paper)" />
  <path d="${edgeParts.join('')}" fill="none" stroke="var(--color-paper-muted)" stroke-opacity="0.18" stroke-width="1" />
  <path d="${tourPath}" fill="none" stroke="var(--color-amber)" stroke-opacity="0.55" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
  <path d="${tourPath}" fill="none" stroke="var(--color-accent-paper)" stroke-width="2.6" stroke-dasharray="9 6" stroke-linecap="round" stroke-linejoin="round" />
  <g>${markers.join('')}</g>
  <text x="${MARGIN}" y="32" fill="var(--color-ink)" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15">Best tour · ${bestText}${meanText}${iterationText}${seedText}</text>
  <text x="${width - MARGIN}" y="${height - 20}" text-anchor="end" fill="var(--color-paper-muted)" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">${cityCount} cities · all-pairs candidates</text>
</svg>
`;
}

/**
 * Run the fixed reference experiment and render its best tour.
 *
 * This is the function the build script and the unit test share, so the test
 * proves the exact artifact the build writes. It is pure: no filesystem access,
 * wall clock, or random source.
 */
export function buildAcoBestTourFigure(): string {
  const engine = new AcoEngine(ACO_DEFAULTS);
  for (let iteration = 0; iteration < ACO_FIGURE_ITERATIONS; iteration += 1) {
    engine.stepIteration();
  }

  const snapshot = engine.snapshot();
  if (snapshot.bestTour === null || snapshot.bestLength === null) {
    throw new Error('ACO best-tour figure: the reference run produced no best tour.');
  }

  return renderAcoBestTourSvg({
    cities: snapshot.cities,
    tour: snapshot.bestTour,
    bestLength: snapshot.bestLength,
    meanLength: snapshot.meanLength,
    iteration: snapshot.iteration,
    seed: snapshot.params.seed,
  });
}
