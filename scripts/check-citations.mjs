#!/usr/bin/env node
/**
 * External citation checker for story references.
 *
 * The script reads every story's frontmatter, extracts the `references` list,
 * and verifies each DOI or URL. DOIs are checked through the official handle
 * API (`https://doi.org/api/handles/<doi>`), which returns the registration
 * status without sending the request on to the publisher; that avoids the
 * bot walls that make publisher landing pages unreliable for automation. Plain
 * URLs are fetched with a timeout and redirects enabled.
 *
 * Status rules (`docs/requirements.md` FR-CONTENT-05):
 *   - ok      2xx/3xx URL, or a registered DOI handle.
 *   - warning 401/403/405/429/5xx, a timeout, or a network error. The citation
 *             may well resolve in a browser; automation cannot prove it here.
 *   - failed  malformed DOI/URL, or an explicit 404/410.
 *
 * The ACO story must list at least three citations (a content requirement).
 * In the default mode the run passes when at least three ACO citations resolve.
 * If network conditions leave fewer than three resolvable but nothing is
 * actually broken, the floor is reported as "not enforced" and the run still
 * passes, so CI does not fail on a publisher block or an offline runner. Use
 * `--require-resolution` to make the floor strict.
 *
 * Usage:
 *   node scripts/check-citations.mjs
 *   node scripts/check-citations.mjs --offline
 *   node scripts/check-citations.mjs --require-resolution --timeout=20000
 *
 * `--offline` validates formats and reports every citation as skipped; it makes
 * no network requests. `COMMIT`/CI does not run this script yet (Step 8.1 owns
 * the full gate); `pnpm check:citations` is the local entry point.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const STORIES_DIR = path.resolve('src/content/stories');
const USER_AGENT =
  'algorithm-stories-citation-check/1.0 (+https://visualizations.ruul.ee/colophon)';
const DEFAULT_TIMEOUT_MS = 15_000;
const ACO_SLUG = 'ant-colony-optimization';
const ACO_FLOOR = 3;

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const requireResolution = args.includes('--require-resolution');
const help = args.includes('--help') || args.includes('-h');

function parseTimeout() {
  const inline = args.find((argument) => argument.startsWith('--timeout='));
  const fromArgs = inline?.slice('--timeout='.length);
  const raw = fromArgs ?? process.env.CITATION_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1_000) {
    console.error(`[check:citations] Invalid timeout "${raw}"; using ${DEFAULT_TIMEOUT_MS} ms.`);
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.floor(value);
}

const timeoutMs = parseTimeout();

const DOI_RE = /^10\.\d{4,9}\/\S+$/;

/** Print usage; `--offline` and `--require-resolution` are the two affordances. */
function printHelp() {
  console.log(`Usage: node scripts/check-citations.mjs [options]

Options:
  --offline              Validate citation formats only; make no network requests.
  --require-resolution   Fail when fewer than ${ACO_FLOOR} ACO citations resolve.
  --timeout=<ms>         Per-request timeout (default ${DEFAULT_TIMEOUT_MS}).
  -h, --help             Show this message.

Status semantics:
  ok       a registered DOI handle or a 2xx/3xx URL
  warning  401/403/405/429/5xx, timeout, or network error
  failed   malformed citation, or HTTP 404/410
`);
}

/** Read the YAML frontmatter block without pulling in a YAML dependency. */
function extractFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

/** Strip one matching pair of quotes; leave other values untouched. */
function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse the `references:` list.
 *
 * The story schema uses one list item per source with four-space-indented
 * continuation keys, so a deliberately small parser is enough. Anything that
 * does not match the documented shape is reported as a malformed citation
 * rather than silently skipped.
 */
function parseReferences(frontmatter) {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => /^references:\s*$/.test(line));
  if (start === -1) return [];

  const references = [];
  let current = null;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line)) break; // the next top-level frontmatter key

    const item = line.match(/^\s{2,}-\s*(.*)$/);
    if (item) {
      current = {};
      references.push(current);
      const inline = item[1].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (inline) current[inline[1]] = unquote(inline[2]);
      continue;
    }

    if (!current) continue;
    const keyValue = line.match(/^\s{4,}([A-Za-z][\w-]*):\s*(.*)$/);
    if (keyValue) current[keyValue[1]] = unquote(keyValue[2]);
  }

  return references;
}

/** List the story MDX files under `src/content/stories`. */
async function listStoryFiles() {
  const entries = await readdir(STORIES_DIR, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(STORIES_DIR, entry.name, 'index.mdx');
    try {
      const source = await readFile(candidate, 'utf8');
      files.push({ slug: entry.name, source });
    } catch {
      // A directory without an index.mdx is not a story collection entry.
    }
  }
  return files;
}

/** Build the citation inventory and validate each locator's shape. */
async function collectCitations() {
  const files = await listStoryFiles();
  const citations = [];
  const problems = [];

  for (const file of files) {
    const frontmatter = extractFrontmatter(file.source);
    if (frontmatter === null) {
      problems.push({ story: file.slug, title: '(frontmatter)', detail: 'missing frontmatter' });
      continue;
    }

    const references = parseReferences(frontmatter);
    for (const [index, reference] of references.entries()) {
      const title = reference.title ?? `(reference ${index + 1})`;
      const doi = reference.doi;
      const url = reference.url;

      if (doi !== undefined && doi !== '') {
        if (!DOI_RE.test(doi)) {
          citations.push({
            story: file.slug,
            title,
            locator: `doi:${doi}`,
            kind: 'doi',
            value: doi,
            status: 'failed',
            detail: 'malformed DOI',
          });
          continue;
        }
        citations.push({
          story: file.slug,
          title,
          locator: `doi:${doi}`,
          kind: 'doi',
          value: doi,
          status: 'pending',
        });
        continue;
      }

      if (url !== undefined && url !== '') {
        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          citations.push({
            story: file.slug,
            title,
            locator: url,
            kind: 'url',
            value: url,
            status: 'failed',
            detail: 'malformed URL',
          });
          continue;
        }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          citations.push({
            story: file.slug,
            title,
            locator: url,
            kind: 'url',
            value: url,
            status: 'failed',
            detail: `unsupported protocol ${parsed.protocol}`,
          });
          continue;
        }
        citations.push({
          story: file.slug,
          title,
          locator: url,
          kind: 'url',
          value: url,
          status: 'pending',
        });
        continue;
      }

      citations.push({
        story: file.slug,
        title,
        locator: '(none)',
        kind: 'none',
        value: '',
        status: 'failed',
        detail: 'reference has neither doi nor url',
      });
    }
  }

  return { citations, problems, storyCount: files.length };
}

/** Fetch a URL with a timeout, redirects, and a descriptive user agent. */
async function fetchWithTimeout(url, accept) {
  return fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      accept,
      'user-agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Describe a network failure without pretending it is a dead citation. */
function describeNetworkError(error) {
  const causeCode = error?.cause?.code;
  if (error?.name === 'TimeoutError') return `timeout after ${timeoutMs} ms`;
  if (causeCode) return `network error (${causeCode})`;
  return `network error (${error?.name ?? 'unknown'})`;
}

/**
 * Check one DOI through the handle API.
 *
 * The handle API is the registration authority, so a 200 with
 * `responseCode: 1` means the DOI is registered even when the publisher's
 * landing page would answer a bot with 403.
 */
async function checkDoi(doi) {
  let response;
  try {
    response = await fetchWithTimeout(
      `https://doi.org/api/handles/${doi}`,
      'application/json;q=0.9,text/plain;q=0.5',
    );
  } catch (error) {
    return { status: 'warning', detail: describeNetworkError(error), network: true };
  }

  if (response.status === 404 || response.status === 410) {
    return { status: 'failed', detail: `handle API HTTP ${response.status}` };
  }
  if (!response.ok) {
    return { status: 'warning', detail: `handle API HTTP ${response.status}` };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: 'warning', detail: 'handle API returned unreadable JSON' };
  }

  if (payload?.responseCode === 1) {
    return { status: 'ok', detail: 'registered handle' };
  }
  return {
    status: 'failed',
    detail: `handle responseCode ${String(payload?.responseCode)}`,
  };
}

/** Check one ordinary URL; 404/410 fail, everything else unreachable warns. */
async function checkUrl(url) {
  let response;
  try {
    response = await fetchWithTimeout(
      url,
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.6',
    );
  } catch (error) {
    return { status: 'warning', detail: describeNetworkError(error), network: true };
  }

  // Do not download the whole page just to read the status line.
  await response.body?.cancel().catch(() => {});

  if (response.status === 404 || response.status === 410) {
    return { status: 'failed', detail: `HTTP ${response.status}` };
  }
  if (response.status >= 200 && response.status < 400) {
    return { status: 'ok', detail: `HTTP ${response.status}` };
  }
  return { status: 'warning', detail: `HTTP ${response.status}` };
}

/** Resolve every pending citation in parallel. */
async function resolveCitations(citations) {
  await Promise.all(
    citations.map(async (citation) => {
      if (citation.status === 'failed') return;
      if (offline) {
        citation.status = 'skipped';
        citation.detail = 'offline: format only';
        return;
      }
      const result =
        citation.kind === 'doi' ? await checkDoi(citation.value) : await checkUrl(citation.value);
      citation.status = result.status;
      citation.detail = result.detail;
      citation.network = result.network === true;
    }),
  );
}

function truncate(value, width) {
  if (value.length <= width) return value.padEnd(width);
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

/** Print a fixed-width table that stays readable in a terminal. */
function printTable(citations) {
  const columns = [
    { key: 'story', label: 'Story', width: 30 },
    { key: 'title', label: 'Citation', width: 44 },
    { key: 'locator', label: 'Locator', width: 46 },
    { key: 'status', label: 'Status', width: 7 },
    { key: 'detail', label: 'Detail', width: 0 },
  ];

  const header = columns.map((column) => truncate(column.label, column.width || 20)).join('  ');
  console.log(header);
  console.log(columns.map((column) => '─'.repeat(column.width || 20)).join('  '));

  for (const citation of citations) {
    const status = citation.status;
    const detail = citation.detail ?? '';
    console.log(
      [
        truncate(citation.story, 30),
        truncate(citation.title, 44),
        truncate(citation.locator, 46),
        truncate(status, 7),
        detail,
      ].join('  '),
    );
  }
}

async function main() {
  if (help) {
    printHelp();
    return;
  }

  const { citations, problems, storyCount } = await collectCitations();

  if (problems.length > 0) {
    console.error('[check:citations] Frontmatter problems:');
    for (const problem of problems) {
      console.error(`  ${problem.story}: ${problem.detail}`);
    }
    process.exitCode = 1;
  }

  if (citations.length === 0) {
    console.error(`[check:citations] No references found in ${storyCount} story file(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[check:citations] ${citations.length} citation(s) across ${storyCount} story file(s)${offline ? ' (offline)' : ''}.`,
  );

  await resolveCitations(citations);
  printTable(citations);

  const counts = { ok: 0, warning: 0, failed: 0, skipped: 0 };
  for (const citation of citations) counts[citation.status] += 1;

  console.log('');
  console.log(
    `Summary: ${counts.ok} ok, ${counts.warning} warning, ${counts.failed} failed, ${counts.skipped} skipped.`,
  );

  if (counts.failed > 0) {
    console.error(
      `[check:citations] ${counts.failed} citation(s) failed. Malformed citations and 404/410 responses are hard failures.`,
    );
    process.exitCode = 1;
    return;
  }

  const aco = citations.filter((citation) => citation.story === ACO_SLUG);
  if (aco.length < ACO_FLOOR) {
    console.error(
      `[check:citations] ${ACO_SLUG} has ${aco.length} citation(s); at least ${ACO_FLOOR} are required.`,
    );
    process.exitCode = 1;
    return;
  }

  const acoOk = aco.filter((citation) => citation.status === 'ok').length;
  const unverifiable = aco.filter(
    (citation) => citation.status === 'warning' || citation.status === 'skipped',
  ).length;

  if (offline) {
    if (requireResolution) {
      console.error(
        '[check:citations] --offline cannot verify the resolution floor; drop --require-resolution or run online.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `ACO citations: formats valid; resolution floor not checked in offline mode (${aco.length} listed).`,
    );
    return;
  }

  if (acoOk >= ACO_FLOOR) {
    console.log(`ACO citations: ${acoOk} of ${aco.length} resolved (floor ${ACO_FLOOR}) — pass.`);
    return;
  }

  if (requireResolution) {
    console.error(
      `[check:citations] ACO citations: ${acoOk} of ${aco.length} resolved (floor ${ACO_FLOOR}) — required floor not met.`,
    );
    process.exitCode = 1;
    return;
  }

  console.warn(
    `[check:citations] ACO citations: ${acoOk} of ${aco.length} resolved; ${unverifiable} could not be verified (publisher block, timeout, or offline runner).`,
  );
  console.warn(
    '[check:citations] Resolution floor not enforced. Re-run when the network is available, or use --require-resolution to make it strict.',
  );
}

await main();
