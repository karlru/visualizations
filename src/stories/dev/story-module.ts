/**
 * `/dev/story-smoke` story module.
 *
 * The module binds the fixture config to its renderer and metric describer and
 * exposes the non-generic view/runtime pair. It is loaded dynamically by the
 * story registry, so `/stories/*` never ships the fixture engine.
 */

import { createStoryModule } from '../runtime';
import { devStoryConfig } from './config';
import { createFixtureHooks } from './runtime-hooks';

export const devStoryHooks = createFixtureHooks();

export const devStoryModule = createStoryModule(devStoryConfig, devStoryHooks);
