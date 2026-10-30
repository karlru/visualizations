/**
 * Build-time pseudocode highlighting.
 *
 * The Ant System listing is shipped as static HTML produced by Shiki during
 * the build. No highlighter, grammar, or theme reaches the browser: this module
 * is imported by `Pseudocode.astro` and by the story route during static
 * generation only.
 *
 * A tiny custom TextMate grammar gives the listing its editorial token classes
 * (control keywords, symbols, operators). The theme writes *CSS variables*
 * instead of literal colours, so the same markup is readable on paper and can
 * be restyled for the dark stage without re-highlighting:
 *
 * - `.pseudocode` defines the paper palette;
 * - `.pseudocode[data-tone='stage']` (or any dark ancestor) overrides it.
 *
 * Every line carries `data-line="0…9"`, which is the contract the controller
 * uses to mark the active line from the chapter spec. Nothing is re-rendered at
 * runtime; the controller only moves `data-active` / `aria-current`.
 */

import {
  createHighlighterCore,
  type HighlighterGeneric,
  type LanguageRegistration,
  type ShikiTransformer,
  type ThemeRegistration,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * The canonical Ant System listing from `docs/stories.md` §2.7.
 *
 * The indices are the `pseudocodeLine` values in `ACO_CHAPTERS`. Do not
 * renumber without updating the chapter map, the docs, and the tests.
 */
export const ACO_PSEUDOCODE_LINES: readonly string[] = Object.freeze([
  'initialize pheromone τ',
  'repeat',
  '  for each ant k:',
  '    build a tour by sampling allowed next cities',
  '      using τ^α · η^β',
  '    compute tour length L_k',
  '  evaporate pheromone by ρ',
  '  deposit Q / L_k on each edge used by ant k',
  '  update best tour',
  'until stopping condition',
]);

/** The listing as one string, without a trailing newline. */
export const ACO_PSEUDOCODE = ACO_PSEUDOCODE_LINES.join('\n');

/** Number of addressable lines. */
export const ACO_PSEUDOCODE_LINE_COUNT = ACO_PSEUDOCODE_LINES.length;

/** Default accessible name for the full listing. */
export const ACO_PSEUDOCODE_LABEL = 'Ant System pseudocode';

export interface PseudocodeOptions {
  /** Unique id for the `<pre>`. Required so article + panel never collide. */
  readonly id: string;
  /** Accessible name for the code block. */
  readonly label: string;
  /** Optional id of the visible description that explains the listing. */
  readonly descriptionId?: string;
  /** Initial active line, used by the article render. */
  readonly activeLine?: number | null;
  /** Visual tone; the stage/future dark panel uses `stage`. */
  readonly tone?: 'paper' | 'stage';
}

/**
 * Editorial palette written into the Shiki theme as CSS variables. The actual
 * values live in `story.css`; inline styles are just `var(--pseudocode-…)`, so
 * a dark-stage ancestor can restyle the same pre-rendered HTML.
 */
const EDITORIAL_THEME: ThemeRegistration = {
  name: 'aco-editorial',
  type: 'light',
  settings: [
    {
      settings: {
        foreground: 'var(--pseudocode-ink)',
        background: 'var(--pseudocode-bg)',
      },
    },
    {
      scope: ['keyword.control.pseudocode'],
      settings: {
        foreground: 'var(--pseudocode-keyword)',
        fontStyle: 'bold',
      },
    },
    {
      scope: ['entity.name.function.pseudocode'],
      settings: { foreground: 'var(--pseudocode-function)' },
    },
    {
      scope: ['variable.other.pseudocode'],
      settings: {
        foreground: 'var(--pseudocode-symbol)',
        fontStyle: 'bold',
      },
    },
    {
      scope: ['keyword.operator.pseudocode'],
      settings: { foreground: 'var(--pseudocode-operator)' },
    },
    {
      scope: ['constant.numeric.pseudocode'],
      settings: { foreground: 'var(--pseudocode-number)' },
    },
    {
      scope: ['comment.line.pseudocode'],
      settings: {
        foreground: 'var(--pseudocode-comment)',
        fontStyle: 'italic',
      },
    },
  ],
};

/**
 * A deliberately small grammar: enough structure to scan the algorithm, not a
 * general-purpose language. The listing is natural-language pseudocode, so
 * "keywords" are the control words and "symbols" are the Greek/quantity names
 * the story uses in prose.
 */
const PSEUDOCODE_GRAMMAR: LanguageRegistration = {
  name: 'pseudocode',
  scopeName: 'source.pseudocode',
  repository: {},
  patterns: [
    { match: '#.*$', name: 'comment.line.pseudocode' },
    {
      match: '\\b(?:initialize|repeat|until|if|then|else|return)\\b',
      name: 'keyword.control.pseudocode',
    },
    { match: '\\bfor each\\b', name: 'keyword.control.pseudocode' },
    {
      match: '\\b(?:build|sample|sampling|compute|evaporate|deposit|update)\\b',
      name: 'entity.name.function.pseudocode',
    },
    {
      match: '[τρηαβ]|\\b[QL]_?[a-z0-9]*\\b',
      name: 'variable.other.pseudocode',
    },
    { match: '[·/^←]', name: 'keyword.operator.pseudocode' },
    { match: '\\b\\d+\\b', name: 'constant.numeric.pseudocode' },
  ],
};

type PseudocodeHighlighter = HighlighterGeneric<string, string>;

let highlighterPromise: Promise<PseudocodeHighlighter> | null = null;

/**
 * One highlighter per build process. `shiki/core` plus the JavaScript regex
 * engine keeps this out of the WASM path and makes the output deterministic in
 * Node, Vitest, and the Astro build.
 */
function getHighlighter(): Promise<PseudocodeHighlighter> {
  highlighterPromise ??= createHighlighterCore({
    themes: [EDITORIAL_THEME],
    langs: [PSEUDOCODE_GRAMMAR],
    engine: createJavaScriptRegexEngine(),
    warnings: false,
  }) as Promise<PseudocodeHighlighter>;

  return highlighterPromise;
}

function activeLineAttributes(
  activeLine: number | null | undefined,
  index: number,
): Record<string, string> {
  if (activeLine === null || activeLine === undefined || activeLine !== index) return {};
  return {
    'data-active': '',
    'aria-current': 'step',
  };
}

/**
 * Render one listing to static HTML.
 *
 * The returned `<pre>` owns the accessible name/description, `tabindex="0"`
 * (so a keyboard user can scroll a long line), and one `data-line` span per
 * source line. The caller must supply a unique `id`; two listings on one page
 * are expected (article prose + the stage panel).
 */
export async function highlightPseudocode(
  source: string,
  options: PseudocodeOptions,
): Promise<string> {
  const highlighter = await getHighlighter();
  const normalized = source.replace(/\r\n?/g, '\n').replace(/\n+$/, '');

  const lineTransformer: ShikiTransformer = {
    name: 'pseudocode-lines',
    line(node, line) {
      const index = line - 1;
      node.properties = {
        ...node.properties,
        class: 'line pseudocode__line',
        'data-line': String(index),
        ...activeLineAttributes(options.activeLine, index),
      };
    },
    pre(node) {
      node.properties = {
        ...node.properties,
        id: options.id,
        class: `${String(node.properties.class ?? '')} pseudocode`.trim(),
        'data-pseudocode': '',
        'data-tone': options.tone ?? 'paper',
        tabindex: '0',
        role: 'group',
        'aria-label': options.label,
        ...(options.descriptionId === undefined
          ? {}
          : { 'aria-describedby': options.descriptionId }),
      };
    },
  };

  return highlighter.codeToHtml(normalized, {
    lang: PSEUDOCODE_GRAMMAR.name,
    theme: EDITORIAL_THEME.name ?? 'aco-editorial',
    transformers: [lineTransformer],
  });
}
