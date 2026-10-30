import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { storySchema } from './lib/story-schema';

/**
 * One entry per story, stored as `src/content/stories/<slug>/index.mdx`.
 * The glob loader derives the entry id from the directory name, so the file
 * path and the frontmatter `slug` stay aligned (`ant-colony-optimization`,
 * `randu-lcg`).
 */
const stories = defineCollection({
  loader: glob({ pattern: '**/index.mdx', base: './src/content/stories' }),
  schema: storySchema,
});

export const collections = { stories };
