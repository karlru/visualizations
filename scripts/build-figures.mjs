#!/usr/bin/env node
/**
 * Build-time figure generation.
 *
 * Step 3.2 generates the static ACO best-tour SVG used by article and
 * no-JavaScript mode. Step 5.1 will add the RANDU 2D projections.
 *
 * This script imports the real pure engine through
 * `src/stories/aco/best-tour-figure.ts`, not a copy of it, so the figure can
 * never drift from the simulation. It runs through `node --import tsx` because
 * the engine and figure renderer are TypeScript; `tsx` is a build-time
 * executable and is never part of a browser bundle.
 *
 * Usage: node --import tsx scripts/build-figures.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ACO_FIGURE_ITERATIONS,
  buildAcoBestTourFigure,
} from '../src/stories/aco/best-tour-figure.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Committed asset location, imported inline by the Step 3.3 MDX article. */
export const ACO_BEST_TOUR_FIGURE_PATH = resolve(ROOT, 'src/assets/figures/aco-best-tour.svg');

function writeAcoBestTourFigure() {
  const svg = buildAcoBestTourFigure();
  mkdirSync(dirname(ACO_BEST_TOUR_FIGURE_PATH), { recursive: true });
  writeFileSync(ACO_BEST_TOUR_FIGURE_PATH, svg, 'utf8');
  console.log(
    `[build-figures] Wrote ${ACO_BEST_TOUR_FIGURE_PATH} (${svg.length} bytes, ${ACO_FIGURE_ITERATIONS} iterations).`,
  );
}

const entry = process.argv[1];
const invokedDirectly =
  entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href;

if (invokedDirectly) {
  writeAcoBestTourFigure();
  console.log('[build-figures] TODO (5.1): emit the RANDU 2D projection figures.');
}
