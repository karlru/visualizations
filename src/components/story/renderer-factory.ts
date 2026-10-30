/**
 * Renderer selection by `StoryConfig.rendererId`.
 *
 * A story config never imports a renderer. The controller asks this factory for
 * the renderer named by the config, and the factory owns the concrete class and
 * its layer set. Step 4.1 extends this map with the Three.js renderer; adding a
 * config that already names `canvas2d` needs no factory edit.
 *
 * The development fixture contract is the only typed snapshot today. Phase 2
 * and Phase 3 add their own layer sets alongside the real engines.
 */

import { Canvas2DRenderer } from '../../render/canvas2d/Canvas2DRenderer';
import type { StageRenderer } from '../../render/types';
import type { SmokeParams, SmokeSnapshot } from '../../stories/dev/canvas-smoke-engine';
import type { RendererId } from '../../stories/registry';
import { createSmokeLayers } from './canvas-smoke-layers';

export function createStoryRenderer(
  rendererId: RendererId,
): StageRenderer<SmokeParams, SmokeSnapshot> {
  switch (rendererId) {
    case 'canvas2d':
      return new Canvas2DRenderer<SmokeParams, SmokeSnapshot>({
        layers: createSmokeLayers(),
        dprCap: 2,
      });
    default:
      throw new Error(`No renderer is registered for rendererId "${rendererId}".`);
  }
}
