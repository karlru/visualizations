/**
 * DOM-side active-line control for a pre-rendered pseudocode listing.
 *
 * Kept out of `pseudocode.ts` on purpose: that module imports Shiki and is
 * build-time only. The story island imports this small function instead, so no
 * highlighter, grammar, or theme can reach the browser bundle.
 *
 * The update is chapter-level, not scroll-level. It removes the previous
 * `data-active`/`aria-current` pair and marks exactly one line, which gives the
 * CSS a non-colour cue (left rule + weight) and screen readers an `aria-current`
 * step without announcing anything in a live region.
 */

/** Mark one line in a rendered listing. Returns the marked index, or null. */
export function setPseudocodeActiveLine(container: ParentNode, line: number | null): number | null {
  for (const current of container.querySelectorAll<HTMLElement>('[data-line][data-active]')) {
    current.removeAttribute('data-active');
    current.removeAttribute('aria-current');
  }

  if (line === null) return null;

  const next = container.querySelector<HTMLElement>(`[data-line="${line}"]`);
  if (next === null) return null;

  next.setAttribute('data-active', '');
  next.setAttribute('aria-current', 'step');
  return line;
}
