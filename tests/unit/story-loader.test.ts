import { describe, expect, it } from 'vitest';
import { ACO_CHAPTERS, ACO_DEFAULTS } from '../../src/stories/aco/config';
import { acoStoryHooks } from '../../src/stories/aco/module';
import { devStoryHooks } from '../../src/stories/dev/story-module';
import {
  FIXTURE_STORY_KEYS,
  isFixtureStoryKey,
  isStorySlug,
  loadStoryConfig,
  loadStoryModule,
  STORY_SLUGS,
} from '../../src/stories/loader';
import { presetParams } from '../../src/stories/runtime';

describe('story config registry', () => {
  it('loads every registered fixture by key with a self-consistent contract', async () => {
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

describe('story module registry', () => {
  it('loads the ACO story by slug with the exact chapter/scene contract', async () => {
    const module = await loadStoryModule('ant-colony-optimization');
    const view = module.view;

    expect(view.slug).toBe('ant-colony-optimization');
    expect(view.rendererId).toBe('canvas2d');
    expect(view.defaults).toEqual(ACO_DEFAULTS);
    expect(view.chapters).toHaveLength(10);
    expect(view.chapters.map(({ id, title, scene }) => ({ id, title, scene }))).toEqual(
      ACO_CHAPTERS.map(({ id, title, scene }) => ({ id, title, scene })),
    );

    for (const chapter of view.chapters) {
      expect(view.scenes[chapter.scene], `${chapter.id} scene`).toBeDefined();
    }

    // Every ACO scene is reachable, and each is a complete scene definition.
    const usedScenes = new Set(view.chapters.map((chapter) => chapter.scene));
    expect(new Set(Object.keys(view.scenes))).toEqual(usedScenes);
    for (const scene of Object.values(view.scenes)) {
      expect(scene.camera).toBeDefined();
      expect(scene.layers.length).toBeGreaterThan(0);
    }

    expect(view.speedControl).toEqual({ kind: 'engine', param: 'speed' });
    expect(view.presetKeeps).toEqual(['seed', 'cityCount', 'antCount', 'speed']);
    expect(view.controlPanel).toBe('none');
  });

  it('keeps both development fixtures available through the module registry', async () => {
    const dev = await loadStoryModule('story-smoke');
    const pulse = await loadStoryModule('pulse-smoke');

    expect(dev.view.slug).toBe('story-smoke');
    expect(pulse.view.slug).toBe('pulse-smoke');
    expect(dev.view.chapters).toHaveLength(4);
    expect(pulse.view.chapters).toHaveLength(4);
    expect(dev.view.presetKeeps).toEqual(['seed', 'variant']);
    expect(pulse.view.presetKeeps).toEqual(['seed', 'variant']);
    expect(dev.view.controlPanel).toBe('fixture');
    expect(pulse.view.controlPanel).toBe('fixture');
    expect(dev.view.speedControl).toEqual({ kind: 'clock' });
  });

  it('exposes serializable config views for every story', async () => {
    for (const slug of STORY_SLUGS) {
      const module = await loadStoryModule(slug);
      const roundTrip = JSON.parse(JSON.stringify(module.view));

      expect(roundTrip).toEqual(module.view);
      expect(roundTrip.defaults).toEqual(module.view.defaults);
      expect(roundTrip.chapters).toHaveLength(module.view.chapters.length);
      expect(roundTrip.urlParams.chapter).toEqual({ source: 'fragment' });
    }
  });

  it('uses distinct renderer/metric hooks for ACO and the fixtures', async () => {
    expect(acoStoryHooks).not.toBe(devStoryHooks);

    const aco = await loadStoryModule('ant-colony-optimization');
    const dev = await loadStoryModule('story-smoke');
    const acoRuntime = aco.createRuntime();
    const devRuntime = dev.createRuntime();

    expect(acoRuntime.createRenderer()).not.toBe(devRuntime.createRenderer());

    const context = { simulatedSeconds: 0, steps: 0 };
    expect(acoRuntime.metrics(context).map((item) => item.id)).toEqual([
      'iteration',
      'best-length',
      'mean-length',
      'entropy',
      'ants',
      'cities',
    ]);
    expect(devRuntime.metrics(context).map((item) => item.id)).toEqual([
      'sim-time',
      'steps',
      'orbit',
      'seed',
    ]);

    acoRuntime.dispose();
    devRuntime.dispose();
  });

  it('describes ACO structural identity and applies presentation parameters live', async () => {
    const module = await loadStoryModule('ant-colony-optimization');
    const runtime = module.createRuntime();

    runtime.setParams({ cityCount: 12, antCount: 8, seed: 7 }, { reset: true });
    expect(runtime.seed).toBe(7);
    expect(runtime.structural()).toEqual({
      cityCount: 12,
      antCount: 8,
      alpha: 1,
      beta: 2,
      rho: 0.5,
    });
    expect(runtime.metrics({ simulatedSeconds: 0, steps: 0 })[0]).toEqual({
      id: 'iteration',
      label: 'Iteration',
      value: '0',
    });

    // Speed is presentation state: writing it must not restart the iteration.
    runtime.setParams({ speed: 4 });
    expect(runtime.structural()).toEqual({
      cityCount: 12,
      antCount: 8,
      alpha: 1,
      beta: 2,
      rho: 0.5,
    });
    expect(runtime.params.speed).toBe(4);

    runtime.dispose();
  });

  it('keeps declared run identity when a preset is applied', async () => {
    const aco = await loadStoryModule('ant-colony-optimization');
    const greedy = aco.view.presets.find((preset) => preset.id === 'greedy');
    expect(greedy).toBeDefined();
    if (greedy === undefined) return;

    const current = {
      ...aco.view.defaults,
      cityCount: 60,
      antCount: 12,
      speed: 4,
      seed: 7,
      alpha: 2,
      beta: 2,
      rho: 0.5,
    };
    const next = presetParams(aco.view, greedy, current);
    expect(next).toMatchObject({
      cityCount: 60,
      antCount: 12,
      speed: 4,
      seed: 7,
      alpha: 0.5,
      beta: 8,
      rho: 0.5,
    });

    const dev = await loadStoryModule('story-smoke');
    const brisk = dev.view.presets.find((preset) => preset.id === 'brisk');
    expect(brisk).toBeDefined();
    if (brisk === undefined) return;
    const devNext = presetParams(dev.view, brisk, {
      ...dev.view.defaults,
      seed: 1234,
      variant: 'spiral',
      orbit: 1.8,
    });
    expect(devNext).toMatchObject({ seed: 1234, variant: 'spiral', orbit: 1.35 });
  });

  it('keeps the RANDU placeholder out until Phase 5', async () => {
    expect(isStorySlug('randu-lcg')).toBe(false);
    expect(STORY_SLUGS).not.toContain('randu-lcg');
    await expect(loadStoryModule('randu-lcg')).rejects.toThrow('Unknown story slug');
  });
});
