/**
 * Server-only pseudocode registry.
 *
 * The story route asks for highlighted HTML once at build time. Only stories
 * with a listing are listed here, so the page stays generic and a future story
 * adds an entry without importing Shiki itself. The returned markup is plain
 * HTML passed to the island; the island never imports this module or Shiki.
 */

import { ACO_PSEUDOCODE, ACO_PSEUDOCODE_LABEL, highlightPseudocode } from './pseudocode';

interface StoryPseudocodeSpec {
  readonly source: string;
  readonly label: string;
}

const STORY_PSEUDOCODE: Readonly<Record<string, StoryPseudocodeSpec>> = Object.freeze({
  'ant-colony-optimization': Object.freeze({
    source: ACO_PSEUDOCODE,
    label: ACO_PSEUDOCODE_LABEL,
  }),
});

/** Id of the stage panel's listing; must not collide with the article copy. */
export const STAGE_PSEUDOCODE_ID = 'story-pseudocode-code';

/**
 * Build the stage panel's listing for a story, or `undefined` when the story
 * has none. Called from the page frontmatter during static generation.
 */
export async function renderStoryPseudocodeHtml(slug: string): Promise<string | undefined> {
  const spec = STORY_PSEUDOCODE[slug];
  if (spec === undefined) return undefined;

  return highlightPseudocode(spec.source, {
    id: STAGE_PSEUDOCODE_ID,
    label: spec.label,
    descriptionId: 'story-pseudocode-note',
    // The controller marks the first chapter's line after the panel renders.
    tone: 'paper',
  });
}
