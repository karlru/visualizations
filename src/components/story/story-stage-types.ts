/**
 * Public handle returned by the stage once the renderer has mounted.
 *
 * The handle keeps the shell renderer-agnostic: camera controls are only
 * exposed when the renderer implements them, and the debug snapshot contains
 * stage-owned lifecycle facts rather than renderer internals.
 */

export interface StoryStageDebugState {
  readonly status: 'pending' | 'ready' | 'error' | 'destroyed';
  readonly frames: number;
  readonly paused: boolean;
  readonly pauseReason: 'pending' | 'reader' | 'offscreen' | 'hidden' | 'running';
  readonly visible: boolean;
  readonly hidden: boolean;
  readonly dprCap: number;
}

export interface StoryStagePoint {
  readonly x: number;
  readonly y: number;
}

export interface StoryStageHandle {
  /** Multiply the renderer's user zoom, if it supports camera control. */
  zoomBy(factor: number): void;
  /** Remove user pan/orbit/zoom offsets. */
  resetCamera(): void;
  /** Convert a client coordinate to world space, or null when unsupported. */
  screenToWorld(clientX: number, clientY: number): StoryStagePoint | null;
  /** Project a world point to stage-local CSS pixels, or null when unsupported. */
  worldToScreen(x: number, y: number): StoryStagePoint | null;
  /** Repaint the last snapshot without advancing simulation time. */
  redraw(): void;
  /** Tear down the renderer, observers, listeners, and ticker callback. */
  dispose(): void;
  debugState(): StoryStageDebugState;
}
