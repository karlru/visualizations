/**
 * Story configuration contracts.
 *
 * A story config is declarative data plus an engine factory. Importing this
 * module or a concrete config must not touch the DOM, register global state, or
 * import a renderer; renderers are selected later by `rendererId` and loaded
 * dynamically (Step 4.1). This keeps configs importable in Node for unit tests,
 * URL-state tests, and build-time figures.
 */

import type { Engine } from '../engines/core/types';
import type { UrlParameterSchema } from '../engines/core/url-state';
import type { CameraState, HighlightTarget, SceneLabel, SceneLayer } from '../render/types';

/**
 * URL parameter contracts live beside the engine URL-state implementation so
 * the pure parser can use them without importing story configuration. They are
 * re-exported here because a `StoryConfig` is their public authoring surface.
 */
export type {
  BooleanUrlParam,
  EnumUrlParam,
  IntegerUrlParam,
  NumberUrlParam,
  StringUrlParam,
  UrlParameterSchema,
  UrlParamSpec,
} from '../engines/core/url-state';

/**
 * Renderer ids known to release 1. Any string is accepted so a future renderer
 * can be registered without changing this contract; the literal union remains
 * for editor completion and typo resistance.
 */
export const KNOWN_RENDERER_IDS = ['canvas2d', 'three'] as const;

export type KnownRendererId = (typeof KNOWN_RENDERER_IDS)[number];

export type RendererId = KnownRendererId | (string & Record<never, never>);

/** A scene id is the key in `StoryConfig.scenes` and the target of a chapter. */
export type SceneId = string;

/** Build an engine for a run. The factory must be pure and DOM-free. */
export type EngineFactory<P extends object, S, M> = (params: P) => Engine<P, S, M>;

/**
 * Presentation and parameter values that a chapter may override on top of a
 * named scene. Every field is optional and typed against the story's params.
 */
export interface SceneOverrides<P extends object> {
  readonly camera?: CameraState;
  readonly layers?: readonly SceneLayer[];
  readonly highlights?: readonly HighlightTarget[];
  readonly revealProgress?: number;
  readonly labels?: readonly SceneLabel[];
  readonly params?: Partial<P>;
}

/**
 * A complete scene. Camera and layers are required because every chapter must
 * declare a coherent visual state; optional fields fall back to sensible empty
 * values when the controller composes a `SceneState`.
 */
export type SceneDefinition<P extends object> = SceneOverrides<P> & {
  readonly id: SceneId;
  readonly camera: CameraState;
  readonly layers: readonly SceneLayer[];
};

/** A named parameter set. Presets may override only the parameters they own. */
export interface Preset<P extends object> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly params: Partial<P>;
}

/**
 * A narrative chapter and the scene it activates.
 *
 * `scene` names an entry in `StoryConfig.scenes`; `sceneOverrides` narrows that
 * scene for this chapter. Annotation ids resolve through the story's annotation
 * catalogue. `reducedMotionSteps` is the number of deterministic keyframes a
 * reader can step through when motion is reduced. `tourAct` selects an act in a
 * guided camera tour.
 */
export interface ChapterSpec<P extends object> {
  readonly id: string;
  readonly title: string;
  readonly scene: SceneId;
  readonly sceneOverrides?: SceneOverrides<P>;
  readonly pseudocodeLine?: number;
  readonly annotations?: readonly string[];
  readonly reducedMotionSteps?: number;
  readonly tourAct?: number;
}

/**
 * How the stage Speed control drives playback.
 *
 * - `clock` (the default when omitted) keeps the existing development
 *   behaviour: the control writes the fixed-step clock's playback rate and the
 *   engine's presentation multiplier stays at its parameter value.
 * - `engine` hands the control to a presentation parameter instead. The clock
 *   stays at 1× and the control writes `params[param]`, which the engine applies
 *   without restarting the run. This avoids applying the multiplier twice.
 *
 * ACO uses `engine` so its `speed` URL parameter (0.5×/1×/2×/4×) is the single
 * source of presentation rate. `clock` remains the fallback for stories whose
 * `speed` parameter means something else or does not exist, so existing configs
 * need no change.
 */
export type SpeedControl<P extends object> =
  | { readonly kind: 'clock' }
  | { readonly kind: 'engine'; readonly param: keyof P & string };

/**
 * Complete runtime description of a story.
 *
 * `defaults` is the sole source of starting parameter values. `presets` apply
 * partial overrides to it. `scenes` and `chapters` are keyed by id so the
 * controller can resolve chapter entry, deep links, and the chapter↔scene
 * invariant without scanning renderer code.
 */
export interface StoryConfig<P extends object, S, M> {
  readonly slug: string;
  readonly rendererId: RendererId;
  readonly createEngine: EngineFactory<P, S, M>;
  readonly defaults: P;
  readonly presets: readonly Preset<P>[];
  readonly scenes: Readonly<Record<SceneId, SceneDefinition<P>>>;
  readonly chapters: readonly ChapterSpec<P>[];
  readonly urlParams: UrlParameterSchema<P>;
  /**
   * Speed-control wiring. Omitted means `{ kind: 'clock' }`.
   */
  readonly speedControl?: SpeedControl<P>;
  /**
   * Extra parameters a preset must not overwrite. The seed is always preserved,
   * because it is the run's identity rather than a presentation choice.
   *
   * A preset is relative to the story defaults; these keys are copied from the
   * reader's current parameters instead. For the development fixtures that is
   * the structural `variant`; for ACO it is the map/colony shape and the stage
   * speed, so choosing "greedy" changes α/β without silently resizing the map.
   */
  readonly presetKeeps?: readonly (keyof P & string)[];
}

/**
 * Identity helper that preserves inference for concrete story configs while
 * checking them against `StoryConfig`. Pure: it performs no registration or
 * side effects.
 */
export function defineStoryConfig<P extends object, S, M>(
  config: StoryConfig<P, S, M>,
): StoryConfig<P, S, M> {
  return config;
}
