/**
 * Motion preference resolution.
 *
 * Two inputs decide how much motion the story may use:
 *
 * 1. the operating system's `prefers-reduced-motion` setting, which is
 *    authoritative and never overridable by the page;
 * 2. a manual "reduce motion" preference in the story, which may only add
 *    constraint. It can never re-enable motion that the system disabled.
 *
 * The module is pure and DOM-free so the rule is unit-tested directly instead
 * of being inferred from a browser emulation.
 */

export interface MotionPreference {
  /** The OS asks for reduced motion. Motion cannot be re-enabled by the page. */
  readonly systemReduced: boolean;
  /** The reader asked for reduced motion inside this story. */
  readonly manualReduced: boolean;
}

export interface ResolvedMotionPreference {
  /** Effective reduced-motion state for throttling, autoplay, and scrubbing. */
  readonly reduced: boolean;
  /** The OS preference, kept for the disabled-with-explanation UI. */
  readonly systemReduced: boolean;
  /** The reader's stored choice, independent of the OS setting. */
  readonly manualReduced: boolean;
  /** False when the manual control must be disabled (the OS reduced motion). */
  readonly canEnableMotion: boolean;
}

export function resolveMotionPreference(preference: MotionPreference): ResolvedMotionPreference {
  return {
    reduced: preference.systemReduced || preference.manualReduced,
    systemReduced: preference.systemReduced,
    manualReduced: preference.manualReduced,
    canEnableMotion: !preference.systemReduced,
  };
}

/** Parse the persisted manual preference. Unknown values fall back to full motion. */
export function parseStoredMotionPreference(value: string | null): boolean {
  return value === 'reduced';
}

/** Serialize the manual preference for storage. */
export function serializeMotionPreference(manualReduced: boolean): 'reduced' | 'full' {
  return manualReduced ? 'reduced' : 'full';
}
