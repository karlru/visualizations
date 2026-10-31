/**
 * Non-generic story runtime facade.
 *
 * A page (or a Svelte island) should not have to know the concrete parameter,
 * snapshot, or metrics types of a story. {@link createStoryModule} closes over
 * those types once, inside the story's own module, and exposes a serializable
 * {@link StoryModuleView} plus a {@link StoryRuntime} whose public API is typed
 * only with the primitive {@link StoryParamBag}.
 *
 * The concrete engine and renderer remain fully typed behind those closures:
 *
 * ```text
 * StoryController  →  StoryRuntime (StoryParamBag)  →  Engine<P, S, M>
 *                                                 ↘  StageRenderer<P, S>
 * ```
 *
 * All casts between the bag and a concrete `P` live in this adapter. No
 * renderer-facing signature accepts `unknown` or `any`; the only non-generic
 * boundary is `Record<string, number | boolean | string>`.
 *
 * A story module is created with `createStoryModule(config, hooks)`. The hooks
 * own the renderer factory and the low-frequency metric/structural descriptions,
 * so adding a story still means a config, a renderer hook, and a page — not a
 * controller edit (`NFR-01`).
 */

import type { Engine } from '../engines/core/types';
import type { UrlParameterSchema } from '../engines/core/url-state';
import type { CameraState, StageRenderer } from '../render/types';
import type {
  ChapterSpec,
  Preset,
  RendererId,
  SceneDefinition,
  SceneOverrides,
  StoryConfig,
} from './registry';

/** A primitive parameter value. Story parameters are flat by contract. */
export type StoryParamValue = number | boolean | string;

/**
 * The story-agnostic parameter bag used by the shell.
 *
 * Values are primitives: every release-1 story has a flat parameter object
 * (numbers, booleans, and string enums), so the bag is serializable and can
 * cross the Svelte/Astro boundary without a schema runtime.
 */
export type StoryParamBag = Readonly<Record<string, StoryParamValue>>;

/** One low-frequency metric row. Structurally compatible with `MetricItem`. */
export interface StoryMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

/**
 * Controller-owned sampling values supplied to a story's metric describer.
 * They are not engine state; they report how the fixed-step clock has advanced.
 */
export interface StoryMetricsContext {
  readonly simulatedSeconds: number;
  readonly steps: number;
}

/**
 * How the stage Speed control drives playback, in a non-generic form.
 *
 * `clock` is the development-fixture behaviour. `engine` names a presentation
 * parameter (ACO's `speed`) that the engine applies without restarting; the
 * clock then stays at 1×.
 */
export interface StorySpeedControlView {
  readonly kind: 'clock' | 'engine';
  /** Parameter written by the stage control when `kind` is `engine`. */
  readonly param?: string;
}

/**
 * Serializable description of a story. It is safe to render on the server,
 * pass as an island prop, and compare in unit tests: it contains plain data
 * only, never the engine, renderer, or a function.
 */
export interface StoryModuleView {
  readonly slug: string;
  readonly rendererId: RendererId;
  readonly defaults: StoryParamBag;
  readonly presets: readonly Preset<StoryParamBag>[];
  readonly chapters: readonly ChapterSpec<StoryParamBag>[];
  readonly scenes: Readonly<Record<string, SceneDefinition<StoryParamBag>>>;
  readonly urlParams: UrlParameterSchema<StoryParamBag>;
  readonly speedControl: StorySpeedControlView;
  /** Keys copied from the reader's parameters when a preset is applied (incl. seed). */
  readonly presetKeeps: readonly string[];
  /**
   * Which control panel the shell may render. `fixture` is the development
   * orbit/trails/presets panel; production stories get `none` until their own
   * lab step supplies a panel (ACO's lab is Step 3.5).
   */
  readonly controlPanel: 'none' | 'fixture';
  /**
   * Optional story-specific lab panel, rendered after the reader enters the
   * story's lab chapter. The shell treats the kind as opaque and the lab
   * component owns the concrete story controls.
   */
  readonly lab: 'aco' | null;
}

/** A renderer-agnostic 2D point used by the generic map overlay. */
export interface StoryMapPoint {
  readonly x: number;
  readonly y: number;
}

/** Read-only map state for one UI sample. Points are in renderer world space. */
export interface StoryMapView {
  readonly points: readonly StoryMapPoint[];
  /** True when the map came from the editor rather than the seeded generator. */
  readonly custom: boolean;
  readonly canAdd: boolean;
  readonly canRemove: boolean;
  /** World-space distance for one arrow-key nudge. */
  readonly nudgeStep: number;
}

/**
 * Generic editable-map operations.
 *
 * The concrete story converts world-space points to its own model; the shell
 * only moves `{x, y}` values and never needs engine or camera knowledge.
 */
export interface StoryMapRuntime {
  getView(): StoryMapView;
  setPoint(index: number, point: StoryMapPoint): void;
  addPoint(point?: StoryMapPoint): void;
  removePoint(index: number): void;
  reset(): void;
}

/** One convergence-history point, structurally compatible with the ACO chart. */
export interface StoryHistoryPoint {
  readonly iteration: number;
  readonly bestLength: number;
  readonly meanLength: number;
}

/** One named probability-fan candidate. */
export interface StoryFanEntryView {
  readonly city: number;
  readonly probability: number;
}

/** The generic subset of a probability fan that the ranked text list renders. */
export interface StoryFanView {
  readonly currentCity: number;
  readonly entries: readonly StoryFanEntryView[];
  readonly other: { readonly probability: number; readonly count: number };
  readonly total: number;
  readonly uniform: boolean;
}

/** One keyboard-operable camera framing preset. */
export interface StoryCameraPreset {
  readonly id: string;
  readonly label: string;
  readonly camera: CameraState;
}

/**
 * Low-frequency lab data.
 *
 * The story module computes everything here from its own snapshot, so the shell
 * and the lab component never call engine internals. The controller samples it
 * at UI frequency (chapter entry, pause, parameter change, one-second timer),
 * never once per frame.
 */
export interface StoryAuxiliaryView {
  readonly history: readonly StoryHistoryPoint[];
  readonly fan: StoryFanView | null;
  readonly tour: readonly number[] | null;
  /** A readable sentence containing the same values as the metric rows. */
  readonly summary: string;
  readonly cameraPresets: readonly StoryCameraPreset[];
  readonly map: StoryMapView | null;
  /**
   * Engine health when the story has a bounded backlog. `degraded` is true
   * only after whole iterations were dropped; the presentation can then show a
   * visible quality notice rather than pretending nothing was lost.
   */
  readonly health?: {
    readonly droppedIterations: number;
    readonly degraded: boolean;
  };
}

/** Story-specific map adapter. All engine calls stay inside the story module. */
export interface StoryMapHooks<P extends object, S, M> {
  /** Current points in renderer world space. */
  readonly read: (snapshot: Readonly<S>) => readonly StoryMapPoint[];
  /** Deterministic point for the Add action. */
  readonly suggest: (snapshot: Readonly<S>) => StoryMapPoint;
  /** Replace the map and return the concrete params after the engine resets. */
  readonly write: (engine: Engine<P, S, M>, points: readonly StoryMapPoint[]) => P;
  /** Restore the seeded map and return the concrete params after the reset. */
  readonly reset: (engine: Engine<P, S, M>) => P;
  /** True when the snapshot's map came from the editor. */
  readonly isCustom: (snapshot: Readonly<S>) => boolean;
  /** Minimum and maximum editable city counts. */
  readonly minPoints?: number;
  readonly maxPoints?: number;
  /** World-space distance for one arrow-key nudge. */
  readonly nudgeStep?: number;
}

/** A renderer facade whose camera controls mirror the concrete renderer. */
export interface StoryRendererFacade extends StageRenderer<StoryParamBag, object> {
  /** Present for renderers that support pointer/button camera control. */
  zoomBy(factor: number): void;
  /** Remove user camera offsets, when supported. */
  resetCamera(): void;
  /** Convert a client coordinate to world space, when supported. */
  screenToWorld?(clientX: number, clientY: number): StoryMapPoint | null;
  /** Project a world point to stage-local CSS pixels, when supported. */
  worldToScreen?(x: number, y: number): StoryMapPoint | null;
}

/** The non-generic runtime handed to the story shell. */
export interface StoryRuntime {
  /** Current parameter bag, including presentation parameters. */
  readonly params: StoryParamBag;
  /** Current integer seed, or 0 when the story has no seed. */
  readonly seed: number;
  /**
   * Apply a parameter patch. The engine decides whether a structural field
   * restarts the run. `reset` forces a restart after the patch.
   */
  setParams(patch: Partial<StoryParamBag>, options?: { readonly reset?: boolean }): void;
  /** Restore the run's starting state without changing parameters. */
  reset(): void;
  /** Advance one fixed substep, in simulated seconds. */
  step(deltaSeconds: number): void;
  /** Low-frequency metrics for the HUD and polite live region. */
  metrics(context: StoryMetricsContext): readonly StoryMetric[];
  /** Low-frequency lab data (history, fan, summary, camera presets, map). */
  auxiliary(): StoryAuxiliaryView | null;
  /** Editable map operations, or null for stories without a map editor. */
  map(): StoryMapRuntime | null;
  /** Structural run identity, recorded on chapter entry. */
  structural(): StoryParamBag;
  /** Cheap read-only snapshot for the active renderer. */
  snapshot(): Readonly<object>;
  /** Build a renderer for one stage mount. */
  createRenderer(): StoryRendererFacade;
  /** Release every renderer created by this runtime. Safe to call twice. */
  dispose(): void;
}

/** Story-specific hooks closed over by {@link createStoryModule}. */
export interface StoryModuleHooks<P extends object, S, M> {
  /** Build the concrete renderer. Called once per stage mount, never at import. */
  readonly createRenderer: () => StageRenderer<P, S>;
  /** Format the story's low-frequency metrics. */
  readonly describeMetrics: (input: {
    readonly params: P;
    readonly metrics: Readonly<M>;
    readonly snapshot: Readonly<S>;
    readonly context: StoryMetricsContext;
  }) => readonly StoryMetric[];
  /** Describe the run identity that chapter entry captures. */
  readonly describeStructural: (params: P) => StoryParamBag;
  /** Low-frequency lab data. Omitted means the story has no lab. */
  readonly auxiliary?: (input: {
    readonly params: P;
    readonly metrics: Readonly<M>;
    readonly snapshot: Readonly<S>;
  }) => StoryAuxiliaryView;
  /** Optional editable map adapter. */
  readonly map?: StoryMapHooks<P, S, M>;
  /** Optional story-specific lab panel kind. */
  readonly lab?: 'aco';
  /** Development-only controls panel. Omitted means no panel. */
  readonly controlPanel?: 'fixture';
}

/** A loaded story: serializable view plus a typed runtime factory. */
export interface StoryModule {
  readonly view: StoryModuleView;
  createRuntime(): StoryRuntime;
}

interface CameraControls {
  zoomBy(factor: number): void;
  resetCamera(): void;
}

function isParamValue(value: unknown): value is StoryParamValue {
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';
}

/**
 * Convert a flat parameter object into the shell's bag.
 *
 * Non-primitive values are an authoring error: a story whose parameters cannot
 * be represented in the URL contract must not silently lose fields when the
 * controller crosses the generic boundary. `undefined` entries in a partial
 * patch are skipped.
 */
export function toStoryParamBag(values: object): StoryParamBag {
  const bag: Record<string, StoryParamValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (!isParamValue(value)) {
      throw new Error(
        `Story parameter "${key}" must be a number, boolean, or string to cross the runtime boundary.`,
      );
    }
    bag[key] = value;
  }
  return Object.freeze(bag);
}

/** The one adapter cast. Values originate from defaults, presets, or validated URL state. */
function toConcreteParams<P extends object>(bag: StoryParamBag): P {
  return bag as unknown as P;
}

function convertOverrides<P extends object>(
  overrides: SceneOverrides<P>,
): SceneOverrides<StoryParamBag> {
  const { params, ...presentation } = overrides;
  return {
    ...presentation,
    ...(params === undefined ? {} : { params: toStoryParamBag(params) }),
  };
}

function convertScene<P extends object>(scene: SceneDefinition<P>): SceneDefinition<StoryParamBag> {
  const { params, ...definition } = scene;
  return {
    ...definition,
    ...(params === undefined ? {} : { params: toStoryParamBag(params) }),
  };
}

function convertChapter<P extends object>(chapter: ChapterSpec<P>): ChapterSpec<StoryParamBag> {
  const { sceneOverrides, ...rest } = chapter;
  return {
    ...rest,
    ...(sceneOverrides === undefined ? {} : { sceneOverrides: convertOverrides(sceneOverrides) }),
  };
}

function convertPreset<P extends object>(preset: Preset<P>): Preset<StoryParamBag> {
  return { ...preset, params: toStoryParamBag(preset.params) };
}

/**
 * Resolve the parameter set a preset should apply.
 *
 * Presets are relative to the story defaults, but `view.presetKeeps` (which
 * always includes `seed`) is copied from the reader's current run. This keeps a
 * preset from silently resizing an ACO map or colony, and keeps the fixture's
 * structural variant stable.
 */
export function presetParams(
  view: StoryModuleView,
  preset: Preset<StoryParamBag>,
  current: StoryParamBag,
): StoryParamBag {
  const base: Record<string, StoryParamValue> = { ...view.defaults };
  for (const [key, value] of Object.entries(preset.params)) {
    if (value !== undefined) base[key] = value;
  }
  for (const key of view.presetKeeps) {
    const value = current[key];
    if (value !== undefined) base[key] = value;
  }
  return Object.freeze(base);
}

function hasCameraControls<P extends object, S>(
  renderer: StageRenderer<P, S>,
): renderer is StageRenderer<P, S> & CameraControls {
  const candidate = renderer as StageRenderer<P, S> & Partial<CameraControls>;
  return typeof candidate.zoomBy === 'function' && typeof candidate.resetCamera === 'function';
}

interface ProjectionControls {
  screenToWorld(clientX: number, clientY: number): StoryMapPoint | null;
  worldToScreen(x: number, y: number): StoryMapPoint | null;
}

function hasProjectionControls<P extends object, S>(
  renderer: StageRenderer<P, S>,
): renderer is StageRenderer<P, S> & ProjectionControls {
  const candidate = renderer as StageRenderer<P, S> & Partial<ProjectionControls>;
  return (
    typeof candidate.screenToWorld === 'function' && typeof candidate.worldToScreen === 'function'
  );
}

/**
 * Close over a concrete story config and expose the non-generic runtime.
 *
 * The module is created at import time but does not construct an engine or
 * touch the DOM. `createRuntime()` is called once per controller mount.
 */
export function createStoryModule<P extends object, S, M>(
  config: StoryConfig<P, S, M>,
  hooks: StoryModuleHooks<P, S, M>,
): StoryModule {
  const presetKeeps = Object.freeze(
    Array.from(new Set<string>(['seed', ...(config.presetKeeps ?? [])])),
  );

  const speedControl: StorySpeedControlView =
    config.speedControl?.kind === 'engine'
      ? { kind: 'engine', param: config.speedControl.param }
      : { kind: 'clock' };

  const scenes: Record<string, SceneDefinition<StoryParamBag>> = {};
  for (const [id, scene] of Object.entries(config.scenes)) {
    scenes[id] = convertScene(scene);
  }

  const view: StoryModuleView = Object.freeze({
    slug: config.slug,
    rendererId: config.rendererId,
    defaults: toStoryParamBag(config.defaults),
    presets: Object.freeze(config.presets.map((preset) => convertPreset(preset))),
    chapters: Object.freeze(config.chapters.map((chapter) => convertChapter(chapter))),
    scenes: Object.freeze(scenes),
    // The schema carries only primitive field kinds and literal enum values;
    // it is plain data, so the bag is the same contract with a wider key type.
    urlParams: config.urlParams as unknown as UrlParameterSchema<StoryParamBag>,
    speedControl: Object.freeze(speedControl),
    presetKeeps,
    controlPanel: hooks.controlPanel ?? 'none',
    lab: hooks.lab ?? null,
  });

  return {
    view,
    createRuntime(): StoryRuntime {
      let bag = toStoryParamBag(config.defaults);
      const engine = config.createEngine(config.defaults);
      const renderers = new Set<StageRenderer<P, S>>();
      let disposed = false;

      const concrete = (): P => toConcreteParams<P>(bag);

      const setParams = (
        patch: Partial<StoryParamBag>,
        options: { readonly reset?: boolean } = {},
      ): void => {
        if (disposed) return;
        const merged: Record<string, StoryParamValue> = { ...bag };
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) continue;
          if (!isParamValue(value)) {
            throw new Error(`Story parameter "${key}" must be a primitive value.`);
          }
          merged[key] = value;
        }
        bag = Object.freeze(merged);
        engine.setParams(concrete());
        if (options.reset === true) engine.reset();
      };

      const mapHook = hooks.map;
      const mapMinPoints = mapHook?.minPoints ?? 1;
      const mapMaxPoints = mapHook?.maxPoints ?? Number.MAX_SAFE_INTEGER;
      let mapRuntime: StoryMapRuntime | null = null;

      const readMapPoints = (): readonly StoryMapPoint[] =>
        mapHook === undefined ? [] : mapHook.read(engine.snapshot());

      const commitMap = (points: readonly StoryMapPoint[]): void => {
        if (mapHook === undefined || disposed) return;
        // The story hook wraps `engine.setCities`/`engine.resetMap`; it returns
        // the concrete params after the engine's restart so the bag (including
        // the city count) stays coherent for the next structural edit.
        bag = toStoryParamBag(mapHook.write(engine, points));
      };

      const mapView = (): StoryMapView => {
        const points = readMapPoints();
        return {
          points,
          custom: mapHook === undefined ? false : mapHook.isCustom(engine.snapshot()),
          canAdd: points.length < mapMaxPoints,
          canRemove: points.length > mapMinPoints,
          nudgeStep: mapHook?.nudgeStep ?? 0.1,
        };
      };

      const ensureMap = (): StoryMapRuntime | null => {
        if (mapHook === undefined || disposed) return null;
        if (mapRuntime !== null) return mapRuntime;

        mapRuntime = {
          getView: mapView,
          setPoint(index: number, point: StoryMapPoint): void {
            if (disposed || !Number.isInteger(index)) return;
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const points = readMapPoints();
            if (index < 0 || index >= points.length) return;
            commitMap(points.map((current, position) => (position === index ? point : current)));
          },
          addPoint(point?: StoryMapPoint): void {
            if (disposed) return;
            const points = readMapPoints();
            if (points.length >= mapMaxPoints) return;
            const next = point ?? mapHook.suggest(engine.snapshot());
            if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return;
            commitMap([...points, next]);
          },
          removePoint(index: number): void {
            if (disposed || !Number.isInteger(index)) return;
            const points = readMapPoints();
            if (points.length <= mapMinPoints) return;
            if (index < 0 || index >= points.length) return;
            commitMap(points.filter((_point, position) => position !== index));
          },
          reset(): void {
            if (disposed) return;
            const next = mapHook.reset(engine);
            bag = toStoryParamBag(next);
          },
        };
        return mapRuntime;
      };

      return {
        get params(): StoryParamBag {
          return bag;
        },

        get seed(): number {
          const value = bag.seed;
          return typeof value === 'number' ? value : 0;
        },

        setParams,

        reset(): void {
          if (!disposed) engine.reset();
        },

        step(deltaSeconds: number): void {
          if (!disposed) engine.step(deltaSeconds);
        },

        metrics(context: StoryMetricsContext): readonly StoryMetric[] {
          if (disposed) return [];
          return hooks.describeMetrics({
            params: concrete(),
            metrics: engine.metrics(),
            snapshot: engine.snapshot(),
            context,
          });
        },

        auxiliary(): StoryAuxiliaryView | null {
          if (disposed || hooks.auxiliary === undefined) return null;
          return hooks.auxiliary({
            params: concrete(),
            metrics: engine.metrics(),
            snapshot: engine.snapshot(),
          });
        },

        map(): StoryMapRuntime | null {
          return ensureMap();
        },

        structural(): StoryParamBag {
          if (disposed) return Object.freeze({});
          return hooks.describeStructural(concrete());
        },

        snapshot(): Readonly<object> {
          // The snapshot type is unconstrained by the contract; every engine in
          // release 1 returns an object view.
          return engine.snapshot() as unknown as Readonly<object>;
        },

        createRenderer(): StoryRendererFacade {
          const inner = hooks.createRenderer();
          renderers.add(inner);

          return {
            mount: (container: HTMLElement) => inner.mount(container),
            resize: (width: number, height: number, dpr: number) =>
              inner.resize(width, height, dpr),
            setScene: (scene) => inner.setScene(scene),
            setParams: (next) => inner.setParams(toConcreteParams<P>(next)),
            setQuality: (quality) => {
              inner.setQuality?.(quality);
            },
            setPaused: (paused: boolean) => inner.setPaused(paused),
            // The snapshot is taken here from the typed engine rather than
            // trusting the shell's opaque object, so the renderer never sees
            // an untyped value on its real contract.
            render: (_snapshot: Readonly<object>) => {
              if (!disposed) inner.render(engine.snapshot());
            },
            zoomBy: (factor: number) => {
              if (hasCameraControls(inner)) inner.zoomBy(factor);
            },
            resetCamera: () => {
              if (hasCameraControls(inner)) inner.resetCamera();
            },
            screenToWorld: (clientX: number, clientY: number) => {
              if (hasProjectionControls(inner)) return inner.screenToWorld(clientX, clientY);
              return null;
            },
            worldToScreen: (x: number, y: number) => {
              if (hasProjectionControls(inner)) return inner.worldToScreen(x, y);
              return null;
            },
            dispose: () => {
              renderers.delete(inner);
              inner.dispose();
            },
          };
        },

        dispose(): void {
          if (disposed) return;
          disposed = true;
          for (const renderer of renderers) renderer.dispose();
          renderers.clear();
        },
      };
    },
  };
}
