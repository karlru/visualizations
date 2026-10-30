#!/usr/bin/env node
/**
 * Internal link checker for the built static site.
 *
 * It walks every HTML file in `dist/`, extracts navigational links and asset
 * references, and verifies that each root-relative or same-origin target
 * resolves to a file or route in the build output. External origins, anchors,
 * `mailto:`, `tel:`, and `data:` URLs are ignored.
 *
 * Astro uses clean URLs (`trailingSlash: 'never'`), and Cloudflare's
 * `drop-trailing-slash` handling serves the same route without a redirect, so
 * `/stories` and `/stories/` are treated as one target. Anything else that is
 * missing fails the check with the source page and target listed.
 *
 * Usage: node scripts/check-links.mjs   (run `pnpm build` first)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DIST_DIR = path.resolve('dist');
const SITE_CONFIG = path.resolve('src/config/site.ts');

const SKIP_PROTOCOLS = new Set(['mailto:', 'tel:', 'sms:', 'data:', 'javascript:', 'blob:']);
const LINK_RELS = new Set([
  'stylesheet',
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'manifest',
  'preload',
  'modulepreload',
]);
const SRC_TAGS = new Set(['audio', 'embed', 'iframe', 'img', 'script', 'source', 'track', 'video']);

const TAG_RE = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Read the configured production origin so same-origin absolute links count. */
async function readSiteOrigin() {
  try {
    const source = await readFile(SITE_CONFIG, 'utf8');
    const match = source.match(/SITE_URL\s*=\s*['"]([^'"]+)['"]/);
    return match ? new URL(match[1]).origin : null;
  } catch {
    return null;
  }
}

/** Recursively list files under `dir`, as POSIX-style paths relative to it. */
async function walk(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walk(path.join(dir, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

/** Clean URLs compare without a trailing slash; the root keeps its slash. */
function normalizePath(pathname) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape will not match any built file, so keep it as written.
  }
  if (!decoded.startsWith('/')) decoded = `/${decoded}`;
  return decoded.length > 1 && decoded.endsWith('/') ? decoded.slice(0, -1) : decoded;
}

/** Build the set of routes and asset paths the build actually produced. */
function collectTargets(files) {
  const routes = new Set(['/']);
  const assets = new Set();

  for (const file of files) {
    const assetPath = `/${file}`;
    assets.add(assetPath);

    if (file === '404.html') {
      // Cloudflare serves this file for unknown routes; the page's own canonical
      // points at `/404`, which is also a valid request.
      routes.add('/404');
    } else if (file === 'index.html') {
      routes.add('/');
    } else if (file.endsWith('/index.html')) {
      routes.add(normalizePath(assetPath.slice(0, -'index.html'.length)));
    } else if (file.endsWith('.html')) {
      routes.add(normalizePath(assetPath.slice(0, -'.html'.length)));
    }
  }

  return { routes, assets };
}

/** Parse the attributes of one start tag. */
function parseAttributes(source) {
  const attributes = new Map();
  for (const match of source.matchAll(ATTR_RE)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes.set(name, value);
  }
  return attributes;
}

/** Parse one `srcset` value into its candidate URLs. */
function parseSrcset(value) {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/** Extract every internal-looking reference from one HTML document. */
function extractReferences(html) {
  const references = [];

  for (const match of html.matchAll(TAG_RE)) {
    const tag = match[1].toLowerCase();
    const attributes = parseAttributes(match[2]);

    if (tag === 'a') {
      const href = attributes.get('href');
      if (href !== undefined) references.push(href);
      continue;
    }

    if (tag === 'link') {
      const rel = (attributes.get('rel') ?? '').toLowerCase().trim();
      const href = attributes.get('href');
      if (href !== undefined && LINK_RELS.has(rel)) references.push(href);
      continue;
    }

    if (!SRC_TAGS.has(tag)) continue;

    const src = attributes.get('src');
    if (src !== undefined) references.push(src);

    const srcset = attributes.get('srcset');
    if (srcset !== undefined) references.push(...parseSrcset(srcset));

    if (tag === 'video') {
      const poster = attributes.get('poster');
      if (poster !== undefined) references.push(poster);
    }
  }

  return references;
}

/** Resolve one raw reference to an internal path, or null when it is external. */
function toInternalPath(raw, pageUrl, siteOrigin) {
  const value = raw.trim();
  if (!value || value.startsWith('#')) return null;
  if (value.startsWith('//')) return null;

  let url;
  try {
    url = new URL(value, pageUrl);
  } catch {
    return null;
  }

  if (SKIP_PROTOCOLS.has(url.protocol)) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== siteOrigin) return null;

  return normalizePath(url.pathname);
}

/** Map a relative HTML file to the clean URL a browser would use. */
function pagePathFor(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  if (file === '404.html') return '/404';
  return `/${file.slice(0, -'.html'.length)}`;
}

async function main() {
  let files;
  try {
    files = await walk(DIST_DIR);
  } catch {
    console.error(`[check-links] ${DIST_DIR} does not exist. Run \`pnpm build\` first.`);
    process.exit(2);
  }

  const siteOrigin = await readSiteOrigin();
  if (!siteOrigin) {
    console.warn('[check-links] Could not read SITE_URL; absolute links are treated as external.');
  }

  const { routes, assets } = collectTargets(files);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));

  const broken = [];
  let checked = 0;

  for (const file of htmlFiles) {
    const html = await readFile(path.join(DIST_DIR, file), 'utf8');
    const page = pagePathFor(file);
    const pageUrl = new URL(page, siteOrigin ?? 'https://internal.invalid');

    for (const reference of extractReferences(html)) {
      const target = toInternalPath(reference, pageUrl, siteOrigin ?? pageUrl.origin);
      if (target === null) continue;

      checked += 1;
      if (!routes.has(target) && !assets.has(target)) {
        broken.push({ page, reference: reference.trim(), target });
      }
    }
  }

  if (broken.length > 0) {
    console.error(`[check-links] ${broken.length} broken internal link(s):`);
    for (const { page, reference, target } of broken) {
      console.error(`  ${page} -> ${target}  (href/src: ${reference})`);
    }
    process.exit(1);
  }

  console.log(
    `[check-links] Checked ${checked} internal reference(s) across ${htmlFiles.length} HTML file(s); all targets resolve.`,
  );
}

await main();
