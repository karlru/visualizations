import { describe, expect, it } from 'vitest';
import { type StoryFrontmatter, storySchema } from '../../src/lib/story-schema';

/**
 * Mirrors the ACO frontmatter in docs/stories.md §2.1–2.2 and §2.11. The build
 * validates the real MDX entry; this fixture proves the schema itself accepts
 * the documented metadata.
 */
const acoStory: StoryFrontmatter = {
  title: 'The Colony That Finds a Short Route',
  dek: 'A colony has no leader and no map. Yet, through pheromones and local decisions, it can find short routes through a set of cities.',
  slug: 'ant-colony-optimization',
  category: 'Optimization',
  difficulty: 'intermediate',
  difficultyNote: 'Starts at introductory level; assumes basic graphs and probability',
  visualMode: '2d',
  learningObjectives: [
    'Explain the traveling salesman problem and why it is hard.',
    'Describe how one ant constructs a tour using pheromone and distance.',
    'Explain the transition probability formula and the roles of α and β.',
    'Explain pheromone deposit and evaporation, and why forgetting matters.',
    'Explain stigmergy: indirect communication through a shared environment.',
    'Explain how positive feedback produces an emergent solution.',
    "Predict how extreme parameter values change the colony's behavior.",
    'Name the limitations of Ant System and the situations where it is useful.',
  ],
  prerequisites: ['Basic graphs', 'Distance', 'Probability'],
  references: [
    {
      title: 'Ant System: Optimization by a colony of cooperating agents',
      authors: 'Dorigo, M., Maniezzo, V., & Colorni, A.',
      year: 1996,
      doi: '10.1109/3477.484436',
    },
    {
      title: 'Ant Colony Optimization',
      authors: 'Dorigo, M., & Stützle, T.',
      year: 2004,
      url: 'https://mitpress.mit.edu/9780262042192/ant-colony-optimization/',
    },
    {
      title: 'MAX–MIN Ant System',
      authors: 'Stützle, T., & Hoos, H. H.',
      year: 2000,
      doi: '10.1016/S0167-739X(00)00043-1',
    },
    {
      title: 'TSPLIB benchmark library',
      url: 'https://comopt.ifi.uni-heidelberg.de/software/TSPLIB95/',
    },
  ],
  status: 'initial-release',
};

/**
 * Mirrors the RANDU frontmatter in docs/stories.md §3.1–3.2 and §3.12. The IBM
 * SSP manual and the L'Ecuyer handbook chapter are omitted until their stable
 * locators are recorded with the prose pass; every included reference has a
 * resolvable url or DOI.
 */
const randuStory: StoryFrontmatter = {
  title: 'Fifteen Planes: How RANDU Broke Randomness',
  dek: 'A generator used for years looked random in one dimension, plausible in two, and collapsed onto fifteen planes in three.',
  slug: 'randu-lcg',
  category: 'Randomness',
  difficulty: 'intermediate',
  visualMode: '3d',
  fallback: '2d',
  learningObjectives: [
    'Explain how a linear congruential generator works.',
    'Explain why parameter choice determines the quality of the output.',
    "Derive RANDU's 3D plane relation from its multiplier and modulus.",
    'Explain why 2D tests can miss a failure that 3D exposes.',
    'Explain why the low bits of an LCG are especially weak.',
    'Compare RANDU with a modern seeded PRNG.',
    'Explain why high-dimensional testing matters for simulation.',
  ],
  prerequisites: ['Modular arithmetic', 'Basic probability', 'Comfort with 3D plots'],
  references: [
    {
      title: 'Random numbers fall mainly in the planes',
      authors: 'Marsaglia, G.',
      year: 1968,
      doi: '10.1073/pnas.61.1.25',
    },
    {
      title: 'The Art of Computer Programming, Volume 2: Seminumerical Algorithms',
      authors: 'Knuth, D. E.',
      url: 'https://www-cs-faculty.stanford.edu/~knuth/taocp.html',
    },
    {
      title:
        'PCG: A Family of Simple Fast Space-Efficient Statistically Good Algorithms for Random Number Generation',
      authors: "O'Neill, M. E.",
      url: 'https://www.pcg-random.org/pdf/hmc-cs-2014-0905.pdf',
    },
    {
      title: 'xoshiro / xoroshiro generators',
      authors: 'Blackman, D., & Vigna, S.',
      url: 'https://prng.di.unimi.it/',
    },
  ],
  status: 'initial-release',
};

const REQUIRED_FIELDS = [
  'title',
  'dek',
  'slug',
  'category',
  'difficulty',
  'visualMode',
  'learningObjectives',
  'prerequisites',
  'references',
  'status',
] as const;

describe('story content schema', () => {
  it('accepts the documented ACO metadata', () => {
    const result = storySchema.safeParse(acoStory);

    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it('accepts the documented RANDU metadata', () => {
    const result = storySchema.safeParse(randuStory);

    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it('accepts a minimal valid story payload', () => {
    const result = storySchema.safeParse({
      title: 'A story',
      dek: 'One sentence that promises the argument.',
      slug: 'a-story',
      category: 'Data',
      difficulty: 'introductory',
      visualMode: '2d',
      learningObjectives: ['Explain one idea.'],
      prerequisites: ['None.'],
      references: [{ title: 'A source', url: 'https://example.com/source' }],
      status: 'planned',
    });

    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it.each(REQUIRED_FIELDS)('rejects a payload without %s', (field) => {
    const invalid: Record<string, unknown> = { ...acoStory };
    delete invalid[field];

    const result = storySchema.safeParse(invalid);

    expect(result.success, `Expected a missing ${field} to fail validation`).toBe(false);
  });

  it('rejects categories, difficulties, and modes outside the documented enums', () => {
    expect(storySchema.safeParse({ ...acoStory, category: 'Algorithms' }).success).toBe(false);
    expect(storySchema.safeParse({ ...acoStory, difficulty: 'expert' }).success).toBe(false);
    expect(storySchema.safeParse({ ...acoStory, visualMode: 'webgl' }).success).toBe(false);
  });

  it('requires at least one learning objective and one reference', () => {
    expect(storySchema.safeParse({ ...acoStory, learningObjectives: [] }).success).toBe(false);
    expect(storySchema.safeParse({ ...acoStory, references: [] }).success).toBe(false);
  });

  it('requires a url or doi on every reference', () => {
    const result = storySchema.safeParse({
      ...acoStory,
      references: [{ title: 'A source with no locator' }],
    });

    expect(result.success).toBe(false);
  });

  it('requires a 2d fallback for a 3d story and forbids it elsewhere', () => {
    expect(storySchema.safeParse({ ...randuStory, fallback: undefined }).success).toBe(false);
    expect(storySchema.safeParse({ ...acoStory, fallback: '2d' }).success).toBe(false);
  });

  // Completing this test waits for the chapter components and scene registry
  // (Steps 3.1 and 5.1). The invariant is bidirectional: every chapter id in
  // MDX must have a scene, and every registered scene must belong to a chapter.
  it.todo('binds every chapter id to a scene and every scene to a chapter');
});
