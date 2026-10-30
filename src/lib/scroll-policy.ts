/**
 * Pure smooth-scroll policy.
 *
 * Lenis is an enhancement, never a requirement. It is switched off whenever
 * smooth motion would remove control from the reader:
 *
 * - `test-mode`: an explicit opt-out for deterministic browser tests. Pass
 *   `?lenis=off`, or mark the page with `data-lenis="off"` before the story
 *   controller starts. The controller writes the effective state back to
 *   `data-lenis` (`on` or `off`) for tests and for CSS.
 * - `reduced-motion`: `prefers-reduced-motion: reduce` is authoritative.
 * - `coarse-pointer`: touch devices keep their native momentum scrolling.
 *
 * This module is DOM-free so the rules can be unit-tested in Node. The browser
 * detection lives in `scroll-director.ts`.
 */

export type SmoothScrollReason = 'enabled' | 'test-mode' | 'reduced-motion' | 'coarse-pointer';

export interface SmoothScrollEnvironment {
  /** Explicit opt-out from a query string or an authored data attribute. */
  readonly testMode: boolean;
  /** `prefers-reduced-motion: reduce` matched at construction time. */
  readonly reducedMotion: boolean;
  /** `(pointer: coarse)` matched at construction time. */
  readonly coarsePointer: boolean;
}

export interface SmoothScrollPolicy extends SmoothScrollEnvironment {
  readonly enabled: boolean;
  readonly reason: SmoothScrollReason;
}

/**
 * Resolve the effective policy. Test mode wins because it is the most specific
 * intent; otherwise any accessibility or input constraint disables smoothing.
 */
export function resolveSmoothScrollPolicy(
  environment: SmoothScrollEnvironment,
): SmoothScrollPolicy {
  if (environment.testMode) {
    return { ...environment, enabled: false, reason: 'test-mode' };
  }

  if (environment.reducedMotion) {
    return { ...environment, enabled: false, reason: 'reduced-motion' };
  }

  if (environment.coarsePointer) {
    return { ...environment, enabled: false, reason: 'coarse-pointer' };
  }

  return { ...environment, enabled: true, reason: 'enabled' };
}

/**
 * Test mode is explicit: `?lenis=off` in the query, or `data-lenis="off"` on
 * the root element before the director claims it. Only the exact value `off`
 * opts out, so `?lenis=on` and unrelated values are ignored.
 */
export function isLenisTestMode(
  search: string,
  authoredRootAttribute: string | null | undefined,
): boolean {
  const queryValue = new URLSearchParams(search).get('lenis');
  return queryValue === 'off' || authoredRootAttribute === 'off';
}
