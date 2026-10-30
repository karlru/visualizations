/**
 * Chapter DOM metadata.
 *
 * `Chapter.astro` publishes a chapter's scene and presentation overrides as
 * data attributes so the story controller can compose a scene without knowing
 * the prose component. This module is the typed boundary: JSON in an attribute
 * is untrusted input, so every field is validated and clamped before it reaches
 * the renderer. Malformed metadata is ignored rather than breaking the story;
 * the chapter still renders and its base scene remains usable.
 *
 * Parameters are deliberately not accepted here. Scroll may change exposition,
 * never engine parameters (`docs/technology.md` §4.4); chapter parameter
 * overrides belong in the typed `StoryConfig`, not in markup.
 */

import type { Vec3 } from '../engines/core/types';
import type {
  CameraState,
  HighlightTarget,
  LabelAnchor,
  SceneLabel,
  SceneLayer,
} from '../render/types';

/** Presentation-only overrides a chapter may apply on top of its scene. */
export interface ChapterSceneOverrides {
  readonly camera?: CameraState;
  readonly layers?: readonly SceneLayer[];
  readonly highlights?: readonly HighlightTarget[];
  readonly revealProgress?: number;
  readonly labels?: readonly SceneLabel[];
}

/** The ordered chapter entry the progress rail renders. */
export interface RailChapterInfo {
  readonly id: string;
  readonly title: string;
  readonly number: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseVec3(value: unknown): Vec3 | null {
  const record = asRecord(value);
  if (record === null) return null;
  const x = finiteNumber(record.x);
  const y = finiteNumber(record.y);
  const z = finiteNumber(record.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function parseCamera(value: unknown): CameraState | null {
  const record = asRecord(value);
  if (record === null) return null;

  if (record.kind === '2d') {
    const panX = finiteNumber(record.panX);
    const panY = finiteNumber(record.panY);
    const zoom = finiteNumber(record.zoom);
    if (panX === null || panY === null || zoom === null || zoom <= 0) return null;

    const rotation = record.rotation === undefined ? 0 : finiteNumber(record.rotation);
    if (rotation === null) return null;
    return { kind: '2d', panX, panY, zoom, rotation };
  }

  if (record.kind === '3d') {
    const position = parseVec3(record.position);
    const target = parseVec3(record.target);
    const up = parseVec3(record.up);
    const fov = finiteNumber(record.fov);
    if (position === null || target === null || up === null || fov === null || fov <= 0) {
      return null;
    }
    return { kind: '3d', position, target, up, fov };
  }

  return null;
}

function parseLayers(value: unknown): readonly SceneLayer[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const layers: SceneLayer[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (record === null) continue;
    const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : null;
    const visible = typeof record.visible === 'boolean' ? record.visible : null;
    const opacity = finiteNumber(record.opacity);
    if (id === null || visible === null || opacity === null) continue;
    layers.push({ id, visible, opacity: clamp01(opacity) });
  }

  return layers.length === 0 ? null : layers;
}

function parseHighlights(value: unknown): readonly HighlightTarget[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const highlights: HighlightTarget[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (record === null) continue;
    const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : null;
    if (id === null) continue;

    const layerId = typeof record.layerId === 'string' ? record.layerId : undefined;
    const intensityValue = finiteNumber(record.intensity);
    const intensity = intensityValue === null ? undefined : clamp01(intensityValue);
    highlights.push({
      id,
      ...(layerId === undefined ? {} : { layerId }),
      ...(intensity === undefined ? {} : { intensity }),
    });
  }

  return highlights.length === 0 ? null : highlights;
}

function parseAnchor(value: unknown): LabelAnchor | null {
  const record = asRecord(value);
  if (record === null) return null;

  if (record.space === 'screen' || record.space === 'world2d') {
    const x = finiteNumber(record.x);
    const y = finiteNumber(record.y);
    if (x === null || y === null) return null;
    return { space: record.space, x, y };
  }

  if (record.space === 'world3d') {
    const position = parseVec3(record.position);
    if (position === null) return null;
    return { space: 'world3d', position };
  }

  return null;
}

function parseLabels(value: unknown): readonly SceneLabel[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const labels: SceneLabel[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (record === null) continue;

    const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : null;
    const text = typeof record.text === 'string' ? record.text : null;
    const anchor = parseAnchor(record.anchor);
    if (id === null || text === null || anchor === null) continue;

    const alignValue = record.align;
    const align =
      alignValue === 'start' || alignValue === 'center' || alignValue === 'end'
        ? alignValue
        : undefined;

    const offsetRecord = asRecord(record.offset);
    const offsetX = offsetRecord === null ? null : finiteNumber(offsetRecord.x);
    const offsetY = offsetRecord === null ? null : finiteNumber(offsetRecord.y);
    const offset = offsetX !== null && offsetY !== null ? { x: offsetX, y: offsetY } : undefined;

    const priorityValue = finiteNumber(record.priority);
    const priority = priorityValue === null ? undefined : priorityValue;

    labels.push({
      id,
      text,
      anchor,
      ...(offset === undefined ? {} : { offset }),
      ...(align === undefined ? {} : { align }),
      ...(priority === undefined ? {} : { priority }),
    });
  }

  return labels.length === 0 ? null : labels;
}

/**
 * Serialize presentation overrides for `Chapter.astro`. Only the five
 * presentation fields are emitted, so a typed `SceneOverrides` carrying engine
 * parameters cannot leak simulation state into markup.
 */
export function serializeChapterSceneOverrides(
  overrides: ChapterSceneOverrides | undefined,
): string | undefined {
  if (overrides === undefined) return undefined;

  const metadata: ChapterSceneOverrides = {
    ...(overrides.camera === undefined ? {} : { camera: overrides.camera }),
    ...(overrides.layers === undefined ? {} : { layers: overrides.layers }),
    ...(overrides.highlights === undefined ? {} : { highlights: overrides.highlights }),
    ...(overrides.revealProgress === undefined
      ? {}
      : { revealProgress: clamp01(overrides.revealProgress) }),
    ...(overrides.labels === undefined ? {} : { labels: overrides.labels }),
  };

  return JSON.stringify(metadata);
}

/**
 * Parse a `data-scene-overrides` attribute. Returns an empty object when the
 * attribute is absent or malformed; individual invalid fields are skipped.
 */
export function parseChapterSceneOverrides(raw: string | undefined | null): ChapterSceneOverrides {
  if (raw === undefined || raw === null || raw.trim().length === 0) return {};

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }

  const record = asRecord(value);
  if (record === null) return {};

  const camera = parseCamera(record.camera);
  const layers = parseLayers(record.layers);
  const highlights = parseHighlights(record.highlights);
  const labels = parseLabels(record.labels);
  const reveal = finiteNumber(record.revealProgress);

  return {
    ...(camera === null ? {} : { camera }),
    ...(layers === null ? {} : { layers }),
    ...(highlights === null ? {} : { highlights }),
    ...(labels === null ? {} : { labels }),
    ...(reveal === null ? {} : { revealProgress: clamp01(reveal) }),
  };
}
