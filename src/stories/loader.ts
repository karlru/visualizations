/**
 * Story module registry.
 *
 * The runtime must not import a concrete story. A page supplies a story key, and
 * the controller resolves the matching `StoryModule` through this registry. Each
 * entry is a dynamic import, so a story's engine, config, and renderer ship in
 * their own chunk:
 *
 * - `/dev/story-smoke` never downloads the ACO module;
 * - `/stories/ant-colony-optimization` never downloads either fixture;
 * - Phase 5 adds `randu-lcg` here without touching the controller.
 *
 * `loadStoryConfig` remains the typed fixture loader used by the existing unit
 * tests. It is deliberately separate from the slug registry: only the fixture
 * keys are valid there, while the public module registry also includes ACO.
 */

import type { SmokeMetrics, SmokeParams, SmokeSnapshot } from './dev/canvas-smoke-engine';
import type { StoryConfig } from './registry';
import type { StoryModule } from './runtime';

/** The typed config shared by the development fixture stories. */
export type FixtureStoryConfig = StoryConfig<SmokeParams, SmokeSnapshot, SmokeMetrics>;

/** Keys accepted by `loadStoryConfig`. Keep in sync with the fixture loader map. */
export const FIXTURE_STORY_KEYS = ['story-smoke', 'pulse-smoke'] as const;

export type FixtureStoryKey = (typeof FIXTURE_STORY_KEYS)[number];

/**
 * Every slug with a story module, in catalogue order.
 *
 * `randu-lcg` is intentionally absent until Phase 5: the content entry exists,
 * but the route filters on this list so it cannot render a broken story page.
 */
export const STORY_SLUGS = ['ant-colony-optimization', 'story-smoke', 'pulse-smoke'] as const;

export type StorySlug = (typeof STORY_SLUGS)[number];

const FIXTURE_LOADERS: Readonly<Record<FixtureStoryKey, () => Promise<FixtureStoryConfig>>> = {
  'story-smoke': async () => (await import('./dev/config')).devStoryConfig,
  'pulse-smoke': async () => (await import('./dev/pulse-config')).pulseStoryConfig,
};

const STORY_MODULE_LOADERS: Readonly<Record<StorySlug, () => Promise<StoryModule>>> = {
  'ant-colony-optimization': async () => (await import('./aco/module')).acoStoryModule,
  'story-smoke': async () => (await import('./dev/story-module')).devStoryModule,
  'pulse-smoke': async () => (await import('./dev/pulse-module')).pulseStoryModule,
};

export function isFixtureStoryKey(value: string): value is FixtureStoryKey {
  return (FIXTURE_STORY_KEYS as readonly string[]).includes(value);
}

/** True when the content collection slug has a runnable story module. */
export function isStorySlug(value: string): value is StorySlug {
  return (STORY_SLUGS as readonly string[]).includes(value);
}

/**
 * Load one story module by slug. The module is plain data plus factories, so it
 * is safe to import during static generation, in tests, and in the browser.
 * A mismatch between the requested slug and the exported view is an authoring
 * error, not a recoverable runtime state.
 */
export async function loadStoryModule(slug: string): Promise<StoryModule> {
  if (!isStorySlug(slug)) {
    throw new Error(`Unknown story slug "${slug}".`);
  }

  const module = await STORY_MODULE_LOADERS[slug]();
  if (module.view.slug !== slug) {
    throw new Error(`Story module "${slug}" exported slug "${module.view.slug}".`);
  }

  return module;
}

/**
 * Load one fixture config by key. This typed entry point is kept for the
 * fixture unit tests and build tooling; runtime code uses `loadStoryModule`.
 */
export async function loadStoryConfig(storyKey: string): Promise<FixtureStoryConfig> {
  if (!isFixtureStoryKey(storyKey)) {
    throw new Error(`Unknown story key "${storyKey}".`);
  }

  const config = await FIXTURE_LOADERS[storyKey]();
  if (config.slug !== storyKey) {
    throw new Error(`Story module "${storyKey}" exported slug "${config.slug}".`);
  }

  return config;
}
