import { describe, expect, it } from 'vitest';
import { isLenisTestMode, resolveSmoothScrollPolicy } from '../../src/lib/scroll-policy';

const environment = (overrides: Partial<Parameters<typeof resolveSmoothScrollPolicy>[0]> = {}) => ({
  testMode: false,
  reducedMotion: false,
  coarsePointer: false,
  ...overrides,
});

describe('resolveSmoothScrollPolicy', () => {
  it('enables Lenis only when no constraint applies', () => {
    expect(resolveSmoothScrollPolicy(environment())).toEqual({
      ...environment(),
      enabled: true,
      reason: 'enabled',
    });
  });

  it('disables Lenis under reduced motion', () => {
    const policy = resolveSmoothScrollPolicy(environment({ reducedMotion: true }));
    expect(policy.enabled).toBe(false);
    expect(policy.reason).toBe('reduced-motion');
  });

  it('disables Lenis on a coarse pointer', () => {
    const policy = resolveSmoothScrollPolicy(environment({ coarsePointer: true }));
    expect(policy.enabled).toBe(false);
    expect(policy.reason).toBe('coarse-pointer');
  });

  it('disables Lenis in test mode', () => {
    const policy = resolveSmoothScrollPolicy(environment({ testMode: true }));
    expect(policy.enabled).toBe(false);
    expect(policy.reason).toBe('test-mode');
  });

  it('lets explicit test mode win over other constraints', () => {
    const policy = resolveSmoothScrollPolicy(
      environment({ testMode: true, reducedMotion: true, coarsePointer: true }),
    );
    expect(policy.reason).toBe('test-mode');
    expect(policy.enabled).toBe(false);
    expect(policy.reducedMotion).toBe(true);
    expect(policy.coarsePointer).toBe(true);
  });
});

describe('isLenisTestMode', () => {
  it('accepts ?lenis=off', () => {
    expect(isLenisTestMode('?lenis=off', null)).toBe(true);
  });

  it('accepts the authored data attribute', () => {
    expect(isLenisTestMode('', 'off')).toBe(true);
  });

  it('ignores other values and absent flags', () => {
    expect(isLenisTestMode('', null)).toBe(false);
    expect(isLenisTestMode('?lenis=on', null)).toBe(false);
    expect(isLenisTestMode('?lenis=OFF', null)).toBe(false);
    expect(isLenisTestMode('?debug=1', undefined)).toBe(false);
  });

  it('reads the flag alongside other query parameters', () => {
    expect(isLenisTestMode('?debug=1&lenis=off', null)).toBe(true);
  });
});
