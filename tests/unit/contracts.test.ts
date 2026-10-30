import { describe, expect, it } from 'vitest';
import type { Engine } from '../../src/engines/core/types';
import type { SceneLabel, SceneState, StageRenderer } from '../../src/render/types';
import { defineStoryConfig, type StoryConfig } from '../../src/stories/registry';

/**
 * Contract smoke tests. These are intentionally small implementations: they
 * prove the interfaces are implementable, that a 3D pose and DOM labels fit the
 * same scene model as a 2D camera, and that parameter typing survives both the
 * engine and renderer boundaries.
 */

interface DummyParams {
  speed: number;
  label: string;
}

interface DummySnapshot {
  readonly tick: number;
  readonly label: string;
}

interface DummyMetrics {
  readonly ticks: number;
}

class DummyEngine implements Engine<DummyParams, DummySnapshot, DummyMetrics> {
  private params: DummyParams;
  private tick = 0;

  constructor(params: DummyParams) {
    this.params = params;
  }

  reset(): void {
    this.tick = 0;
  }

  setParams(params: DummyParams): void {
    this.params = params;
  }

  step(dtSeconds: number): void {
    this.tick += dtSeconds;
  }

  snapshot(): Readonly<DummySnapshot> {
    return { tick: this.tick, label: this.params.label };
  }

  metrics(): Readonly<DummyMetrics> {
    return { ticks: this.tick };
  }
}

class DummyRenderer implements StageRenderer<DummyParams, DummySnapshot> {
  mounted = false;
  disposed = false;
  paused = false;
  scene: SceneState | null = null;
  params: DummyParams | null = null;
  snapshot: Readonly<DummySnapshot> | null = null;
  size: { width: number; height: number; dpr: number } | null = null;

  mount(_container: HTMLElement): Promise<void> {
    this.mounted = true;
    return Promise.resolve();
  }

  resize(width: number, height: number, dpr: number): void {
    this.size = { width, height, dpr };
  }

  setScene(scene: SceneState): void {
    this.scene = scene;
  }

  setParams(params: DummyParams): void {
    this.params = params;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  render(snapshot: Readonly<DummySnapshot>): void {
    this.snapshot = snapshot;
  }

  dispose(): void {
    this.disposed = true;
  }
}

class FakeThreeRenderer extends DummyRenderer {
  readonly labels = new Map<string, SceneLabel>();

  override setScene(scene: SceneState): void {
    super.setScene(scene);
    this.labels.clear();
    for (const label of scene.labels) {
      this.labels.set(label.id, label);
    }
  }
}

const layers = [
  { id: 'graph', visible: true, opacity: 1 },
  { id: 'pheromone', visible: true, opacity: 0.4 },
] as const;

const scene2d = {
  camera: { kind: '2d', panX: 4, panY: 2, zoom: 1.5, rotation: 0.1 },
  layers,
  highlights: [{ id: 'city-3', layerId: 'graph', intensity: 0.8 }],
  revealProgress: 0.5,
  labels: [
    {
      id: 'focal-city',
      text: 'City 3',
      anchor: { space: 'world2d', x: 10, y: 20 },
    },
  ],
} satisfies SceneState;

const scene3d = {
  camera: {
    kind: '3d',
    position: { x: 1, y: 1, z: 1 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fov: 45,
  },
  layers: [
    { id: 'point-cloud', visible: true, opacity: 0.9 },
    { id: 'planes', visible: true, opacity: 0.35 },
  ],
  highlights: [{ id: 'plane-4', layerId: 'planes' }],
  revealProgress: 1,
  labels: [
    {
      id: 'plane-normal',
      text: '9x − 6y + z = k·2³¹',
      anchor: { space: 'world3d', position: { x: 0.5, y: 0.5, z: 0.5 } },
    },
    {
      id: 'hud',
      text: '15 planes',
      anchor: { space: 'screen', x: 16, y: 16 },
    },
  ],
} satisfies SceneState;

const dummyConfig: StoryConfig<DummyParams, DummySnapshot, DummyMetrics> = {
  slug: 'contract-smoke',
  rendererId: 'canvas2d',
  createEngine: (params) => new DummyEngine(params),
  defaults: { speed: 1, label: 'default' },
  presets: [{ id: 'fast', label: 'Fast', description: 'A faster run', params: { speed: 2 } }],
  scenes: {
    overview: {
      id: 'overview',
      camera: scene2d.camera,
      layers: scene2d.layers,
      labels: scene2d.labels,
    },
  },
  chapters: [
    {
      id: 'one',
      title: 'The first idea',
      scene: 'overview',
      pseudocodeLine: 3,
      annotations: ['focal-city'],
      reducedMotionSteps: 3,
      tourAct: 1,
    },
  ],
  urlParams: {
    params: [
      {
        kind: 'number',
        key: 'speed',
        query: 'speed',
        structural: false,
        min: 0.5,
        max: 4,
        step: 0.5,
      },
      {
        kind: 'enum',
        key: 'label',
        query: 'label',
        structural: true,
        values: ['default', 'fast'],
      },
    ],
    chapter: { source: 'fragment' },
  },
};

describe('engine contract', () => {
  it('supports reset, setParams, step, snapshot, and metrics', () => {
    const engine: Engine<DummyParams, DummySnapshot, DummyMetrics> = new DummyEngine({
      speed: 1,
      label: 'alpha',
    });

    engine.step(0.5);
    expect(engine.snapshot()).toEqual({ tick: 0.5, label: 'alpha' });
    expect(engine.metrics()).toEqual({ ticks: 0.5 });

    engine.setParams({ speed: 2, label: 'beta' });
    expect(engine.snapshot().label).toBe('beta');

    engine.reset();
    expect(engine.snapshot().tick).toBe(0);
    expect(engine.metrics().ticks).toBe(0);
  });
});

describe('renderer contract', () => {
  it('mounts, resizes, accepts scenes and params, and disposes', async () => {
    const renderer: StageRenderer<DummyParams, DummySnapshot> = new DummyRenderer();
    const container = {} as HTMLElement;

    await renderer.mount(container);
    renderer.resize(640, 360, 2);
    renderer.setScene(scene2d);
    renderer.setParams({ speed: 2, label: 'run' });
    renderer.setPaused(true);
    renderer.render({ tick: 1, label: 'run' });
    renderer.dispose();

    const dummy = renderer as DummyRenderer;
    expect(dummy.mounted).toBe(true);
    expect(dummy.size).toEqual({ width: 640, height: 360, dpr: 2 });
    expect(dummy.scene).toBe(scene2d);
    expect(dummy.params).toEqual({ speed: 2, label: 'run' });
    expect(dummy.paused).toBe(true);
    expect(dummy.snapshot).toEqual({ tick: 1, label: 'run' });
    expect(dummy.disposed).toBe(true);
  });

  it('rejects a mismatched parameter object at compile time', () => {
    const renderer: StageRenderer<DummyParams, DummySnapshot> = new DummyRenderer();

    // @ts-expect-error BUG: speed is a number in DummyParams; a string must not compile.
    renderer.setParams({ speed: 'fast', label: 'run' });

    expect((renderer as DummyRenderer).params).toEqual({ speed: 'fast', label: 'run' });
  });
});

describe('scene model', () => {
  it('represents 2D and 3D scenes without renderer-specific fields', () => {
    expect(scene2d.camera.kind).toBe('2d');
    expect(scene3d.camera.kind).toBe('3d');
    expect(Object.keys(scene3d).sort()).toEqual([
      'camera',
      'highlights',
      'labels',
      'layers',
      'revealProgress',
    ]);

    const camera = scene3d.camera;
    if (camera.kind !== '3d') {
      throw new Error('Expected a 3D camera pose');
    }
    expect(camera.position).toEqual({ x: 1, y: 1, z: 1 });
    expect(camera.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(camera.fov).toBe(45);

    expect(scene3d.labels.map((label) => label.anchor.space)).toEqual(['world3d', 'screen']);
  });

  it('passes a fake 3D contract with async mount, an orbit pose, and label registration', async () => {
    const renderer = new FakeThreeRenderer();

    await expect(renderer.mount({} as HTMLElement)).resolves.toBeUndefined();
    renderer.setScene(scene3d);

    expect(renderer.mounted).toBe(true);
    expect(renderer.labels.size).toBe(2);
    expect(renderer.labels.get('plane-normal')?.text).toContain('9x');
    expect(renderer.labels.get('plane-normal')?.anchor).toEqual({
      space: 'world3d',
      position: { x: 0.5, y: 0.5, z: 0.5 },
    });
    expect(renderer.labels.get('hud')?.anchor).toEqual({ space: 'screen', x: 16, y: 16 });
  });
});

describe('story config', () => {
  it('defines a typed config and imports the registry without DOM side effects', async () => {
    expect('window' in globalThis).toBe(false);

    const registry = await import('../../src/stories/registry');
    const config = registry.defineStoryConfig(dummyConfig);

    expect(config.slug).toBe('contract-smoke');
    expect(config.rendererId).toBe('canvas2d');
    expect(config.defaults).toEqual({ speed: 1, label: 'default' });
    expect(config.presets[0]?.params).toEqual({ speed: 2 });
    expect(config.chapters[0]?.scene).toBe('overview');
    expect(config.urlParams.chapter.source).toBe('fragment');
    expect('window' in globalThis).toBe(false);
  });

  it('creates an engine through the configured factory', () => {
    const engine = defineStoryConfig(dummyConfig).createEngine(dummyConfig.defaults);

    expect(engine.snapshot()).toEqual({ tick: 0, label: 'default' });
  });
});
