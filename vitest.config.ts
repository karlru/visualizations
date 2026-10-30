import { defineConfig } from 'vitest/config';

/**
 * Unit tests cover pure logic only. Browser behaviour belongs to Playwright
 * (`tests/e2e`), which runs against the built preview.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
