import { describe, expect, it } from 'vitest';
import {
  parseStoredMotionPreference,
  resolveMotionPreference,
  serializeMotionPreference,
} from '../../src/lib/motion-policy';
import {
  PREFERENCE_KEYS,
  readPreference,
  removePreference,
  type StorageLike,
  writePreference,
} from '../../src/lib/persistence';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const throwingStorage: StorageLike = {
  getItem() {
    throw new Error('storage disabled');
  },
  setItem() {
    throw new Error('storage disabled');
  },
  removeItem() {
    throw new Error('storage disabled');
  },
};

describe('reader preference persistence', () => {
  it('round-trips a stored value and removes it', () => {
    const storage = new MemoryStorage();
    expect(writePreference(PREFERENCE_KEYS.articleMode, 'article', storage)).toBe(true);
    expect(readPreference(PREFERENCE_KEYS.articleMode, storage)).toBe('article');
    expect(removePreference(PREFERENCE_KEYS.articleMode, storage)).toBe(true);
    expect(readPreference(PREFERENCE_KEYS.articleMode, storage)).toBeNull();
  });

  it('treats missing storage as "no preference" without throwing', () => {
    expect(readPreference(PREFERENCE_KEYS.articleMode, null)).toBeNull();
    expect(writePreference(PREFERENCE_KEYS.articleMode, 'stage', null)).toBe(false);
    expect(removePreference(PREFERENCE_KEYS.articleMode, null)).toBe(false);
  });

  it('survives storage that throws on every operation', () => {
    expect(readPreference(PREFERENCE_KEYS.reducedMotion, throwingStorage)).toBeNull();
    expect(writePreference(PREFERENCE_KEYS.reducedMotion, 'reduced', throwingStorage)).toBe(false);
    expect(removePreference(PREFERENCE_KEYS.reducedMotion, throwingStorage)).toBe(false);
  });

  it('stores the quality preference under its own key', () => {
    const storage = new MemoryStorage();
    expect(writePreference(PREFERENCE_KEYS.quality, 'low', storage)).toBe(true);
    expect(readPreference(PREFERENCE_KEYS.quality, storage)).toBe('low');
    expect(readPreference(PREFERENCE_KEYS.reducedMotion, storage)).toBeNull();
    expect(PREFERENCE_KEYS.quality).toBe('algorithm-stories.quality');
  });
});

describe('motion preference policy', () => {
  it('reduces when either the system or the reader asks for it', () => {
    expect(resolveMotionPreference({ systemReduced: false, manualReduced: false }).reduced).toBe(
      false,
    );
    expect(resolveMotionPreference({ systemReduced: false, manualReduced: true }).reduced).toBe(
      true,
    );
    expect(resolveMotionPreference({ systemReduced: true, manualReduced: false }).reduced).toBe(
      true,
    );
  });

  it('never lets the manual choice re-enable motion the system disabled', () => {
    const systemReduced = resolveMotionPreference({
      systemReduced: true,
      manualReduced: false,
    });
    expect(systemReduced.reduced).toBe(true);
    expect(systemReduced.canEnableMotion).toBe(false);

    const manualOnly = resolveMotionPreference({
      systemReduced: false,
      manualReduced: true,
    });
    expect(manualOnly.canEnableMotion).toBe(true);
  });

  it('parses and serializes only known stored values', () => {
    expect(parseStoredMotionPreference('reduced')).toBe(true);
    expect(parseStoredMotionPreference('full')).toBe(false);
    expect(parseStoredMotionPreference('nonsense')).toBe(false);
    expect(parseStoredMotionPreference(null)).toBe(false);
    expect(serializeMotionPreference(true)).toBe('reduced');
    expect(serializeMotionPreference(false)).toBe('full');
  });
});
