/**
 * Typed story URL state.
 *
 * A story URL has three parts:
 *
 * - the **path** names the story (`/stories/<slug>`);
 * - the **query** carries typed parameters and the seed;
 * - the **fragment** carries the canonical chapter id (`#chapter-id`).
 *
 * This module owns the query and fragment only. It is pure, DOM-free, and
 * runs in Node, so the controller, build scripts, and unit tests share one
 * implementation. Browser code supplies `window.location.href`, applies the
 * returned values, and calls `history.replaceState` with the canonical
 * relative URL.
 *
 * ## Encoding policy
 *
 * - Parameters are emitted in the schema's declaration order, never object key
 *   order. That makes canonical links stable.
 * - Values equal to the story defaults are omitted when the caller supplies
 *   `defaults` (the controller always does). `serializeUrlState` without
 *   `defaults` emits every declared parameter, which is useful for tests and
 *   diagnostics.
 * - Numbers use JavaScript's shortest round-trip representation
 *   (`String(value)`); booleans are the literals `true` and `false`; enums use
 *   the enum value's string form.
 * - The query starts with `?` when non-empty and is `''` otherwise. The
 *   fragment starts with `#` when non-empty and is `''` otherwise.
 * - Only declared query fields are serialized. Unknown fields, secrets, and
 *   personal data cannot leak into a canonical URL.
 *
 * ## Validation
 *
 * The table in `docs/requirements.md` §2.6.1 is implemented as follows:
 *
 * - a finite numeric value outside its range is clamped and reported with an
 *   "adjusted to X" notice;
 * - an unknown enum value falls back to the story default and reports a
 *   notice;
 * - malformed numbers, `NaN`, `Infinity`, and non-integer values for integer
 *   fields are invalid typed input: they fall back to the default, report a
 *   notice, and are not marked explicit;
 * - booleans accept `true`/`false`, `1`/`0`, `yes`/`no`, and `on`/`off`
 *   (case-insensitive); anything else falls back to the default with a notice;
 * - repeated keys use the first value and report a notice;
 * - unknown query keys are ignored; prototype-pollution keys are rejected;
 * - a fragment that does not name a known chapter is ignored with a notice.
 *
 * Parse results distinguish the effective `values` from `explicit`: only
 * values that were present and accepted (including clamped values) are
 * explicit. The controller applies `explicit` on top of chapter entry so an
 * invalid URL value cannot silently override a chapter's typed override.
 */

export interface UrlParamBase<P extends object, K extends keyof P & string> {
  /** Parameter key in the story's typed parameter object. */
  readonly key: K;
  /** Query-string field name. The chapter is always the fragment, not a query. */
  readonly query: string;
  /** Structural changes restart the run at iteration 0; others apply live. */
  readonly structural: boolean;
  /** Human-readable name for notices such as "adjusted to X". */
  readonly label?: string;
}

export interface IntegerUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'integer';
  readonly min: number;
  readonly max: number;
}

export interface NumberUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'number';
  readonly min: number;
  readonly max: number;
  readonly step?: number;
}

export interface EnumUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'enum';
  readonly values: readonly P[K][];
}

export interface BooleanUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'boolean';
}

export interface StringUrlParam<P extends object, K extends keyof P & string>
  extends UrlParamBase<P, K> {
  readonly kind: 'string';
}

/**
 * One declared URL field. The union is keyed by the parameter object, so a
 * spec cannot reference a parameter that does not exist; the value kind follows
 * the parameter's TypeScript type. Defaults live in `StoryConfig.defaults`, so
 * there is one source of truth for a run's starting values.
 */
export type UrlParamSpec<P extends object> = {
  [K in keyof P & string]:
    | (P[K] extends number
        ? IntegerUrlParam<P, K> | NumberUrlParam<P, K> | EnumUrlParam<P, K>
        : never)
    | (P[K] extends string ? EnumUrlParam<P, K> | StringUrlParam<P, K> : never)
    | (P[K] extends boolean ? BooleanUrlParam<P, K> : never);
}[keyof P & string];

/**
 * The story's URL contract: query parameters plus the canonical chapter
 * fragment. The slug is a path segment supplied by `StoryConfig.slug`.
 */
export interface UrlParameterSchema<P extends object> {
  readonly params: readonly UrlParamSpec<P>[];
  readonly chapter: { readonly source: 'fragment' };
}

export type UrlStateNoticeCode =
  | 'clamped'
  | 'enum-fallback'
  | 'invalid'
  | 'duplicate'
  | 'rejected-key'
  | 'unknown-chapter';

export type UrlStateNoticeSeverity = 'info' | 'warning' | 'error';

/** A structured, user-facing explanation produced while parsing a URL. */
export interface UrlStateNotice {
  readonly code: UrlStateNoticeCode;
  /** Query field name, when the notice is about one parameter. */
  readonly field?: string;
  readonly severity: UrlStateNoticeSeverity;
  readonly message: string;
}

/** Input accepted by `parseUrlState`: a URL string or already-split fields. */
export type UrlStateSource =
  | string
  | {
      readonly search?: string;
      readonly hash?: string;
    };

export interface ParseUrlStateOptions {
  /** Known chapter ids. When supplied, unknown fragments are rejected. */
  readonly chapterIds?: readonly string[];
}

export interface ParsedUrlState<P extends object> {
  /** Effective values: defaults with explicit and clamped fields applied. */
  readonly values: P;
  /** Values that were present in the URL and accepted, including clamps. */
  readonly explicit: Partial<P>;
  readonly chapter: string | null;
  readonly notices: readonly UrlStateNotice[];
}

export interface SerializeUrlStateOptions<P extends object> {
  /**
   * The story's single source of default values. Supplying it enables default
   * omission; pass `omitDefaults: false` to emit every parameter explicitly.
   */
  readonly defaults?: P;
  /** Overrides the default omission rule (`defaults !== undefined`). */
  readonly omitDefaults?: boolean;
  /** Known chapter ids. An unknown chapter is omitted from the fragment. */
  readonly chapterIds?: readonly string[];
}

export interface SerializedUrlState {
  /** Canonical query including a leading `?`, or `''`. */
  readonly query: string;
  /** Canonical fragment including a leading `#`, or `''`. */
  readonly fragment: string;
  /** `query + fragment`; safe to pass to `history.replaceState`. */
  readonly relative: string;
}

interface UrlParamRule {
  readonly kind: 'integer' | 'number' | 'enum' | 'boolean' | 'string';
  readonly key: string;
  readonly query: string;
  readonly structural: boolean;
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly values?: readonly unknown[];
}

interface ValidationOutcome {
  readonly value: unknown;
  /** True when the value may be applied as an explicit URL override. */
  readonly accepted: boolean;
  readonly notice: UrlStateNotice | null;
}

const URL_STATE_BASE = 'https://url-state.invalid/';

/**
 * Names that must never be written from a query string. The parser already
 * builds a fresh values object from defaults and only reads declared fields,
 * but an explicit guard documents the threat model and keeps a future
 * schema from ever accepting one of these names.
 */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/** Strict decimal syntax. Rejects hex, empty strings, `NaN`, and `Infinity`. */
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const TRUE_VALUES: ReadonlySet<string> = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES: ReadonlySet<string> = new Set(['false', '0', 'no', 'off']);

function rulesOf<P extends object>(schema: UrlParameterSchema<P>): readonly UrlParamRule[] {
  return schema.params as unknown as readonly UrlParamRule[];
}

function labelFor(rule: UrlParamRule): string {
  return rule.label ?? rule.query;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function parseFiniteNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !DECIMAL_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Clamp a finite number to an inclusive range. Non-finite input returns the
 * lower bound so callers never publish `NaN` or `Infinity`.
 */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamp an integer to an inclusive integer range; the result stays an integer. */
export function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Math.trunc(min);
  return Math.trunc(clampNumber(value, Math.trunc(min), Math.trunc(max)));
}

function invalidNotice(rule: UrlParamRule, raw: string, fallback: unknown): UrlStateNotice {
  return {
    code: 'invalid',
    field: rule.query,
    severity: 'error',
    message: `Invalid ${labelFor(rule)} "${raw}". Using ${formatValue(fallback)}.`,
  };
}

function clampNotice(rule: UrlParamRule, value: number): UrlStateNotice {
  return {
    code: 'clamped',
    field: rule.query,
    severity: 'warning',
    message: `${labelFor(rule)} adjusted to ${formatValue(value)}.`,
  };
}

function validateRuleValue(rule: UrlParamRule, raw: string, fallback: unknown): ValidationOutcome {
  switch (rule.kind) {
    case 'integer': {
      const parsed = parseFiniteNumber(raw);
      if (parsed === null || !Number.isInteger(parsed)) {
        return { value: fallback, accepted: false, notice: invalidNotice(rule, raw, fallback) };
      }
      const min = rule.min ?? Number.MIN_SAFE_INTEGER;
      const max = rule.max ?? Number.MAX_SAFE_INTEGER;
      const clamped = clampInteger(parsed, min, max);
      if (clamped !== parsed) {
        return { value: clamped, accepted: true, notice: clampNotice(rule, clamped) };
      }
      return { value: parsed, accepted: true, notice: null };
    }

    case 'number': {
      const parsed = parseFiniteNumber(raw);
      if (parsed === null) {
        return { value: fallback, accepted: false, notice: invalidNotice(rule, raw, fallback) };
      }
      const min = rule.min ?? Number.NEGATIVE_INFINITY;
      const max = rule.max ?? Number.POSITIVE_INFINITY;
      const clamped = clampNumber(parsed, min, max);
      if (clamped !== parsed) {
        return { value: clamped, accepted: true, notice: clampNotice(rule, clamped) };
      }
      return { value: parsed, accepted: true, notice: null };
    }

    case 'enum': {
      const values = rule.values ?? [];
      const matched = values.find((candidate) => formatValue(candidate) === raw.trim());
      if (matched === undefined) {
        return {
          value: fallback,
          accepted: false,
          notice: {
            code: 'enum-fallback',
            field: rule.query,
            severity: 'warning',
            message: `Unknown ${labelFor(rule)} "${raw.trim()}". Using ${formatValue(fallback)}.`,
          },
        };
      }
      return { value: matched, accepted: true, notice: null };
    }

    case 'boolean': {
      const normalized = raw.trim().toLowerCase();
      if (TRUE_VALUES.has(normalized)) {
        return { value: true, accepted: true, notice: null };
      }
      if (FALSE_VALUES.has(normalized)) {
        return { value: false, accepted: true, notice: null };
      }
      return { value: fallback, accepted: false, notice: invalidNotice(rule, raw, fallback) };
    }

    case 'string': {
      // The schema carries no length or pattern constraint yet. Keep the raw
      // value rather than guessing; a story that needs a bounded string should
      // model it as an enum.
      return { value: raw, accepted: true, notice: null };
    }
  }
}

function resolveSource(source: UrlStateSource): { search: string; hash: string } {
  if (typeof source === 'string') {
    const url = new URL(source, URL_STATE_BASE);
    return {
      search: url.search.startsWith('?') ? url.search.slice(1) : url.search,
      hash: url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
    };
  }

  const searchValue = source.search ?? '';
  const hashValue = source.hash ?? '';
  let search = searchValue.startsWith('?') ? searchValue.slice(1) : searchValue;
  let hash = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;

  // Accept a complete relative URL in `search` too, so callers are not
  // required to split before calling.
  if (hash.length === 0) {
    const hashIndex = search.indexOf('#');
    if (hashIndex >= 0) {
      hash = search.slice(hashIndex + 1);
      search = search.slice(0, hashIndex);
    }
  }

  return { search, hash };
}

function readChapter(fragment: string): string {
  if (fragment.length === 0) return '';
  try {
    return decodeURIComponent(fragment);
  } catch {
    // Malformed percent encoding is still a fragment; treat it as unknown
    // rather than throwing during load.
    return fragment;
  }
}

function serializeValue(value: unknown): string {
  return typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
}

function normalizeForSerialization(rule: UrlParamRule, value: unknown): ValidationOutcome {
  switch (rule.kind) {
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        return { value, accepted: false, notice: null };
      }
      const min = rule.min ?? Number.MIN_SAFE_INTEGER;
      const max = rule.max ?? Number.MAX_SAFE_INTEGER;
      return { value: clampInteger(value, min, max), accepted: true, notice: null };
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { value, accepted: false, notice: null };
      }
      const min = rule.min ?? Number.NEGATIVE_INFINITY;
      const max = rule.max ?? Number.POSITIVE_INFINITY;
      return { value: clampNumber(value, min, max), accepted: true, notice: null };
    }
    case 'enum': {
      const values = rule.values ?? [];
      const matched = values.find((candidate) => Object.is(candidate, value));
      return matched === undefined
        ? { value, accepted: false, notice: null }
        : { value: matched, accepted: true, notice: null };
    }
    case 'boolean':
      return typeof value === 'boolean'
        ? { value, accepted: true, notice: null }
        : { value, accepted: false, notice: null };
    case 'string':
      return typeof value === 'string'
        ? { value, accepted: true, notice: null }
        : { value, accepted: false, notice: null };
  }
}

/**
 * Serialize a story state into a canonical query and chapter fragment.
 *
 * Values that are missing, the wrong type, non-finite, or not members of an
 * enum are omitted rather than encoded as nonsense. Numeric values are clamped
 * so a caller can never publish a URL outside the schema's declared range.
 */
export function serializeUrlState<P extends object>(
  schema: UrlParameterSchema<P>,
  values: P,
  chapter: string | null | undefined,
  options: SerializeUrlStateOptions<P> = {},
): SerializedUrlState {
  const rules = rulesOf(schema);
  const valueRecord = values as unknown as Record<string, unknown>;
  const defaultRecord =
    options.defaults === undefined
      ? undefined
      : (options.defaults as unknown as Record<string, unknown>);
  const omitDefaults = options.omitDefaults ?? defaultRecord !== undefined;

  const search = new URLSearchParams();
  for (const rule of rules) {
    const normalized = normalizeForSerialization(rule, valueRecord[rule.key]);
    if (!normalized.accepted) continue;
    if (
      omitDefaults &&
      defaultRecord !== undefined &&
      Object.is(normalized.value, defaultRecord[rule.key])
    ) {
      continue;
    }
    search.append(rule.query, serializeValue(normalized.value));
  }

  const query = search.toString();
  const chapterValue = typeof chapter === 'string' ? chapter : '';
  const chapterIsKnown =
    chapterValue.length > 0 &&
    (options.chapterIds === undefined || options.chapterIds.includes(chapterValue));
  const fragment = chapterIsKnown ? `#${encodeURIComponent(chapterValue)}` : '';

  return {
    query: query.length > 0 ? `?${query}` : '',
    fragment,
    relative: `${query.length > 0 ? `?${query}` : ''}${fragment}`,
  };
}

/**
 * Parse a URL (or its query and fragment) into typed values, an explicit
 * override set, a validated chapter, and structured notices.
 *
 * The function never throws for malformed input. It never reads the DOM and it
 * never mutates the source URL. The caller decides whether to apply the values
 * and whether to rewrite the address bar with the canonical form.
 */
export function parseUrlState<P extends object>(
  schema: UrlParameterSchema<P>,
  defaults: P,
  source: UrlStateSource,
  options: ParseUrlStateOptions = {},
): ParsedUrlState<P> {
  const rules = rulesOf(schema);
  const ruleByQuery = new Map<string, UrlParamRule>();
  for (const rule of rules) {
    ruleByQuery.set(rule.query, rule);
  }

  const { search, hash } = resolveSource(source);
  const params = new URLSearchParams(search);
  const defaultsRecord = defaults as unknown as Record<string, unknown>;

  const valuesRecord: Record<string, unknown> = { ...defaultsRecord };
  const explicitRecord: Record<string, unknown> = {};
  const notices: UrlStateNotice[] = [];
  const seen = new Set<string>();

  for (const key of params.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);

    if (RESERVED_KEYS.has(key)) {
      notices.push({
        code: 'rejected-key',
        field: key,
        severity: 'warning',
        message: `Rejected reserved query field "${key}".`,
      });
      continue;
    }

    const rule = ruleByQuery.get(key);
    if (rule === undefined) {
      // Unknown fields are ignored. They may belong to another feature (for
      // example the development-only `lenis` switch) and are not story state.
      continue;
    }

    const rawValues = params.getAll(key);
    if (rawValues.length > 1) {
      notices.push({
        code: 'duplicate',
        field: key,
        severity: 'warning',
        message: `Repeated ${labelFor(rule)} in the URL. Using the first value.`,
      });
    }

    const raw = rawValues[0] ?? '';
    const fallback = defaultsRecord[rule.key];
    const outcome = validateRuleValue(rule, raw, fallback);
    if (outcome.accepted) {
      valuesRecord[rule.key] = outcome.value;
      explicitRecord[rule.key] = outcome.value;
    }
    if (outcome.notice !== null) {
      notices.push(outcome.notice);
    }
  }

  const decodedChapter = readChapter(hash);
  let chapter: string | null = null;
  if (decodedChapter.length > 0) {
    if (options.chapterIds === undefined || options.chapterIds.includes(decodedChapter)) {
      chapter = decodedChapter;
    } else {
      notices.push({
        code: 'unknown-chapter',
        severity: 'warning',
        message: `Unknown chapter "${decodedChapter}". Ignoring the fragment.`,
      });
    }
  }

  return {
    values: valuesRecord as P,
    explicit: explicitRecord as Partial<P>,
    chapter,
    notices,
  };
}
