/**
 * Canvas 2D implementation of the shared `StageRenderer` contract.
 *
 * Responsibilities:
 * - own a canvas and a DOM label layer inside the stage container;
 * - apply a pan/zoom/rotation camera transform;
 * - draw registered layers in `SceneState.layers` order, honouring visibility
 *   and opacity;
 * - project `SceneState.labels` into real, selectable DOM elements;
 * - resize the backing store to CSS size × capped DPR;
 * - handle horizontal-drag orbit and button zoom without ever blocking native
 *   vertical page scrolling;
 * - dispose the canvas, labels, and listeners idempotently.
 *
 * It deliberately does not own the animation loop. `StoryStage` adds the single
 * GSAP ticker callback and calls `render(snapshot)`. That keeps one driver for
 * the whole story and lets the stage pause without knowing the renderer type.
 *
 * The steady-state `draw()` path reuses one mutable frame object, one camera
 * object, one matrix, and one projected point. No arrays or style objects are
 * created per frame; debug attributes are refreshed every
 * `DEBUG_DRAW_INTERVAL` draws rather than on every frame.
 */

import type { Camera2DState, SceneLabel, SceneLayer, SceneState, StageRenderer } from '../types';
import {
  cameraMatrixInto,
  type MutableCameraMatrix,
  type MutablePoint,
  projectInto,
  projectPoint,
  unprojectPoint,
} from './camera';
import { type CanvasSize, computeCanvasSize } from './sizing';
import { type CanvasTheme, readCanvasTheme } from './theme';

/** One layer's draw callback. Registered once; called only when visible. */
export interface Canvas2DLayer<P extends object, S> {
  /** Matches `SceneLayer.id` in `SceneState.layers`. */
  readonly id: string;
  draw(frame: Canvas2DLayerFrame<P, S>): void;
}

/** Everything a layer may read while drawing one frame. */
export interface Canvas2DLayerFrame<P extends object, S> {
  readonly ctx: CanvasRenderingContext2D;
  /** Read-only engine snapshot for this frame. Do not retain it. */
  readonly snapshot: Readonly<S>;
  readonly params: P;
  /** The complete current scene (labels and highlights included). */
  readonly scene: SceneState;
  /** Effective camera after user orbit/zoom offsets. */
  readonly camera: Camera2DState;
  readonly layer: SceneLayer;
  readonly theme: CanvasTheme;
  /** Stage width in CSS pixels. */
  readonly width: number;
  /** Stage height in CSS pixels. */
  readonly height: number;
  /** Capped DPR used for the backing store. */
  readonly dpr: number;
  /** Scene reveal progress in [0, 1]. */
  readonly revealProgress: number;
  /** Highlight intensity for this layer in [0, 1]; 0 when not targeted. */
  readonly highlight: number;
}

export interface Canvas2DRendererOptions<P extends object, S> {
  readonly layers: readonly Canvas2DLayer<P, S>[];
  /** Maximum device pixel ratio. Defaults to 2. */
  readonly dprCap?: number;
  /** Set false to disable pointer orbit (for example under reduced motion). */
  readonly interactive?: boolean;
}

export interface Canvas2DRendererDebugState {
  readonly mounted: boolean;
  readonly disposed: boolean;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly draws: number;
  readonly labels: number;
  readonly layerIds: readonly string[];
  readonly camera: Camera2DState;
}

/** Attribute refreshed at this cadence instead of every frame. */
const DEBUG_DRAW_INTERVAL = 30;
/** Horizontal drag radians per CSS pixel. */
const ORBIT_RADIANS_PER_PIXEL = 0.008;
const MIN_USER_ZOOM = 0.25;
const MAX_USER_ZOOM = 4;

const IDENTITY_CAMERA: Camera2DState = {
  kind: '2d',
  panX: 0,
  panY: 0,
  zoom: 1,
  rotation: 0,
};

const EMPTY_SCENE: SceneState = {
  camera: IDENTITY_CAMERA,
  layers: [],
  highlights: [],
  revealProgress: 1,
  labels: [],
};

/** A camera object mutated once per draw, never replaced. */
class WorkingCamera implements Camera2DState {
  readonly kind = '2d' as const;
  panX = 0;
  panY = 0;
  zoom = 1;
  rotation = 0;
}

/** A frame object mutated once per draw, never replaced. */
class WorkingFrame<P extends object, S> implements Canvas2DLayerFrame<P, S> {
  ctx!: CanvasRenderingContext2D;
  snapshot!: Readonly<S>;
  params!: P;
  scene: SceneState = EMPTY_SCENE;
  camera!: Camera2DState;
  layer!: SceneLayer;
  theme!: CanvasTheme;
  width = 0;
  height = 0;
  dpr = 1;
  revealProgress = 1;
  highlight = 0;
}

interface LabelRecord {
  readonly element: HTMLDivElement;
  label: SceneLabel;
  lastX: number;
  lastY: number;
  lastAlign: SceneLabel['align'];
}

export class Canvas2DRenderer<P extends object, S> implements StageRenderer<P, S> {
  private readonly options: Canvas2DRendererOptions<P, S>;
  private readonly layersById = new Map<string, Canvas2DLayer<P, S>>();
  private readonly labels = new Map<string, LabelRecord>();
  private readonly workingCamera = new WorkingCamera();
  private readonly workingFrame = new WorkingFrame<P, S>();
  private readonly matrix: MutableCameraMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private readonly projected: MutablePoint = { x: 0, y: 0 };
  private readonly abort = new AbortController();

  private canvas: HTMLCanvasElement | null = null;
  private labelsRoot: HTMLDivElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private theme: CanvasTheme | null = null;
  private scene: SceneState = EMPTY_SCENE;
  private params: P | null = null;
  private lastSnapshot: Readonly<S> | null = null;
  private size: CanvasSize = {
    cssWidth: 0,
    cssHeight: 0,
    dpr: 1,
    pixelWidth: 0,
    pixelHeight: 0,
    capped: false,
  };

  private mounted = false;
  private disposed = false;
  private paused = false;
  private draws = 0;

  private userRotation = 0;
  private userZoom = 1;
  private labelsDirty = true;

  private dragging = false;
  private dragPointerId = -1;
  private dragLastX = 0;

  constructor(options: Canvas2DRendererOptions<P, S>) {
    this.options = options;
    for (const layer of options.layers) {
      this.layersById.set(layer.id, layer);
    }
  }

  async mount(container: HTMLElement): Promise<void> {
    if (this.disposed) {
      throw new Error('Cannot mount a disposed Canvas2DRenderer.');
    }
    if (this.mounted) return;

    // Reuse an authored stage canvas so the shell can keep a stable SSR
    // element; otherwise create one exactly as the renderer contract allows.
    const existing = container.querySelector<HTMLCanvasElement>('canvas[data-stage-canvas]');
    const canvas = existing ?? document.createElement('canvas');
    canvas.dataset.stageCanvas = 'true';
    canvas.dataset.renderer = 'canvas2d';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.display = 'block';
    canvas.style.touchAction = 'pan-y';
    if (!existing) {
      container.appendChild(canvas);
    }

    const labelsRoot = document.createElement('div');
    labelsRoot.className = 'story-stage__labels';
    labelsRoot.dataset.stageLabels = 'true';
    container.appendChild(labelsRoot);

    this.canvas = canvas;
    this.labelsRoot = labelsRoot;
    this.theme = readCanvasTheme(container);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      labelsRoot.remove();
      if (!existing) canvas.remove();
      this.canvas = null;
      this.labelsRoot = null;
      throw new Error('Canvas 2D is not available in this browser.');
    }
    this.ctx = ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (this.options.interactive !== false) {
      canvas.addEventListener('pointerdown', this.handlePointerDown, {
        signal: this.abort.signal,
      });
      canvas.addEventListener('pointermove', this.handlePointerMove, {
        signal: this.abort.signal,
      });
      canvas.addEventListener('pointerup', this.handlePointerUp, {
        signal: this.abort.signal,
      });
      canvas.addEventListener('pointercancel', this.handlePointerUp, {
        signal: this.abort.signal,
      });
      canvas.addEventListener('lostpointercapture', this.handlePointerUp, {
        signal: this.abort.signal,
      });
    }

    this.mounted = true;
    this.applySceneCamera();
    this.syncLabelElements();
    this.updateLabels(true);
    this.syncDebugAttributes();
  }

  resize(width: number, height: number, dpr: number): void {
    if (this.disposed) return;
    this.size = computeCanvasSize(width, height, this.options.dprCap ?? 2, dpr);

    const canvas = this.canvas;
    if (!canvas) return;

    if (this.size.pixelWidth === 0 || this.size.pixelHeight === 0) {
      // A hidden or detached stage can legitimately report 0×0. Keep the
      // attributes coherent and skip the context work instead of throwing.
      canvas.width = 0;
      canvas.height = 0;
      canvas.dataset.cssWidth = '0';
      canvas.dataset.cssHeight = '0';
      canvas.dataset.pixelWidth = '0';
      canvas.dataset.pixelHeight = '0';
      canvas.dataset.dpr = String(this.size.dpr);
      this.labelsDirty = true;
      return;
    }

    canvas.width = this.size.pixelWidth;
    canvas.height = this.size.pixelHeight;
    canvas.style.width = `${this.size.cssWidth}px`;
    canvas.style.height = `${this.size.cssHeight}px`;
    canvas.dataset.cssWidth = String(this.size.cssWidth);
    canvas.dataset.cssHeight = String(this.size.cssHeight);
    canvas.dataset.pixelWidth = String(this.size.pixelWidth);
    canvas.dataset.pixelHeight = String(this.size.pixelHeight);
    canvas.dataset.dpr = String(this.size.dpr);
    canvas.dataset.dprCapped = String(this.size.capped);

    const ctx = this.ctx;
    if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.labelsDirty = true;
    this.updateLabels(true);
    this.syncDebugAttributes();
  }

  setScene(scene: SceneState): void {
    if (this.disposed) return;
    this.scene = scene;
    this.applySceneCamera();
    this.syncLabelElements();
    this.updateLabels(true);
    this.syncDebugAttributes();
  }

  setParams(params: P): void {
    if (this.disposed) return;
    this.params = params;
  }

  setPaused(paused: boolean): void {
    if (this.disposed) return;
    this.paused = paused;
    if (this.canvas) {
      this.canvas.dataset.paused = String(paused);
    }
  }

  render(snapshot: Readonly<S>): void {
    if (this.disposed || this.ctx === null) return;
    this.lastSnapshot = snapshot;
    this.draw();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mounted = false;
    this.abort.abort();

    for (const record of this.labels.values()) {
      record.element.remove();
    }
    this.labels.clear();
    this.labelsRoot?.remove();
    this.labelsRoot = null;

    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.theme = null;
    this.lastSnapshot = null;
    this.params = null;
    this.scene = EMPTY_SCENE;
  }

  // ── Interaction ────────────────────────────────────────────────────────

  /**
   * Zoom around the stage centre. The story shell exposes this through zoom
   * buttons so camera control is available to a single pointer and keyboard
   * users without a drag gesture.
   */
  zoomBy(factor: number): void {
    if (this.disposed || !Number.isFinite(factor) || factor <= 0) return;
    this.userZoom = Math.max(MIN_USER_ZOOM, Math.min(MAX_USER_ZOOM, this.userZoom * factor));
    this.applySceneCamera();
    this.labelsDirty = true;
    this.updateLabels(true);
    this.drawLastFrame();
    this.syncDebugAttributes();
  }

  /** Remove user orbit/zoom offsets. Scene camera values are untouched. */
  resetCamera(): void {
    if (this.disposed) return;
    this.userRotation = 0;
    this.userZoom = 1;
    this.applySceneCamera();
    this.labelsDirty = true;
    this.updateLabels(true);
    this.drawLastFrame();
    this.syncDebugAttributes();
  }

  /**
   * Convert a client coordinate to world space using the live camera.
   *
   * This is the generic hook the lab's map overlay uses to drag cities without
   * duplicating the camera math in a Svelte component. It returns stage-local
   * world coordinates; the overlay only cares that the renderer and the camera
   * agree.
   */
  screenToWorld(
    clientX: number,
    clientY: number,
  ): { readonly x: number; readonly y: number } | null {
    if (this.disposed || this.canvas === null) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.applySceneCamera();
    return unprojectPoint(
      this.workingCamera,
      rect.width,
      rect.height,
      clientX - rect.left,
      clientY - rect.top,
    );
  }

  /** Project a world-space point to stage-local CSS pixels. */
  worldToScreen(x: number, y: number): { readonly x: number; readonly y: number } | null {
    if (this.disposed || this.canvas === null) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.applySceneCamera();
    return projectPoint(this.workingCamera, rect.width, rect.height, x, y);
  }

  debugState(): Canvas2DRendererDebugState {
    return {
      mounted: this.mounted,
      disposed: this.disposed,
      width: this.size.cssWidth,
      height: this.size.cssHeight,
      dpr: this.size.dpr,
      draws: this.draws,
      labels: this.labels.size,
      layerIds: this.options.layers.map((layer) => layer.id),
      camera: {
        kind: '2d',
        panX: this.workingCamera.panX,
        panY: this.workingCamera.panY,
        zoom: this.workingCamera.zoom,
        rotation: this.workingCamera.rotation,
      },
    };
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.disposed || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.dragging = true;
    this.dragPointerId = event.pointerId;
    this.dragLastX = event.clientX;
    try {
      this.canvas?.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic or already-released pointer cannot be captured; dragging
      // still works while the pointer stays over the canvas.
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.dragPointerId) return;

    const dx = event.clientX - this.dragLastX;
    this.dragLastX = event.clientX;
    // Only horizontal motion orbits. Vertical motion is left entirely to the
    // browser: `touch-action: pan-y` keeps the page's native scroll intact.
    if (dx === 0) return;

    this.userRotation += dx * ORBIT_RADIANS_PER_PIXEL;
    this.applySceneCamera();
    this.labelsDirty = true;
    this.updateLabels(true);
    this.drawLastFrame();
    this.syncDebugAttributes();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.dragPointerId = -1;
    try {
      this.canvas?.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released; nothing to do.
    }
  };

  // ── Drawing ────────────────────────────────────────────────────────────

  private drawLastFrame(): void {
    if (this.lastSnapshot !== null) this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const theme = this.theme;
    const snapshot = this.lastSnapshot;
    const params = this.params;
    if (!ctx || !canvas || !theme || snapshot === null || params === null) return;
    if (this.size.pixelWidth === 0 || this.size.pixelHeight === 0) return;

    const { cssWidth, cssHeight, dpr } = this.size;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.stage;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    cameraMatrixInto(this.workingCamera, cssWidth, cssHeight, dpr, this.matrix);

    const frame = this.workingFrame;
    frame.ctx = ctx;
    frame.snapshot = snapshot;
    frame.params = params;
    frame.scene = this.scene;
    frame.camera = this.workingCamera;
    frame.theme = theme;
    frame.width = cssWidth;
    frame.height = cssHeight;
    frame.dpr = dpr;
    frame.revealProgress = Math.max(0, Math.min(1, this.scene.revealProgress));

    const layers = this.scene.layers;
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      if (layer === undefined || !layer.visible || layer.opacity <= 0) continue;

      const registered = this.layersById.get(layer.id);
      if (registered === undefined) continue;

      frame.layer = layer;
      frame.highlight = this.highlightFor(layer.id);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
      ctx.setTransform(
        this.matrix.a,
        this.matrix.b,
        this.matrix.c,
        this.matrix.d,
        this.matrix.e,
        this.matrix.f,
      );
      registered.draw(frame);
      ctx.restore();
    }

    if (this.labelsDirty) {
      this.updateLabels(false);
      this.labelsDirty = false;
    }

    this.draws += 1;
    if (this.draws === 1 || this.draws % DEBUG_DRAW_INTERVAL === 0) {
      this.syncDebugAttributes();
    }
  }

  private highlightFor(layerId: string): number {
    let intensity = 0;
    const highlights = this.scene.highlights;
    for (let index = 0; index < highlights.length; index += 1) {
      const highlight = highlights[index];
      if (highlight === undefined) continue;
      if (highlight.layerId === layerId || highlight.id === layerId) {
        intensity = Math.max(intensity, Math.max(0, Math.min(1, highlight.intensity ?? 1)));
      }
    }
    return intensity;
  }

  private applySceneCamera(): void {
    const sceneCamera = this.scene.camera.kind === '2d' ? this.scene.camera : IDENTITY_CAMERA;
    this.workingCamera.panX = sceneCamera.panX;
    this.workingCamera.panY = sceneCamera.panY;
    this.workingCamera.zoom = sceneCamera.zoom * this.userZoom;
    this.workingCamera.rotation = (sceneCamera.rotation ?? 0) + this.userRotation;
  }

  // ── DOM labels ─────────────────────────────────────────────────────────

  private syncLabelElements(): void {
    const root = this.labelsRoot;
    if (!root) return;

    const seen = new Set<string>();
    for (const label of this.scene.labels) {
      seen.add(label.id);
      let record = this.labels.get(label.id);
      if (record === undefined) {
        const element = document.createElement('div');
        element.className = 'story-label';
        element.dataset.labelId = label.id;
        root.appendChild(element);
        record = {
          element,
          label,
          lastX: Number.NaN,
          lastY: Number.NaN,
          lastAlign: label.align,
        };
        this.labels.set(label.id, record);
      }

      if (record.element.textContent !== label.text) {
        record.element.textContent = label.text;
      }
      record.label = label;
      record.element.dataset.align = label.align ?? 'start';
      record.element.hidden = label.anchor.space === 'world3d';
      if (label.priority !== undefined) {
        record.element.style.zIndex = String(label.priority);
      }
    }

    for (const [id, record] of this.labels) {
      if (!seen.has(id)) {
        record.element.remove();
        this.labels.delete(id);
      }
    }
    this.labelsDirty = true;
  }

  /**
   * Project labels to stage-local CSS pixels. The DOM text is never painted
   * into the canvas. Updates are skipped while the camera and anchors are
   * unchanged, which keeps `transform` string allocation out of the steady
   * state draw path.
   */
  private updateLabels(force: boolean): void {
    const root = this.labelsRoot;
    if (!root) return;

    this.applySceneCamera();
    const width = this.size.cssWidth;
    const height = this.size.cssHeight;
    const camera = this.workingCamera;

    for (const record of this.labels.values()) {
      const label = record.label;
      const anchor = label.anchor;
      if (anchor.space === 'world3d') {
        record.element.hidden = true;
        continue;
      }

      let x = anchor.x;
      let y = anchor.y;
      if (anchor.space === 'world2d') {
        projectInto(camera, width, height, anchor.x, anchor.y, this.projected);
        x = this.projected.x;
        y = this.projected.y;
      }
      record.element.hidden = false;

      const offsetX = label.offset?.x ?? 0;
      const offsetY = label.offset?.y ?? 0;
      const align = label.align ?? 'start';
      const shift = align === 'center' ? -50 : align === 'end' ? -100 : 0;

      const moved =
        force ||
        record.lastX !== x ||
        record.lastY !== y ||
        record.lastAlign !== align ||
        !Number.isFinite(record.lastX);
      if (!moved) continue;

      record.element.style.transform = `translate3d(${x + offsetX}px, ${y + offsetY}px, 0) translateX(${shift}%)`;
      record.lastX = x;
      record.lastY = y;
      record.lastAlign = align;
    }
    this.labelsDirty = false;
  }

  private syncDebugAttributes(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.dataset.draws = String(this.draws);
    canvas.dataset.labels = String(this.labels.size);
    canvas.dataset.cameraRotation = this.workingCamera.rotation.toFixed(4);
    canvas.dataset.cameraZoom = this.workingCamera.zoom.toFixed(4);
    canvas.dataset.panX = this.workingCamera.panX.toFixed(4);
    canvas.dataset.panY = this.workingCamera.panY.toFixed(4);
    canvas.dataset.paused = String(this.paused);
  }
}
