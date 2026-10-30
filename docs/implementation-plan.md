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
│  └─ build-figures.mjs
├─ src/
│  ├─ pages/
│  │  ├─ index.astro
│  │  ├─ stories/index.astro
│  │  ├─ stories/[...slug].astro
│  │  ├─ about.astro
│  │  ├─ colophon.astro
│  │  ├─ 404.astro
│  │  ├─ rss.xml.ts
│  │  ├─ og/[...slug].png.ts
│  │  └─ dev/story-smoke.astro
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
│  │  │  ├─ ConvergenceChart.svelte
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
│  │  │  │  ├─ graph.ts
│  │  │  │  ├─ pheromone.ts
│  │  │  │  ├─ ants.ts
│  │  │  │  ├─ best-tour.ts
│  │  │  │  └─ probability-fan.ts
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
│  │  ├─ dev/
│  │  │  ├─ config.ts
│  │  │  └─ canvas-smoke-engine.ts
│  │  ├─ aco/
│  │  │  ├─ config.ts
│  │  │  ├─ scenes.ts
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
│  │  └─ scroll-director.ts
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
   │  ├─ scene-composition.test.ts
   │  ├─ aco.test.ts
   │  ├─ randu.test.ts
   │  ├─ import-boundaries.test.ts
   │  └─ content-schema.test.ts
   └─ e2e/
      ├─ smoke.spec.ts
      ├─ site.spec.ts
      ├─ story-runtime.spec.ts
      ├─ aco.spec.ts
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
3. (DONE) Set a provisional production `site` URL in `astro.config.mjs`; replace it with the deployed workers.dev URL at Step 0.6.
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

### Step 0.6 — Cloudflare configuration, headers, and CI deployment

**Goal:** Every push to the main branch can deploy the static site to Cloudflare's free plan.

**Tasks**

1. (DONE) Add `wrangler.jsonc` with the static assets directory, `html_handling: "drop-trailing-slash"`, and 404 handling.
2. (DONE) Add `public/_headers` with baseline security headers, immutable caching for hashed assets, and explicit cache rules for `/fonts/*` and `/og/*`.
3. (DONE) Add an internal link checker that fails on broken relative links.
4. (DONE) Create a GitHub Actions workflow that installs dependencies, lints, tests, builds, checks links, checks bundles, and deploys.
5. Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets. — blocked: requires Cloudflare/GitHub credentials.
6. Deploy once manually to verify the account and permissions. — blocked: requires Cloudflare credentials.
7. Record the production workers.dev URL in the repository documentation and set Astro's `site` to it. Replace it with the custom domain at Step 8.3. — blocked: requires a live deployment URL.

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
- [ ] The production deployment returns 200 for `/` and `/stories` without a trailing-slash redirect. — blocked: requires a live deployment; locally, `wrangler dev` returned 200 for both and a 307 from `/stories/` to `/stories`.
- [ ] `site` is set to the deployed workers.dev URL, not `example.com`. — blocked: no deployed URL exists yet; `SITE_URL` remains the provisional placeholder.
- [x] The custom 404 is served for an unknown route. (verified locally with `wrangler dev --local`, not yet against production)
- [x] `curl -I` shows the security headers. (verified locally with `wrangler dev --local`)
- [x] Hashed assets show the immutable cache header; fonts and OG images show their explicit cache rules. (verified locally; the `/og/*` rule used a temporary probe file that was removed)
- [ ] The GitHub Actions workflow succeeds from a clean checkout. — blocked: requires a GitHub Actions run with repository secrets; the workflow YAML was parsed locally.
- [x] The link checker passes on the built output and fails on a deliberately broken internal link.
- [x] No Cloudflare paid service is required.

Local verification (2026-10-30): `pnpm exec wrangler dev --port 8799 --local` parsed 4 header rules, served `/` and `/stories` with 200, redirected `/stories/` to `/stories` with 307, served the custom 404 with a 404 status, and applied the `_astro`, `fonts`, and `og` cache rules. The link checker passed on the real build and failed with a clear path when a temporary broken link was added to the home page. Development pages are now excluded from the sitemap, which satisfies the Step 1.5 exclusion ahead of schedule.

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

### Step 1.7 — Reduced motion and article mode

**Goal:** The full story remains readable and understandable without animation.

**Tasks**

1. Detect `prefers-reduced-motion` and expose a manual motion toggle that can only reduce motion further.
2. Disable autoplay, scroll scrubbing, camera motion, and smooth scrolling under reduced motion.
3. Provide step-forward and step-back controls for scenes.
4. Make the server-rendered default the article layout. The stage is an enhancement inserted after hydration.
5. Implement article mode as the no-stage layout; with JavaScript disabled it is the only layout.
6. Build `<Predict>` on `<details>/<summary>` so it works without JavaScript.
7. Persist the reader's choice if `localStorage` is available.
8. Add a no-JavaScript layout test that asserts prose, formulas, and figures are visible and no empty stage is present.

**Files**

- `src/components/story/ArticleModeToggle.svelte`
- `src/components/story/StoryController.svelte`
- `src/lib/persistence.ts`
- `src/styles/story.css`

**Acceptance criteria**

- [ ] With reduced motion enabled, no animation starts automatically.
- [ ] Step controls advance and reverse the scene.
- [ ] Article mode hides the stage and shows all content.
- [ ] With JavaScript disabled, the article layout renders with all prose, formulas, figures, and citations; no empty stage is present.
- [ ] `<Predict>` reveals its explanation without JavaScript.
- [ ] The choice persists across reloads when storage is available.
- [ ] The story remains understandable in both modes.

### Step 1.8 — URL state and sharing

**Goal:** Shareable, restorable story state.

**Tasks**

1. Create a typed URL-state module with serialize, parse, validate, and clamp.
2. Define per-story parameter schemas and defaults, including generator identity for RANDU.
3. Use the path for the story slug, the query for parameters/seed, and the `#chapter-id` fragment for the chapter. The fragment is canonical.
4. Update the URL with `replaceState` on parameter and chapter changes, debounced. Do not add history entries.
5. Implement a share button that copies the canonical absolute URL.
6. Restore the starting state (chapter, seed, structural parameters) on load. City-map edits are not shared; the UI says so.
7. Clamp or reject invalid values according to the validation table in `docs/requirements.md` §2.6.1.
8. Add unit tests, a table-driven validation test, and an E2E reload test.

**Files**

- `src/engines/core/url-state.ts`
- `src/lib/clipboard.ts`
- `tests/unit/url-state.test.ts`

**Acceptance criteria**

- [ ] Serialize/parse round-trips for every parameter, including the chapter fragment.
- [ ] Invalid values follow the validation table and show a notice where required.
- [ ] Reloading a shared URL restores the same starting state.
- [ ] A share taken after a city edit restores the seeded map and the UI discloses that map edits are local.
- [ ] The share button copies an absolute URL.
- [ ] Repeated slider and chapter changes do not flood browser history.
- [ ] No secrets or personal data are encoded.

### Step 1.9 — Story runtime acceptance gate

**Goal:** Prove the runtime before building the first real story.

**Tasks**

1. Expand the development story to exercise play/pause, speed, replay, reduced motion, article mode, share, resize, and navigation cleanup.
2. Add E2E tests for the runtime.
3. Add a navigation stress test.
4. Record a short screen capture for design review.

**Acceptance criteria**

- [ ] All runtime requirements in `docs/requirements.md` pass on the development story.
- [ ] The runtime works at 360 px and 1440 px widths.
- [ ] Deep-link, forward-scroll, reverse-scroll, and reload converge on the same starting state at chapter entry.
- [ ] The no-JS article layout renders without an empty stage.
- [ ] No uncaught errors occur during the stress test.
- [ ] The runtime can be reused by a new story by adding a config and an MDX file.

## 6. Phase 2 — ACO engine

### Step 2.1 — TSP model

**Goal:** A correct, testable traveling salesman model.

**Tasks**

1. Define `City`, `Tour`, and `TspInstance`.
2. Generate a seeded random city layout inside a normalized coordinate space.
3. Compute a distance matrix, clamping coincident cities to a small epsilon.
4. Compute tour length, including the return edge.
5. Validate that a tour visits every city exactly once.
6. Add a nearest-neighbor initial tour for comparison.
7. Add tests for distance, tour length, validation, and coincident cities.

**Files**

- `src/engines/aco/types.ts`
- `src/engines/aco/tsp.ts`
- `tests/unit/aco.test.ts`

**Acceptance criteria**

- [ ] Tour length is symmetric for symmetric distances.
- [ ] A tour that misses a city is rejected.
- [ ] A tour that visits a city twice is rejected.
- [ ] The return edge is included.
- [ ] The same seed produces the same layout.
- [ ] A 2-city and a 1-city instance are handled without crashing.
- [ ] Coincident cities produce finite distances and no `NaN` or `Infinity`.

### Step 2.2 — Ant System engine

**Goal:** A complete Ant System implementation with live parameters and metrics.

**Tasks**

1. Define parameters: city count, ant count, `α`, `β`, `ρ`, speed, seed. `Q` is fixed at `1` in release 1.
2. Initialize pheromone to a small positive value.
3. Construct one tour per ant using the probabilistic transition rule, falling back to a uniform choice when all weights are zero.
4. Deposit pheromone proportional to inverse tour length.
5. Evaporate and update pheromone, allowing values to reach zero but never negative or non-finite.
6. Track best tour, best length, mean length, iteration, and normalized pheromone entropy using the formula in `docs/stories.md` §2.6.
7. Support `stepIteration()` for deterministic tests and `step(dt)` for the clock.
8. Restart the run at iteration 0 when a structural parameter or the city set changes; invalidate best/mean history.
9. Handle edge cases: `α = 0`, `β = 0`, `ρ = 1`, one ant, two cities, collinear cities.
10. Expose a snapshot suitable for rendering without copying the entire graph every frame.
11. Cap simulated iterations per frame at the worst-case workload.

**Files**

- `src/engines/aco/engine.ts`
- `src/engines/aco/presets.ts`
- `src/engines/aco/types.ts`

**Acceptance criteria**

- [ ] The engine constructs valid tours.
- [ ] Transition probabilities are normalized over the allowed set.
- [ ] All-zero transition weights fall back to a uniform choice.
- [ ] Pheromone remains non-negative and finite, including `ρ = 1`.
- [ ] The best length never increases for a fixed city set since the last reset.
- [ ] The entropy metric is normalized to `[0, 1]`.
- [ ] A fixed run identity produces identical results.
- [ ] Structural parameter changes restart at iteration 0; presentation changes do not.
- [ ] Metrics are available at a low frequency.

### Step 2.3 — ACO correctness tests

**Goal:** Confidence that the visual result is mathematically trustworthy.

**Tasks**

1. Add deterministic unit tests for known small instances.
2. Add property-based tests for tour validity and probability normalization.
3. Add edge-case tests for all parameters.
4. Add a test that a larger `β` makes the next-city choice more distance-sensitive on a controlled instance.
5. Add a test that evaporation reduces pheromone when no deposit occurs.
6. Add a test that the best tour is preserved across iterations.

**Files**

- `tests/unit/aco.test.ts`

**Acceptance criteria**

- [ ] All ACO invariants from `docs/requirements.md` have tests.
- [ ] Tests run quickly and do not depend on the DOM.
- [ ] Tests fail if the transition formula, deposit, or evaporation is broken.
- [ ] Edge cases do not produce `NaN`, `Infinity`, or empty tours.

## 7. Phase 3 — ACO story

### Step 3.1 — Story configuration and scenes

**Goal:** A complete scene map connecting chapters to ACO behavior.

**Tasks**

1. Create `src/stories/aco/config.ts` with defaults, presets, and the engine factory.
2. Create `src/stories/aco/scenes.ts` with one scene per chapter.
3. Define camera moves: overview, zoom to a city, follow the best tour, pull back for convergence.
4. Define visible layers per scene: graph, pheromone, ants, best tour, probability fan, convergence chart.
5. Define annotations per scene.
6. Set defaults: 30 cities, 40 ants, `α = 1`, `β = 2`, `ρ = 0.5`, `Q = 1`, speed `1×`, seed `42`.
7. Add presets: balanced, greedy, stagnant, forgetful.

**Files**

- `src/stories/aco/config.ts`
- `src/stories/aco/scenes.ts`
- `src/stories/aco/annotations.ts`
- `src/stories/registry.ts`

**Acceptance criteria**

- [ ] Every chapter has a scene.
- [ ] Every scene declares its camera, layers, and annotations.
- [ ] Presets apply the documented parameter values.
- [ ] The default story is deterministic.
- [ ] Scene transitions settle into coherent states.

### Step 3.2 — ACO renderer layers

**Goal:** A polished 2D visualization of the colony.

**Tasks**

1. Draw the city graph and faint candidate edges.
2. Draw pheromone intensity with alpha and width on a readable scale.
3. Draw ants as moving dots with short trails.
4. Draw the best tour in a distinct accent.
5. Draw the probability fan for the focal ant with the top N candidates (default N = 8) and an explicit "other (Σ)" bucket.
6. Add a compact convergence chart as an SVG/DOM component, not as canvas text.
7. Add layer toggles for debugging and for the lab.
8. Ensure labels are DOM overlays, not canvas text.
9. Ensure the best tour has a weight/pattern difference in addition to color.
10. Add `scripts/build-figures.mjs` to generate the static ACO best-tour figure for article/no-JS mode by importing the engine with a fixed seed and writing an SVG.

**Commands**

```bash
pnpm add d3-scale d3-shape d3-color
```

**Files**

- `src/render/canvas2d/layers/*`
- `src/render/canvas2d/Canvas2DRenderer.ts`
- `src/render/canvas2d/theme.ts`
- `scripts/build-figures.mjs`

**Acceptance criteria**

- [ ] Cities, edges, pheromone, ants, best tour, and probability fan are visible.
- [ ] The probability fan labels sum to 1 and the textual alternative lists the top candidates plus the "other" bucket.
- [ ] Pheromone intensity is readable at early and late iterations.
- [ ] The best tour is distinguishable without relying on color alone.
- [ ] The convergence chart updates.
- [ ] Layer toggles work.
- [ ] The scene remains legible on a dark stage and at 360 px.
- [ ] `scripts/build-figures.mjs` produces the static best-tour SVG used by article/no-JS mode.

### Step 3.3 — ACO story prose

**Goal:** A complete narrative with the required educational content.

**Tasks**

1. Write the MDX chapters listed in `docs/stories.md`.
2. Add learning objectives, difficulty, prerequisites, and references.
3. Add at least one predict-then-reveal interaction.
4. Add callouts for key ideas.
5. Add a limitations section and an applications section.
6. Add a glossary or inline definitions.
7. Verify every chapter is readable in article mode.
8. Add `scripts/check-citations.mjs` to verify stable URLs/DOIs and report external link status; wire it into `check:citations`.

**Files**

- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/components/ui/Callout.astro`
- `src/components/ui/Predict.astro`
- `src/components/ui/Figure.astro`
- `scripts/check-citations.mjs`

**Acceptance criteria**

- [ ] All required chapters exist.
- [ ] The narrative explains the problem, the rules, the emergence, the parameters, and the limits.
- [ ] At least one predict-then-reveal interaction works.
- [ ] Applications and limitations sections are present.
- [ ] Key terms are defined in a glossary or inline.
- [ ] At least three citations are present and resolve.
- [ ] `pnpm check:citations` passes and reports external citation status.
- [ ] Article mode contains the complete argument.
- [ ] No chapter depends on animation alone to make sense.

### Step 3.4 — Math and pseudocode

**Goal:** The underlying logic is visible and synchronized with the story.

**Tasks**

1. Add the transition probability, deposit, and evaporation formulas.
2. Render math at build time and configure the MDX pipeline with `remark-math` and `rehype-katex`.
3. Add pseudocode with syntax highlighting at build time.
4. Add line-level highlight control driven by the active scene.
5. Style formulas and code for the editorial paper and the dark stage.
6. Ensure formulas and code are readable at 320 px.

**Commands**

```bash
pnpm add katex remark-math rehype-katex
```

**Files**

- `src/components/ui/Math.astro`
- `src/components/ui/Pseudocode.astro`
- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/styles/story.css`

**Acceptance criteria**

- [ ] All three formulas render correctly.
- [ ] Pseudocode is highlighted without runtime highlighting.
- [ ] The highlighted line changes with the scene.
- [ ] Math and code remain readable in article mode.
- [ ] Long lines scroll within their own container on mobile.

### Step 3.5 — ACO lab

**Goal:** A complete free-play sandbox.

**Tasks**

1. Add controls for city count, ant count, `α`, `β`, `ρ`, speed, and seed. Do not add a Q control; Q is fixed at 1.
2. Add city dragging, adding, removing, and map reset. Each edit pauses, restarts at iteration 0, invalidates best/mean history, and shows the local-map notice.
3. Add presets and a seed randomizer.
4. Add play, pause, step, and restart.
5. Add share URL and disclose that custom map edits are not included.
6. Add a layer panel for pheromone, ants, best tour, and probability fan.
7. Add a "compare" mode if the SHOULD requirement is implemented; otherwise document its deferral.
8. Add camera framing presets and zoom buttons for keyboard users.
9. Add a text summary of the current best tour and metrics.

**Files**

- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/components/controls/*`
- `src/stories/aco/config.ts`

**Acceptance criteria**

- [ ] Every documented control works.
- [ ] Dragging a city updates distances, tours, rendering, and restarts the run.
- [ ] Adding and removing cities keep the instance valid and restart the run.
- [ ] Reset restores a valid default map.
- [ ] Share restores the starting state and discloses that custom map edits are local.
- [ ] The lab is usable by keyboard and touch; camera presets and zoom buttons work without dragging.
- [ ] The text summary matches the visible best tour length.
- [ ] The edge cases (1 ant, 2 cities, `α = 0`, `β = 0`, `ρ = 1`, collinear cities) are reachable in the lab or the test fixtures.

### Step 3.6 — ACO responsive and performance pass

**Goal:** The story is comfortable on mobile and meets the frame budget.

**Tasks**

1. Test at 320, 360, 390, 768, 1024, 1440, and 1920 px.
2. Add a mobile stage layout that leaves room for controls and prose; use sticky rather than pinned below the small-screen threshold.
3. Reduce city and ant counts at the low quality tier.
4. Cap DPR and disable expensive effects on low-tier devices.
5. Profile the story with a 30-city and a 150-city × 200-ant worst-case instance.
6. Fix any long tasks or per-frame allocations; cap iterations per frame.
7. Add a frame-time harness that reports p95.
8. Use the reference desktop and mobile definitions in `docs/requirements.md` §1.4.

**Acceptance criteria**

- [ ] No horizontal overflow at any supported width.
- [ ] The stage and controls are usable at 360 px.
- [ ] Touch dragging works without scrolling the page unintentionally.
- [ ] The story meets 55 fps p95 on the reference desktop and 45 fps p95 on the reference mobile device.
- [ ] No long task exceeds 200 ms during the defined scroll and interaction workload, including the worst-case parameter set.
- [ ] Quality tier changes take effect without a reload.

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

### Step 8.2 — Production deployment to the workers.dev URL

**Goal:** A stable production release on Cloudflare's workers.dev URL before the custom domain.

**Tasks**

1. Confirm the workers.dev `site` URL and canonical URLs.
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

**Tasks**

1. Attach the custom domain to the Cloudflare project.
2. Configure DNS.
3. Verify HTTPS and redirects from the workers.dev URL if desired.
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
    "build": "node scripts/build-figures.mjs && astro check && astro build",
    "build:figures": "node scripts/build-figures.mjs",
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

### Appendix B — Astro configuration skeleton

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://<workers-dev-subdomain>.workers.dev',
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
