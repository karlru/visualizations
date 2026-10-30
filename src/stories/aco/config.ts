/**
 * Ant Colony Optimization story configuration.
 *
 * Pure data plus a pure engine factory: importing this module must not touch the
 * DOM, register global state, or import a renderer. That keeps defaults, scenes,
 * chapters, and the URL schema usable in Node for unit tests, build-time
 * figures, and share-link validation.
 *
 * Run identity follows `docs/requirements.md` §2.6.1: `seed` and the structural
 * parameters (`cityCount`, `antCount`, `alpha`, `beta`, `rho`) restart the run.
 * `speed` is presentation state on the engine and is wired through
 * `speedControl: { kind: 'engine', param: 'speed' }`, so the stage control must
 * not also change the clock rate.
 */

import { AcoEngine } from '../../engines/aco/engine';
import { ACO_PRESETS } from '../../engines/aco/presets';
import type { AcoMetrics, AcoParams, AcoSnapshot } from '../../engines/aco/types';
import {
  type ChapterSpec,
  defineStoryConfig,
  type Preset,
  type UrlParameterSchema,
} from '../registry';
import { ACO_SCENES } from './scenes';

/** URL path segment and story identity. */
export const ACO_SLUG = 'ant-colony-optimization';

/**
 * Release-1 defaults, exactly as documented in `docs/stories.md` §2.5.
 * `Q` is not a parameter: the engine exports it as the fixed constant 1.
 */
export const ACO_DEFAULTS: AcoParams = Object.freeze({
  cityCount: 30,
  antCount: 40,
  alpha: 1,
  beta: 2,
  rho: 0.5,
  speed: 1,
  seed: 42,
});

/**
 * The four documented colony presets. `ACO_PRESETS` owns the α/β/ρ patches;
 * the story preset wraps them so the controller has one uniform `Preset` shape.
 * Only the three owned parameters change; map, colony size, seed, and speed are
 * preserved when a preset is spread over {@link ACO_DEFAULTS}.
 */
export const ACO_STORY_PRESETS: readonly Preset<AcoParams>[] = Object.freeze(
  ACO_PRESETS.map((preset) =>
    Object.freeze({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      params: preset.patch,
    }),
  ),
);

/**
 * Chapter ↔ scene map. Ids, titles, and scene names are part of the contract
 * that Step 3.3 prose and Step 3.7 tests rely on.
 *
 * `pseudocodeLine` is a 0-based line into the Ant System pseudocode in
 * `docs/stories.md` §2.7; Step 3.4 refines the highlight ranges but the
 * starting line stays meaningful. ACO has no guided `tourAct`.
 */
export const ACO_CHAPTERS: readonly ChapterSpec<AcoParams>[] = Object.freeze([
  {
    id: 'the-colony',
    title: 'The colony',
    scene: 'colony-overview',
    pseudocodeLine: 2,
    annotations: ['colony-map', 'colony-ants'],
    reducedMotionSteps: 3,
  },
  {
    id: 'the-problem',
    title: 'The problem',
    scene: 'tour-problem',
    pseudocodeLine: 3,
    annotations: ['candidate-tour', 'return-edge'],
    reducedMotionSteps: 2,
  },
  {
    id: 'one-ants-choice',
    title: "One ant's choice",
    scene: 'focal-choice',
    pseudocodeLine: 4,
    annotations: ['focal-city', 'allowed-neighbours'],
    reducedMotionSteps: 3,
  },
  {
    id: 'the-probability-rule',
    title: 'The probability rule',
    scene: 'probability-rule',
    pseudocodeLine: 4,
    annotations: ['pheromone-weight', 'distance-weight'],
    reducedMotionSteps: 3,
  },
  {
    id: 'leaving-a-trace',
    title: 'Leaving a trace',
    scene: 'deposit',
    pseudocodeLine: 7,
    annotations: ['deposit-edge', 'shorter-tour-deposit'],
    reducedMotionSteps: 3,
  },
  {
    id: 'forgetting',
    title: 'Forgetting',
    scene: 'evaporation',
    pseudocodeLine: 6,
    annotations: ['evaporating-edge', 'remaining-trail'],
    reducedMotionSteps: 3,
  },
  {
    id: 'emergence',
    title: 'Emergence',
    scene: 'emergence',
    pseudocodeLine: 8,
    annotations: ['best-tour', 'convergence-chart'],
    reducedMotionSteps: 4,
  },
  {
    id: 'tuning-the-colony',
    title: 'Tuning the colony',
    scene: 'tuning',
    pseudocodeLine: 4,
    annotations: ['balanced-preset', 'greedy-preset'],
    reducedMotionSteps: 3,
  },
  {
    id: 'when-it-fails',
    title: 'When it fails',
    scene: 'limits',
    pseudocodeLine: 9,
    annotations: ['local-optimum', 'heuristic-limit'],
    reducedMotionSteps: 3,
  },
  {
    id: 'the-lab',
    title: 'The lab',
    scene: 'lab',
    pseudocodeLine: 2,
    annotations: ['lab-controls', 'share-run'],
    reducedMotionSteps: 2,
  },
]);

/** Canonical chapter ids in narrative order, for validation and rail links. */
export const ACO_CHAPTER_IDS: readonly string[] = Object.freeze(
  ACO_CHAPTERS.map((chapter) => chapter.id),
);

/**
 * Query schema from `docs/requirements.md` §2.6.1. Declaration order is the
 * canonical URL order. `seed` and the structural parameters restart the run;
 * `speed` is presentation-only.
 */
export const ACO_URL_PARAMS: UrlParameterSchema<AcoParams> = {
  params: [
    {
      kind: 'integer',
      key: 'seed',
      query: 'seed',
      structural: true,
      min: 0,
      max: 4_294_967_295,
      label: 'Seed',
    },
    {
      kind: 'integer',
      key: 'cityCount',
      query: 'cities',
      structural: true,
      min: 2,
      max: 150,
      label: 'Cities',
    },
    {
      kind: 'integer',
      key: 'antCount',
      query: 'ants',
      structural: true,
      min: 1,
      max: 200,
      label: 'Ants',
    },
    {
      kind: 'number',
      key: 'alpha',
      query: 'alpha',
      structural: true,
      min: 0,
      max: 5,
      step: 0.1,
      label: 'Pheromone weight α',
    },
    {
      kind: 'number',
      key: 'beta',
      query: 'beta',
      structural: true,
      min: 0,
      max: 10,
      step: 0.5,
      label: 'Distance weight β',
    },
    {
      kind: 'number',
      key: 'rho',
      query: 'rho',
      structural: true,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Evaporation ρ',
    },
    {
      kind: 'enum',
      key: 'speed',
      query: 'speed',
      structural: false,
      values: [0.5, 1, 2, 4],
      label: 'Speed',
    },
  ],
  chapter: { source: 'fragment' },
};

/** Complete story config consumed by the loader and the controller. */
export const acoStoryConfig = defineStoryConfig<AcoParams, AcoSnapshot, AcoMetrics>({
  slug: ACO_SLUG,
  rendererId: 'canvas2d',
  createEngine: (params) => new AcoEngine(params),
  defaults: ACO_DEFAULTS,
  presets: ACO_STORY_PRESETS,
  scenes: ACO_SCENES,
  chapters: ACO_CHAPTERS,
  urlParams: ACO_URL_PARAMS,
  speedControl: { kind: 'engine', param: 'speed' },
  // A preset changes α/β/ρ only. The map size, colony size, seed, and the
  // reader's chosen speed remain their run identity/presentation choices.
  presetKeeps: ['cityCount', 'antCount', 'speed'],
});
