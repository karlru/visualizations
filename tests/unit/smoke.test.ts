import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

describe('tooling smoke', () => {
  it('runs a plain assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('runs a fast-check property', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        expect(value + 0).toBe(value);
      }),
    );
  });
});
