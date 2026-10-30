import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Architecture guard.
 *
 * Engines must stay pure so they can run in Node, in build scripts, and in a
 * Web Worker. Renderers may use browser and rendering APIs but must not import
 * Svelte components. The scanner uses the TypeScript AST rather than regular
 * expressions, so comments and string literals cannot hide a violation.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENGINE_DIR = path.join(ROOT, 'src/engines');
const RENDER_DIR = path.join(ROOT, 'src/render');
const COMPONENTS_DIR = path.join(ROOT, 'src/components');
const STORIES_DIR = path.join(ROOT, 'src/stories');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

const FORBIDDEN_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'WebGL2RenderingContext',
]);

const FORBIDDEN_PACKAGES = new Set(['astro', 'svelte', 'three']);
const FORBIDDEN_PACKAGE_PREFIXES = ['@astrojs/', '@sveltejs/'];

type Boundary = 'engine' | 'render';

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

function isWithin(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveSpecifier(specifier: string, importer: string): string | null {
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(importer), specifier);
  }
  if (specifier.startsWith('/')) {
    return path.resolve(ROOT, `.${specifier}`);
  }
  return null;
}

function packageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0] ?? specifier;
}

function isSvelteComponentSpecifier(specifier: string, importer: string): boolean {
  if (specifier.endsWith('.svelte')) {
    return true;
  }
  const name = packageName(specifier);
  if (name === 'svelte' || name === '@sveltejs/svelte') {
    return true;
  }
  const resolved = resolveSpecifier(specifier, importer);
  return resolved !== null && isWithin(resolved, COMPONENTS_DIR);
}

function forbiddenImportReason(
  specifier: string,
  importer: string,
  boundary: Boundary,
): string | null {
  if (boundary === 'render') {
    return isSvelteComponentSpecifier(specifier, importer)
      ? 'render modules must not import Svelte components or stores'
      : null;
  }

  const name = packageName(specifier);
  if (FORBIDDEN_PACKAGES.has(name) || FORBIDDEN_PACKAGE_PREFIXES.some((p) => name.startsWith(p))) {
    return `engines must not import ${name}`;
  }

  const resolved = resolveSpecifier(specifier, importer);
  if (resolved === null) {
    return null;
  }
  if (isWithin(resolved, RENDER_DIR)) {
    return 'engines must not import renderer code';
  }
  if (isWithin(resolved, COMPONENTS_DIR)) {
    return 'engines must not import UI components';
  }
  if (isWithin(resolved, STORIES_DIR)) {
    return 'engines must not import story configuration';
  }
  return null;
}

function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;

  if (
    ts.isPropertyAccessExpression(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isEnumMember(parent) ||
    ts.isJsxAttribute(parent)
  ) {
    if (parent.name === node) {
      // `globalThis.document` is still a browser-global access.
      return !(
        ts.isPropertyAccessExpression(parent) &&
        ts.isIdentifier(parent.expression) &&
        parent.expression.text === 'globalThis'
      );
    }
  }

  if (ts.isBindingElement(parent) && parent.propertyName === node) {
    return true;
  }
  if (ts.isQualifiedName(parent) && parent.right === node) {
    return true;
  }

  return false;
}

function collectImportViolations(
  sourceFile: ts.SourceFile,
  boundary: Boundary,
  report: (node: ts.Node, message: string) => void,
): void {
  const check = (specifier: string, node: ts.Node): void => {
    const reason = forbiddenImportReason(specifier, sourceFile.fileName, boundary);
    if (reason !== null) {
      report(node, `${reason}: "${specifier}"`);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      check(node.moduleSpecifier.text, node.moduleSpecifier);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      check(node.argument.literal.text, node.argument.literal);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const firstArgument = node.arguments[0];
      if (
        (isDynamicImport || isRequire) &&
        firstArgument !== undefined &&
        ts.isStringLiteral(firstArgument)
      ) {
        check(firstArgument.text, firstArgument);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function collectGlobalViolations(
  sourceFile: ts.SourceFile,
  report: (node: ts.Node, message: string) => void,
): void {
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text) && !isPropertyName(node)) {
      report(node, `engines must not use the browser global "${node.text}"`);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function findViolations(file: string, source: string, boundary: Boundary): Violation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const report = (node: ts.Node, message: string): void => {
    const start = node.getStart(sourceFile);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
    violations.push({ file, line: line + 1, column: character + 1, message });
  };

  collectImportViolations(sourceFile, boundary, report);
  if (boundary === 'engine') {
    collectGlobalViolations(sourceFile, report);
  }

  return violations;
}

function formatViolations(violations: readonly Violation[]): string {
  return violations
    .map((v) => `${path.relative(ROOT, v.file)}:${v.line}:${v.column} ${v.message}`)
    .join('\n');
}

function scan(directory: string, boundary: Boundary): Violation[] {
  return listSourceFiles(directory).flatMap((file) =>
    findViolations(file, readFileSync(file, 'utf8'), boundary),
  );
}

describe('engine and renderer import boundaries', () => {
  it('finds the engine and renderer sources', () => {
    expect(listSourceFiles(ENGINE_DIR).length).toBeGreaterThan(0);
    expect(listSourceFiles(RENDER_DIR).length).toBeGreaterThan(0);
  });

  it('keeps engines free of DOM, Svelte, Astro, Three.js, renderer, and story code', () => {
    const violations = scan(ENGINE_DIR, 'engine');

    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('keeps renderer modules free of Svelte components', () => {
    const violations = scan(RENDER_DIR, 'render');

    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

describe('boundary scanner', () => {
  const engineProbe = path.join(ENGINE_DIR, '__boundary_probe__.ts');
  const renderProbe = path.join(RENDER_DIR, '__boundary_probe__.ts');

  it('ignores comments and string literals', () => {
    const source = `
      // document.body must not be flagged here.
      const note = 'window.location and navigator.userAgent';
      export const value = note.length;
    `;

    expect(findViolations(engineProbe, source, 'engine')).toEqual([]);
  });

  it('reports browser globals and forbidden package imports', () => {
    const source = `
      import { writable } from 'svelte/store';
      export const value = document.body;
    `;
    const messages = findViolations(engineProbe, source, 'engine').map((v) => v.message);

    expect(messages.join('\n')).toContain('svelte');
    expect(messages.join('\n')).toContain('document');
  });

  it('reports relative imports into renderer or story code', () => {
    const source = `
      import type { SceneState } from '../render/types';
      import type { StoryConfig } from '../stories/registry';
    `;
    const messages = findViolations(engineProbe, source, 'engine').map((v) => v.message);

    expect(messages).toHaveLength(2);
    expect(messages.join('\n')).toContain('renderer code');
    expect(messages.join('\n')).toContain('story configuration');
  });

  it('reports Svelte component imports from renderer modules', () => {
    const source = `import Stage from '../components/story/StoryStage.svelte';`;
    const messages = findViolations(renderProbe, source, 'render').map((v) => v.message);

    expect(messages.join('\n')).toContain('Svelte components');
  });
});
