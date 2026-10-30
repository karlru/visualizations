import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACO_CHAPTERS } from '../../src/stories/aco/config';

/**
 * Content contract for `docs/requirements.md` FR-CONTENT-01…12 and
 * `docs/stories.md` §2.3, §2.8–2.11.
 *
 * The MDX is parsed as source because the chapter attributes are the contract
 * shared with `ACO_CHAPTERS`: a renamed id, title, or scene must fail here
 * before it silently detaches the prose from its scene.
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
  it('binds the ten MDX chapters to ACO_CHAPTERS id, title, and scene in order', () => {
    expect(chapters.map(({ id, title, scene }) => ({ id, title, scene }))).toEqual(
      ACO_CHAPTERS.map(({ id, title, scene }) => ({ id, title, scene })),
    );
  });

  it('has complete prose in every chapter with no placeholder text', () => {
    expect(mdx).not.toMatch(/placeholder/i);
    expect(mdx).not.toMatch(/\bTODO\b/);

    expect(chapters).toHaveLength(10);
    for (const chapter of chapters) {
      const text = plainText(chapter.body);
      expect(wordCount(chapter.body), `${chapter.id} is too short`).toBeGreaterThanOrEqual(80);
      const sentences = text.match(/[.!?](?:\s|$)/g) ?? [];
      expect(sentences.length, `${chapter.id} needs readable sentences`).toBeGreaterThanOrEqual(2);
    }

    const total = chapters.reduce((sum, chapter) => sum + wordCount(chapter.body), 0);
    expect(total).toBeGreaterThanOrEqual(1_800);
    expect(total).toBeLessThanOrEqual(2_800);
  });

  it('keeps the documented metadata and four references in frontmatter', () => {
    expect(frontmatter).toMatch(/^difficulty: "intermediate"$/m);
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
    expect(prerequisitesBlock.match(/^ {2}- "/gm)).toHaveLength(3);

    const referenceTitles = frontmatter
      .slice(frontmatter.indexOf('references:'))
      .match(/^ {2}- title:/gm);
    expect(referenceTitles).toHaveLength(4);
  });

  it('covers the required narrative beats chapter by chapter', () => {
    // 01 — the colony: no leader, simple agents, stigmergy defined.
    expect(chapterBody('the-colony')).toMatch(/no control room|no leader/i);
    expect(chapterBody('the-colony')).toMatch(/stigmergy/i);

    // 02 — the problem: TSP, tour/cycle, return edge, the search space.
    expect(chapterBody('the-problem')).toMatch(/traveling salesman problem/i);
    expect(chapterBody('the-problem')).toMatch(/cycle/i);
    expect(chapterBody('the-problem')).toMatch(/return edge/i);
    expect(chapterBody('the-problem')).toMatch(/29! orders/);
    expect(chapterBody('the-problem')).not.toMatch(/29 orders/);
    expect(chapterBody('the-problem')).toMatch(/29!\/2/);

    // 03 — one ant's choice: allowed set, focal city, top N and other (Σ),
    // normalized probabilities.
    expect(chapterBody('one-ants-choice')).toMatch(/unvisited/i);
    expect(chapterBody('one-ants-choice')).toMatch(/allowed set/i);
    expect(chapterBody('one-ants-choice')).toMatch(/Other 21 cities \(Σ\)/);
    expect(chapterBody('one-ants-choice')).toMatch(/normalized/i);

    // 04 — the probability rule: τ^α and η^β, extremes, one prediction.
    expect(chapterBody('the-probability-rule')).toMatch(/(\\tau|τ)/);
    expect(chapterBody('the-probability-rule')).toMatch(/(\\eta|η)/);
    expect(chapterBody('the-probability-rule')).toMatch(/(\\alpha = 0|α = 0)/);
    expect(chapterBody('the-probability-rule')).toMatch(/(\\beta = 0|β = 0)/);
    expect(chapterBody('the-probability-rule')).toMatch(/<Predict\b/);
    expect(chapterBody('the-probability-rule')).toMatch(/<Math\b/);
    expect(chapterBody('the-probability-rule')).toMatch(/<Pseudocode\b/);

    // 05 — leaving a trace: Q/L, shorter tours, positive feedback.
    expect(chapterBody('leaving-a-trace')).toMatch(/Q\/L/);
    expect(chapterBody('leaving-a-trace')).toMatch(/positive feedback/i);
    expect(chapterBody('leaving-a-trace')).toMatch(/shorter route|shorter tour/i);
    expect(chapterBody('leaving-a-trace')).toMatch(/<Math\b/);

    // 06 — forgetting: (1 − ρ), stale paths, ρ = 1 boundary.
    expect(chapterBody('forgetting')).toMatch(/(\(1 - \\rho\)|\(1 − ρ\))/);
    expect(chapterBody('forgetting')).toMatch(/(\\rho = 1|ρ = 1)/);
    expect(chapterBody('forgetting')).toMatch(/zero/i);
    expect(chapterBody('forgetting')).toMatch(/<Math\b/);

    // 07 — emergence: record vs mean, entropy, the static figure.
    expect(chapterBody('emergence')).toMatch(/never rises/i);
    expect(chapterBody('emergence')).toMatch(/mean/i);
    expect(chapterBody('emergence')).toMatch(/entropy/i);
    expect(chapterBody('emergence')).toMatch(/4\.91/);
    expect(chapterBody('emergence')).toMatch(/6\.12/);
    expect(chapterBody('emergence')).not.toMatch(/6\.36/);
    expect(chapterBody('emergence')).toMatch(/4\.91 record is shorter/i);
    expect(chapterBody('emergence')).toMatch(/<Figure\b/);

    // 08 — tuning: all four presets with their documented values.
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 1, β = 2, ρ = 0\.5/);
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 0\.5, β = 8, ρ = 0\.5/);
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 5, β = 1, ρ = 0\.1/);
    expect(chapterBody('tuning-the-colony')).toMatch(/α = 1, β = 2, ρ = 0\.95/);
    expect(chapterBody('tuning-the-colony')).toMatch(/exploration/i);
    expect(chapterBody('tuning-the-colony')).toMatch(/exploitation/i);

    // 09 — when it fails: explicit limitations and applications sections.
    expect(chapterBody('when-it-fails')).toMatch(/<h3>Limitations<\/h3>/);
    expect(chapterBody('when-it-fails')).toMatch(/<h3>Applications<\/h3>/);
    expect(chapterBody('when-it-fails')).toMatch(/heuristic/i);
    expect(chapterBody('when-it-fails')).toMatch(/local optima/i);
    expect(chapterBody('when-it-fails')).toMatch(/Max–Min Ant System/);
    expect(chapterBody('when-it-fails')).toMatch(/vehicle routing/i);
    expect(chapterBody('when-it-fails')).toMatch(/network design/i);
    expect(chapterBody('when-it-fails')).toMatch(/scheduling/i);
    expect(chapterBody('when-it-fails')).toMatch(/dynamic/i);

    // 10 — the lab: every control is named, and local map edits are disclosed.
    expect(chapterBody('the-lab')).toMatch(/Cities \(2–150\)/);
    expect(chapterBody('the-lab')).toMatch(/ants \(1–200\)/);
    expect(chapterBody('the-lab')).toMatch(/α \(0–5\).*β \(0–10\).*ρ \(0–1\)/s);
    expect(chapterBody('the-lab')).toMatch(/0\.5×, 1×, 2×, 4×/);
    expect(chapterBody('the-lab')).toMatch(/seed/i);
    expect(chapterBody('the-lab')).toMatch(/share link/i);
    expect(chapterBody('the-lab')).toMatch(/not encoded in a share URL/i);
    expect(chapterBody('the-lab')).toMatch(/playback, replay, speed, and share/);
    expect(chapterBody('the-lab')).toMatch(
      /share link records the seed.*structural parameters.*speed.*chapter/is,
    );
    expect(chapterBody('the-lab')).toMatch(/parameter panel, presets, city editor, and reset/);
    expect(chapterBody('the-lab')).toMatch(/not part of this chapter yet/i);
    expect(chapterBody('the-lab')).not.toMatch(/share button belong/i);
  });

  it('includes two native predictions, four callouts, and one static figure', () => {
    expect(mdx.match(/<Predict\b/g)).toHaveLength(2);
    expect((mdx.match(/<Callout\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(mdx.match(/<Figure\b/g)).toHaveLength(1);
    expect(mdx).toContain('aco-best-tour.svg?raw');
    expect(mdx).toContain('name="aco-best-tour"');

    // The figure's caption must carry the argument, not rely on colour alone.
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
      'Pheromone',
      'Stigmergy',
      'Tour',
      'Traveling salesman problem',
      'Heuristic',
      'Exploration and exploitation',
      'Evaporation',
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

    // No external link anywhere in the document may omit the rel values.
    for (const [tag] of mdx.matchAll(/<a\b[^>]*href="https?:\/\/[^"]+"[^>]*>/g)) {
      expect(tag).toContain('rel="noopener noreferrer"');
    }
  });

  it('keeps the article self-contained instead of promising absent panels', () => {
    // The page has no live convergence chart or fan summary yet; the prose
    // refers to the metrics panel and the ranked text instead.
    expect(chapterBody('emergence')).toMatch(/metrics panel/i);
    expect(chapterBody('one-ants-choice')).toMatch(/textual version of the same fan/i);
    expect(mdx).not.toMatch(/convergence chart/i);
    expect(mdx).not.toMatch(/fan summary/i);
  });
});
