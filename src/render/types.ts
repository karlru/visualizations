/**
 * Renderer-facing contracts.
 *
 * Renderers may import rendering libraries (Canvas 2D, Three.js) and browser
 * APIs, but never Svelte components. Both renderers implement the same
 * `StageRenderer` contract so the story shell does not know which one is
 * active.
 *
 * Labels and annotations are DOM overlays, never text drawn into a canvas or
 * WebGL scene. A renderer receives the complete label set through
 * `SceneState`, registers/updates its DOM overlay elements, and removes them on
 * dispose. There is deliberately no separate `setLabels` method: labels are
 * part of the scene, so every `setScene` call is the single source of truth.
 */

import type { Vec3 } from '../engines/core/types';

/**
 * 2D camera.
 *
 * `panX`/`panY` identify the world-space point at the centre of the stage and
 * `zoom` is CSS pixels per world unit. Before optional rotation, a world point
 * projects to `((x - panX) * zoom, (y - panY) * zoom)` relative to the stage
 * centre. `rotation` is in radians, positive counter-clockwise.
 */
export interface Camera2DState {
  readonly kind: '2d';
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly rotation?: number;
}

/**
 * 3D camera pose. `fov` is the vertical field of view in degrees. The pose is
 * absolute, so a camera director can interpolate between poses without reading
 * renderer-specific orbit state.
 */
export interface Camera3DState {
  readonly kind: '3d';
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fov: number;
}

export type CameraState = Camera2DState | Camera3DState;

/**
 * Where a DOM label attaches.
 *
 * - `screen`: stage-local CSS pixels, origin at the top-left of the stage.
 * - `world2d`: scene coordinates in the active 2D camera's world space.
 * - `world3d`: world coordinates in the active 3D scene.
 *
 * Renderers project world anchors to screen space; this union is the complete
 * renderer-agnostic anchor model for both stories.
 */
export type LabelAnchor =
  | { readonly space: 'screen'; readonly x: number; readonly y: number }
  | { readonly space: 'world2d'; readonly x: number; readonly y: number }
  | { readonly space: 'world3d'; readonly position: Vec3 };

/**
 * A label rendered as a positioned DOM element over the stage.
 *
 * `offset` is in CSS pixels from the projected anchor. `priority` breaks
 * collision ties; higher values win. Text must remain selectable and available
 * to assistive technology, so it is never painted into the drawing surface.
 */
export interface SceneLabel {
  readonly id: string;
  readonly text: string;
  readonly anchor: LabelAnchor;
  readonly offset?: { readonly x: number; readonly y: number };
  readonly align?: 'start' | 'center' | 'end';
  readonly priority?: number;
}

/**
 * One layer in draw order. Layers are listed back to front; a later entry
 * paints over an earlier one. `opacity` is in [0, 1]; hidden layers may be
 * omitted from rendering entirely.
 */
export interface SceneLayer {
  readonly id: string;
  readonly visible: boolean;
  readonly opacity: number;
}

/**
 * A renderer-agnostic highlight request. `layerId` narrows the target to a
 * layer; `intensity` is in [0, 1] and defaults to 1.
 */
export interface HighlightTarget {
  readonly id: string;
  readonly layerId?: string;
  readonly intensity?: number;
}

/**
 * Everything a renderer needs to present one scene, independent of whether the
 * active renderer is Canvas 2D or Three.js.
 *
 * Scroll and chapter changes produce new `SceneState` values that interpolate
 * presentation only: camera, layer opacity, highlight intensity, reveal
 * progress, and labels. They never mutate engine parameters.
 */
export interface SceneState {
  readonly camera: CameraState;
  /** Back-to-front draw order. */
  readonly layers: readonly SceneLayer[];
  readonly highlights: readonly HighlightTarget[];
  /** Progressive reveal in [0, 1]; 1 shows the complete scene. */
  readonly revealProgress: number;
  readonly labels: readonly SceneLabel[];
}

/**
 * The shared renderer contract.
 *
 * @typeParam P - The story's typed parameter object. It is passed through
 *   unchanged; no renderer-facing signature accepts `unknown` or `any`.
 * @typeParam S - The engine's render snapshot type.
 */
export interface StageRenderer<P extends object, S> {
  /**
   * Attach the renderer to a stage container and resolve when it can accept
   * scenes and frames.
   *
   * The host calls this only after the container exists in the DOM. Importing
   * a renderer module must never mount anything, so static generation never
   * evaluates canvas or WebGL code. Implementations append their own canvas
   * and DOM label layer to `container` and must not replace sibling content.
   */
  mount(container: HTMLElement): Promise<void>;

  /**
   * Resize the drawing surface.
   *
   * @param width CSS pixels.
   * @param height CSS pixels.
   * @param dpr Device pixel ratio already capped by the story host. The
   *   renderer sizes its backing store as CSS size × dpr.
   */
  resize(width: number, height: number, dpr: number): void;

  /**
   * Apply the latest scene: camera, layers, highlights, reveal progress, and
   * DOM labels. Called on chapter entry and as presentation values interpolate.
   */
  setScene(scene: SceneState): void;

  /**
   * Apply the story's typed parameters. Renderers read only presentation
   * fields; the engine remains the owner of simulation state.
   */
  setParams(params: P): void;

  /**
   * Pause or resume visual animation. The last frame remains visible. Pausing
   * simulation time is the controller's responsibility and is applied through
   * the clock and engine.
   */
  setPaused(paused: boolean): void;

  /**
   * Draw one frame from a read-only engine snapshot.
   *
   * The snapshot may reuse internal buffers. Renderers must not mutate it or
   * retain mutable references past the call unless the engine documents the
   * buffer as stable and read-only.
   */
  render(snapshot: Readonly<S>): void;

  /**
   * Remove the canvas, DOM labels, observers, listeners, geometries, materials,
   * textures, and GPU context. Must be safe to call more than once.
   */
  dispose(): void;
}
