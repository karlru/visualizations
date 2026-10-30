import { describe, expect, it } from 'vitest';
import {
  clampInteger,
  clampNumber,
  parseUrlState,
  serializeUrlState,
  type UrlParameterSchema,
  type UrlStateNoticeCode,
} from '../../src/engines/core/url-state';

interface SmokeParams {
  readonly seed: number;
  readonly orbit: number;
  readonly variant: 'orbit' | 'spiral';
  readonly trails: boolean;
}

const defaults: SmokeParams = {
  seed: 42,
  orbit: 1,
  variant: 'orbit',
  trails: true,
};

const chapterIds = ['the-moving-point', 'a-closer-look', 'the-turn', 'pulling-back'] as const;

const schema: UrlParameterSchema<SmokeParams> = {
  params: [
    {
      kind: 'integer',
      key: 'seed',
      query: 'seed',
      structural: true,
      min: 0,
      max: 4_294_967_295,
      label: 'Seed',
    },
    {
      kind: 'number',
      key: 'orbit',
      query: 'orbit',
      structural: false,
      min: 0.4,
      max: 2.4,
      step: 0.05,
      label: 'Orbit radius',
    },
    {
      kind: 'enum',
      key: 'variant',
      query: 'variant',
      structural: true,
      values: ['orbit', 'spiral'],
      label: 'Variant',
    },
    {
      kind: 'boolean',
      key: 'trails',
      query: 'trails',
      structural: false,
      label: 'Ant trails',
    },
  ],
  chapter: { source: 'fragment' },
};

const serializeOptions = { defaults, chapterIds } as const;

function parse(search: string, hash = '') {
  // `serializeUrlState().relative` is a complete query+fragment string. The
  // other calls pass already-split fields, matching the two accepted forms.
  if (hash.length === 0 && search.includes('#')) {
    return parseUrlState(schema, defaults, search, { chapterIds });
  }
  return parseUrlState(schema, defaults, { search, hash }, { chapterIds });
}

function codesOf(result: ReturnType<typeof parse>): UrlStateNoticeCode[] {
  return result.notices.map((notice) => notice.code);
}

describe('serializeUrlState', () => {
  it('emits every declared parameter in schema order, not object key order', () => {
    const values: SmokeParams = {
      trails: false,
      variant: 'spiral',
      orbit: 1.35,
      seed: 7,
    };

    const serialized = serializeUrlState(schema, values, 'the-turn', serializeOptions);

    expect(serialized.query).toBe('?seed=7&orbit=1.35&variant=spiral&trails=false');
    expect(serialized.fragment).toBe('#the-turn');
    expect(serialized.relative).toBe('?seed=7&orbit=1.35&variant=spiral&trails=false#the-turn');
  });

  it('omits defaults when defaults are supplied, leaving the chapter fragment alone', () => {
    const serialized = serializeUrlState(schema, defaults, 'the-turn', serializeOptions);

    expect(serialized).toEqual({ query: '', fragment: '#the-turn', relative: '#the-turn' });
  });

  it('can emit defaults explicitly for diagnostics', () => {
    const serialized = serializeUrlState(schema, defaults, null, {
      defaults,
      omitDefaults: false,
      chapterIds,
    });

    expect(serialized.query).toBe('?seed=42&orbit=1&variant=orbit&trails=true');
    expect(serialized.fragment).toBe('');
  });

  it('encodes explicit false and non-default enum values', () => {
    const serialized = serializeUrlState<SmokeParams>(
      schema,
      { ...defaults, trails: false, variant: 'spiral' },
      null,
      serializeOptions,
    );

    expect(serialized.query).toBe('?variant=spiral&trails=false');
  });

  it('omits an unknown chapter fragment when a chapter list is supplied', () => {
    const serialized = serializeUrlState(schema, defaults, 'not-a-chapter', serializeOptions);

    expect(serialized.fragment).toBe('');
    expect(serialized.relative).toBe('');
  });

  it('percent-encodes a chapter id and clamps invalid numeric values', () => {
    const serialized = serializeUrlState(
      schema,
      { ...defaults, seed: -10, orbit: 99 },
      'the turn',
      { defaults },
    );

    expect(serialized.fragment).toBe('#the%20turn');
    expect(serialized.query).toContain('seed=0');
    expect(serialized.query).toContain('orbit=2.4');
  });

  it('never emits undeclared fields, so secrets and personal data cannot leak', () => {
    const values = {
      ...defaults,
      seed: 7,
      token: 'secret-token',
      email: 'reader@example.com',
    } as SmokeParams;

    const serialized = serializeUrlState(schema, values, null, serializeOptions);

    expect(serialized.relative).toBe('?seed=7');
    expect(serialized.relative).not.toContain('secret');
    expect(serialized.relative).not.toContain('reader@example.com');
  });
});

describe('parseUrlState', () => {
  it('round-trips every parameter and the chapter fragment', () => {
    const cases: readonly { readonly name: string; readonly values: SmokeParams }[] = [
      { name: 'seed', values: { ...defaults, seed: 7 } },
      { name: 'orbit', values: { ...defaults, orbit: 1.35 } },
      { name: 'variant', values: { ...defaults, variant: 'spiral' } },
      { name: 'trails', values: { ...defaults, trails: false } },
      {
        name: 'all values',
        values: { seed: 7, orbit: 1.35, variant: 'spiral', trails: false },
      },
    ];

    for (const testCase of cases) {
      const serialized = serializeUrlState(schema, testCase.values, 'the-turn', serializeOptions);
      const parsed = parse(serialized.relative);

      expect(parsed.values, testCase.name).toEqual(testCase.values);
      expect(parsed.chapter, testCase.name).toBe('the-turn');
      expect(parsed.notices, testCase.name).toEqual([]);
      expect(parsed.explicit, testCase.name).toEqual(
        Object.fromEntries(
          Object.entries(testCase.values).filter(
            ([key, value]) => !Object.is(value, defaults[key as keyof SmokeParams]),
          ),
        ),
      );
    }
  });

  it('is idempotent: parse then serialize produces the same canonical URL', () => {
    const values: SmokeParams = { seed: 7, orbit: 1.35, variant: 'spiral', trails: false };
    const first = serializeUrlState(schema, values, 'the-turn', serializeOptions);
    const parsed = parse(first.relative);
    const second = serializeUrlState(schema, parsed.values, parsed.chapter, serializeOptions);

    expect(second).toEqual(first);
  });

  it('returns defaults and no notices for an empty query', () => {
    const parsed = parse('');

    expect(parsed.values).toEqual(defaults);
    expect(parsed.explicit).toEqual({});
    expect(parsed.chapter).toBeNull();
    expect(parsed.notices).toEqual([]);
  });

  it('accepts an absolute URL, a relative URL, and split query/hash fields', () => {
    const absolute = parseUrlState(
      schema,
      defaults,
      'https://example.com/stories/demo?seed=7&orbit=1.5#the-turn',
      { chapterIds },
    );
    const relative = parse('?seed=7&orbit=1.5', '#the-turn');
    const split = parseUrlState(
      schema,
      defaults,
      { search: 'seed=7&orbit=1.5', hash: '#the-turn' },
      { chapterIds },
    );
    const combined = parseUrlState(
      schema,
      defaults,
      { search: '?seed=7&orbit=1.5#the-turn' },
      { chapterIds },
    );

    expect(absolute.values).toMatchObject({ seed: 7, orbit: 1.5 });
    expect(absolute.chapter).toBe('the-turn');
    expect(relative.values).toMatchObject({ seed: 7, orbit: 1.5 });
    expect(relative.chapter).toBe('the-turn');
    expect(split.values).toMatchObject({ seed: 7, orbit: 1.5 });
    expect(split.chapter).toBe('the-turn');
    expect(combined.values).toMatchObject({ seed: 7, orbit: 1.5 });
    expect(combined.chapter).toBe('the-turn');
  });

  it('decodes a percent-encoded chapter fragment without throwing on malformed input', () => {
    const decoded = parseUrlState(schema, defaults, { hash: '#the%20turn' });
    expect(decoded.chapter).toBe('the turn');

    const malformed = parse('', '#%E0%A4%A');
    expect(malformed.chapter).toBeNull();
    expect(codesOf(malformed)).toContain('unknown-chapter');
  });
});

interface ValidationRow {
  readonly name: string;
  readonly search: string;
  readonly hash?: string;
  readonly expected: Partial<SmokeParams>;
  readonly codes: readonly UrlStateNoticeCode[];
  readonly explicit: readonly (keyof SmokeParams)[];
}

describe('validation table (docs/requirements.md §2.6.1)', () => {
  const rows: readonly ValidationRow[] = [
    {
      name: 'numeric value above range clamps with an adjusted notice',
      search: '?orbit=99',
      expected: { orbit: 2.4 },
      codes: ['clamped'],
      explicit: ['orbit'],
    },
    {
      name: 'numeric value below range clamps with an adjusted notice',
      search: '?orbit=-3',
      expected: { orbit: 0.4 },
      codes: ['clamped'],
      explicit: ['orbit'],
    },
    {
      name: 'integer value above range clamps and stays an integer',
      search: '?seed=999999999999999999999999999999',
      expected: { seed: 4_294_967_295 },
      codes: ['clamped'],
      explicit: ['seed'],
    },
    {
      name: 'unknown enum falls back to the default with a notice',
      search: '?variant=warp',
      expected: { variant: 'orbit' },
      codes: ['enum-fallback'],
      explicit: [],
    },
    {
      name: 'a non-integer value in an integer field is invalid typed input',
      search: '?seed=7.5',
      expected: { seed: 42 },
      codes: ['invalid'],
      explicit: [],
    },
    {
      name: 'NaN is invalid typed input, not a clamp',
      search: '?orbit=NaN',
      expected: { orbit: 1 },
      codes: ['invalid'],
      explicit: [],
    },
    {
      name: 'Infinity is invalid typed input, not a clamp',
      search: '?orbit=Infinity',
      expected: { orbit: 1 },
      codes: ['invalid'],
      explicit: [],
    },
    {
      name: 'a malformed number is invalid typed input',
      search: '?orbit=1.2.3',
      expected: { orbit: 1 },
      codes: ['invalid'],
      explicit: [],
    },
    {
      name: 'an empty number is invalid typed input',
      search: '?orbit=',
      expected: { orbit: 1 },
      codes: ['invalid'],
      explicit: [],
    },
    {
      name: 'hex notation is not a decimal URL number',
      search: '?orbit=0x10',
      expected: { orbit: 1 },
      codes: ['invalid'],
      explicit: [],
    },
    {
      name: 'boolean true forms are accepted',
      search: '?trails=ON',
      expected: { trails: true },
      codes: [],
      explicit: ['trails'],
    },
    {
      name: 'boolean false forms are accepted and marked explicit',
      search: '?trails=off',
      expected: { trails: false },
      codes: [],
      explicit: ['trails'],
    },
    {
      name: 'an invalid boolean falls back to the default with a notice',
      search: '?trails=maybe',
      expected: { trails: true },
      codes: ['invalid'],
      explicit: [],
    },
    {
      name: 'a repeated key uses the first value and reports it',
      search: '?seed=7&seed=8',
      expected: { seed: 7 },
      codes: ['duplicate'],
      explicit: ['seed'],
    },
    {
      name: 'unknown query keys are ignored',
      search: '?utm_source=newsletter&token=secret',
      expected: {},
      codes: [],
      explicit: [],
    },
    {
      name: 'prototype-pollution keys are rejected',
      search: '?__proto__=polluted&prototype=x&constructor=y',
      expected: {},
      codes: ['rejected-key', 'rejected-key', 'rejected-key'],
      explicit: [],
    },
    {
      name: 'an empty query and no fragment produce defaults',
      search: '',
      expected: {},
      codes: [],
      explicit: [],
    },
    {
      name: 'a known fragment is accepted as the chapter',
      search: '',
      hash: '#the-turn',
      expected: {},
      codes: [],
      explicit: [],
    },
    {
      name: 'an unknown fragment is ignored with a notice',
      search: '',
      hash: '#not-a-chapter',
      expected: {},
      codes: ['unknown-chapter'],
      explicit: [],
    },
  ];

  it.each(rows)('$name', (row) => {
    const parsed = parse(row.search, row.hash ?? '');

    expect(parsed.values).toMatchObject(row.expected);
    expect(codesOf(parsed)).toEqual(row.codes);
    expect(Object.keys(parsed.explicit).sort()).toEqual([...row.explicit].sort());
  });

  it('does not mutate Object.prototype when reserved keys are present', () => {
    const parsed = parse('?__proto__=polluted&prototype=x&constructor=y');

    expect(Object.getPrototypeOf(parsed.values)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(parsed.values, 'prototype')).toBe(false);
    expect(Object.hasOwn(parsed.values, 'constructor')).toBe(false);
  });

  it('reports the exact adjusted-to message for a numeric clamp', () => {
    const parsed = parse('?orbit=99');
    const message = parsed.notices.find((notice) => notice.code === 'clamped')?.message;

    expect(message).toBe('Orbit radius adjusted to 2.4.');
  });

  it('preserves number versus integer types after clamping', () => {
    const parsed = parse('?seed=999999999999999999999&orbit=99');

    expect(Number.isInteger(parsed.values.seed)).toBe(true);
    expect(Number.isInteger(parsed.values.orbit)).toBe(false);
    expect(parsed.values.seed).toBe(4_294_967_295);
    expect(parsed.values.orbit).toBe(2.4);
  });
});

describe('clamp helpers', () => {
  it('clamp to the inclusive range and never return non-finite values', () => {
    expect(clampNumber(99, 0.4, 2.4)).toBe(2.4);
    expect(clampNumber(-1, 0.4, 2.4)).toBe(0.4);
    expect(clampNumber(Number.NaN, 0.4, 2.4)).toBe(0.4);
    expect(clampNumber(Number.POSITIVE_INFINITY, 0.4, 2.4)).toBe(0.4);
  });

  it('clamp integers to an integer range and preserve the integer type', () => {
    expect(clampInteger(99, 0, 10)).toBe(10);
    expect(clampInteger(-4, 0, 10)).toBe(0);
    expect(clampInteger(Number.NaN, 0, 10)).toBe(0);
    expect(Number.isInteger(clampInteger(3.9, 0, 10))).toBe(true);
  });
});
