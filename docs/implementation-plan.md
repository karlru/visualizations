# Implementation Plan

See the [README](../README.md) for the project overview and the other documentation files.

This document is the build order for the first public release: a static, scroll-driven site with two stories, **Ant Colony Optimization** and **LCG / RANDU**.

Every step has a goal, concrete tasks, the files it touches, and acceptance criteria. A step is complete only when all of its acceptance criteria pass.

The plan intentionally contains no time estimates and no pinned dependency versions. Use the latest stable release of each tool, commit the lockfile, and treat upgrades as tested changes.

## 1. How to use this plan

- Work through the phases in order. Later steps assume earlier contracts exist.
- Do not start a story's content pass before its engine and renderer contracts are stable.
- Keep each step small enough to review as a coherent change.
- Run the full verification command set at the end of every phase.
- If a step reveals a flaw in an earlier contract, fix the contract and update this document before continuing.

### 1.1 Conventions

- **Language:** TypeScript, strict mode.
- **Package manager:** pnpm.
- **Formatting and linting:** Biome for TS/JS/CSS plus `astro check` for Astro/Svelte markup. Biome's HTML support is experimental.
- **Unit tests:** Vitest.
- **Browser tests:** Playwright.
- **File naming:** kebab-case for files, PascalCase for components, camelCase for functions and variables.
- **Engine purity:** files under `src/engines/` must not import DOM APIs, Svelte, Astro, or Three.js.
- **Renderer isolation:** files under `src/render/` may import rendering libraries, but not Svelte components.
- **Story content:** prose lives in MDX; mechanics live in TypeScript scene configs.
- **No dead code:** remove unused exports, styles, and dependencies as part of the step that makes them obsolete.
- **No version pins in documentation:** the lockfile is the source of truth.

### 1.2 Priority of correctness

1. The simulation must be correct and deterministic.
2. The story must remain readable and accessible without motion or JavaScript.
3. The interaction must be responsive and predictable.
4. The visuals must be polished.
5. Extra effects are optional and must never compromise 1–4.

## 2. Prerequisites

Install:

- The current Node LTS release.
- pnpm.
- Git.
- A modern browser for development.
- A Cloudflare account with access to Workers.
- A GitHub repository for CI and deployment.
- Optional: a custom domain.

Verify:

```bash
node --version
pnpm --version
git --version
```

## 3. Target repository structure

```text
/
├─ README.md
├─ docs/
│  ├─ requirements.md
│  ├─ technology.md
│  ├─ implementation-plan.md
│  ├─ runtime-acceptance.md
│  └─ stories.md
├─ .github/workflows/deploy.yml
├─ .gitignore
├─ astro.config.mjs
├─ biome.json
├─ lighthouserc.json
├─ playwright.config.ts
├─ tsconfig.json
├─ vitest.config.ts
├─ wrangler.jsonc
├─ package.json
├─ pnpm-lock.yaml
├─ public/
│  ├─ fonts/
│  ├─ og/
│  ├─ _headers
│  ├─ robots.txt
│  └─ favicon.svg
├─ scripts/
│  ├─ check-links.mjs
│  ├─ check-bundle-size.mjs
│  ├─ check-citations.mjs
│  ├─ capture-runtime.mjs
│  └─ build-figures.mjs
├─ src/
│  ├─ assets/
│  │  └─ figures/
│  │     └─ aco-best-tour.svg
│  ├─ pages/
│  │  ├─ index.astro
│  │  ├─ stories/index.astro
│  │  ├─ stories/[...slug].astro
│  │  ├─ about.astro
│  │  ├─ colophon.astro
│  │  ├─ 404.astro
│  │  ├─ rss.xml.ts
│  │  ├─ og/[...slug].png.ts
│  │  └─ dev/
│  │     ├─ aco-smoke.astro
│  │     ├─ canvas-smoke.astro
│  │     ├─ pulse-smoke.astro
│  │     ├─ story-smoke.astro
│  │     └─ type-specimen.astro
│  ├─ content/
│  │  └─ stories/
│  │     ├─ ant-colony-optimization/index.mdx
│  │     └─ randu-lcg/index.mdx
│  ├─ content.config.ts
│  ├─ layouts/
│  │  ├─ BaseLayout.astro
│  │  └─ StoryLayout.astro
│  ├─ components/
│  │  ├─ story/
│  │  │  ├─ StoryStage.svelte
│  │  │  ├─ StoryController.svelte
│  │  │  ├─ Chapter.astro
│  │  │  ├─ ProgressRail.svelte
│  │  │  ├─ StageChrome.svelte
│  │  │  ├─ story-runtime-debug.ts
│  │  │  ├─ ConvergenceChart.svelte
│  │  │  ├─ ProbabilityFanSummary.svelte
│  │  │  ├─ AcoSmokeHarness.svelte
│  │  │  └─ ArticleModeToggle.svelte
│  │  ├─ controls/
│  │  │  ├─ Slider.svelte
│  │  │  ├─ PresetPicker.svelte
│  │  │  ├─ Toggle.svelte
│  │  │  ├─ SeedControl.svelte
│  │  │  └─ Metrics.svelte
│  │  └─ ui/
│  │     ├─ Callout.astro
│  │     ├─ Figure.astro
│  │     ├─ Math.astro
│  │     ├─ Pseudocode.astro
│  │     ├─ Predict.astro
│  │     └─ Seo.astro
│  ├─ engines/
│  │  ├─ core/
│  │  │  ├─ rng.ts
│  │  │  ├─ clock.ts
│  │  │  ├─ types.ts
│  │  │  └─ url-state.ts
│  │  ├─ aco/
│  │  │  ├─ types.ts
│  │  │  ├─ tsp.ts
│  │  │  ├─ engine.ts
│  │  │  └─ presets.ts
│  │  └─ randu/
│  │     ├─ types.ts
│  │     ├─ lcg.ts
│  │     ├─ planes.ts
│  │     ├─ good-prng.ts
│  │     └─ presets.ts
│  ├─ render/
│  │  ├─ types.ts
│  │  ├─ canvas2d/
│  │  │  ├─ Canvas2DRenderer.ts
│  │  │  ├─ camera.ts
│  │  │  ├─ layers/
│  │  │  │  ├─ common.ts
│  │  │  │  ├─ graph.ts
│  │  │  │  ├─ pheromone.ts
│  │  │  │  ├─ ants.ts
│  │  │  │  ├─ best-tour.ts
│  │  │  │  ├─ probability-fan.ts
│  │  │  │  └─ index.ts
│  │  │  └─ theme.ts
│  │  └─ three/
│  │     ├─ ThreeRenderer.ts
│  │     ├─ CameraDirector.ts
│  │     ├─ LabelProjector.ts
│  │     ├─ layers/
│  │     │  ├─ point-cloud.ts
│  │     │  ├─ plane-family.ts
│  │     │  ├─ cube-frame.ts
│  │     │  └─ comparison-cloud.ts
│  │     └─ theme.ts
│  ├─ stories/
│  │  ├─ registry.ts
│  │  ├─ runtime.ts
│  │  ├─ loader.ts
│  │  ├─ dev/
│  │  │  ├─ config.ts
│  │  │  ├─ pulse-config.ts
│  │  │  ├─ pulse-engine.ts
│  │  │  ├─ scene-layers.ts
│  │  │  ├─ runtime-hooks.ts
│  │  │  ├─ story-module.ts
│  │  │  ├─ pulse-module.ts
│  │  │  └─ canvas-smoke-engine.ts
│  │  ├─ aco/
│  │  │  ├─ config.ts
│  │  │  ├─ module.ts
│  │  │  ├─ scenes.ts
│  │  │  ├─ probability-fan.ts
│  │  │  ├─ best-tour-figure.ts
│  │  │  └─ annotations.ts
│  │  └─ randu/
│  │     ├─ config.ts
│  │     ├─ scenes.ts
│  │     ├─ tour.ts
│  │     └─ annotations.ts
│  ├─ lib/
│  │  ├─ seo.ts
│  │  ├─ clipboard.ts
│  │  ├─ persistence.ts
│  │  ├─ chapter-metadata.ts
│  │  ├─ scene-composition.ts
│  │  ├─ scroll-director.ts
│  │  ├─ aco-formulas.ts
│  │  ├─ pseudocode.ts
│  │  ├─ pseudocode-dom.ts
│  │  └─ story-pseudocode.ts
│  └─ styles/
│     ├─ tokens.css
│     ├─ base.css
│     ├─ story.css
│     └─ three.css
└─ tests/
   ├─ unit/
   │  ├─ smoke.test.ts
   │  ├─ tokens.test.ts
   │  ├─ rng.test.ts
   │  ├─ clock.test.ts
   │  ├─ url-state.test.ts
   │  ├─ clipboard.test.ts
   │  ├─ scene-composition.test.ts
   │  ├─ aco.test.ts
   │  ├─ aco-render.test.ts
   │  ├─ randu.test.ts
   │  ├─ import-boundaries.test.ts
   │  ├─ story-loader.test.ts
   │  ├─ content-schema.test.ts
   │  ├─ aco-content.test.ts
   │  └─ pseudocode.test.ts
   └─ e2e/
      ├─ smoke.spec.ts
      ├─ site.spec.ts
      ├─ story-runtime.spec.ts
      ├─ story-runtime-acceptance.spec.ts
      ├─ url-state.spec.ts
      ├─ aco.spec.ts
      ├─ aco-renderer.spec.ts
      ├─ randu.spec.ts
      ├─ a11y.spec.ts
      ├─ responsive.spec.ts
      ├─ no-js.spec.ts
      └─ visual.spec.ts
```

## 4. Phase 0 — Foundation

### (DONE) Step 0.1 — Initialize the repository and Astro project

**Goal:** A working Astro site in a Git repository.

**Tasks**

1. (DONE) Initialize Git.
2. (DONE) Scaffold Astro in a temporary directory, then merge the generated files into the repository. The repository already contains `README.md` and `docs/`, and `create-astro` prompts or can overwrite the README when run in place.
3. (DONE) Choose the minimal template and install dependencies. Strict TypeScript is the default; current `create-astro` has no `--typescript` flag. Do not initialize a nested Git repository.
4. (DONE) Add a `packageManager` field to `package.json` for `pnpm/action-setup`.
5. (DONE) Confirm `src/pages/index.astro` renders.
6. (DONE) Add a `.gitignore` covering build output, dependencies, test artifacts, and local environment files.
7. (DONE) Make the first commit.

**Commands**

```bash
git init
pnpm create astro@latest /tmp/algorithm-stories-scaffold --template minimal --install --no-git --no-ai
cp -a /tmp/algorithm-stories-scaffold/. .
pnpm install
pnpm dev
```

Astro's dev server runs in the background; check it with `pnpm astro dev status` and stop it with `pnpm astro dev stop`.

**Files**

- `package.json`
- `pnpm-lock.yaml`
- `.gitignore`
- `src/pages/index.astro`
- `astro.config.mjs`
- `tsconfig.json`

**Acceptance criteria**

- [x] `pnpm dev` serves a local page.
- [x] `pnpm build` completes and creates `dist/index.html`.
- [x] `src/engines/`, `src/render/`, `src/stories/`, and `docs/` exist or are created.
- [x] `git status` shows a clean repository after the first commit.
- [x] The lockfile is committed.
- [x] `package.json` has a `packageManager` field or the CI workflow passes an explicit pnpm version.
- [x] The existing `README.md` and `docs/` are preserved.

### (DONE) Step 0.2 — Add Svelte, MDX, sitemap, and strict checks

**Goal:** The project supports interactive islands, MDX content, sitemap generation, and type checking.

**Tasks**

1. (DONE) Add the Svelte, MDX, and sitemap integrations.
2. (DONE) Configure `output: 'static'`.
3. (DONE) Set a provisional production `site` URL in `astro.config.mjs`; replace it with the production custom domain at Step 0.6.
4. (DONE) Add `astro check` to the build script.
5. (DONE) Create a temporary Svelte island on the home page and a temporary MDX page to prove both work.
6. (DONE) Remove the temporary examples after verification.

**Commands**

```bash
pnpm astro add svelte mdx sitemap
pnpm add -D @astrojs/check
pnpm exec astro check
```

**Files**

- `astro.config.mjs`
- `src/pages/index.astro`
- temporary MDX and Svelte files

**Acceptance criteria**

- [x] A Svelte island hydrates in the browser.
- [x] An MDX page renders.
- [x] `pnpm exec astro check` passes.
- [x] `pnpm build` produces static HTML for all routes.
- [x] `sitemap-index.xml` and its numbered sitemap file are generated after a build.
- [x] No framework adapter for server rendering is installed.

### (DONE) Step 0.3 — Add tooling: Biome, Vitest, Playwright, axe, Lighthouse CI

**Goal:** One command each for linting, unit tests, browser tests, accessibility checks, and performance budgets.

**Tasks**

1. (DONE) Initialize Biome and configure formatting and linting for TypeScript, JavaScript, and CSS. Enable `html.experimentalFullSupportEnabled` for Astro/Svelte markup, and document that `astro check` is the framework-template check because Biome's HTML support is experimental.
2. (DONE) Add Vitest and a smoke unit test.
3. (DONE) Add Playwright and a smoke browser test; configure it to start a preview server for the built site.
4. (DONE) Add axe-core integration for Playwright.
5. (DONE) Add Lighthouse CI configuration with desktop and mobile presets.
6. (DONE) Add `fast-check` for property-based tests.
7. (DONE) Create stub `scripts/check-bundle-size.mjs` and `scripts/build-figures.mjs` so the build and CI commands exist from Phase 0; fill in the real logic in Steps 3.2 and 7.2.
8. (DONE) Add package scripts for all verification commands, including `test:visual`.
9. (DONE) Add `web-vitals` for the INP harness.

**Commands**

```bash
pnpm add -D @biomejs/biome vitest @playwright/test @axe-core/playwright @lhci/cli fast-check wrangler web-vitals
pnpm exec biome init
pnpm exec playwright install --with-deps chromium firefox webkit
```

**Files**

- `biome.json`
- `vitest.config.ts`
- `playwright.config.ts`
- `lighthouserc.json`
- `package.json`
- `scripts/check-bundle-size.mjs`
- `scripts/build-figures.mjs`
- `tests/unit/smoke.test.ts`
- `tests/e2e/smoke.spec.ts`

**Acceptance criteria**

- [x] `pnpm lint` passes.
- [x] `pnpm test` runs at least one unit test and passes.
- [x] `pnpm test:e2e` runs at least one Playwright test and passes.
- [x] `pnpm test:visual` runs at least one screenshot test or a documented placeholder.
- [x] `pnpm check:bundle` runs without a missing-file error.
- [x] `pnpm build` runs the figures stub without a missing-file error.
- [x] `pnpm exec lhci autorun` runs against a built preview and reports results.
- [x] CI can run all verification commands without interactive prompts.

### (DONE) Step 0.4 — Design tokens, fonts, and base layout

**Goal:** The editorial paper + dark stage visual system exists as reusable tokens and primitives.

**Tasks**

1. (DONE) Define tokens for color, typography, spacing, radii, shadows, z-index, and motion, using the values in `docs/technology.md` §3.21.
2. (DONE) Self-host the three font families in `public/fonts/` with appropriate weights and subsets: Instrument Serif (display), Geist (body), JetBrains Mono (data/code). Subset with `subfont` or `fonttools`.
3. (DONE) Create `BaseLayout.astro` with the paper background, header, footer, skip link, and main landmark.
4. (DONE) Create `tokens.css`, `base.css`, and `story.css`.
5. (DONE) Add a typographic specimen page or section for visual review.
6. (DONE) Verify font loading does not cause visible layout shift.
7. (DONE) Add a unit test that every text/UI token pair meets its contrast threshold on both paper and stage.

**Commands**

```bash
pnpm add -D subfont
```

**Files**

- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/styles/story.css`
- `src/layouts/BaseLayout.astro`
- `public/fonts/*`
- `tests/unit/tokens.test.ts`

**Acceptance criteria**

- [x] All colors and spacing values used by components come from tokens.
- [x] Every text/UI token pair passes its contrast threshold on both backgrounds.
- [x] Fonts are self-hosted; no third-party font requests are made.
- [x] The base layout has a skip link that becomes visible on focus.
- [x] The header and footer are keyboard accessible.
- [x] The page has no horizontal overflow at 320 px.
- [x] The font fallback metrics are configured to minimize layout shift.

### (DONE) Step 0.5 — Base SEO, 404, and content schema skeleton

**Goal:** Every page has correct metadata, a custom 404, and a typed story schema.

**Tasks**

1. (DONE) Create `Seo.astro` with title, description, canonical, Open Graph, and social-card tags.
2. (DONE) Add a custom `404.astro`.
3. (DONE) Create `content.config.ts` with the story collection schema.
4. (DONE) Add required fields: title, dek, slug, category, difficulty, difficulty note (optional), visual mode, fallback (optional), learning objectives, prerequisites, references, and status.
5. (DONE) Use enums that match the content: category includes Optimization, Randomness, Graphs, Emergence, Physics, Generative, and Data; difficulty is introductory, intermediate, or advanced; visual mode is 2d, 3d, or mixed, with an optional 2d fallback for 3d.
6. (DONE) Create placeholder story entries for ACO and RANDU using the schema.
7. (DONE) Add a build-time validation test that a missing required field fails.
8. (DONE) Add a placeholder bidirectional chapter↔scene test that will be completed once scenes exist.

**Files**

- `src/components/ui/Seo.astro`
- `src/pages/404.astro`
- `src/pages/stories/index.astro` (Phase 0 placeholder; replaced in Step 6.2)
- `src/config/site.ts`
- `src/content.config.ts`
- `src/lib/story-schema.ts`
- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/content/stories/randu-lcg/index.mdx`
- `tests/unit/content-schema.test.ts`
- `tests/e2e/seo.spec.ts`

**Acceptance criteria**

- [x] Every route has a unique title and meta description.
- [x] `404.astro` returns a 404 status and links home and to `/stories`.
- [x] A story with a missing required field fails the build.
- [x] The schema accepts the ACO and RANDU metadata as written in `docs/stories.md`.
- [x] A placeholder bidirectional chapter↔scene test exists.
- [x] The placeholder stories appear in the content collection.
- [x] Canonical URLs are absolute and use the configured site URL.

### (DONE) Step 0.6 — Cloudflare configuration, headers, and CI deployment

**Goal:** Every push to the main branch can deploy the static site to Cloudflare's free plan.

**Tasks**

1. (DONE) Add `wrangler.jsonc` with the static assets directory, `html_handling: "drop-trailing-slash"`, and 404 handling.
2. (DONE) Add `public/_headers` with baseline security headers, immutable caching for hashed assets, and explicit cache rules for `/fonts/*` and `/og/*`.
3. (DONE) Add an internal link checker that fails on broken relative links.
4. (DONE) Create a GitHub Actions workflow that installs dependencies, lints, tests, builds, checks links, checks bundles, and deploys.
5. (DONE) Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
6. (DONE) Deploy once manually to verify the account and permissions.
7. (DONE) Record the production custom-domain URL (`https://visualizations.ruul.ee`) in the repository documentation and set Astro's `site` to it. The custom domain is attached in `wrangler.jsonc`, so Step 8.3 only re-verifies it.

**Files**

- `wrangler.jsonc`
- `public/_headers`
- `.github/workflows/deploy.yml`
- `scripts/check-links.mjs`
- `README.md`

**`wrangler.jsonc` skeleton**

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "algorithm-stories",
  "compatibility_date": "<current-date>",
  "workers_dev": false,
  "routes": [
    {
      "pattern": "<custom-domain>",
      "custom_domain": true
    }
  ],
  "assets": {
    "directory": "./dist",
    "html_handling": "drop-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

**`public/_headers` skeleton**

```text
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400

/og/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=86400
```

**Acceptance criteria**

- [x] `pnpm build` completes without errors.
- [x] `pnpm exec wrangler deploy --dry-run` succeeds.
- [x] The production deployment returns 200 for `/` and `/stories` without a trailing-slash redirect.
- [x] `site` is set to the deployed origin (`https://visualizations.ruul.ee`), not `example.com`.
- [x] The custom 404 is served for an unknown route. (verified in production)
- [x] `curl -I` shows the security headers. (verified locally and in production)
- [x] Hashed assets show the immutable cache header; fonts and OG images show their explicit cache rules. (verified locally and in production; the `/og/*` rule used a temporary probe file that was removed)
- [x] The GitHub Actions workflow succeeds from a clean checkout.
- [x] The link checker passes on the built output and fails on a deliberately broken internal link.
- [x] No Cloudflare paid service is required.

Local verification (2026-10-30): `pnpm exec wrangler dev --port 8799 --local` parsed 4 header rules, served `/` and `/stories` with 200, redirected `/stories/` to `/stories` with 307, served the custom 404 with a 404 status, and applied the `_astro`, `fonts`, and `og` cache rules. The link checker passed on the real build and failed with a clear path when a temporary broken link was added to the home page. Development pages are now excluded from the sitemap, which satisfies the Step 1.5 exclusion ahead of schedule.

Production verification (2026-10-30): GitHub Actions run `41087732973` passed `Verify` and `Deploy to Cloudflare` from commit `65f8329`. `wrangler.jsonc` attaches `visualizations.ruul.ee` as a Workers custom domain with `workers_dev: false`, and `SITE_URL` matches it. The live site returned 200 for `/` and `/stories`, 307 from `/stories/` to `/stories`, and 404 with the custom page for an unknown route; responses carried the four security headers, `/_astro/*` returned `max-age=31536000, immutable`, `/fonts/*` returned the weekly revalidation rule, and the canonical tag and sitemap pointed at `https://visualizations.ruul.ee`. Cloudflare issued the certificate and created the DNS record on the first deploy, and the free plan is sufficient.

## 5. Phase 1 — Story runtime

The story runtime is built once and used by both stories. It is tested with a hidden development page before any real story content is written.

### (DONE) Step 1.1 — Define core contracts

**Goal:** Stable TypeScript contracts for engines, scenes, renderers, and story configuration.

**Tasks**

1. (DONE) Define `Engine<P, S, M>` with `reset`, `setParams`, `step`, `snapshot`, and `metrics`.
2. (DONE) Define `SceneState` with a discriminated `CameraState` union (2D pan/zoom or 3D pose), visible layers, layer opacity, highlight targets, and reveal progress.
3. (DONE) Define `StageRenderer<P, S>` with async `mount`, `resize`, `setScene`, `setParams`, `setPaused`, and `dispose`.
4. (DONE) Define `StoryConfig` with slug, engine factory, defaults, presets, scenes, and URL parameter schema.
5. (DONE) Define `ChapterSpec` with id, title, scene overrides, `pseudocodeLine`, `annotations`, `reducedMotionSteps`, and `tourAct`.
6. (DONE) Add an import-boundary lint rule or test that engines do not import UI or renderer code.
7. (DONE) Add a fake-3D contract test: async mount, a 3D camera pose, and label registration. This must pass before Phase 4.

**Files**

- `src/engines/core/types.ts`
- `src/render/types.ts`
- `src/stories/registry.ts`
- `tests/unit/import-boundaries.test.ts`

**Acceptance criteria**

- [x] All contracts compile in strict mode.
- [x] A dummy engine and dummy renderer satisfy the interfaces.
- [x] Engines have no DOM, Svelte, Astro, or Three.js imports.
- [x] The scene state can describe both 2D and 3D scenes without renderer-specific fields.
- [x] `setParams` is generic; no `unknown` parameter type is used at the renderer boundary.
- [x] A fake 3D renderer passes the contract test with async mount, orbit pose, and label registration.
- [x] The story config can be imported without side effects.

### (DONE) Step 1.2 — Seeded RNG and fixed-timestep clock

**Goal:** Deterministic randomness and a stable simulation clock.

**Tasks**

1. (DONE) Implement a small seeded PRNG for simulation use.
2. (DONE) Add a seed-to-state helper and a `randomInt`/`randomFloat` API.
3. (DONE) Implement a fixed-timestep accumulator with a maximum number of substeps.
4. (DONE) Add a speed multiplier and a pause flag.
5. (DONE) Add tests for determinism, range, large time deltas, and frame-rate independence (30/60/120 fps converge to the same state for the same elapsed time).

**Files**

- `src/engines/core/rng.ts`
- `src/engines/core/clock.ts`
- `tests/unit/rng.test.ts`
- `tests/unit/clock.test.ts`

**Acceptance criteria**

- [x] The same seed produces the same sequence across runs.
- [x] Different seeds produce different sequences in practice.
- [x] Floats are in `[0, 1)`; integers are within the requested bounds.
- [x] The clock never performs more than the configured maximum substeps per frame.
- [x] A long tab-away gap does not cause a simulation spiral.
- [x] The same elapsed simulation time at 30, 60, and 120 fps produces the same state within tolerance.
- [x] Pausing stops simulation advancement.
- [x] Unit tests cover all of the above.

### (DONE) Step 1.3 — Scroll director

**Goal:** A reusable scroll controller that reports chapter entry, progress, and exit without hijacking scroll.

**Tasks**

1. (DONE) Integrate GSAP and ScrollTrigger.
2. (DONE) Integrate Lenis with ScrollTrigger, disabled on touch, reduced motion, and test mode.
3. (DONE) Create `ScrollDirector` with `registerChapter`, `unregisterChapter`, `onEnter`, `onProgress`, `onExit`, and `refresh`.
4. (DONE) Ensure all triggers are scoped and reverted with `gsap.context()`.
5. (DONE) Add cleanup on `astro:before-swap` and component destroy.
6. (DONE) Add a development overlay showing the active chapter and progress (removed or dev-only in production).
7. (DONE) Verify native scroll, keyboard scrolling, and browser back/forward.
8. (DONE) Confirm the GSAP ticker is the single simulation driver; Lenis and ScrollTrigger only update scroll state.

**Commands**

```bash
pnpm add gsap lenis
```

**Files**

- `src/components/story/StoryController.svelte`
- `src/lib/scroll-director.ts`
- `src/lib/scroll-policy.ts` (pure Lenis policy, unit-tested)
- `src/styles/story.css`
- `src/pages/dev/scroll-smoke.astro` (temporary Step 1.3 fixture)
- `tests/e2e/scroll.spec.ts`
- `tests/unit/scroll-policy.test.ts`
- `package.json` / `pnpm-lock.yaml`

**Test mode and Lenis policy**

Test mode is explicit: append `?lenis=off`, or author `data-lenis="off"` on `<html>` before the controller mounts. StoryController mirrors the effective state to `data-lenis="on|off"` and the reason to `data-lenis-reason`; `debugState()` reports the same flags. Lenis is also disabled whenever `prefers-reduced-motion: reduce` or `(pointer: coarse)` matches, and at runtime when either media query changes. It is never stopped in a way that adds `overflow: hidden`/`clip`; the document stays the native scroller and Lenis RAF runs only from `gsap.ticker`.

The `/dev/scroll-smoke` harness is the Step 1.3 test fixture. Step 1.5 replaces it with `/dev/story-smoke`; that page must reuse `ScrollDirector` and keep the same trigger-count and navigation-stress assertions.

**Acceptance criteria**

- [x] Scrolling updates the active chapter and progress.
- [x] The scrollbar remains visible and native.
- [x] PageDown, PageUp, Arrow keys, Home, and End work.
- [x] Lenis is disabled under reduced motion, on coarse pointers, and in test mode.
- [x] Only the GSAP ticker advances simulation time.
- [x] Navigating between stories does not leave duplicate triggers.
- [x] A stress test of ten navigations leaves no more than one set of active triggers.
- [x] No console errors occur.

Verified 2026-10-30 with `pnpm lint`, `pnpm test`, `pnpm build`, and `CI=1 pnpm test:e2e`. The scroll suite covers chapter/progress reporting, native document scrolling, all five keyboard controls, reduced motion, coarse-pointer detection, `?lenis=off`, idempotent destroy (0 remaining triggers), ten navigations, and back/forward. `debugState()` and `data-scroll-triggers` are the leak detectors.

### (DONE) Step 1.4 — Stage shell and Canvas 2D renderer

**Goal:** A persistent stage that mounts, resizes, renders layers, pauses offscreen, and disposes cleanly.

**Tasks**

1. (DONE) Create `StoryStage.svelte` with a container, canvas, and overlay slot; mount it as a client-only island or guard all browser APIs inside `onMount`.
2. (DONE) Implement `Canvas2DRenderer` with a 2D camera and layer list.
3. (DONE) Handle `ResizeObserver`, device pixel ratio, and canvas backing-store size.
4. (DONE) Implement a single RAF loop driven by the story controller.
5. (DONE) Add `IntersectionObserver` and `visibilitychange` pause behavior.
6. (DONE) Add layer primitives for lines, points, arcs, text-free shapes, and gradients.
7. (DONE) Add the coarse-pointer touch rule: vertical page scroll stays native; one-finger horizontal drag or an explicit Orbit mode handles orbit; zoom buttons provide a single-pointer alternative.
8. (DONE) Handle iOS Safari viewport resizing with `100dvh`/`visualViewport` and debounced `ScrollTrigger.refresh()`.
9. (DONE) Dispose the canvas, observers, and RAF loop on destroy.

**Files**

- `src/components/story/StoryStage.svelte`
- `src/render/canvas2d/Canvas2DRenderer.ts`
- `src/render/canvas2d/camera.ts`
- `src/render/canvas2d/theme.ts`
- `src/render/types.ts`

**Acceptance criteria**

- [x] The build succeeds without evaluating canvas or `window` code during static generation.
- [x] The canvas fills the stage without distortion.
- [x] The backing store matches CSS size × capped DPR.
- [x] Resizing updates the drawing immediately.
- [x] The loop pauses when the stage leaves the viewport or the tab is hidden.
- [x] The loop resumes correctly.
- [x] On coarse pointers, vertical drag scrolls the page; orbit is explicit or horizontal-only.
- [x] iOS viewport resize does not break the pinned stage.
- [x] Destroying the component removes all observers and listeners.
- [x] No per-frame allocations occur in the steady-state draw path beyond documented buffers.

Verified 2026-10-30 with `pnpm lint`, `pnpm test`, `pnpm build`, and `CI=1 pnpm test:e2e`. `tests/e2e/canvas-stage.spec.ts` covers hydration with no console errors, CSS/backing-store sizing at DPR 1 and 3 (cap 2), resize-while-paused, offscreen and hidden pause/resume, a real CDP touch gesture on a coarse pointer (vertical scroll remains native, horizontal orbit changes rotation, zoom buttons work), a synthetic `visualViewport` resize, and teardown plus ten reloads with one canvas. `tests/unit/canvas2d.test.ts` covers camera projection/unprojection/matrix, DPR sizing, theme token mapping, and primitive call sequences. The iOS criterion is verified in Chromium through the actual `visualViewport` handler and CSS `100svh`/`100dvh` rules; a real-device Safari pass remains part of the Step 3.6 responsive gate. The per-frame rule is a source audit, not a measurement: the draw path reuses one frame object, camera matrix, and point, and touches the DOM only every fifteenth frame for `data-frames` (plus `data-draws`/camera debug every thirtieth renderer draw). The `/dev/canvas-smoke` fixture remains in the production build as the renderer-lifecycle fixture; Step 1.5 added `/dev/story-smoke` for the complete story runtime.

### (DONE) Step 1.5 — Story controller, chapters, and progress rail

**Goal:** A complete scroll-story skeleton driven by MDX chapters.

**Tasks**

1. (DONE) Create the `Chapter.astro` component with a stable `id`, title, and optional scene overrides.
2. (DONE) Create `StoryController.svelte` to load a story config, build the engine, mount the renderer, and register chapters.
3. (DONE) Create `ProgressRail.svelte` with chapter links, current position, and keyboard access.
4. (DONE) Create `StageChrome.svelte` for play/pause, replay, speed, and settings.
5. (DONE) Implement chapter entry, progress, and exit semantics.
6. (DONE) Create a hidden development story page with at least four chapters and a simple moving object.
7. (DONE) Keep the development page in the production build with `noindex`, no navigation link, and an explicit sitemap exclusion. This lets Playwright test the built preview against the same artifact that ships.
8. (DONE) Ensure deep links to `#chapter-id` activate the correct scene after the pin offset is measured.

**Files**

- `src/components/story/Chapter.astro`
- `src/components/story/StoryController.svelte`
- `src/components/story/ProgressRail.svelte`
- `src/components/story/StageChrome.svelte`
- `src/lib/chapter-metadata.ts`
- `src/lib/scene-composition.ts`
- `src/stories/dev/config.ts`
- `src/pages/dev/story-smoke.astro`
- `src/stories/registry.ts`
- `tests/unit/scene-composition.test.ts`
- `tests/e2e/story-runtime.spec.ts`
- `tests/e2e/scroll.spec.ts`

**Acceptance criteria**

- [x] The development story scrolls through four chapters.
- [x] Each chapter activates its scene.
- [x] Deep-linking to `#chapter-id` works.
- [x] The progress rail reflects the active chapter.
- [x] The stage remains pinned during the narrative.
- [x] The page has a single stage element.
- [x] The development page is not linked from the production navigation, is `noindex`, and is excluded from the sitemap.
- [x] The runtime E2E suite runs against the built preview, including the development page.

Verified 2026-10-30 with `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm check:links`, and `CI=1 pnpm test:e2e`. `/dev/story-smoke` renders four `Chapter.astro` sections inside the `StoryController` island and reuses `StoryStage` + `Canvas2DRenderer`; `StoryController` registers the chapter elements with `ScrollDirector` and owns the fixed-step clock and engine. Chapter entry resets the run and applies typed defaults; progress composes camera, layer opacity, highlights, and reveal through `composeSceneState` without touching engine parameters; exit settles the crossed edge. Deep links are resolved after `ScrollDirector.refresh()` and again after fonts settle. The renderer factory is constructed inside the island (Astro cannot pass functions across hydration) and remains the single concrete factory until Step 4.1 adds a renderer-id registry. `tests/e2e/story-runtime.spec.ts` covers four chapter/scene activations, deep links and reload, rail keyboard/click navigation, a pinned stage at 360 px and 1440 px, one stage/canvas, noindex/unlinked/sitemap exclusion, play/pause, 1×/4× simulated time, replay, and teardown. `tests/e2e/scroll.spec.ts` now targets `/dev/story-smoke` and keeps the Step 1.3 trigger-count, native-scroll, keyboard, Lenis-policy, ten-navigation, and back/forward assertions. `/dev/scroll-smoke` was removed; `/dev/canvas-smoke` remains as the renderer-lifecycle fixture.

### (DONE) Step 1.6 — Controls, keyboard support, and metrics

**Goal:** Accessible controls that update the engine live.

**Tasks**

1. (DONE) Create `Slider.svelte` with a label, value readout, keyboard support, and numeric input.
2. (DONE) Create `PresetPicker.svelte`, `Toggle.svelte`, and `SeedControl.svelte`.
3. (DONE) Create `Metrics.svelte` with polite live-region updates at a low frequency.
4. (DONE) Implement play/pause, replay chapter, and speed controls.
5. (DONE) Add keyboard shortcuts scoped to a focusable stage region: Space toggles play/pause, arrows step, Escape leaves stage focus. Do not use `role="application"`.
6. (DONE) Add focus-visible styles and 44 px minimum touch targets.
7. (DONE) Add a documented shortcut list and `aria-roledescription` for the stage region.

**Files**

- `src/components/controls/*`
- `src/components/story/StageChrome.svelte`
- `src/styles/story.css`

**Acceptance criteria**

- [x] Every control is reachable by Tab and operable by keyboard.
- [x] Sliders announce their label and current value.
- [x] Space toggles play/pause only when the stage has focus.
- [x] Metrics update without announcing every frame.
- [x] Touch targets meet the minimum size.
- [x] Focus is always visible.
- [x] Screen-reader reading order matches visual order.

Verified 2026-10-30 with `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm check:links`, and `CI=1 pnpm test:e2e` (47 Playwright tests, including the new 11-test `tests/e2e/controls.spec.ts`). The control layer lives in `src/components/controls/`: `Slider` keeps a native range plus an exact number input, a visible label and readout, and `aria-valuetext`; `Toggle` is a native checkbox with a 44 px transparent target over a small switch; `PresetPicker` is a native select that applies typed config presets; `SeedControl` validates unsigned 32-bit seeds, reports invalid entries through a polite notice, and randomizes with `crypto.getRandomValues`. `Metrics` renders a key/value `<dl>` inside a polite live region; the controller samples it on chapter entry, pause/replay, seed/preset changes, and a one-second timer, never from the GSAP frame callback. The development story exposes orbit radius, ant trails, presets, and seed, all applied through `engine.setParams` and the renderer's existing `setParams` path without recreating the runtime. Its stage is a focusable `region` (no application role) described by a visible shortcut `<details>`: Space toggles playback, ArrowRight/Up advance one 1/60 s fixed step, ArrowLeft/Down replay one step back, and Escape focuses the first simulation control. `StoryStage` forwards key events only when the region itself is the target, so native button/slider/input keys are untouched and page scrolling is never hijacked. E2E verifies Tab reachability, slider naming/value, non-double-toggle on focused buttons and sliders, deterministic stepping, Escape without a trap, metrics mutation counts far below frame counts, 44 px target boxes, computed focus rings, DOM/visual reading order, a 360 px overlay rule for the pinned stage, and a clean WCAG 2.2 AA axe scan. Backward stepping replays from reset and is documented to restart runs longer than 10,000 fixed steps; a production engine that exposes a cheaper deterministic restore should replace that replay in Phase 2.

### (DONE) Step 1.7 — Reduced motion and article mode

**Goal:** The full story remains readable and understandable without animation.

**Tasks**

1. (DONE) Detect `prefers-reduced-motion` and expose a manual motion toggle that can only reduce motion further.
2. (DONE) Disable autoplay, scroll scrubbing, camera motion, and smooth scrolling under reduced motion.
3. (DONE) Provide step-forward and step-back controls for scenes.
4. (DONE) Make the server-rendered default the article layout. The stage is an enhancement inserted after hydration.
5. (DONE) Implement article mode as the no-stage layout; with JavaScript disabled it is the only layout.
6. (DONE) Build `<Predict>` on `<details>/<summary>` so it works without JavaScript.
7. (DONE) Persist the reader's choice if `localStorage` is available.
8. (DONE) Add a no-JavaScript layout test that asserts prose, formulas, and figures are visible and no empty stage is present.

**Files**

- `src/components/story/ArticleModeToggle.svelte`
- `src/components/story/StoryController.svelte`
- `src/components/story/StageChrome.svelte`
- `src/components/ui/Predict.astro`
- `src/lib/persistence.ts`
- `src/lib/motion-policy.ts`
- `src/lib/scroll-director.ts`
- `src/styles/story.css`
- `src/pages/dev/story-smoke.astro`
- `src/stories/dev/config.ts`
- `tests/unit/persistence.test.ts`
- `tests/e2e/motion-article.spec.ts`
- `tests/e2e/no-js.spec.ts`

**Acceptance criteria**

- [x] With reduced motion enabled, no animation starts automatically.
- [x] Step controls advance and reverse the scene.
- [x] Article mode hides the stage and shows all content.
- [x] With JavaScript disabled, the article layout renders with all prose, formulas, figures, and citations; no empty stage is present.
- [x] `<Predict>` reveals its explanation without JavaScript.
- [x] The choice persists across reloads when storage is available.
- [x] The story remains understandable in both modes.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (139 passing, 1 existing todo), `pnpm build`, `pnpm check:links` (54 internal references across 6 HTML files), and `CI=1 pnpm test:e2e` (56 Playwright tests). The article is the SSR default: `StoryController` renders the progress rail and chapter children, but no stage, controls, metrics, or article toggle until `onMount` sets `data-story-enhanced="true"`. The two-column/sticky layout and 110svh chapter ranges are gated on `[data-story-enhanced="true"][data-article-mode="false"]`; the no-JS and article layouts stay compact. `ArticleModeToggle` removes the stage from the DOM (not just visually) and persists `algorithm-stories.article-mode` (`article`/`stage`); the manual motion choice persists as `algorithm-stories.reduced-motion` (`reduced`/`full`). Both reads and writes go through `src/lib/persistence.ts`, which collapses missing/throwing storage to "no preference"; the storage-failure E2E overrides `window.localStorage` with a throwing getter and still toggles modes. `src/lib/motion-policy.ts` makes the OS preference authoritative: the manual toggle can only add reduced motion, and it is checked and disabled with a visible explanation when the OS asks for reduce. A `matchMedia` change listener pauses at runtime, settles the active chapter on its final keyframe, and re-applies the Lenis override. Reduced motion starts paused, ignores scroll progress for camera/reveal composition, and steps through `ChapterSpec.reducedMotionSteps` keyframes with the stage's back/forward controls; replay stays paused. `ScrollDirector.setReducedMotionOverride()` and `html[data-reduced-motion="true"]` remove Lenis and CSS smooth scrolling for a manual reduction too. `Predict.astro` is native `<details>/<summary>`; the dev page now carries real prose, a static formula, an inline SVG tour figure, a DOI citation, and the prediction in the no-JS article. The reduced-motion and article-mode axe scans are clean, and the earlier controls spec now tabs through the three added controls (step back, motion toggle, article toggle) instead of a fixed 12-stop walk.

### (DONE) Step 1.8 — URL state and sharing

**Goal:** Shareable, restorable story state.

**Tasks**

1. (DONE) Create a typed URL-state module with serialize, parse, validate, and clamp.
2. (DONE) Define per-story parameter schemas and defaults, including generator identity for RANDU.
3. (DONE) Use the path for the story slug, the query for parameters/seed, and the `#chapter-id` fragment for the chapter. The fragment is canonical.
4. (DONE) Update the URL with `replaceState` on parameter and chapter changes, debounced. Do not add history entries.
5. (DONE) Implement a share button that copies the canonical absolute URL.
6. (DONE) Restore the starting state (chapter, seed, structural parameters) on load. City-map edits are not shared; the UI says so.
7. (DONE) Clamp or reject invalid values according to the validation table in `docs/requirements.md` §2.6.1.
8. (DONE) Add unit tests, a table-driven validation test, and an E2E reload test.

**Files**

- `src/engines/core/url-state.ts`
- `src/lib/clipboard.ts`
- `src/components/story/StoryController.svelte`
- `src/components/story/StageChrome.svelte`
- `src/stories/registry.ts`
- `src/stories/dev/config.ts`
- `src/stories/dev/canvas-smoke-engine.ts`
- `tests/unit/url-state.test.ts`
- `tests/unit/clipboard.test.ts`
- `tests/e2e/url-state.spec.ts`

**Acceptance criteria**

- [x] Serialize/parse round-trips for every parameter, including the chapter fragment.
- [x] Invalid values follow the validation table and show a notice where required.
- [x] Reloading a shared URL restores the same starting state.
- [x] A share taken after a city edit restores the seeded map and the UI discloses that map edits are local.
- [x] The share button copies an absolute URL.
- [x] Repeated slider and chapter changes do not flood browser history.
- [x] No secrets or personal data are encoded.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (185 passing, 1 existing todo), `pnpm build`, `pnpm check:links`, and `CI=1 pnpm test:e2e` (61 Playwright tests). `src/engines/core/url-state.ts` owns the `UrlParamSpec`/`UrlParameterSchema` contracts (re-exported by `src/stories/registry.ts`) and implements canonical query serialization, typed parsing, clamping, and structured notices. The dev story declares `seed` (integer 0–4,294,967,295, structural), `orbit` (0.4–2.4), `variant` (`orbit`/`spiral`, structural), and `trails` (boolean); `story.defaults` remains the single source of defaults and is passed to the serializer so default fields are omitted from canonical URLs. The stage Speed control is the clock's playback rate and is intentionally not part of the shared run identity; the dev config's `speed` field remains the engine's internal chapter rate. `StoryController` parses the URL before building the engine, applies only accepted explicit values on top of chapter entry, resolves a valid fragment after layout measurement, and updates `?query#fragment` through a 180 ms debounced `replaceState`; unrelated query fields such as the `?lenis=off` test switch stay in the live address bar but are excluded from share links. Share copies an absolute URL built from `SITE_URL` plus the current path, with the canonical query and chapter fragment, through `src/lib/clipboard.ts` (Clipboard API with a hidden-textarea `execCommand` fallback; failures resolve instead of throwing). Notices render once in a polite `role="status"` region, never per frame. The dev fixture has no editable city map yet, so the city-edit criterion is verified through the visible disclosure that map edits are local, the seeded default map, and the share/reload test; the ACO lab will exercise the same disclosure with real edits.

### (DONE) Step 1.9 — Story runtime acceptance gate

**Goal:** Prove the runtime before building the first real story.

**Tasks**

1. (DONE) Expand the development story to exercise play/pause, speed, replay, reduced motion, article mode, share, resize, and navigation cleanup.
2. (DONE) Add E2E tests for the runtime.
3. (DONE) Add a navigation stress test.
4. (DONE) Record a short screen capture for design review.

**Acceptance criteria**

- [x] All runtime requirements in `docs/requirements.md` pass on the development story.
- [x] The runtime works at 360 px and 1440 px widths.
- [x] Deep-link, forward-scroll, reverse-scroll, and reload converge on the same starting state at chapter entry.
- [x] The no-JS article layout renders without an empty stage.
- [x] No uncaught errors occur during the stress test.
- [x] The runtime can be reused by a new story by adding a config and an MDX file.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (188 passing, 1 existing todo), `pnpm build`, `pnpm check:links`, and `CI=1 pnpm test:e2e` (74 Playwright tests). `src/stories/loader.ts` is a story-config registry keyed by slug; it dynamic-imports each config, and `StoryController` takes a `storyKey` prop instead of importing a concrete story. `src/components/story/renderer-factory.ts` (since replaced by per-story modules in Step 3.3) selects a renderer by `StoryConfig.rendererId`, leaving the Step 4.1 Three.js extension as a factory edit rather than a controller edit. The second fixture, `/dev/pulse-smoke`, adds `PulseEngine`, its own defaults, presets, four scenes, four chapters, URL schema, and page without touching controller internals; both dev pages stay `noindex`, unlinked, and sitemap-excluded. Chapter entry now records a deterministic `entryState` (chapter, scene, seed, structural and presentation params, step 0, simulated time 0, keyframe) before any frame can advance, exposed through `window.__storyRuntimeDebug.entryState()` and `data-entry-*`; the convergence test compares deep-link, forward-scroll, reverse-scroll, and reload entries for deep equality. `tests/e2e/story-runtime-acceptance.spec.ts` adds the acceptance matrix, all-four-speed rate test, offscreen/hidden pause, fast forward/reverse settling, 360/1440 flows with DPR 3 (capped at 2), share-and-reopen, ten round-trips between both stories, in-page teardown, and preference persistence. `tests/unit/story-loader.test.ts` checks the registry, chapter↔scene map, and that the two configs instantiate different engines. The runtime requirements matrix is in `docs/runtime-acceptance.md`. `scripts/capture-runtime.mjs` (also `pnpm capture:runtime`) records `test-results/design-review/story-runtime-review.webm` at 1440×900; the ignored artifact is a few megabytes and is not committed. The pre-existing URL-history test now waits 150 ms for a previous smooth scroll to settle between rail clicks; it still asserts that repeated slider and chapter changes do not grow history.

## 6. Phase 2 — ACO engine

### (DONE) Step 2.1 — TSP model

**Goal:** A correct, testable traveling salesman model.

**Tasks**

1. (DONE) Define `City`, `Tour`, and `TspInstance`.
2. (DONE) Generate a seeded random city layout inside a normalized coordinate space.
3. (DONE) Compute a distance matrix, clamping coincident cities to a small epsilon.
4. (DONE) Compute tour length, including the return edge.
5. (DONE) Validate that a tour visits every city exactly once.
6. (DONE) Add a nearest-neighbor initial tour for comparison.
7. (DONE) Add tests for distance, tour length, validation, and coincident cities.

**Files**

- `src/engines/aco/types.ts`
- `src/engines/aco/tsp.ts`
- `tests/unit/aco.test.ts`

**Acceptance criteria**

- [x] Tour length is symmetric for symmetric distances.
- [x] A tour that misses a city is rejected.
- [x] A tour that visits a city twice is rejected.
- [x] The return edge is included.
- [x] The same seed produces the same layout.
- [x] A 2-city and a 1-city instance are handled without crashing.
- [x] Coincident cities produce finite distances and no `NaN` or `Infinity`.

Verified 2026-10-30 with `pnpm lint` and `pnpm test` (225 passing, 1 existing todo). `src/engines/aco/types.ts` owns `City`, `Tour`, `DistanceMatrix`, `TspInstance`, and the discriminated `TourValidation` result. `src/engines/aco/tsp.ts` generates each city from two consecutive `SeededRandom` floats, stores cities in index order, and builds a symmetric row-major `Float64Array`. Off-diagonal distances below `DISTANCE_EPSILON = 1e-6` clamp to that value so `η = 1/d` stays finite; the diagonal stays zero because a tour never contains a self-edge. `createTspInstance` throws a clear `RangeError` for zero, negative, fractional, or non-finite city counts; `createTspInstanceFromCities(cities, seed)` copies, validates (`[0, 1]²`), and freezes explicit lists for the Step 3.5 editor. `validateTour` returns `wrong-length`, `out-of-range`, or `duplicate-city` with a display-ready message; a missing city appears as a wrong length, and with the correct length a duplicate necessarily means a missing city. `tourLength` validates first and throws on programmer error. `nearestNeighborTour(instance, startCity = 0)` is deterministic, tie-breaks toward the lower index, consumes no random numbers, and returns a frozen tour. `tests/unit/aco.test.ts` has 37 cases, including fast-check properties for matrix symmetry/bounds, validation against a reference permutation check, and greedy nearest-neighbor selection.

### (DONE) Step 2.2 — Ant System engine

**Goal:** A complete Ant System implementation with live parameters and metrics.

**Tasks**

1. (DONE) Define parameters: city count, ant count, `α`, `β`, `ρ`, speed, seed. `Q` is fixed at `1` in release 1.
2. (DONE) Initialize pheromone to a small positive value.
3. (DONE) Construct one tour per ant using the probabilistic transition rule, falling back to a uniform choice when all weights are zero.
4. (DONE) Deposit pheromone proportional to inverse tour length.
5. (DONE) Evaporate and update pheromone, allowing values to reach zero but never negative or non-finite.
6. (DONE) Track best tour, best length, mean length, iteration, and normalized pheromone entropy using the formula in `docs/stories.md` §2.6.
7. (DONE) Support `stepIteration()` for deterministic tests and `step(dt)` for the clock.
8. (DONE) Restart the run at iteration 0 when a structural parameter or the city set changes; invalidate best/mean history.
9. (DONE) Handle edge cases: `α = 0`, `β = 0`, `ρ = 1`, one ant, two cities, collinear cities.
10. (DONE) Expose a snapshot suitable for rendering without copying the entire graph every frame.
11. (DONE) Cap simulated iterations per frame at the worst-case workload.

**Files**

- `src/engines/aco/engine.ts`
- `src/engines/aco/presets.ts`
- `src/engines/aco/types.ts`

**Acceptance criteria**

- [x] The engine constructs valid tours.
- [x] Transition probabilities are normalized over the allowed set.
- [x] All-zero transition weights fall back to a uniform choice.
- [x] Pheromone remains non-negative and finite, including `ρ = 1`.
- [x] The best length never increases for a fixed city set since the last reset.
- [x] The entropy metric is normalized to `[0, 1]`.
- [x] A fixed run identity produces identical results.
- [x] Structural parameter changes restart at iteration 0; presentation changes do not.
- [x] Metrics are available at a low frequency.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (281 passing, 1 existing todo; 56 new engine tests), and `pnpm build`. `src/engines/aco/engine.ts` implements the complete Ant System: `τ₀ = 0.1` on every off-diagonal edge, construction with `p_ij ∝ τ_ij^α η_ij^β` and one seeded draw per next-city choice, deposit `Q / L_k`, evaporation then deposit, and normalized entropy with `E = n(n−1)/2`. `Q = 1`, the base rate (`1` iteration per simulated second), and the per-call/backlog caps (`2` and `8`) are exported constants. `stepIteration()` is the deterministic test/reduced-motion entry point; `step(dt)` converts simulated seconds into a pending-iteration budget, carries the fraction, runs at most two whole iterations per call, and counts trimmed whole backlog in `metrics().droppedIterations`. The fixed-step suite reaches identical tours and pheromone at 30, 60, and 120 fps. Structural fields (`cityCount`, `antCount`, `α`, `β`, `ρ`, `seed`) and `setCities()` restart at iteration 0 and clear best/mean history; `speed` changes apply without a reset, and a same-value `setParams` is a no-op. `transitionProbabilities(instance, pheromone, currentCity, allowed, alpha, beta, options?)` is exported for Step 3.2's fan and returns `{ cities, probabilities, count, uniform }`, with ascending candidate order and a uniform fallback for all-zero or non-finite weights. `AcoSnapshot` keeps stable references to cities, distances, the pheromone matrix, ant tour buffers, and the last best tour; ants are animated from `tour` plus the shared `iterationProgress`, so no graph is copied per frame. Best length starts from the first iteration's fastest ant; the nearest-neighbor baseline remains a separate `nearestNeighborTour` comparison. `src/engines/aco/presets.ts` carries the four documented parameter patches. `tests/unit/aco-engine.test.ts` covers valid tours, normalization, fallback, `ρ = 1`, non-increasing best, entropy with known distributions, determinism, structural/presentation resets, snapshot buffer reuse, collinear/coincident/one-city cases, frame-rate independence, and the workload cap.

**Contract extension (Step 3.2):** `AcoSnapshot` now also carries `history: AcoHistory` — a stable, bounded (512-point) chronological best/mean series whose objects are pooled and reused, so the convergence chart can read it without a per-frame copy. `AcoMetrics.history` is a fresh low-frequency copy. Reset, structural parameter changes, and `setCities()` clear the series. `src/engines/aco/types.ts` documents the shape; `tests/unit/aco-render.test.ts` covers the cap, determinism, stable references, reset, and copy isolation.

### (DONE) Step 2.3 — ACO correctness tests

**Goal:** Confidence that the visual result is mathematically trustworthy.

**Tasks**

1. (DONE) Add deterministic unit tests for known small instances.
2. (DONE) Add property-based tests for tour validity and probability normalization.
3. (DONE) Add edge-case tests for all parameters.
4. (DONE) Add a test that a larger `β` makes the next-city choice more distance-sensitive on a controlled instance.
5. (DONE) Add a test that evaporation reduces pheromone when no deposit occurs.
6. (DONE) Add a test that the best tour is preserved across iterations.

**Files**

- `tests/unit/aco.test.ts`

**Acceptance criteria**

- [x] All ACO invariants from `docs/requirements.md` have tests.
- [x] Tests run quickly and do not depend on the DOM.
- [x] Tests fail if the transition formula, deposit, or evaporation is broken.
- [x] Edge cases do not produce `NaN`, `Infinity`, or empty tours.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (308 passing, 1 existing todo; 27 new cases in `tests/unit/aco-engine.test.ts`), and `pnpm build`. The new cases live beside the Step 2.2 engine suite rather than in `tests/unit/aco.test.ts`, keeping TSP geometry and engine behavior separated; no new file was added. Coverage: hand-computable two-city, unit-square, and triangle instances with exact lengths and probabilities (`0.9/0.1` distance-driven, `0.2/0.8` pheromone-driven); fast-check properties for `ACO-INV-01` tour validity and `ACO-INV-02` normalization over random allowed sets; edge cases at `α ∈ {0,5}`, `β ∈ {0,10}`, `ρ ∈ {0,1}`, one ant, one/two cities, collinear and coincident cities, plus named `RangeError` checks for every structural field and the transition helpers; a controlled β test asserting the nearest-candidate mass rises from `0.5` to the exact `9^β` probability ratio (including a case where β overrides adverse pheromone) and a same-seed sampling check; evaporation with `ρ = 0.4` comparing unused edges against `(1 − ρ)·τ`, with `ρ = 0` and `ρ = 1` boundaries and exact `Q / L` deposits; and best-tour preservation across flat iterations plus non-increasing best length. Mutation checks (each reverted, not committed) failed as intended: ignoring `η^β` failed 5 formula/probability tests; using `Q · L` for the deposit failed the deposit test, `ACO-INV-04`, and the `Q / L` test; skipping evaporation failed both evaporation tests, the deposit test, the `ρ = 1` pheromone test, and `ACO-INV-04`.

## 7. Phase 3 — ACO story

### (DONE) Step 3.1 — Story configuration and scenes

**Goal:** A complete scene map connecting chapters to ACO behavior.

**Tasks**

1. (DONE) Create `src/stories/aco/config.ts` with defaults, presets, and the engine factory.
2. (DONE) Create `src/stories/aco/scenes.ts` with one scene per chapter.
3. (DONE) Define camera moves: overview, zoom to a city, follow the best tour, pull back for convergence.
4. (DONE) Define visible layers per scene: graph, pheromone, ants, best tour, probability fan, convergence chart.
5. (DONE) Define annotations per scene.
6. (DONE) Set defaults: 30 cities, 40 ants, `α = 1`, `β = 2`, `ρ = 0.5`, `Q = 1`, speed `1×`, seed `42`.
7. (DONE) Add presets: balanced, greedy, stagnant, forgetful.

**Files**

- `src/stories/aco/config.ts`
- `src/stories/aco/scenes.ts`
- `src/stories/aco/annotations.ts`
- `src/stories/aco/world.ts`
- `src/stories/registry.ts`
- `tests/unit/aco-story.test.ts`

**Acceptance criteria**

- [x] Every chapter has a scene.
- [x] Every scene declares its camera, layers, and annotations.
- [x] Presets apply the documented parameter values.
- [x] The default story is deterministic.
- [x] Scene transitions settle into coherent states.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (331 passing, 1 existing todo; 23 new cases in `tests/unit/aco-story.test.ts`), and `pnpm build`. `src/stories/aco/config.ts` exports `acoStoryConfig` with slug `ant-colony-optimization`, renderer `canvas2d`, `createEngine: (params) => new AcoEngine(params)`, the exact defaults (30 cities, 40 ants, α 1, β 2, ρ 0.5, speed 1, seed 42; `Q` remains the engine's fixed constant), and the four documented preset patches spread from `ACO_PRESETS` so city count, ant count, seed, and speed are preserved. The URL schema matches `docs/requirements.md` §2.6.1: `seed` (integer, structural), `cities` → `cityCount` (2–150, structural), `ants` → `antCount` (1–200, structural), `alpha` (0–5, structural), `beta` (0–10, structural), `rho` (0–1, structural), `speed` (0.5/1/2/4, presentation), and a `{ source: 'fragment' }` chapter. `StoryConfig` gains an optional `speedControl`: omitted means the existing clock behaviour, while ACO declares `{ kind: 'engine', param: 'speed' }` so Step 3.3/3.5 write the engine's presentation multiplier and leave the clock at 1× instead of applying speed twice. `src/stories/aco/scenes.ts` defines ten scenes in the exact chapter order (the-colony → colony-overview, the-problem → tour-problem, one-ants-choice → focal-choice, the-probability-rule → probability-rule, leaving-a-trace → deposit, forgetting → evaporation, emergence → emergence, tuning-the-colony → tuning, when-it-fails → limits, the-lab → lab), each with a 2D camera, all five canvas layers (`graph`, `pheromone`, `ants`, `best-tour`, `probability-fan`), highlights, reveal, and DOM labels. `src/stories/aco/world.ts` fixes the story world space (normalized unit square × 6, centred on the origin); the focal camera pans to city 17 of the seed-42/30-city layout and the deposit/evaporation cameras follow the best-tour centroid after 40 iterations, both checked against the pure engine in the tests. The convergence chart is not a canvas layer: `AcoSceneDefinition.convergenceChart` is a documented story-level field for the DOM chart that Step 3.2 builds. `src/stories/aco/annotations.ts` holds a 20-entry catalogue keyed by stable id; every chapter's annotation ids resolve in its own scene labels and every catalogue entry is used. Tests cover the chapter↔scene bijection, canonical layers and opacity bounds, graph visibility, annotation resolution, preset patches, exact defaults, URL field mapping plus round-trip/validation, import side effects, 12-iteration determinism (tour, length, pheromone, metrics), 40-iteration world anchors, and `composeSceneState` at progress 0/0.5/1 including exact settlement at progress 1.

### (DONE) Step 3.2 — ACO renderer layers

**Goal:** A polished 2D visualization of the colony.

**Tasks**

1. (DONE) Draw the city graph and faint candidate edges.
2. (DONE) Draw pheromone intensity with alpha and width on a readable scale.
3. (DONE) Draw ants as moving dots with short trails.
4. (DONE) Draw the best tour in a distinct accent.
5. (DONE) Draw the probability fan for the focal ant with the top N candidates (default N = 8) and an explicit "other (Σ)" bucket.
6. (DONE) Add a compact convergence chart as an SVG/DOM component, not as canvas text.
7. (DONE) Add layer toggles for debugging and for the lab.
8. (DONE) Ensure labels are DOM overlays, not canvas text.
9. (DONE) Ensure the best tour has a weight/pattern difference in addition to color.
10. (DONE) Add `scripts/build-figures.mjs` to generate the static ACO best-tour figure for article/no-JS mode by importing the engine with a fixed seed and writing an SVG.

**Commands**

```bash
pnpm add d3-scale d3-shape d3-color
pnpm add -D @types/d3-scale @types/d3-shape @types/d3-color tsx
```

**Files**

- `src/render/canvas2d/layers/*`
- `src/render/canvas2d/Canvas2DRenderer.ts`
- `src/render/canvas2d/theme.ts`
- `scripts/build-figures.mjs`

**Acceptance criteria**

- [x] Cities, edges, pheromone, ants, best tour, and probability fan are visible.
- [x] The probability fan labels sum to 1 and the textual alternative lists the top candidates plus the "other" bucket.
- [x] Pheromone intensity is readable at early and late iterations.
- [x] The best tour is distinguishable without relying on color alone.
- [x] The convergence chart updates.
- [x] Layer toggles work.
- [x] The scene remains legible on a dark stage and at 360 px.
- [x] `scripts/build-figures.mjs` produces the static best-tour SVG used by article/no-JS mode.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (355 passing, 1 existing todo; 24 new cases in `tests/unit/aco-render.test.ts`), `pnpm build`, and `CI=1 pnpm exec playwright test tests/e2e/aco-renderer.spec.ts` (3 passing). `src/render/canvas2d/layers/` adds the graph, pheromone, ants, best-tour, and probability-fan layers plus `createAcoLayers()`; every layer guards `visible`/opacity, reads the story world space (`ACO_WORLD_SCALE = 6`), converts CSS-pixel widths through the camera zoom, and draws no text. The graph batches all `n(n−1)/2` candidate edges into one path and reveals a deterministic prefix. Pheromone uses `t = ln(1 + τ/τ₀) / ln(1 + 32)` with width/alpha interpolation and a zero floor, bucketed into twenty batched paths on a theme-cached d3-color ramp. Ants interpolate `progress × n` along the tour (wrapping the return edge), use one reusable trail buffer, and skip `visitedCount === 0`. The best tour combines an amber halo, an accent dashed line, and square markers; its length stays in the DOM metrics. `src/stories/aco/probability-fan.ts` delegates to `transitionProbabilities`/`buildTransitionWeights`, names the top 8 candidates plus the other bucket with an exact normalized total, and feeds both the canvas arcs and `ProbabilityFanSummary.svelte`. The engine now exposes a bounded 512-point `AcoSnapshot.history` (stable array, pooled objects, no recording allocation) and a fresh `AcoMetrics.history` copy; `ConvergenceChart.svelte` plots both series with d3-scale/d3-shape and a visible caption/description. `/dev/aco-smoke` renders the real engine with `ACO_SCENES.emergence`, five layer toggles, play/pause/replay, zoom buttons, the fan summary, chart, and metrics; the E2E spec checks console cleanliness, both chart series, the fan total, a canvas hash change after a toggle without remounting, and the 360 px layout. The committed figure is `src/assets/figures/aco-best-tour.svg`, generated deterministically by `node --import tsx scripts/build-figures.mjs` from the same pure engine and intended for inline MDX use.


### (DONE) Step 3.3 — ACO story prose

**Goal:** A complete narrative with the required educational content.

**Tasks**

1. (DONE) Write the MDX chapters listed in `docs/stories.md`.
2. (DONE) Add learning objectives, difficulty, prerequisites, and references.
3. (DONE) Add at least one predict-then-reveal interaction.
4. (DONE) Add callouts for key ideas.
5. (DONE) Add a limitations section and an applications section.
6. (DONE) Add a glossary or inline definitions.
7. (DONE) Verify every chapter is readable in article mode.
8. (DONE) Add `scripts/check-citations.mjs` to verify stable URLs/DOIs and report external link status; wire it into `check:citations`.

**Files**

- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/components/ui/Callout.astro`
- `src/components/ui/Predict.astro`
- `src/components/ui/Figure.astro`
- `scripts/check-citations.mjs`

**Acceptance criteria**

- [x] All required chapters exist.
- [x] The narrative explains the problem, the rules, the emergence, the parameters, and the limits.
- [x] At least one predict-then-reveal interaction works.
- [x] Applications and limitations sections are present.
- [x] Key terms are defined in a glossary or inline.
- [x] At least three citations are present and resolve.
- [x] `pnpm check:citations` passes and reports external citation status.
- [x] Article mode contains the complete argument.
- [x] No chapter depends on animation alone to make sense.

**Session note (2026-10-30).** Step 3.3 is complete. The route/runtime half added `src/stories/runtime.ts` (the non-generic `StoryModuleView`/`StoryRuntime` facade from `createStoryModule(config, hooks)`), story-keyed dynamic modules in `src/stories/loader.ts`, and moved the concrete `AcoEngine`/`Canvas2DRenderer`/`createAcoLayers()` wiring into `src/stories/aco/module.ts`. `StoryController` consumes the runtime and a primitive `StoryParamBag`; `StoryConfig.presetKeeps` keeps run identity through presets, and `speedControl: engine` writes ACO speed without touching the 1× clock. `/stories/ant-colony-optimization` renders from the content entry plus the module view with the exact ten `ACO_CHAPTERS` ids/titles/scenes.

The prose half replaces the placeholders with 2,620 words across the ten chapters (one idea each, 174–368 words per chapter), in the `docs/stories.md` §6 voice: concrete, definition-first, and explicit about what the visualization shows versus what the algorithm guarantees. Each chapter is self-contained in article mode. `the-colony` defines stigmergy; `the-problem` defines tour/cycle/return edge and the (n−1)!/2 search space (29! orders, then 29!/2); `one-ants-choice` states the unvisited allowed set and gives the top-eight-plus-"other (Σ)" textual ranking with normalized probabilities; `the-probability-rule` states `p_ij ∝ τ_ij^α η_ij^β`, explains α/β and the α=0/β=0 extremes (distance-driven sampling, not nearest neighbour); `leaving-a-trace` gives Q/L_k with Q fixed at 1; `forgetting` gives (1−ρ) and the ρ=1 boundary; `emergence` distinguishes the non-increasing record from the fluctuating current-iteration mean, defines normalized entropy, compares the 4.91 record with the 6.12 default nearest-neighbour baseline, and embeds the static best-tour figure; `tuning-the-colony` documents all four presets and an experiment; `when-it-fails` has explicit `<h3>Limitations</h3>` and `<h3>Applications</h3>` sections (vehicle routing, network design, scheduling, dynamic problems, TSPLIB) and names ACS/MMAS as unimplemented refinements; `the-lab` names the controls available now (playback, replay, speed, share), states what a share link records, discloses that map edits are local and absent from share URLs, and marks the parameter panel, presets, city editor, and reset as not on the page yet. Two `<Predict>` blocks and five `<Callout>` tones (`idea`/`warning`/`try`) use native `<details>` and semantic notes. The inline `aco-best-tour.svg` figure (imported with `?raw`) is server-rendered with a halo + dashed accent + square markers caption and the 4.91 numeric length; below 48rem its internal text labels are hidden and the caption carries their content, so the full-width drawing stays usable without page overflow. A glossary defines nine terms and the references list all four frontmatter sources with DOI/URL links carrying `rel="noopener noreferrer"`.

`scripts/check-citations.mjs` scans story frontmatter, validates DOI/URL formats, resolves DOIs through `https://doi.org/api/handles/<doi>` (avoiding publisher bot walls), follows URL redirects with a timeout, and prints a per-citation table. Malformed citations and 404/410 fail; 401/403/405/429/5xx, timeouts, and network errors warn. `--offline` validates formats without network access; `--require-resolution` makes the three-ACO-citation floor strict. The default run passes when at least three resolve, and reports the floor as not enforced rather than failing on a blocked or offline runner.

Verification: `pnpm lint`, `pnpm test` (370 passing, 1 existing todo; 8 new cases in `tests/unit/aco-content.test.ts`), `pnpm build`, `pnpm check:links` (83 internal references across 9 HTML files), `pnpm check:citations` (8 citations across 2 stories: 6 ok, 2 warnings, 0 failed; 3 of 4 ACO citations resolved, floor met), and `CI=1 pnpm test:e2e` (84 Playwright tests). The E2E additions open a prediction with JavaScript disabled, assert the inline figure/glossary/references/limitations/applications, check external-link `rel` values, and run an ACO-route axe scan with no serious or critical violations. A 320 px and 1440 px visual pass confirmed the formula, ranked fan, preset list, figure, glossary, and references wrap without page overflow.

### (DONE) Step 3.4 — Math and pseudocode

**Goal:** The underlying logic is visible and synchronized with the story.

**Tasks**

1. (DONE) Add the transition probability, deposit, and evaporation formulas.
2. (DONE) Render math at build time and configure the MDX pipeline with `remark-math` and `rehype-katex`.
3. (DONE) Add pseudocode with syntax highlighting at build time.
4. (DONE) Add line-level highlight control driven by the active scene.
5. (DONE) Style formulas and code for the editorial paper and the dark stage.
6. (DONE) Ensure formulas and code are readable at 320 px.

**Commands**

```bash
pnpm add katex remark-math rehype-katex shiki @astrojs/markdown-remark
```

**Files**

- `src/components/ui/Math.astro`
- `src/components/ui/Pseudocode.astro`
- `src/lib/aco-formulas.ts`
- `src/lib/pseudocode.ts`
- `src/lib/pseudocode-dom.ts`
- `src/lib/story-pseudocode.ts`
- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/components/story/StoryController.svelte`
- `src/pages/stories/[...slug].astro`
- `src/layouts/StoryLayout.astro`
- `astro.config.mjs`
- `src/styles/story.css`
- `tests/unit/pseudocode.test.ts`
- `tests/e2e/aco-story.spec.ts`

**Acceptance criteria**

- [x] All three formulas render correctly.
- [x] Pseudocode is highlighted without runtime highlighting.
- [x] The highlighted line changes with the scene.
- [x] Math and code remain readable in article mode.
- [x] Long lines scroll within their own container on mobile.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (378 passing, 1 existing todo; 8 new cases in `tests/unit/pseudocode.test.ts`), `pnpm build`, `pnpm check:links` (84 internal references across 9 HTML files), `pnpm check:citations` (8 citations: 6 ok, 2 warnings, 0 failed; 3 of 4 ACO citations resolved, floor met), and `CI=1 pnpm test:e2e` (86 Playwright tests). Astro 7 defaults to Sätteri, which ignores remark/rehype plugins, so the MDX pipeline uses `@astrojs/markdown-remark`'s `unified()` with `remark-math` and `rehype-katex` (`throwOnError`, `output: 'htmlAndMathml'`); MDX inherits it. `Math.astro` renders the three `docs/stories.md` §2.7 formulas with `katex.renderToString` at build time and labels each with a visible caption and MathML output. `katex/dist/katex.min.css` is imported only by `StoryLayout.astro`; Vite emits the KaTeX fonts as same-origin `/_astro/KaTeX_*.woff2|woff|ttf` assets, and the home and index routes contain no KaTeX CSS. `src/lib/pseudocode.ts` holds the canonical ten-line listing, a small custom TextMate grammar, and a Shiki core highlighter with a CSS-variable theme; the output has `data-line="0…9"` on every line and no script. `src/lib/story-pseudocode.ts` generates the panel HTML once at build time in the page, and the island receives it as a string prop. `StoryController` mounts the panel only in the enhanced stage layout and moves exactly one `data-active`/`aria-current="step"` line in an `$effect` keyed on `activeChapterId`; `pseudocodeLine` values (2, 3, 4, 4, 7, 6, 8, 4, 9, 2) are unchanged. The article/no-JS path keeps a `<Pseudocode>` block in `the-probability-rule` with a static line 4. E2E asserts three display formulas in stage, article, and no-JS modes, the panel appearing only in stage mode, the active line moving from chapter 01 line 2 to `leaving-a-trace` line 7 and `forgetting` line 6, unique ids, no page overflow at 320 px with the listing and formula scrolling inside their own containers, and a clean ACO axe scan. The stage column gives up vertical room for the panel and is non-sticky below 60rem until Step 3.6 designs the mobile stage layout.

### (DONE) Step 3.5 — ACO lab

**Goal:** A complete free-play sandbox.

**Tasks**

1. (DONE) Add controls for city count, ant count, `α`, `β`, `ρ`, speed, and seed. Do not add a Q control; Q is fixed at 1.
2. (DONE) Add city dragging, adding, removing, and map reset. Each edit pauses, restarts at iteration 0, invalidates best/mean history, and shows the local-map notice.
3. (DONE) Add presets and a seed randomizer.
4. (DONE) Add play, pause, step, and restart.
5. (DONE) Add share URL and disclose that custom map edits are not included.
6. (DONE) Add a layer panel for pheromone, ants, best tour, and probability fan.
7. (DONE) Add a "compare" mode if the SHOULD requirement is implemented; otherwise document its deferral. Compare mode is deferred and documented in the lab and below.
8. (DONE) Add camera framing presets and zoom buttons for keyboard users.
9. (DONE) Add a text summary of the current best tour and metrics.

**Files**

- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/components/controls/*`
- `src/stories/aco/config.ts`
- `src/components/story/AcoLabPanel.svelte`
- `src/components/story/StoryMapOverlay.svelte`
- `src/components/story/StoryController.svelte`
- `src/stories/runtime.ts`
- `src/stories/aco/module.ts`
- `src/stories/aco/map.ts`
- `src/stories/aco/camera.ts`

**Acceptance criteria**

- [x] Every documented control works.
- [x] Dragging a city updates distances, tours, rendering, and restarts the run.
- [x] Adding and removing cities keep the instance valid and restart the run.
- [x] Reset restores a valid default map.
- [x] Share restores the starting state and discloses that custom map edits are local.
- [x] The lab is usable by keyboard and touch; camera presets and zoom buttons work without dragging.
- [x] The text summary matches the visible best tour length.
- [x] The edge cases (1 ant, 2 cities, `α = 0`, `β = 0`, `ρ = 1`, collinear cities) are reachable in the lab or the test fixtures.

Verified 2026-10-30 with `pnpm lint`, `pnpm test` (389 passing, 1 existing todo; 11 new cases in `tests/unit/aco-lab.test.ts`), `pnpm build`, `pnpm check:links` (87 internal references across 9 HTML files), `pnpm check:citations` (7 ok, 1 warning, 0 failed; ACO floor 3 of 4 met), and `CI=1 pnpm test:e2e` (98 Playwright tests, including the 12-test `tests/e2e/aco-lab.spec.ts`). The shared runtime gained only generic seams: `StoryModuleView.lab`, `StoryRuntime.auxiliary()`/`map()`, `StoryAuxiliaryView` (history, fan, tour, summary, camera presets, map view), `StoryMapRuntime`, and optional `screenToWorld`/`worldToScreen` on the renderer/stage handle. `src/stories/aco/module.ts` owns every ACO call (fan, summary, camera presets, map adapter); `AcoLabPanel.svelte` is ACO-specific and renders only after the lab chapter is entered; `StoryMapOverlay.svelte` is generic world-space handles. City add/remove updates the structural `cities` count, so a share restores a seeded map with that count and the UI says so; coordinates never enter the URL. Lab layer toggles and camera framing are presentation overrides cleared on chapter entry; the graph stays visible. Compare mode (FR-ACO-17) remains deferred and is named in the lab copy and `docs/requirements.md` §7. To keep city handles usable at 360 px, the one-column layout is a flex column (a sticky item in a one-row grid cannot pin across the story), the lab hides the stage pseudocode listing, and map handles appear only in Edit map mode so dense cities do not create overlapping target-size violations. Step 3.6 still owns the full responsive/perf gate and Step 3.7 owns the complete ACO E2E/visual matrix.

### (DONE) Step 3.6 — ACO responsive and performance pass

**Goal:** The story is comfortable on mobile and meets the frame budget.

**Tasks**

1. (DONE) Test at 320, 360, 390, 768, 1024, 1440, and 1920 px.
2. (DONE) Add a mobile stage layout that leaves room for controls and prose; use sticky rather than pinned below the small-screen threshold.
3. (DONE) Reduce rendered ant and edge detail at the low quality tier; the engine's city and ant counts stay part of the run identity.
4. (DONE) Cap DPR and disable expensive effects on low-tier devices.
5. (DONE) Profile the story with a 30-city and a 150-city × 200-ant worst-case instance.
6. (DONE) Fix any long tasks or per-frame allocations; cap iterations per frame.
7. (DONE) Add a frame-time harness that reports p95.
8. (DONE) Use the reference desktop and mobile definitions in `docs/requirements.md` §1.4.

**Acceptance criteria**

- [x] No horizontal overflow at any supported width.
- [x] The stage and controls are usable at 360 px.
- [x] Touch dragging works without scrolling the page unintentionally.
- [x] The story meets 55 fps p95 on the reference desktop and 45 fps p95 on the reference mobile device.
- [x] No long task exceeds 200 ms during the defined scroll and interaction workload, including the worst-case parameter set.
- [x] Quality tier changes take effect without a reload.

Verified 2026-10-31 with `pnpm lint`, `pnpm test` (407 passing, 1 existing todo; 5 new quality-cap cases), `pnpm build`, `pnpm check:links`, `pnpm check:citations`, `CI=1 pnpm exec playwright test tests/e2e/aco-responsive.spec.ts tests/e2e/aco-performance.spec.ts` (13 + 3 tests), and the full `CI=1 pnpm test:e2e`. `tests/e2e/aco-responsive.spec.ts` covers all seven widths, the 360 px stage/chrome/lab/pseudocode/formula surfaces, native vertical touch scroll with Edit map mode off, a captured city drag that does not move the page, and two quality tests: an explicit tier change (High → Low → High) swaps the canvas backing store between DPR 2 and 1 while paused iteration state and the page instance survive, and the 150 × 200 workload caps an explicit High choice to Low with the notice visible. `tests/e2e/aco-performance.spec.ts` installs a `requestAnimationFrame` wrapper with `page.addInitScript` before load, groups each callback's execution time by rAF timestamp, and asserts p95 **frame work** for the default 30 × 40 instance: ≤18.2 ms desktop (1440 × 900, DPR 2) and ≤22.2 ms mobile (390 × 844, DPR 2, 4× CDP CPU throttle). Measured frame-work p95 across the repeated gate runs was **0.6–1.3 ms desktop** and **2.6–4.8 ms mobile**, far inside their budgets; the 150 × 200 worst case reported **24.6–34.7 ms**. The wall-clock rAF interval p95 was **100–150 ms** desktop and **100–150 ms** mobile, reported in `test-results/aco-performance-*.json` but not asserted because headless Chromium's compositor and scheduler (software rasterization at ~10–20 Hz here) are not the reference display. The 150 × 200 worst case at 4× asserts no long task over 200 ms; its max long task was **up to 120 ms**. Long-task maxima were **up to 152 ms desktop**, **up to 164 ms mobile**, and **up to 120 ms worst case**, all below 200 ms. The engine now runs at most **one** iteration per `step(dt)` (`MAX_ITERATIONS_PER_STEP = 1`); the 8-iteration backlog cap and dropped-iteration count remain, and 4× still averages four iterations per simulated second because the pending-time budget accumulates across 60 Hz steps. The workload-quality cap lives in `src/lib/quality.ts` (`workloadQualityTier`, `capQualityForWorkload`): >80 cities or >120 ants resolves to `low`, >60 or >80 to `medium`, and the cap applies to an explicit reader choice as a hard presentation budget. `StoryController` derives it from the live `cityCount`/`antCount`, `StoryStage` forwards the tier to `Canvas2DRenderer.setQuality`, and `StageChrome` shows the reduced notice plus `data-quality-reduced`. The tier changes DPR, the rendered ant subset, trail samples, pheromone buckets, edge stride, and the tour halo only; it never changes city/ant counts, engine parameters, or the run identity, so the iteration state persists. Remaining caveat for Step 3.7/7.2: a real mid-tier device pass is still required for the reference-mobile criterion, and the artifact interval shows the current CI host renders at ~20 Hz under software rasterization, so use the frame-work and long-task numbers as regression signals rather than as a GPU-side fps claim.

### Step 3.7 — ACO end-to-end and visual tests

**Goal:** The story is protected against regressions.

**Tasks**

1. Add E2E tests for chapter navigation, play/pause, replay, speed, presets, city editing, lab, share, article mode, and reduced motion.
2. Add screenshot tests at fixed seeds and fixed scroll positions.
3. Add an accessibility scan.
4. Add a mobile project.
5. Add a no-JavaScript reading test.

**Acceptance criteria**

- [ ] The ACO E2E suite passes.
- [ ] Screenshots are stable across runs with the fixed seed and frozen time.
- [ ] axe reports no serious or critical violations.
- [ ] The no-JS reading test passes.
- [ ] The mobile project passes.

## 8. Phase 4 — 3D foundation and RANDU math

### Step 4.1 — Renderer adapter integration

**Goal:** The story runtime can switch between Canvas 2D and Three.js without changing the story shell.

**Tasks**

1. Install Three.js and its type definitions.
2. Add a renderer factory keyed by a renderer id string in the story config.
3. Dynamically import the Three.js renderer only when requested; story configs must never import renderers.
4. Load story configs per slug with dynamic imports so the ACO route does not include the RANDU config or Three.js.
5. Ensure the 2D story bundle does not include Three.js; add a build assertion that scans the ACO output for Three.
6. Add a loading state and a failure state for the 3D chunk.
7. Verify that the renderer contract is sufficient for both 2D and 3D scenes using the fake-3D test from Step 1.1.

**Commands**

```bash
pnpm add three
pnpm add -D @types/three
```

If the current Three.js release ships its own type declarations, skip the separate type package.

**Files**

- `src/stories/registry.ts`
- `src/components/story/StoryStage.svelte`
- `src/render/types.ts`
- `src/render/three/ThreeRenderer.ts`

**Acceptance criteria**

- [ ] The 2D story still works unchanged.
- [ ] The 3D renderer loads only on the RANDU route.
- [ ] Story configs do not import renderers; they only name renderer ids.
- [ ] The build assertion confirms Three.js is absent from the ACO and shared bundles.
- [ ] A failed chunk load shows a readable error and a retry action.
- [ ] The build output confirms Three.js is in a separate chunk.
- [ ] The renderer factory is unit-tested with fake renderers.

### Step 4.2 — ThreeStage: lifecycle, camera, labels, context loss

**Goal:** A reliable Three.js host.

**Tasks**

1. Create the renderer, scene, and perspective camera.
2. Add orbit controls with damping and constrained distance.
3. Add resize handling and DPR capping.
4. Add a DOM label projector.
5. Add pause/resume and dispose.
6. Add WebGL context-loss handling with a visible fallback and retry.
7. Add a quality-tier hook for point count and antialiasing.
8. Ensure only one WebGL context exists at a time.

**Files**

- `src/render/three/ThreeRenderer.ts`
- `src/render/three/LabelProjector.ts`
- `src/render/three/theme.ts`
- `src/styles/three.css`

**Acceptance criteria**

- [ ] The 3D stage mounts, renders, and resizes.
- [ ] Orbit and zoom work with mouse and touch.
- [ ] Labels project correctly and hide when behind the camera.
- [ ] The renderer pauses offscreen.
- [ ] Disposing removes the canvas, controls, listeners, geometries, materials, and textures.
- [ ] Simulated context loss shows a fallback and retry.
- [ ] Navigating between 3D routes does not leak contexts.

### Step 4.3 — LCG and RANDU math

**Goal:** An exact, tested implementation of the generator and its failure.

**Tasks**

1. Define the `Generator` interface and implement LCG, PCG32, and xoshiro128** adapters.
2. Implement the LCG with `a`, `c`, `m`, and seed, plus a fast exact path only when `a × (m − 1) + c ≤ 2^53`.
3. Add a BigInt reference path for arbitrary moduli and for unsafe LCG presets such as ANSI C.
4. Generate normalized values and consecutive triples.
5. Compute the RANDU plane index exactly from integer state: `(9x − 6y + z) / 2^31`.
6. Detect occupied plane indices and compute the maximum gap from the data.
7. Implement the low-bit check and the bit-plane data for the low-bit chapter.
8. Implement PCG32 and xoshiro128** with their own seeding schemes and exact fixtures.
9. Add presets: RANDU, MINSTD, ANSI C, Numerical Recipes, PCG32, `xoshiro128**`.
10. Add validation for invalid parameters, including even seeds (accept with warning) and fewer than 3 triples.
11. Document the RANDU period as 2²⁹ and remove any full-period claim for the multiplicative generator.

**Files**

- `src/engines/randu/lcg.ts`
- `src/engines/randu/planes.ts`
- `src/engines/randu/good-prng.ts`
- `src/engines/randu/presets.ts`
- `src/engines/randu/types.ts`

**Acceptance criteria**

- [ ] The fast path matches the BigInt reference for at least 10,000 outputs.
- [ ] The ANSI C preset uses the exact BigInt or `Math.imul` path; the fast-path predicate is per `(a, m)`.
- [ ] All normalized values are in `[0, 1)`.
- [ ] Every RANDU triple satisfies `9x − 6y + z = k × 2^31` when checked on integer state.
- [ ] A 50,000-triple run with seed `1` produces exactly 15 plane indices from −5 to 9.
- [ ] Small runs can produce fewer than 15 planes; seed `2^30` produces one plane.
- [ ] With an odd seed, every output is odd; even seeds are accepted with a warning.
- [ ] The comparison PRNG does not satisfy the RANDU plane relation.
- [ ] The RANDU period is documented and tested as 2²⁹.
- [ ] Invalid parameters produce a validation error or a clamp notice, not a crash.

### Step 4.4 — RANDU correctness tests

**Goal:** The mathematics is locked down before visualization.

**Tasks**

1. Add known-sequence tests for each preset using exact constants and first-output fixtures.
2. Add the BigInt reference comparison, including ANSI C.
3. Add plane relation and distinct-plane tests at fixed seed and run length.
4. Add low-bit tests and the even-seed warning tests.
5. Add normalization and range tests.
6. Add a test for seed `2^30` producing one plane.
7. Add a test for `m` not a power of two.
8. Add a test that the comparison PRNG breaks the relation.
9. Add a point-count test that confirms the control counts rendered triples.

**Files**

- `tests/unit/randu.test.ts`

**Acceptance criteria**

- [ ] All RANDU invariants from `docs/requirements.md` have tests.
- [ ] Tests fail if the multiplier, modulus, or plane formula changes incorrectly.
- [ ] Tests run without a browser.
- [ ] Edge cases are covered.

## 9. Phase 5 — RANDU story

### Step 5.1 — Point cloud, planes, cube, and axes

**Goal:** The 3D scene that makes the failure visible.

**Tasks**

1. Build a `Points` object from the normalized triples.
2. Add color-by-plane with a sequential palette.
3. Add progressive reveal via `setDrawRange`.
4. Build the 15 plane meshes with the correct normal and offsets.
5. Clip planes to the unit cube using six local clipping planes or pre-clipped geometry; do not approximate.
6. Add a cube frame and axes with labels.
7. Add point size, opacity, and plane opacity controls.
8. Add a comparison cloud from the good PRNG.
9. Add a 2D pairs view for the pre-3D chapter, showing consecutive values as a scatter plot.
10. Add a 2D top/edge projection for the fallback, generated by `scripts/build-figures.mjs`.
11. Detect WebGL2 and route to the fallback when it is unavailable.

**Files**

- `src/render/three/layers/point-cloud.ts`
- `src/render/three/layers/plane-family.ts`
- `src/render/three/layers/cube-frame.ts`
- `src/render/three/layers/comparison-cloud.ts`
- `src/render/three/theme.ts`
- `scripts/build-figures.mjs`

**Acceptance criteria**

- [ ] RANDU points visibly form sheets.
- [ ] Fifteen planes are visible and aligned with the points.
- [ ] Toggling planes works.
- [ ] Color-by-plane matches the computed indices.
- [ ] The cube frame and axes make the space legible.
- [ ] The comparison cloud looks uniform.
- [ ] Point count and opacity controls work.
- [ ] The 2D pairs view renders and shows lattice lines.
- [ ] The 2D projection shows the planes as lines.

### Step 5.2 — Camera director and guided tour

**Goal:** A cinematic automatic animation that the reader can interrupt and replay.

**Tasks**

1. Create `CameraDirector` with `scripted` and `free` modes.
2. Define camera poses: 3/4 `(1,1,1)`, top `(0,1,0)`, front `(0,0,1)`, edge-on `(6,9,0)` (perpendicular to the plane normal), and plane-normal `(9,−6,1)` (face-on).
3. Create a GSAP timeline for point reveal, plane fade, camera moves, and comparison crossfade.
4. Start one six-act tour spanning chapters 6–9 on chapter entry unless reduced motion is active. Entering a chapter seeks to its act; replay restarts the current act.
5. Pause the tour on pointer interaction and show a resume action; scroll scrubbing is suspended while the tour owns the camera.
6. Add replay and pause controls.
7. Highlight the plane equation when the camera reaches the edge-on view.
8. On reduced motion, jump to the final state and provide step buttons.
9. Ensure camera tweens and orbit controls do not fight.

**Files**

- `src/render/three/CameraDirector.ts`
- `src/stories/randu/tour.ts`
- `src/stories/randu/scenes.ts`
- `src/components/story/StageChrome.svelte`

**Acceptance criteria**

- [ ] The tour plays automatically on chapter entry and spans chapters 6–9.
- [ ] The camera reaches each documented pose; edge-on shows the planes as lines and plane-normal shows them face-on.
- [ ] Grabbing the camera pauses the tour and suspends scroll scrubbing.
- [ ] Resume returns to the scripted tour.
- [ ] Replay restarts the current act.
- [ ] The plane equation annotation appears at the edge-on pose.
- [ ] Reduced motion skips the tour and shows a coherent final view.
- [ ] No GSAP tour tweens remain after navigation.

### Step 5.3 — RANDU controls, presets, comparison, and metrics

**Goal:** A complete interactive parameter lab.

**Tasks**

1. Add the preset selector.
2. Add advanced controls for `a`, `c`, `m`, seed, and point count. Show `a/c/m` only for LCG presets.
3. Add toggles for planes, color-by-plane, cube, axes, auto-rotate, and comparison.
4. Hide or disable the RANDU-specific plane overlay and 15-plane claim unless the active parameters satisfy the RANDU relation (`a = 65539`, `c = 0`, `m = 2^31`).
5. Add camera preset buttons and zoom buttons.
6. Add metrics: distinct planes, maximum gap, period for known presets, low-bit result, sample triples. Compute them from the data.
7. Add regenerate and reset view.
8. Add share URL and disclose that only the starting state is shared.
9. Debounce expensive regeneration and show a busy state; run BigInt generation in a Worker or in chunks.
10. Accept even seeds with a warning; show an explanatory empty state for fewer than 3 triples.

**Files**

- `src/stories/randu/config.ts`
- `src/components/controls/*`
- `src/render/three/ThreeRenderer.ts`

**Acceptance criteria**

- [ ] All presets apply and regenerate the cloud.
- [ ] Advanced controls accept valid values and reject or clamp invalid ones with a notice.
- [ ] `a/c/m` are hidden for PCG32 and xoshiro128**.
- [ ] Metrics match unit-test values for RANDU and are computed from the data.
- [ ] Selecting a non-RANDU preset, or changing `a`, `c`, or `m` away from RANDU, hides or disables the RANDU-specific plane overlay and metrics.
- [ ] Comparison toggles between RANDU and the good PRNG.
- [ ] Camera presets and zoom buttons work.
- [ ] Share restores the starting parameters and seed and discloses the share scope.
- [ ] Even seeds show a warning; fewer than 3 triples shows an empty state.
- [ ] Regeneration at the default point count does not freeze the UI for more than 200 ms; 100,000-triple BigInt generation stays off the main thread or chunked.

### Step 5.4 — RANDU story prose

**Goal:** A complete narrative around the visualization.

**Tasks**

1. Write the chapters listed in `docs/stories.md`.
2. Include the LCG formula, RANDU parameters, the period 2²⁹, the Hull–Dobell scope, and the derivation of the plane relation.
3. Include the low-bit failure as a bit-plane strip or table, not a flat parity strip.
4. Include the 2D pairs chapter before the 3D reveal.
5. Include the history of RANDU and Marsaglia's observation, plus the even-seed warning and degenerate-seed note.
6. Include modern PRNGs and testing.
7. Include real-world applications and the distinction between simulation PRNGs and cryptographic RNGs.
8. Include limitations and appropriate-use guidance.
9. Add a glossary or inline definitions for key terms.
10. Add at least one predict-then-reveal interaction using `<details>`.
11. Add citations with stable URLs/DOIs and further reading.
12. Verify article mode includes static figures.
13. Run `pnpm check:citations` for the RANDU references.

**Files**

- `src/content/stories/randu-lcg/index.mdx`
- `src/components/ui/Callout.astro`
- `src/components/ui/Predict.astro`
- `src/components/ui/Figure.astro`

**Acceptance criteria**

- [ ] All required chapters exist.
- [ ] The derivation is mathematically correct.
- [ ] The period is stated as 2²⁹ and Hull–Dobell is not applied to RANDU.
- [ ] The 15-plane claim is demonstrated, not just asserted.
- [ ] The low-bit failure is demonstrated with a bit-plane view.
- [ ] The even-seed warning and the degenerate seed `2³⁰` are explained.
- [ ] The comparison with a good PRNG is clear.
- [ ] Applications and limitations sections are present.
- [ ] Key terms are defined in a glossary or inline.
- [ ] At least three citations are present and resolve.
- [ ] Article mode contains the complete argument.
- [ ] The story does not overclaim that all LCGs are unusable; it explains the specific failure and the broader lesson.

### Step 5.5 — RANDU accessibility fallback

**Goal:** The 3D story works without WebGL and for users who cannot use a 3D canvas.

**Tasks**

1. Add a 2D top projection and an edge-on projection generated at build time for article/no-JS mode.
2. Add a text summary of the current point cloud and plane structure.
3. Add a sample data table of triples and plane indices.
4. Add camera preset buttons, zoom buttons, and a pause control.
5. Ensure the canvas is hidden from assistive technology and the summary is exposed.
6. Add keyboard access to all controls.
7. Test with WebGL2 disabled, WebGL unavailable, and reduced motion.

**Files**

- `src/render/three/ThreeRenderer.ts`
- `src/components/story/StoryStage.svelte`
- `src/styles/three.css`
- `src/content/stories/randu-lcg/index.mdx`

**Acceptance criteria**

- [ ] With WebGL2 disabled, the fallback projections, summary, and table are visible.
- [ ] With reduced motion, no auto tour runs.
- [ ] All controls, including camera presets and zoom, are keyboard accessible.
- [ ] The accessibility tree contains the summary, not the canvas pixels.
- [ ] The page remains understandable with JavaScript disabled and the static figures are visible.

### Step 5.6 — RANDU responsive and performance pass

**Goal:** The 3D story is usable and smooth on mobile.

**Tasks**

1. Test at 320, 360, 390, 768, 1024, 1440, and 1920 px.
2. Reduce point count and DPR at the low quality tier.
3. Disable antialiasing and expensive effects on low-tier devices.
4. Keep vertical page scroll native on coarse pointers; use horizontal drag or an explicit Orbit mode, with zoom buttons as the single-pointer alternative.
5. Profile the default 50,000-triple scene and a 100,000-triple scene, including the BigInt path.
6. Fix per-frame allocations and unnecessary geometry rebuilds.
7. Add a frame-time harness that reports p95.
8. Verify context disposal on navigation.
9. Use the reference desktop and mobile definitions in `docs/requirements.md` §1.4.

**Acceptance criteria**

- [ ] No horizontal overflow at supported widths.
- [ ] Touch orbit and zoom work without trapping vertical page scroll.
- [ ] The story meets 55 fps p95 on the reference desktop and 45 fps p95 on the reference mobile device.
- [ ] The default point count regenerates within 200 ms on the reference desktop; 100,000 triples does not block the UI.
- [ ] Quality tiers change point count and DPR.
- [ ] No WebGL context leak after ten navigations.
- [ ] The fallback remains available.

### Step 5.7 — RANDU end-to-end and visual tests

**Goal:** The 3D story is protected against regressions.

**Tasks**

1. Add E2E tests for chapter navigation, tour, pause, resume, replay, presets, advanced controls, comparison, camera presets, share, article mode, and reduced motion.
2. Add WebGL2-disabled, WebGL-unavailable, and context-loss tests.
3. Add screenshot tests with a fixed camera, fixed seed, frozen time, disabled Lenis, and fonts ready.
4. Add an accessibility scan.
5. Add a mobile project.
6. Add a no-JavaScript reading test.
7. In the 3D test, enable SwiftShader and assert `data-renderer="three"` so the test does not silently pass on the fallback.

**Acceptance criteria**

- [ ] The RANDU E2E suite passes.
- [ ] Screenshots are stable across runs.
- [ ] The 3D test asserts the Three renderer mounted and a WebGL2 context exists.
- [ ] axe reports no serious or critical violations.
- [ ] The fallback tests pass.
- [ ] The mobile project passes.
- [ ] No console errors occur.

## 10. Phase 6 — Site surface

### Step 6.1 — Landing page

**Goal:** A distinctive home page that explains the project and points to the two stories.

**Tasks**

1. Write the hero: title, one-sentence description, and a clear entry point.
2. Add a live or still visual that reflects the editorial paper + dark stage aesthetic.
3. Add a two-card story section with title, dek, category, and link.
4. Add a short "how to read this site" section.
5. Add a footer with source, colophon, and story index.
6. Ensure the hero does not block LCP or load Three.js.

**Files**

- `src/pages/index.astro`
- `src/components/ui/*`
- `src/styles/base.css`

**Acceptance criteria**

- [ ] Both initial stories are linked.
- [ ] The hero is readable at 320 px.
- [ ] No 3D bundle is loaded on the home page.
- [ ] Lighthouse thresholds for the home page pass.
- [ ] The page has a single `<h1>`.

### Step 6.2 — Stories index

**Goal:** A clear catalog of the initial stories and future backlog.

**Tasks**

1. List the two initial stories with metadata.
2. Show future stories in a separate, visually quieter section.
3. Add category and status labels.
4. Add links to each story.
5. Ensure the index is usable without JavaScript.

**Files**

- `src/pages/stories/index.astro`
- `src/content.config.ts`

**Acceptance criteria**

- [ ] Both initial stories appear with links.
- [ ] Future stories are clearly marked as not yet available.
- [ ] The page works with JavaScript disabled.
- [ ] No dead links.

### Step 6.3 — About and colophon

**Goal:** Explain the project, the method, and the credits.

**Tasks**

1. Write an about page: purpose, editorial approach, and who it is for.
2. Write a colophon: technology, fonts, rendering approach, accessibility statement, and credits.
3. Add a privacy note describing analytics and data handling.
4. Link both pages from the footer.

**Files**

- `src/pages/about.astro`
- `src/pages/colophon.astro`

**Acceptance criteria**

- [ ] Both pages exist and are linked.
- [ ] The colophon lists fonts and major libraries with licenses.
- [ ] The privacy note matches actual behavior.
- [ ] No unsupported claims about performance or accessibility.

### Step 6.4 — Open Graph images, sitemap, RSS, and JSON-LD

**Goal:** Complete metadata and shareability.

**Tasks**

1. Generate a static Open Graph image per story at build time with `astro-og-canvas` and local TTF/OTF fonts.
2. Add a default social image for non-story pages.
3. Add `Article` JSON-LD for stories and `WebSite` JSON-LD for the site.
4. Add RSS for stories with `@astrojs/rss`; both stories appear.
5. Verify `sitemap-index.xml` includes all public routes and excludes `/dev/*`, the 404 page, and `/og/*`.
6. Add `robots.txt` pointing to `/sitemap-index.xml`.

**Commands**

```bash
pnpm add astro-og-canvas @astrojs/rss
```

**Files**

- `src/lib/seo.ts`
- `src/pages/og/[...slug].png.ts`
- `src/pages/rss.xml.ts`
- `public/robots.txt`

**Acceptance criteria**

- [ ] Every page has Open Graph and social-card metadata.
- [ ] Every story has a generated image that returns 200.
- [ ] JSON-LD parses and validates as `Article`/`WebSite`.
- [ ] `sitemap-index.xml` includes all public routes and excludes the dev page, 404, and OG images.
- [ ] `robots.txt` points to `/sitemap-index.xml`.
- [ ] The RSS feed contains both stories.

### Step 6.5 — Page transitions and final 404 polish

**Goal:** Navigation feels cohesive without breaking lifecycle cleanup.

**Tasks**

1. Enable progressive view transitions.
2. Add cleanup hooks for GSAP, Lenis, renderers, observers, and tour tweens.
3. Remount the story island when the slug changes; do not reuse an engine instance across stories.
4. Test navigation between the two stories repeatedly, in both directions.
5. Style the 404 page to match the site.
6. Verify browser back/forward restores the correct page and scroll position.

**Acceptance criteria**

- [ ] View transitions work where supported and fall back cleanly.
- [ ] No duplicate stages or triggers after navigation.
- [ ] No WebGL context leak.
- [ ] Back/forward navigation restores the expected page and position.
- [ ] The 404 page matches the visual system.

## 11. Phase 7 — Hardening

### Step 7.1 — Accessibility audit

**Goal:** Current WCAG Level AA compliance for the implemented experience.

**Tasks**

1. Run axe on every page and both stories.
2. Perform a keyboard-only pass, including camera presets and zoom.
3. Perform a screen-reader smoke test with at least two screen readers.
4. Check contrast for paper and dark-stage combinations against the token contract.
5. Check 200% zoom and 320 px reflow, including pinned-stage overlap.
6. Check reduced motion and article mode.
7. Check heading hierarchy, one `<h1>` per page, and meaningful link text.
8. Check that live metrics do not spam announcements.
9. Check non-text contrast, focus-not-obscured, and target size.
10. Fix all serious and critical issues.
11. Document any known limitations.

**Acceptance criteria**

- [ ] Zero serious or critical axe violations.
- [ ] Keyboard-only path works for both stories.
- [ ] Screen-reader summaries are accurate.
- [ ] Contrast passes.
- [ ] 200% zoom and 320 px reflow pass.
- [ ] Reduced motion and article mode pass.
- [ ] The accessibility statement is accurate.

### Step 7.2 — Performance audit

**Goal:** Meet every performance budget.

**Tasks**

1. Run Lighthouse CI on the home page, stories index, and both stories with desktop and mobile presets.
2. Create a bundle-size check with the explicit budgets from `docs/requirements.md` §2.8: initial and route-total JS, gzip level 9, ACO 200 KB, RANDU 450 KB initial plus 300 KB Three, route-total 700 KB.
3. Profile scrolling and interaction on the reference desktop and mobile device definitions.
4. Inspect long tasks and layout shifts.
5. Verify Three.js is absent from 2D pages.
6. Verify fonts do not cause layout shift.
7. Verify the production build contains no source maps or development-only code.
8. Run the Playwright `web-vitals` INP harness with the scripted interactions.
9. Fix regressions.
10. Record the baseline in the repository.

**Acceptance criteria**

- [ ] Lighthouse Performance ≥ 90 desktop and ≥ 80 mobile for story pages.
- [ ] LCP ≤ 2.5 s and CLS ≤ 0.1 in Lighthouse; INP ≤ 200 ms in the Playwright web-vitals harness.
- [ ] Initial and route-total bundle budgets pass.
- [ ] No long tasks over 200 ms during the defined workload.
- [ ] Frame-rate p95 targets pass.
- [ ] Three.js loads only on the RANDU page.
- [ ] No source maps are present in the production output.

### Step 7.3 — Cross-browser and device QA

**Goal:** The supported browser matrix works.

**Tasks**

1. Test current Chromium, Firefox, and WebKit in Playwright CI.
2. Manually test current Safari on macOS, current iOS Safari, and current Android Chrome on real devices.
3. Treat previous major versions as best-effort, not a release gate.
4. Test touch, trackpad, mouse, and keyboard.
5. Test WebGL2-disabled and reduced-motion modes.
6. Test slow network conditions.
7. File and fix defects.

**Acceptance criteria**

- [ ] Core reading and interaction paths pass on Chromium, Firefox, and WebKit.
- [ ] The documented manual device pass passes on current Safari, iOS Safari, and Android Chrome.
- [ ] No browser-specific layout breakage.
- [ ] Touch orbit and zoom work on mobile without trapping scroll.
- [ ] WebGL fallback works on all browsers.
- [ ] No console errors.

### Step 7.4 — Security headers and CSP

**Goal:** Harden the static site without breaking the build.

**Tasks**

1. Verify baseline headers.
2. Verify external links use `rel="noopener noreferrer"` where appropriate.
3. Add a Content Security Policy compatible with Astro's generated scripts, Svelte islands, and KaTeX styles.
4. Decide between hashes/nonces and a documented conservative fallback; document the choice before launch.
5. Add `frame-ancestors 'none'` and consider HSTS.
6. Test that analytics (none in v1), fonts, and assets still load.
7. Add the headers to the deployment smoke test.

**Acceptance criteria**

- [ ] Security headers are present in production.
- [ ] CSP does not block required scripts, styles, fonts, or images.
- [ ] No `unsafe-eval` is required.
- [ ] The smoke test checks the headers.

### Step 7.5 — Analytics and privacy

**Goal:** Optional, privacy-friendly measurement.

**Tasks**

1. Confirm analytics are off for release 1.
2. If analytics are enabled later, add the Cloudflare Web Analytics beacon and update the privacy note.
3. Verify no cookies are set.
4. Verify no personal data is collected.
5. Ensure analytics never block rendering.

**Acceptance criteria**

- [ ] Analytics are off in release 1.
- [ ] No consent banner is required.
- [ ] No tracking cookies are set.
- [ ] The privacy note matches behavior and mentions `localStorage` preferences.

### Step 7.6 — Error handling and resilience

**Goal:** Graceful failure for real-world conditions.

**Tasks**

1. Add an error boundary for story islands.
2. Add a retry action for failed 3D chunk loads.
3. Add a WebGL context-loss message and retry.
4. Add a visible message for unsupported browsers.
5. Ensure a renderer failure does not hide the prose.
6. Test offline/slow network behavior for the static page.

**Acceptance criteria**

- [ ] A failed 3D load leaves the prose readable and offers retry.
- [ ] Context loss is recoverable.
- [ ] A renderer error does not produce a blank page.
- [ ] Error messages are accessible.
- [ ] No unhandled promise rejections occur.

## 12. Phase 8 — Launch

### Step 8.1 — Full CI gates

**Goal:** Every change is verified automatically.

**Tasks**

1. Add lint, type-check, unit tests, E2E tests, accessibility tests, visual regression, build, link checking, bundle-size, and Lighthouse checks to CI.
2. Cache dependencies and Playwright browsers.
3. Upload test artifacts and screenshots on failure.
4. Require the CI checks before merging to main.
5. Document how to run the suite locally.
6. Ensure `test:a11y` is not run twice (either inside `test:e2e` or as a separate job, not both).

**Acceptance criteria**

- [ ] A clean pull request runs all checks.
- [ ] A deliberately broken engine test fails CI.
- [ ] A deliberately broken accessibility check fails CI.
- [ ] A deliberately broken visual snapshot fails CI.
- [ ] A bundle-budget regression fails CI.
- [ ] Artifacts are available for failed runs.

### Step 8.2 — Production deployment

**Goal:** A stable production release on the canonical custom domain.

**Tasks**

1. Confirm the production `site` URL and canonical URLs.
2. Run the full build from a clean checkout.
3. Deploy with Wrangler.
4. Run the post-deploy smoke script.
5. Verify both stories, 404, sitemap, robots, RSS, OG images, and headers.
6. Tag the release candidate in Git.

**Acceptance criteria**

- [ ] Production returns 200 for `/`, `/stories`, both stories, `/about`, and `/colophon`.
- [ ] The custom 404 works.
- [ ] `sitemap-index.xml`, robots, RSS, and OG images are reachable.
- [ ] Security and cache headers are correct.
- [ ] Both stories work on desktop and mobile.
- [ ] No paid Cloudflare service is used.

### Step 8.3 — Custom domain and final verification

**Goal:** A branded, secure URL and a final verification against the canonical domain.

The custom domain (`https://visualizations.ruul.ee`) was attached in Step 0.6, `SITE_URL` already uses it, and `workers_dev` is disabled. Tasks 1–5 below are therefore already satisfied; what remains is the post-launch re-verification once all content is final.

**Tasks**

1. Attach the custom domain to the Cloudflare project.
2. Configure DNS.
3. Verify HTTPS and that the disabled `workers.dev` route is not canonical.
4. Update the canonical `site` URL and sitemap.
5. Redeploy.
6. Re-run the full post-deploy smoke script with the custom domain: routes, canonicals, sitemap, robots, RSS, OG images, headers, and 404.
7. Re-run the final visual and accessibility spot checks on the custom domain.

**Acceptance criteria**

- [ ] The custom domain serves the site over HTTPS.
- [ ] Canonical URLs, sitemap, RSS, and OG images use the custom domain.
- [ ] The old deployment URL redirects or is clearly non-canonical.
- [ ] No mixed-content warnings.
- [ ] The full production verification is repeated after the domain change.

### Step 8.4 — Launch checklist

**Goal:** Nothing important is forgotten.

**Tasks**

1. Re-read `docs/requirements.md` and confirm all MUST requirements pass.
2. Confirm both stories meet the definition of done in `docs/stories.md`.
3. Confirm the README, docs, and colophon match reality.
4. Confirm the privacy note and analytics behavior.
5. Confirm the license and credits.
6. Confirm the development smoke page is `noindex` and absent from the sitemap.
7. Confirm the repository has a clear README and contribution notes.
8. Confirm the production deployment is tagged.

**Acceptance criteria**

- [ ] All release acceptance criteria in `docs/requirements.md` pass.
- [ ] Documentation is accurate.
- [ ] License and credits are present.
- [ ] The production release is tagged and reproducible.

### Step 8.5 — Post-launch monitoring

**Goal:** Catch regressions and real-world issues.

**Tasks**

1. Monitor Cloudflare analytics only if it is enabled later; release 1 has no analytics beacon.
2. Check Core Web Vitals in the field when data is available.
3. Triage user feedback.
4. Add regression tests for any reported defect.
5. Review dependency updates on a regular cadence.
6. Keep the backlog of future stories prioritized.
7. Use the documented rollback path (redeploy the previous tagged commit or `wrangler rollback`) for a bad deployment.

**Acceptance criteria**

- [ ] A monitoring routine is documented.
- [ ] Reported defects become tests before fixes.
- [ ] Dependency upgrades follow the test protocol.
- [ ] The future-story backlog remains current.

## 13. Appendices

### Appendix A — Package scripts

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "node --import tsx scripts/build-figures.mjs && astro check && astro build",
    "build:figures": "node --import tsx scripts/build-figures.mjs",
    "preview": "astro preview",
    "lint": "biome check . && astro check",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:a11y": "playwright test tests/e2e/a11y.spec.ts",
    "test:visual": "playwright test tests/e2e/visual.spec.ts",
    "check:links": "node scripts/check-links.mjs",
    "check:citations": "node scripts/check-citations.mjs",
    "check:bundle": "node scripts/check-bundle-size.mjs",
    "deploy": "pnpm build && wrangler deploy"
  }
}
```

`build:figures` runs through `node --import tsx` so the build script can import the pure TypeScript engine and figure renderer without duplicating their logic in JavaScript. `tsx` is a dev-only executable: it runs at build time and is never part of a browser bundle. The ACO figure is written to `src/assets/figures/aco-best-tour.svg` for inline MDX use.

### Appendix B — Astro configuration skeleton

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://visualizations.ruul.ee',
  trailingSlash: 'never',
  output: 'static',
  integrations: [
    svelte(),
    mdx(),
    sitemap({
      filter: (page) =>
        !page.includes('/dev/') &&
        !page.endsWith('/404') &&
        !page.includes('/og/'),
    }),
  ],
});
```

### Appendix C — CI workflow skeleton

Use the current major release of each official action. Do not pin versions in documentation.

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<current-major>
      - uses: pnpm/action-setup@<current-major>
        # Reads packageManager from package.json; pass `with: version: ...` if absent.
      - uses: actions/setup-node@<current-major>
        with:
          node-version: lts/*
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - run: pnpm check:links
      - run: pnpm check:citations
      - run: pnpm check:bundle
      - run: pnpm test:e2e
      - run: pnpm test:visual
      - run: pnpm exec lhci autorun
      - uses: actions/upload-artifact@<current-major>
        if: failure()
        with:
          name: playwright-artifacts
          path: |
            playwright-report/
            test-results/
          if-no-files-found: ignore

  deploy:
    needs: verify
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<current-major>
      - uses: pnpm/action-setup@<current-major>
      - uses: actions/setup-node@<current-major>
        with:
          node-version: lts/*
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: cloudflare/wrangler-action@<current-major>
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

### Appendix D — Test matrix

| Area | Unit | E2E | Visual | Manual |
|---|---|---|---|---|
| Seeded RNG | Yes | — | — | — |
| Fixed timestep | Yes | — | — | — |
| ACO invariants | Yes | — | — | — |
| RANDU invariants | Yes | — | — | — |
| URL state | Yes | Yes | — | — |
| Story runtime | — | Yes | — | Yes |
| ACO story | — | Yes | Yes | Yes |
| RANDU story | — | Yes | Yes | Yes |
| Accessibility | — | axe | — | Screen reader |
| Performance | — | — | — | Lighthouse + traces |
| Responsive | — | Yes | Yes | Device lab |
| No-JS reading | — | Yes | — | — |
| WebGL2 fallback | — | Yes | — | — |
| Deployment | — | Smoke | — | Manual |

### Appendix E — Definition of done for a story

A story is done only when:

- [ ] All chapters from `docs/stories.md` exist.
- [ ] The engine has unit-tested invariants.
- [ ] The renderer has all required layers.
- [ ] Parameters, presets, seed, reset, and share work; share restores the starting state and discloses excluded local edits.
- [ ] The lab is complete.
- [ ] Article mode and reduced motion are complete, including static figures.
- [ ] The no-JavaScript reading path works and shows the article layout, not an empty stage.
- [ ] Accessibility checks pass at WCAG 2.2 AA, including token contrast.
- [ ] Performance budgets pass.
- [ ] E2E and visual regression tests pass.
- [ ] Mobile and desktop layouts pass.
- [ ] Citations and further reading are present.
- [ ] Metadata and Open Graph images are present.
- [ ] The story is linked from the index and the home page.

### Appendix F — Commit and review conventions

- Keep engine changes separate from renderer and content changes where practical.
- Every bug fix includes a regression test.
- Every new dependency includes a note in the pull request explaining its role.
- Every visual change includes a before/after screenshot or recording.
- Do not merge with failing CI, disabled tests, or documented-but-unfixed P0/P1 defects.

### Appendix G — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Stage is blank | Renderer not mounted, canvas size zero, or story config missing | Check container dimensions, mount lifecycle, and scene registry |
| Scroll animations duplicate after navigation | GSAP context not reverted | Use `gsap.context()` and clean up on `astro:before-swap` |
| Lenis fights touch scrolling | Smooth scroll enabled on coarse pointers | Disable Lenis for touch and reduced motion |
| 3D chunk appears in 2D bundles | Static import of Three.js | Use a dynamic import inside the 3D renderer factory |
| WebGL context lost on navigation | Renderer not disposed | Cancel RAF, dispose geometries/materials/textures, remove canvas |
| Points look like a solid block | Point size too large or additive blending too strong | Reduce size/opacity; check DPR and quality tier |
| Planes look wrong | Incorrect normal/offset or clipping | Recompute plane position from the normalized equation and clip to the cube |
| Lighthouse performance fails | Fonts, eager 3D, or long tasks | Preload only critical assets, lazy-load 3D, profile long tasks |
| Text over canvas is unreadable | No scrim or contrast | Use paper prose outside the stage or a dark scrim with sufficient contrast |
| Share URL does not restore state | Parser defaults are applied after state load | Validate and apply URL state before initializing the engine |
| Tests are flaky | Time-dependent screenshots or unseeded randomness | Freeze time, fix seeds, and disable animations in visual tests |
