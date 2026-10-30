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
import type { CameraState, HighlightTarget, SceneLabel, SceneLayer } from '../render/types';

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

interface UrlParamBase<P extends object, K extends keyof P & string> {
  /** Parameter key in the story's typed parameter object. */
  readonly key: K;
  /** Query-string field name. The chapter is always the fragment, not a query. */
  readonly query: string;
  /** Structural changes restart the run at iteration 0; others apply live. */
  readonly structural: boolean;
  /** Human-readable name for notices such as "adjusted to X". */
  readonly label?: string;
}

export interface IntegerUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'integer';
  readonly min: number;
  readonly max: number;
}

export interface NumberUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'number';
  readonly min: number;
  readonly max: number;
  readonly step?: number;
}

export interface EnumUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'enum';
  readonly values: readonly P[K][];
}

export interface BooleanUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'boolean';
}

export interface StringUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'string';
}

/**
 * One declared URL field. The union is keyed by the parameter object, so a
 * spec cannot reference a parameter that does not exist; the value kind follows
 * the parameter's TypeScript type. Defaults live in `StoryConfig.defaults`, so
 * there is one source of truth for a run's starting values.
 *
 * Step 1.8 consumes these specs to serialize, parse, validate, and clamp.
 */
export type UrlParamSpec<P extends object> = {
  [K in keyof P & string]:
    | (P[K] extends number
        ? IntegerUrlParam<P, K> | NumberUrlParam<P, K> | EnumUrlParam<P, K>
        : never)
    | (P[K] extends string ? EnumUrlParam<P, K> | StringUrlParam<P, K> : never)
    | (P[K] extends boolean ? BooleanUrlParam<P, K> : never);
}[keyof P & string];

/**
 * The story's URL contract: query parameters plus the canonical chapter
 * fragment. The slug is a path segment supplied by `StoryConfig.slug`.
 */
export interface UrlParameterSchema<P extends object> {
  readonly params: readonly UrlParamSpec<P>[];
  readonly chapter: { readonly source: 'fragment' };
}

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
