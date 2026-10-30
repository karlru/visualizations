/**
 * Shared types for the story runtime's browser-test hook.
 *
 * The controller publishes `window.__storyRuntimeDebug` after hydration. It is
 * a development and acceptance-test surface, not part of the reader UI: it
 * reports the latest deterministic chapter entry and enough lifecycle detail to
 * detect leaked timers, listeners, stages, or directors.
 *
 * The entry uses the shell's primitive parameter bag rather than a concrete
 * story type, so the same hook works for the fixtures and ACO.
 */

import type { StoryParamBag } from '../../stories/runtime';

export interface StoryRuntimeEntryState {
  readonly storyKey: string;
  readonly chapter: string;
  readonly scene: string;
  readonly seed: number;
  readonly params: StoryParamBag;
  readonly structural: StoryParamBag;
  readonly steps: 0;
  readonly simulatedSeconds: 0;
  readonly sceneStep: number;
}

export interface StoryRuntimeDebugState {
  readonly storyKey: string;
  readonly status: string;
  readonly ready: boolean;
  readonly entry: StoryRuntimeEntryState | null;
  readonly entryCount: number;
  readonly chapter: string | null;
  readonly scene: string | null;
  readonly steps: number;
  readonly simulatedSeconds: number;
  readonly paused: boolean;
  readonly speed: number;
  readonly stageCount: number;
  readonly metricTimerActive: boolean;
  readonly listenersActive: boolean;
  readonly stageLive: number;
  readonly mounts: number;
}

export interface StoryRuntimeDebug {
  readonly storyKey: string;
  readonly debugState: () => StoryRuntimeDebugState;
  readonly entryState: () => StoryRuntimeEntryState | null;
}

declare global {
  interface Window {
    /** Incremented by StoryController on every mount in this document. */
    __storyRuntimeMounts?: number;
    /** Live runtime debug hook, safe to call after hydration and teardown. */
    __storyRuntimeDebug?: StoryRuntimeDebug;
    /** Incremented by StoryStage on every mount. */
    __storyStageMounts?: number;
    /** Currently mounted StoryStage instances. */
    __storyStageLive?: number;
  }
}
