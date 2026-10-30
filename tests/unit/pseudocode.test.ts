import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACO_DEPOSIT_TEX, ACO_TRANSITION_TEX, ACO_UPDATE_TEX } from '../../src/lib/aco-formulas';
import {
  ACO_PSEUDOCODE,
  ACO_PSEUDOCODE_LINE_COUNT,
  ACO_PSEUDOCODE_LINES,
  highlightPseudocode,
} from '../../src/lib/pseudocode';
import { ACO_CHAPTERS } from '../../src/stories/aco/config';

/**
 * Step 3.4 content contract: the build-time pseudocode and the three formulas
 * must match `docs/stories.md` §2.7 and the `pseudocodeLine` indices in
 * `ACO_CHAPTERS`. These tests run without a browser; Shiki is a Node build
 * dependency, never a client one.
 */

const mdX = readFileSync(
  new URL('../../src/content/stories/ant-colony-optimization/index.mdx', import.meta.url),
  'utf8',
);

const stories = readFileSync(new URL('../../docs/stories.md', import.meta.url), 'utf8');

/** Extract the canonical listing from the docs rather than duplicating it. */
function documentedPseudocode(): string {
  const start = stories.indexOf('**Pseudocode**');
  if (start === -1) throw new Error('docs/stories.md no longer has a pseudocode section');
  const fenceStart = stories.indexOf('```text', start);
  const fenceEnd = stories.indexOf('```', fenceStart + '```text'.length);
  return stories.slice(fenceStart + '```text\n'.length, fenceEnd).replace(/\n$/, '');
}

function lineMatches(html: string): string[] {
  return [...html.matchAll(/data-line="(\d+)"/g)].map((match) => match[1] as string);
}

describe('ACO pseudocode contract', () => {
  it('matches the documented Ant System listing line for line', () => {
    expect(ACO_PSEUDOCODE).toBe(documentedPseudocode());
    expect(ACO_PSEUDOCODE_LINES).toHaveLength(10);
    expect(ACO_PSEUDOCODE_LINE_COUNT).toBe(10);
  });

  it('binds every chapter to an addressable line', () => {
    for (const chapter of ACO_CHAPTERS) {
      expect(chapter.pseudocodeLine, chapter.id).toBeTypeOf('number');
      expect(Number.isInteger(chapter.pseudocodeLine), chapter.id).toBe(true);
      expect(chapter.pseudocodeLine, chapter.id).toBeGreaterThanOrEqual(0);
      expect(chapter.pseudocodeLine, chapter.id).toBeLessThan(ACO_PSEUDOCODE_LINE_COUNT);
    }
  });

  it('highlights deterministically with one data-line span per line', async () => {
    const first = await highlightPseudocode(ACO_PSEUDOCODE, {
      id: 'unit-pseudocode',
      label: 'Ant System pseudocode',
      descriptionId: 'unit-pseudocode-description',
    });
    const second = await highlightPseudocode(ACO_PSEUDOCODE, {
      id: 'unit-pseudocode',
      label: 'Ant System pseudocode',
      descriptionId: 'unit-pseudocode-description',
    });

    expect(first).toBe(second);
    expect(lineMatches(first)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

    // Structure and accessible name live on the pre; tokens are static spans.
    expect(first).toContain('data-pseudocode');
    expect(first).toContain('id="unit-pseudocode"');
    expect(first).toContain('aria-label="Ant System pseudocode"');
    expect(first).toContain('aria-describedby="unit-pseudocode-description"');
    expect(first).toContain('tabindex="0"');
    expect(first).toContain('role="group"');

    // Keywords and symbols come from the build-time grammar, not a script.
    expect(first).toContain('var(--pseudocode-keyword)');
    expect(first).toContain('var(--pseudocode-symbol)');
    expect(first).toContain('>initialize<');
    expect(first).toContain('>repeat<');
    expect(first).toContain('>until<');
    expect(first).toContain('>τ<');

    // No runtime highlighter, inline script, handler, or network font.
    expect(first).not.toContain('<script');
    expect(first).not.toContain('<style');
    expect(first).not.toMatch(/\son(?:click|load)=/i);
    expect(first).not.toMatch(/https?:\/\//i);
  });

  it('marks exactly one active line when asked', async () => {
    const html = await highlightPseudocode(ACO_PSEUDOCODE, {
      id: 'unit-active',
      label: 'Ant System pseudocode',
      activeLine: 4,
    });

    expect(html.match(/data-active/g)).toHaveLength(1);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/data-line="4"[^>]*data-active=""/);
    expect(html).toMatch(/data-line="4"[^>]*aria-current="step"/);

    const none = await highlightPseudocode(ACO_PSEUDOCODE, {
      id: 'unit-none',
      label: 'Ant System pseudocode',
      activeLine: null,
    });
    expect(none).not.toContain('data-active');
    expect(none).not.toContain('aria-current');
  });
});

describe('ACO formula contract', () => {
  it('states the transition probability and η = 1/d', () => {
    expect(ACO_TRANSITION_TEX).toContain('p_{ij}');
    expect(ACO_TRANSITION_TEX).toContain(String.raw`\tau_{ij}^{\alpha}`);
    expect(ACO_TRANSITION_TEX).toContain(String.raw`\eta_{ij}^{\beta}`);
    expect(ACO_TRANSITION_TEX).toContain(String.raw`\sum_{l \in \mathrm{allowed}}`);
    expect(ACO_TRANSITION_TEX).toContain(String.raw`\eta_{ij} = \frac{1}{d_{ij}}`);
  });

  it('states Q/L on used edges and 0 otherwise', () => {
    expect(ACO_DEPOSIT_TEX).toContain(String.raw`\Delta\tau_{ij}^{k}`);
    expect(ACO_DEPOSIT_TEX).toContain(String.raw`\frac{Q}{L_k}`);
    expect(ACO_DEPOSIT_TEX).toContain('otherwise');
  });

  it('evaporates before adding the deposits', () => {
    expect(ACO_UPDATE_TEX).toContain(String.raw`\tau_{ij} \leftarrow (1-\rho)\,\tau_{ij}`);
    expect(ACO_UPDATE_TEX).toContain(String.raw`\sum_{k} \Delta\tau_{ij}^{k}`);
  });

  it('renders all three through the build-time Math wrapper', () => {
    expect(mdX.match(/<Math\b/g)).toHaveLength(3);
    for (const id of ['formula-transition', 'formula-deposit', 'formula-update']) {
      expect(mdX).toContain(`id="${id}"`);
    }
    for (const constant of ['ACO_TRANSITION_TEX', 'ACO_DEPOSIT_TEX', 'ACO_UPDATE_TEX']) {
      expect(mdX).toContain(constant);
    }

    // The article/no-JS path carries the full listing, not just the stage panel.
    expect(mdX).toContain('<Pseudocode');
    expect(mdX).toContain('id="aco-pseudocode-article"');
  });
});
