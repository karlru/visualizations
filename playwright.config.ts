import { defineConfig, devices } from '@playwright/test';

// Playwright always tests the production build, not the dev server, so a
// passing run proves the artifact that ships. The webServer command rebuilds
// `dist/` and then serves it with Astro's preview server.
const port = 4321;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // A single worker keeps the shared preview server and the visual baseline
  // stable. The cross-browser matrix is added in Step 7.3.
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The focused mobile gate runs in the `mobile` project only.
      testIgnore: /aco-mobile\.spec\.ts/,
    },
    {
      // Mobile gate for Step 3.7. It reuses the production build and the same
      // preview server. The matrix is deliberately scoped: the desktop visual
      // baselines, the explicit viewport responsive matrix, and the frame-time
      // harness must not run twice, while the mobile-appropriate ACO specs and
      // the accessibility scans do.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /(?:aco(?:-story|-lab|-mobile)?|a11y)\.spec\.ts/,
    },
  ],
  webServer: {
    // `--ignore-lock` keeps Astro's preview server in the foreground. Astro 7
    // otherwise auto-backgrounds when it detects an agent or a CI harness,
    // which makes Playwright treat the process as exited.
    command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${port} --ignore-lock`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
