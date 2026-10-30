/**
 * Safe reader-preference storage.
 *
 * Preferences are an enhancement: every read and write is best-effort. Safari
 * private mode, embedded webviews, blocked third-party storage, and explicit
 * privacy settings can all make `localStorage` throw on access, on read, or on
 * write. A reader must never lose the story because a preference could not be
 * saved, so all failures collapse to "no preference" / "not persisted".
 *
 * Simulation state never lives here. The URL is the canonical run identity
 * (Step 1.8); this module only remembers presentation choices such as article
 * mode and a further-reduced motion preference.
 */

export const PREFERENCE_KEYS = {
  /** `article` or `stage`. The server-rendered default is always article. */
  articleMode: 'algorithm-stories.article-mode',
  /** `reduced` or `full`. `reduced` may only reduce motion further than the OS. */
  reducedMotion: 'algorithm-stories.reduced-motion',
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

/** The subset of the Storage API this module needs, so tests can inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Resolve `window.localStorage` without trusting it to exist or to be readable.
 * Even the property access can throw when storage is disabled.
 */
export function getSafeStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Read one preference. Missing storage, missing keys, and throws all yield null. */
export function readPreference(
  key: PreferenceKey,
  storage: StorageLike | null = getSafeStorage(),
): string | null {
  if (storage === null) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Persist one preference. Returns `true` only when the value was written, so a
 * caller can expose "preferences are unavailable" without treating failure as
 * an error.
 */
export function writePreference(
  key: PreferenceKey,
  value: string,
  storage: StorageLike | null = getSafeStorage(),
): boolean {
  if (storage === null) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Remove one preference. Safe to call when storage is unavailable. */
export function removePreference(
  key: PreferenceKey,
  storage: StorageLike | null = getSafeStorage(),
): boolean {
  if (storage === null) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** True when preferences can be read or written in this browser context. */
export function isPersistenceAvailable(storage: StorageLike | null = getSafeStorage()): boolean {
  if (storage === null) return false;

  try {
    const probe = '__algorithm_stories_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
