import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACO_CHAPTERS } from '../../src/stories/aco/config';

/**
 * Content contract for the guided ACO story.
 *
 * The MDX is parsed as source because the chapter attributes are the contract
 * shared with `ACO_CHAPTERS`: a renamed id, title, or scene must fail here before
 * it silently detaches the prose from its scene. The math/pseudocode checks
 * enforce the teaching arc in `docs/stories.md` §1.3.
 */
const mdx = readFileSync(
  new URL('../../src/content/stories/ant-colony-optimization/index.mdx', import.meta.url),
  'utf8',
);

const frontmatter = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';

interface ChapterSource {
  readonly id: string;
  readonly title: string;
  readonly scene: string;
  readonly body: string;
}

/** Parse the attributes of one component tag. */
function attributeMap(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1] as string] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

/** Chapter bodies, in document order. */
function parseChapters(source: string): ChapterSource[] {
  const chapters: ChapterSource[] = [];
  for (const match of source.matchAll(/<Chapter\b([^>]*)>([\s\S]*?)<\/Chapter>/g)) {
    const attributes = attributeMap(match[1] as string);
    chapters.push({
      id: attributes.id ?? '',
      title: attributes.title ?? '',
      scene: attributes.scene ?? '',
      body: match[2] as string,
    });
  }
  return chapters;
}

/** Strip markup so word counts reflect what a reader actually sees. */
function plainText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(fragment: string): number {
  return plainText(fragment).split(/\s+/).filter(Boolean).length;
}

function chapterBody(id: string): string {
  const chapter = parseChapters(mdx).find((entry) => entry.id === id);
  if (!chapter) throw new Error(`Missing chapter ${id}`);
  return chapter.body;
}

function section(id: string): string {
  const start = mdx.indexOf(`id="${id}"`);
  if (start === -1) return '';
  const nextSection = mdx.indexOf('<section', start + 1);
  return nextSection === -1 ? mdx.slice(start) : mdx.slice(start, nextSection);
}

const chapters = parseChapters(mdx);

describe('ACO story prose contract', () => {
  it('binds the thirteen MDX chapters to ACO_CHAPTERS in order', () => {
    expect(chapters.map(({ id, title, scene }) => ({ id, title, scene }))).toEqual(
      ACO_CHAPTERS.map(({ id, title, scene }) => ({ id, title, scene })),
    );
    expect(chapters).toHaveLength(13);
  });

  it('has complete prose in every chapter with no placeholder text', () => {
    expect(mdx).not.toMatch(/placeholder/i);
    expect(mdx).not.toMatch(/\bTODO\b/);

    for (const chapter of chapters) {
      const text = plainText(chapter.body);
      expect(wordCount(chapter.body), `${chapter.id} is too short`).toBeGreaterThanOrEqual(80);
      const sentences = text.match(/[.!?](?:\s|$)/g) ?? [];
      expect(sentences.length, `${chapter.id} needs readable sentences`).toBeGreaterThanOrEqual(2);
    }

    const total = chapters.reduce((sum, chapter) => sum + wordCount(chapter.body), 0);
    expect(total).toBeGreaterThanOrEqual(1_800);
    expect(total).toBeLessThanOrEqual(3_200);
  });

  it('uses introductory metadata with no assumed knowledge', () => {
    expect(frontmatter).toMatch(/^difficulty: "introductory"$/m);
    expect(frontmatter).toMatch(/^difficultyNote: "No prior knowledge assumed/m);
    expect(frontmatter).toMatch(/^visualMode: "2d"$/m);
    expect(frontmatter).toMatch(/^learningObjectives:$/m);
    expect(frontmatter).toMatch(/^prerequisites:$/m);
    expect(frontmatter).toMatch(/^references:$/m);

    const objectivesBlock = frontmatter.slice(
      frontmatter.indexOf('learningObjectives:'),
      frontmatter.indexOf('prerequisites:'),
    );
    expect(objectivesBlock.match(/^ {2}- "/gm)).toHaveLength(8);

    const prerequisitesBlock = frontmatter.slice(
      frontmatter.indexOf('prerequisites:'),
      frontmatter.indexOf('references:'),
    );
    expect(prerequisitesBlock).toMatch(/None — every term is defined in the story/);

    const referenceTitles = frontmatter
      .slice(frontmatter.indexOf('references:'))
      .match(/^ {2}- title:/gm);
    expect(referenceTitles).toHaveLength(4);
  });

  it('covers the teaching beats chapter by chapter', () => {
    // 01 — five cities, TSP, closed tour, return home, distance sum.
    expect(chapterBody('the-problem')).toMatch(/traveling salesman problem/i);
    expect(chapterBody('the-problem')).toMatch(/tour/i);
    expect(chapterBody('the-problem')).toMatch(/closed cycle/i);
    expect(chapterBody('the-problem')).toMatch(/return/i);
    expect(chapterBody('the-problem')).toMatch(/five cities/i);

    // 02 — twelve tours, brute force, shortest 1.617.
    expect(chapterBody('try-every-tour')).toMatch(/12 distinct tours|twelve distinct tours/i);
    expect(chapterBody('try-every-tour')).toMatch(/brute force/i);
    expect(chapterBody('try-every-tour')).toMatch(/1\.617/);

    // 03 — factorial growth, time wall, heuristic.
    expect(chapterBody('too-many-tours')).toMatch(/factorial/i);
    expect(chapterBody('too-many-tours')).toMatch(/4\.4 × 10³⁰|4\.4e30/);
    expect(chapterBody('too-many-tours')).toMatch(/heuristic/i);
    expect(chapterBody('too-many-tours')).toMatch(/30/);

    // 04 — one ant, allowed set, randomness, pheromone, 1.737.
    expect(chapterBody('one-ants-choice')).toMatch(/allowed/i);
    expect(chapterBody('one-ants-choice')).toMatch(/pheromone/i);
    expect(chapterBody('one-ants-choice')).toMatch(/1\.737/);
    expect(chapterBody('one-ants-choice')).toMatch(/local/i);

    // 05 — deposit Q/L, shorter tour, positive feedback, stigmergy.
    expect(chapterBody('leaving-a-trace')).toMatch(/Q\/L/);
    expect(chapterBody('leaving-a-trace')).toMatch(/positive feedback/i);
    expect(chapterBody('leaving-a-trace')).toMatch(/stigmergy/i);
    expect(chapterBody('leaving-a-trace')).toMatch(/shorter tour/i);

    // 06 — evaporation, (1 − ρ), why forgetting matters.
    expect(chapterBody('forgetting')).toMatch(/(\(1-\\rho\)|\(1 - \\rho\)|\(1 − ρ\))/);
    expect(chapterBody('forgetting')).toMatch(/fade|evaporat/i);
    expect(chapterBody('forgetting')).toMatch(/older|old evidence|forget/i);

    // 07 — second ant, shared trail, feedback loop.
    expect(chapterBody('two-ants')).toMatch(/second ant/i);
    expect(chapterBody('two-ants')).toMatch(/trail/i);
    expect(chapterBody('two-ants')).toMatch(/two rounds|two/i);

    // 08 — four ants, 1.617, emergence, record vs mean.
    expect(chapterBody('emergence')).toMatch(/four/i);
    expect(chapterBody('emergence')).toMatch(/1\.617/);
    expect(chapterBody('emergence')).toMatch(/emergence/i);
    expect(chapterBody('emergence')).toMatch(/best length/i);
    expect(chapterBody('emergence')).toMatch(/mean length/i);

    // 09 — transition rule, tau/eta, alpha/beta, pseudocode.
    expect(chapterBody('the-probability-rule')).toMatch(/\\tau|τ/);
    expect(chapterBody('the-probability-rule')).toMatch(/\\eta|η/);
    expect(chapterBody('the-probability-rule')).toMatch(/\\alpha|α/);
    expect(chapterBody('the-probability-rule')).toMatch(/\\beta|β/);
    expect(chapterBody('the-probability-rule')).toMatch(/<Math\b/);
    expect(chapterBody('the-probability-rule')).toMatch(/<Pseudocode\b/);
    expect(chapterBody('the-probability-rule')).toMatch(/<Predict\b/);

    // 10 — deposit and update rules, evaporation order.
    expect(chapterBody('the-update-rule')).toMatch(/Q\/L/);
    expect(chapterBody('the-update-rule')).toMatch(/evaporat/i);
    expect(chapterBody('the-update-rule')).toMatch(/<Math\b/);

    // 11 — presets, exploration/exploitation, the thirty-city figure.
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 1, β = 2, ρ = 0\.5/);
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 0\.5, β = 8, ρ = 0\.5/);
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 5, β = 1, ρ = 0\.1/);
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 1, β = 2, ρ = 0\.95/);
    expect(chapterBody('tuning-the-colony')).toMatch(/exploration/i);
    expect(chapterBody('tuning-the-colony')).toMatch(/exploitation/i);
    expect(chapterBody('tuning-the-colony')).toMatch(/4\.91/);
    expect(chapterBody('tuning-the-colony')).toMatch(/<Figure\b/);
    expect(chapterBody('tuning-the-colony')).toMatch(/<Predict\b/);

    // 12 — limitations and applications.
    expect(chapterBody('when-it-fails')).toMatch(/<h3>Limitations<\/h3>/);
    expect(chapterBody('when-it-fails')).toMatch(/<h3>Applications<\/h3>/);
    expect(chapterBody('when-it-fails')).toMatch(/heuristic/i);
    expect(chapterBody('when-it-fails')).toMatch(/local optima/i);
    expect(chapterBody('when-it-fails')).toMatch(/Max–Min Ant System/);
    expect(chapterBody('when-it-fails')).toMatch(/vehicle routing/i);
    expect(chapterBody('when-it-fails')).toMatch(/network design/i);
    expect(chapterBody('when-it-fails')).toMatch(/scheduling/i);

    // 13 — the lab, start action, map edits, share scope.
    expect(chapterBody('the-lab')).toMatch(/Start simulation/i);
    expect(chapterBody('the-lab')).toMatch(/place and move cities/i);
    expect(chapterBody('the-lab')).toMatch(/ants/i);
    expect(chapterBody('the-lab')).toMatch(/seed/i);
    expect(chapterBody('the-lab')).toMatch(/share link/i);
    expect(chapterBody('the-lab')).toMatch(/not encoded in a share link/i);
    expect(chapterBody('the-lab')).toMatch(/pause, step, restart, and share/i);
  });

  it('keeps math and pseudocode out of the guided opening', () => {
    for (const id of [
      'the-problem',
      'try-every-tour',
      'too-many-tours',
      'one-ants-choice',
      'leaving-a-trace',
      'forgetting',
      'two-ants',
      'emergence',
    ]) {
      expect(chapterBody(id), `${id} must stay concrete`).not.toMatch(/<Math\b/);
      expect(chapterBody(id), `${id} must stay concrete`).not.toMatch(/<Pseudocode\b/);
    }

    expect(mdx.indexOf('<Math')).toBeGreaterThan(mdx.indexOf('id="the-probability-rule"'));
    expect(mdx.indexOf('<Pseudocode')).toBeGreaterThan(mdx.indexOf('id="the-probability-rule"'));
  });

  it('includes two native predictions, at least four callouts, and one static figure', () => {
    expect(mdx.match(/<Predict\b/g)).toHaveLength(2);
    expect((mdx.match(/<Callout\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(mdx.match(/<Figure\b/g)).toHaveLength(1);
    expect(mdx).toContain('aco-best-tour.svg?raw');
    expect(mdx).toContain('name="aco-best-tour"');

    const figure = mdx.slice(mdx.indexOf('<Figure'));
    for (const phrase of ['halo', 'dashed', 'square', '4.91', 'server-rendered']) {
      expect(figure.slice(0, figure.indexOf('/>')).toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it('defines the key terms in a glossary after the chapters', () => {
    const glossary = section('glossary');
    expect(glossary).toMatch(/<dl\b/);
    expect(mdx.indexOf('<section id="glossary"')).toBeGreaterThan(
      mdx.indexOf('<Chapter id="the-lab"'),
    );

    for (const term of [
      'Ant (agent)',
      'Brute force',
      'Candidate tour',
      'Pheromone',
      'Stigmergy',
      'Tour',
      'Traveling salesman problem',
      'Heuristic',
      'Exploration and exploitation',
      'Evaporation',
      'Positive feedback',
      'Local optimum',
      'Diversity',
    ]) {
      expect(glossary, `glossary is missing ${term}`).toContain(term);
    }
  });

  it('lists stable citations and marks every external link as safe', () => {
    const references = section('references');
    expect(references).toMatch(/<ol\b/);

    const links = [...references.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g)];
    expect(links.length).toBeGreaterThanOrEqual(3);

    for (const [tag, href] of links) {
      expect(href, `expected a stable locator: ${href}`).toMatch(
        /^https:\/\/(doi\.org|mitpress\.mit\.edu|comopt\.ifi\.uni-heidelberg\.de)\//,
      );
      expect(tag).toContain('rel="noopener noreferrer"');
    }

    for (const [tag] of mdx.matchAll(/<a\b[^>]*href="https?:\/\/[^"]+"[^>]*>/g)) {
      expect(tag).toContain('rel="noopener noreferrer"');
    }
  });

  it('keeps the article self-contained instead of promising absent panels', () => {
    expect(chapterBody('emergence')).toMatch(/record/i);
    expect(chapterBody('emergence')).toMatch(/mean/i);
    expect(mdx).not.toMatch(/convergence chart/i);
    expect(mdx).not.toMatch(/fan summary/i);
  });
});
