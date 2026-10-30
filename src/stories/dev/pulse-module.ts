/**
 * `/dev/pulse-smoke` story module.
 *
 * The second fixture uses the same engine/renderer contracts but its own config
 * and page. It shares the fixture hook helper; nothing in the controller knows
 * which fixture is running.
 */

import { createStoryModule } from '../runtime';
import { pulseStoryConfig } from './pulse-config';
import { createFixtureHooks } from './runtime-hooks';

export const pulseStoryHooks = createFixtureHooks();

export const pulseStoryModule = createStoryModule(pulseStoryConfig, pulseStoryHooks);
