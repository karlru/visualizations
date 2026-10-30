import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TOKENS_PATH = join(ROOT, 'src/styles/tokens.css');
const BASE_PATH = join(ROOT, 'src/styles/base.css');
const LAYOUT_PATH = join(ROOT, 'src/layouts/BaseLayout.astro');
const TECHNOLOGY_PATH = join(ROOT, 'docs/technology.md');

const TOKENS_SOURCE = readFileSync(TOKENS_PATH, 'utf8');
const BASE_SOURCE = readFileSync(BASE_PATH, 'utf8');
const LAYOUT_SOURCE = readFileSync(LAYOUT_PATH, 'utf8');
const TECHNOLOGY_SOURCE = readFileSync(TECHNOLOGY_PATH, 'utf8');

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

const BASE_RULES = stripComments(BASE_SOURCE);

function rootBlock(css: string): string {
  const source = stripComments(css);
  const rootStart = source.indexOf(':root');
  const open = source.indexOf('{', rootStart);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  // Only the :root block holds the normative values. The reduced-motion media
  // query later in the file intentionally redefines the duration tokens, so it
  // must not overwrite the base values used by the contrast/normative checks.
  for (const match of rootBlock(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = match[1];
    const value = match[2].replace(/\s+/g, ' ').trim();
    tokens.set(name, value);
  }
  return tokens;
}

const tokens = parseTokens(TOKENS_SOURCE);

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(value: string): Rgb {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected a six-digit hex colour, received "${value}"`);
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(hexToRgb(foreground));
  const second = relativeLuminance(hexToRgb(background));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function token(name: string): string {
  const value = tokens.get(name);
  if (!value) {
    throw new Error(`Token "${name}" is not defined in src/styles/tokens.css`);
  }
  return value;
}

interface ContrastPair {
  name: string;
  foreground: string;
  background: string;
  minimum: number;
  note: string;
}

const CONTRAST_PAIRS: ContrastPair[] = [
  {
    name: 'ink / paper',
    foreground: '--color-ink',
    background: '--color-paper',
    minimum: 4.5,
    note: 'body text on paper',
  },
  {
    name: 'paper muted / paper',
    foreground: '--color-paper-muted',
    background: '--color-paper',
    minimum: 4.5,
    note: 'secondary text on paper',
  },
  {
    name: 'accent on paper / paper',
    foreground: '--color-accent-paper',
    background: '--color-paper',
    minimum: 4.5,
    note: 'links and small accent text on paper',
  },
  {
    name: 'stage ink / stage',
    foreground: '--color-stage-ink',
    background: '--color-stage',
    minimum: 4.5,
    note: 'body text on stage',
  },
  {
    name: 'stage muted / stage',
    foreground: '--color-stage-muted',
    background: '--color-stage',
    minimum: 4.5,
    note: 'stage captions',
  },
  {
    name: 'accent on stage / stage',
    foreground: '--color-accent-stage',
    background: '--color-stage',
    minimum: 4.5,
    note: 'stage highlights',
  },
  {
    name: 'focus / paper',
    foreground: '--color-focus',
    background: '--color-paper',
    minimum: 3,
    note: 'focus ring, UI component (3:1)',
  },
  {
    name: 'focus / stage',
    foreground: '--color-focus',
    background: '--color-stage',
    minimum: 3,
    note: 'focus ring, UI component (3:1)',
  },
  {
    name: 'vermilion (accent on stage) / paper',
    foreground: '--color-accent-stage',
    background: '--color-paper',
    minimum: 3,
    note: 'large text and non-text graphics on paper only (3:1)',
  },
  {
    name: 'warm amber / stage',
    foreground: '--color-amber',
    background: '--color-stage',
    minimum: 3,
    note: 'ants, trails, warm data (graphics and large text, 3:1)',
  },
  {
    name: 'cool accent / stage',
    foreground: '--color-cool',
    background: '--color-stage',
    minimum: 3,
    note: 'best tour and comparison data (graphics and large text, 3:1)',
  },
];

const DOCUMENTED_LABELS: Record<string, string> = {
  'Paper muted': '--color-paper-muted',
  'Accent on paper': '--color-accent-paper',
  'Stage ink': '--color-stage-ink',
  'Stage muted': '--color-stage-muted',
  'Accent on stage': '--color-accent-stage',
  Focus: '--color-focus',
};

interface DocumentedRatio {
  label: string;
  tokenName: string;
  documentedHex: string;
  ground: 'paper' | 'stage';
  ratio: number;
}

function documentedRatios(): DocumentedRatio[] {
  const start = TECHNOLOGY_SOURCE.indexOf('### 3.21 Design tokens');
  const end = TECHNOLOGY_SOURCE.indexOf('### 3.22');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not locate §3.21 Design tokens in docs/technology.md');
  }
  const section = TECHNOLOGY_SOURCE.slice(start, end);
  const ratios: DocumentedRatio[] = [];

  for (const line of section.split('\n')) {
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*`(#[0-9a-f]{6})`\s*\|\s*([^|]+?)\s*\|$/i);
    if (!row) continue;
    const [, label, documentedHex, use] = row;
    const tokenName = DOCUMENTED_LABELS[label];
    if (!tokenName) continue;

    for (const match of use.matchAll(/([0-9.]+):1\s+on\s+(paper|stage)/gi)) {
      ratios.push({
        label,
        tokenName,
        documentedHex,
        ground: match[2].toLowerCase() as 'paper' | 'stage',
        ratio: Number.parseFloat(match[1]),
      });
    }
  }

  return ratios;
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('design tokens', () => {
  it('defines every normative colour token', () => {
    const required = [
      '--color-paper',
      '--color-ink',
      '--color-paper-muted',
      '--color-accent-paper',
      '--color-stage',
      '--color-stage-ink',
      '--color-stage-muted',
      '--color-accent-stage',
      '--color-focus',
      '--color-amber',
      '--color-cool',
    ];

    for (const name of required) {
      expect(tokens.has(name), `${name} is missing`).toBe(true);
    }
  });

  it('has no duplicate custom-property definitions', () => {
    const names = [...rootBlock(TOKENS_SOURCE).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(
      (match) => match[1],
    );
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });

  for (const pair of CONTRAST_PAIRS) {
    it(`${pair.name} meets ${pair.minimum}:1 — ${pair.note}`, () => {
      const ratio = contrast(token(pair.foreground), token(pair.background));
      expect(
        ratio,
        `${pair.foreground} on ${pair.background} is ${ratio.toFixed(2)}:1, needs ${pair.minimum}:1`,
      ).toBeGreaterThanOrEqual(pair.minimum);
    });
  }

  it('matches the normative ratios in docs/technology.md', () => {
    const ratios = documentedRatios();

    // Guard against the docs table changing shape and silently skipping checks.
    expect(ratios.length).toBeGreaterThanOrEqual(7);

    for (const documented of ratios) {
      const actualHex = token(documented.tokenName);
      expect(
        actualHex.toLowerCase(),
        `${documented.tokenName} drifted from technology.md (${documented.documentedHex})`,
      ).toBe(documented.documentedHex.toLowerCase());

      const background = documented.ground === 'paper' ? '--color-paper' : '--color-stage';
      const actualRatio = contrast(actualHex, token(background));
      expect(
        Math.abs(actualRatio - documented.ratio),
        `${documented.label} on ${documented.ground}: computed ${actualRatio.toFixed(3)}:1, documented ${documented.ratio}:1`,
      ).toBeLessThanOrEqual(0.01);
    }
  });

  it('uses a monotonic 4 px spacing scale', () => {
    const scale = [
      '--space-3xs',
      '--space-2xs',
      '--space-xs',
      '--space-sm',
      '--space-md',
      '--space-lg',
      '--space-xl',
      '--space-2xl',
      '--space-3xl',
      '--space-4xl',
      '--space-5xl',
    ];

    const values = scale.map((name) => {
      const value = token(name);
      expect(value, `${name} must use rem`).toMatch(/^[0-9.]+rem$/);
      return Number.parseFloat(value);
    });

    for (let index = 1; index < values.length; index += 1) {
      expect(
        values[index],
        `${scale[index]} must be larger than ${scale[index - 1]}`,
      ).toBeGreaterThan(values[index - 1]);
    }

    for (const [index, value] of values.entries()) {
      expect(value % 0.25, `${scale[index]} must be a multiple of 0.25rem`).toBe(0);
    }
  });

  it('keeps explanatory motion calm and ease-out', () => {
    expect(token('--duration-calm')).toBe('480ms');
    expect(token('--duration-slow')).toBe('720ms');
    expect(token('--duration-act')).toBe('900ms');

    for (const name of ['--ease-out', '--ease-calm', '--ease-in-out']) {
      expect(token(name), `${name} must be a cubic-bezier curve`).toMatch(/^cubic-bezier\(/);
    }
  });

  it('does not use raw colours outside tokens.css', () => {
    const files = walk(join(ROOT, 'src')).filter(
      (path) => /\.(astro|css|svelte|ts)$/.test(path) && path !== TOKENS_PATH,
    );
    const offenders: string[] = [];

    for (const path of files) {
      const source = stripComments(readFileSync(path, 'utf8'));
      for (const match of source.matchAll(/#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\(/gi)) {
        offenders.push(`${relative(ROOT, path)}: ${match[0]}`);
      }
    }

    expect(offenders, 'Use var(--color-*) tokens instead of raw colour values').toEqual([]);
  });

  it('resolves every design-token var() reference to a defined token', () => {
    const files = walk(join(ROOT, 'src')).filter((path) => /\.(astro|css|svelte|ts)$/.test(path));
    const tokenPrefixes =
      'color|space|text|font|weight|leading|tracking|radius|shadow|z|duration|ease|measure|page|header|hairline|rule|tap|focus';
    const reference = new RegExp(`var\\(\\s*(--(?:${tokenPrefixes})-[a-z0-9-]+)`, 'gi');
    const missing: string[] = [];

    for (const path of files) {
      if (path === TOKENS_PATH) continue;
      const source = stripComments(readFileSync(path, 'utf8'));
      for (const match of source.matchAll(reference)) {
        if (!tokens.has(match[1])) {
          missing.push(`${relative(ROOT, path)}: ${match[1]}`);
        }
      }
    }

    expect(missing, 'Every token reference must be declared in tokens.css').toEqual([]);
  });
});

describe('self-hosted fonts', () => {
  it('declares the three families and points at files that exist', () => {
    for (const family of ['Instrument Serif', 'Geist', 'JetBrains Mono']) {
      expect(BASE_SOURCE, `${family} @font-face is missing`).toContain(`font-family: "${family}"`);
    }

    const fontUrls = [...BASE_SOURCE.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)].map(
      (match) => match[1],
    );
    expect(fontUrls.length).toBe(4);

    for (const url of fontUrls) {
      expect(statSync(join(ROOT, 'public', url)).isFile(), `${url} is missing`).toBe(true);
    }
  });

  it('preloads only the critical faces', () => {
    const preloads = [...LAYOUT_SOURCE.matchAll(/rel="preload"[\s\S]*?href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(preloads).toEqual([
      '/fonts/geist-latin-wght-normal.woff2',
      '/fonts/instrument-serif-latin-400-normal.woff2',
    ]);

    const fontRequests = [...BASE_SOURCE.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)].map(
      (match) => match[1],
    );
    for (const url of preloads) {
      expect(fontRequests).toContain(url);
    }
  });

  it('declares metric-matched fallbacks for all three families', () => {
    for (const family of [
      'Instrument Serif Fallback',
      'Geist Fallback',
      'JetBrains Mono Fallback',
    ]) {
      expect(BASE_SOURCE).toContain(`font-family: "${family}"`);
    }

    expect((BASE_RULES.match(/(?<![\w-])size-adjust:/g) ?? []).length).toBe(4);
    expect((BASE_RULES.match(/ascent-override:/g) ?? []).length).toBe(4);
    expect((BASE_RULES.match(/descent-override:/g) ?? []).length).toBe(4);
    expect((BASE_RULES.match(/line-gap-override:/g) ?? []).length).toBe(4);
  });

  it('does not reference a third-party font CDN', () => {
    const sources = [BASE_SOURCE, LAYOUT_SOURCE].join('\n');
    expect(sources).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });
});
