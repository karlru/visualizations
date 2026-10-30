import { describe, expect, it } from 'vitest';
import { FIXTURE_STORY_KEYS, isFixtureStoryKey, loadStoryConfig } from '../../src/stories/loader';

describe('story config registry', () => {
  it('loads every registered story by key with a self-consistent contract', async () => {
    for (const key of FIXTURE_STORY_KEYS) {
      const config = await loadStoryConfig(key);

      expect(config.slug).toBe(key);
      expect(config.chapters.length).toBeGreaterThanOrEqual(4);
      expect(config.rendererId).toBe('canvas2d');
      expect(config.defaults.seed).toEqual(expect.any(Number));

      const chapterIds = config.chapters.map((chapter) => chapter.id);
      expect(new Set(chapterIds).size).toBe(chapterIds.length);

      for (const chapter of config.chapters) {
        expect(config.scenes[chapter.scene], `${key}: ${chapter.id} scene`).toBeDefined();
      }

      // Every scene is reachable from at least one chapter, so the chapter↔scene
      // map has no orphan that a deep link could never activate.
      const usedScenes = new Set(config.chapters.map((chapter) => chapter.scene));
      for (const sceneId of Object.keys(config.scenes)) {
        expect(usedScenes.has(sceneId), `${key}: scene ${sceneId} is used`).toBe(true);
      }
    }
  });

  it('loads a different engine for each story without editing the controller', async () => {
    const primary = await loadStoryConfig('story-smoke');
    const secondary = await loadStoryConfig('pulse-smoke');

    expect(primary).not.toBe(secondary);
    expect(primary.defaults).not.toEqual(secondary.defaults);

    const primaryEngine = primary.createEngine(primary.defaults);
    const secondaryEngine = secondary.createEngine(secondary.defaults);
    for (let step = 0; step < 20; step += 1) {
      primaryEngine.step(1 / 60);
      secondaryEngine.step(1 / 60);
    }

    expect(primaryEngine.snapshot().phase).not.toBeCloseTo(secondaryEngine.snapshot().phase, 3);
  });

  it('rejects an unknown story key instead of silently loading a default', async () => {
    expect(isFixtureStoryKey('story-smoke')).toBe(true);
    expect(isFixtureStoryKey('not-a-story')).toBe(false);
    await expect(loadStoryConfig('not-a-story')).rejects.toThrow('Unknown story key');
  });
});
