/*
 * The story frontmatter contract.
 *
 * This module imports only `astro/zod`, never `astro:content`, so unit tests can
 * exercise the schema directly without the Astro Vite environment. The content
 * collection in src/content.config.ts imports the same schema, which keeps the
 * test and the build honest about the same rules.
 *
 * Enum values come from docs/stories.md §1 and §2–3. The status values are
 * kebab-case labels for the editorial lifecycle; the two initial stories use
 * `initial-release`.
 */

import { z } from 'astro/zod';

export const STORY_CATEGORIES = [
  'Optimization',
  'Randomness',
  'Graphs',
  'Emergence',
  'Physics',
  'Generative',
  'Data',
] as const;

export const STORY_DIFFICULTIES = ['introductory', 'intermediate', 'advanced'] as const;

export const STORY_VISUAL_MODES = ['2d', '3d', 'mixed'] as const;

export const STORY_STATUSES = ['planned', 'in-development', 'initial-release', 'archived'] as const;

/** A stable source for a claim. At least one locator is required. */
export const referenceSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(300),
    authors: z.string().trim().min(1).max(300).optional(),
    year: z.number().int().min(1400).max(2100).optional(),
    url: z.url().optional(),
    doi: z.string().trim().min(1).max(200).optional(),
  })
  .refine((reference) => reference.url !== undefined || reference.doi !== undefined, {
    message: 'A reference must provide either a url or a doi.',
    path: ['doi'],
  });

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const storySchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160),
    dek: z.string().trim().min(1).max(320),
    slug: z.string().trim().regex(slugPattern, 'Use a lowercase kebab-case slug.'),
    category: z.enum(STORY_CATEGORIES),
    difficulty: z.enum(STORY_DIFFICULTIES),
    difficultyNote: z.string().trim().min(1).max(200).optional(),
    visualMode: z.enum(STORY_VISUAL_MODES),
    fallback: z.literal('2d').optional(),
    learningObjectives: z.array(z.string().trim().min(1).max(300)).min(1),
    prerequisites: z.array(z.string().trim().min(1).max(200)).min(1),
    references: z.array(referenceSchema).min(1),
    status: z.enum(STORY_STATUSES),
  })
  .superRefine((story, ctx) => {
    if (story.visualMode === '3d' && story.fallback !== '2d') {
      ctx.addIssue({
        code: 'custom',
        path: ['fallback'],
        message: "A 3d story must declare fallback: '2d'.",
      });
    }

    if (story.visualMode !== '3d' && story.fallback !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallback'],
        message: "fallback is only allowed when visualMode is '3d'.",
      });
    }
  });

export type StoryCategory = (typeof STORY_CATEGORIES)[number];
export type StoryDifficulty = (typeof STORY_DIFFICULTIES)[number];
export type StoryVisualMode = (typeof STORY_VISUAL_MODES)[number];
export type StoryStatus = (typeof STORY_STATUSES)[number];
export type StoryReference = z.infer<typeof referenceSchema>;
export type StoryFrontmatter = z.infer<typeof storySchema>;
