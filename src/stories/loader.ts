/**
 * Story configuration loader.
 *
 * The runtime must not import a concrete story. A page supplies a story key,
 * and the controller resolves the matching `StoryConfig` through this registry.
 * Each entry is a dynamic import, so a story's engine and scene data ship in
 * their own chunk instead of the shared runtime bundle.
 *
 * The current registry is typed to the development fixture contract. Phase 2
 * and Phase 3 add the ACO and RANDU configs; Step 4.1 extends the renderer
 * factory at the same time. Adding a story here is the only runtime edit a new
 * story needs: its config module and its page carry everything else.
 */

import type { SmokeMetrics, SmokeParams, SmokeSnapshot } from './dev/canvas-smoke-engine';
import type { StoryConfig } from './registry';

/** The typed config shared by the development fixture stories. */
export type FixtureStoryConfig = StoryConfig<SmokeParams, SmokeSnapshot, SmokeMetrics>;

/** Keys accepted by `loadStoryConfig`. Keep in sync with the loader map. */
export const FIXTURE_STORY_KEYS = ['story-smoke', 'pulse-smoke'] as const;

export type FixtureStoryKey = (typeof FIXTURE_STORY_KEYS)[number];

const STORY_LOADERS: Readonly<Record<FixtureStoryKey, () => Promise<FixtureStoryConfig>>> = {
  'story-smoke': async () => (await import('./dev/config')).devStoryConfig,
  'pulse-smoke': async () => (await import('./dev/pulse-config')).pulseStoryConfig,
};

export function isFixtureStoryKey(value: string): value is FixtureStoryKey {
  return (FIXTURE_STORY_KEYS as readonly string[]).includes(value);
}

/**
 * Load one story config by key. The module itself is pure data plus an engine
 * factory, so this is safe in Node, in tests, and during static generation.
 * A mismatch between the requested key and the exported slug is an authoring
 * error, not a recoverable runtime state.
 */
export async function loadStoryConfig(storyKey: string): Promise<FixtureStoryConfig> {
  if (!isFixtureStoryKey(storyKey)) {
    throw new Error(`Unknown story key "${storyKey}".`);
  }

  const config = await STORY_LOADERS[storyKey]();
  if (config.slug !== storyKey) {
    throw new Error(`Story module "${storyKey}" exported slug "${config.slug}".`);
  }

  return config;
}
