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
 * that the prose, lesson layers, and E2E tests rely on.
 *
 * The opening chapters are scripted teaching scenes (`lockParams`): they always
 * show the five-city instance, even after the reader has played in the lab.
 * Chapter entry is the only place simulation configuration changes. Formal
 * notation appears in chapters 9–10, after the reader has seen the mechanism;
 * the lab is the only free-play chapter.
 *
 * `pseudocodeLine` is a 0-based line into the Ant System pseudocode in
 * `docs/stories.md` §2.7 and is present only where the panel is visible.
 * ACO has no guided `tourAct`.
 */
const DEMO_CHAPTER_PARAMS: Partial<AcoParams> = Object.freeze({
  cityCount: 5,
  seed: 42,
  alpha: 1,
  beta: 2,
  rho: 0.5,
});

function demoParams(antCount: number, speed = 1): Partial<AcoParams> {
  return { ...DEMO_CHAPTER_PARAMS, antCount, speed };
}

/** A scroll-driven teaching scene with no simulation controls at all. */
const SCRIPTED_PRESENTATION = Object.freeze({
  metrics: false,
  pseudocode: false,
  chrome: 'none' as const,
  lockParams: true,
});

/** A guided scene the reader may pause or replay, but not retune. */
const GUIDED_PLAYBACK_PRESENTATION = Object.freeze({
  metrics: false,
  pseudocode: false,
  chrome: 'playback' as const,
  lockParams: true,
});

/** A formal scene with the live metrics panel but no parameter controls. */
const FORMAL_PRESENTATION = Object.freeze({
  metrics: true,
  pseudocode: false,
  chrome: 'playback' as const,
  lockParams: true,
});

function guidedPlayback(reducedMotionIterations: number) {
  return Object.freeze({
    ...GUIDED_PLAYBACK_PRESENTATION,
    reducedMotionIterations,
  });
}

export const ACO_CHAPTERS: readonly ChapterSpec<AcoParams>[] = Object.freeze([
  {
    id: 'the-problem',
    title: 'Five cities, one round trip',
    scene: 'five-cities',
    sceneOverrides: { params: demoParams(1) },
    annotations: ['demo-tour', 'demo-home'],
    reducedMotionSteps: 6,
    presentation: SCRIPTED_PRESENTATION,
  },
  {
    id: 'try-every-tour',
    title: 'Try every tour',
    scene: 'enumerate-tours',
    sceneOverrides: { params: demoParams(1) },
    annotations: ['demo-twelve', 'demo-optimum'],
    reducedMotionSteps: 13,
    presentation: SCRIPTED_PRESENTATION,
  },
  {
    id: 'too-many-tours',
    title: 'Too many tours',
    scene: 'factorial-wall',
    sceneOverrides: { params: demoParams(1) },
    annotations: ['demo-growth'],
    reducedMotionSteps: 6,
    presentation: SCRIPTED_PRESENTATION,
  },
  {
    id: 'one-ants-choice',
    title: 'One ant, alone',
    scene: 'one-ant',
    sceneOverrides: { params: demoParams(1) },
    annotations: ['demo-one-ant', 'demo-allowed'],
    reducedMotionSteps: 6,
    presentation: SCRIPTED_PRESENTATION,
  },
  {
    id: 'leaving-a-trace',
    title: 'Leaving a trail',
    scene: 'deposit',
    sceneOverrides: { params: demoParams(1) },
    annotations: ['demo-trail'],
    reducedMotionSteps: 4,
    presentation: guidedPlayback(1),
  },
  {
    id: 'forgetting',
    title: 'Trails fade',
    scene: 'evaporation',
    sceneOverrides: { params: demoParams(1) },
    annotations: ['demo-fade'],
    reducedMotionSteps: 4,
    presentation: guidedPlayback(3),
  },
  {
    id: 'two-ants',
    title: 'A second ant',
    scene: 'two-ants',
    sceneOverrides: { params: demoParams(2) },
    annotations: ['demo-second-ant'],
    reducedMotionSteps: 4,
    presentation: guidedPlayback(2),
  },
  {
    id: 'emergence',
    title: 'A few more ants',
    scene: 'colony',
    sceneOverrides: { params: demoParams(4) },
    annotations: ['demo-colony', 'demo-match'],
    reducedMotionSteps: 4,
    presentation: guidedPlayback(6),
  },
  {
    id: 'the-probability-rule',
    title: 'The rule behind the choice',
    scene: 'probability-rule',
    sceneOverrides: { params: demoParams(1) },
    pseudocodeLine: 4,
    annotations: ['transition-weight', 'distance-weight'],
    reducedMotionSteps: 4,
    presentation: {
      ...GUIDED_PLAYBACK_PRESENTATION,
      metrics: true,
      pseudocode: true,
    },
  },
  {
    id: 'the-update-rule',
    title: 'The rule behind the trail',
    scene: 'update-rule',
    sceneOverrides: { params: demoParams(4) },
    pseudocodeLine: 6,
    annotations: ['deposit-rule', 'update-rule'],
    reducedMotionSteps: 4,
    presentation: {
      ...GUIDED_PLAYBACK_PRESENTATION,
      metrics: true,
      pseudocode: true,
    },
  },
  {
    id: 'tuning-the-colony',
    title: 'Tuning the colony',
    scene: 'tuning',
    annotations: ['balanced-preset', 'greedy-preset', 'best-tour'],
    reducedMotionSteps: 4,
    presentation: FORMAL_PRESENTATION,
  },
  {
    id: 'when-it-fails',
    title: 'When it fails',
    scene: 'limits',
    annotations: ['local-optimum', 'heuristic-limit'],
    reducedMotionSteps: 3,
    presentation: FORMAL_PRESENTATION,
  },
  {
    id: 'the-lab',
    title: 'The lab',
    scene: 'lab',
    pseudocodeLine: 2,
    annotations: ['lab-controls', 'share-run'],
    reducedMotionSteps: 2,
    presentation: {
      metrics: true,
      pseudocode: true,
      chrome: 'full',
      lockParams: false,
    },
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
