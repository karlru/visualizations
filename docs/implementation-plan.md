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
- **Formatting and linting:** Biome.
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
│  └─ check-bundle-size.mjs
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
│  │  ├─ format.ts
│  │  ├─ clipboard.ts
│  │  ├─ persistence.ts
│  │  ├─ quality.ts
│  │  └─ scroll-director.ts
│  └─ styles/
│     ├─ tokens.css
│     ├─ base.css
│     ├─ story.css
│     └─ three.css
└─ tests/
   ├─ unit/
   │  ├─ rng.test.ts
   │  ├─ clock.test.ts
   │  ├─ url-state.test.ts
   │  ├─ aco.test.ts
   │  ├─ randu.test.ts
   │  └─ content-schema.test.ts
   └─ e2e/
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

### Step 0.1 — Initialize the repository and Astro project

**Goal:** A working Astro site in a Git repository.

**Tasks**

1. Initialize Git.
2. Scaffold Astro in the current directory. Choose the minimal template, strict TypeScript, install dependencies, and do not initialize a nested Git repository.
3. Confirm `src/pages/index.astro` renders.
4. Add a `.gitignore` covering build output, dependencies, test artifacts, and local environment files.
5. Make the first commit.

**Commands**

```bash
git init
pnpm create astro@latest . --template minimal --typescript strict --install --no-git
pnpm install
pnpm dev
```

If the CLI prompts differ, choose: minimal template, strict TypeScript, install dependencies, no Git.

**Files**

- `package.json`
- `pnpm-lock.yaml`
- `.gitignore`
- `src/pages/index.astro`
- `astro.config.mjs`
- `tsconfig.json`

**Acceptance criteria**

- [ ] `pnpm dev` serves a local page.
- [ ] `pnpm build` completes and creates `dist/index.html`.
- [ ] `src/engines/`, `src/render/`, `src/stories/`, and `docs/` exist or are created.
- [ ] `git status` shows a clean repository after the first commit.
- [ ] The lockfile is committed.

### Step 0.2 — Add Svelte, MDX, sitemap, and strict checks

**Goal:** The project supports interactive islands, MDX content, sitemap generation, and type checking.

**Tasks**

1. Add the Svelte, MDX, and sitemap integrations.
2. Configure `output: 'static'`.
3. Set the production `site` URL placeholder in `astro.config.mjs`.
4. Add `astro check` to the build script.
5. Create a temporary Svelte island on the home page and a temporary MDX page to prove both work.
6. Remove the temporary examples after verification.

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

- [ ] A Svelte island hydrates in the browser.
- [ ] An MDX page renders.
- [ ] `pnpm exec astro check` passes.
- [ ] `pnpm build` produces static HTML for all routes.
- [ ] `sitemap.xml` is generated after a build.
- [ ] No framework adapter for server rendering is installed.

### Step 0.3 — Add tooling: Biome, Vitest, Playwright, axe, Lighthouse CI

**Goal:** One command each for linting, unit tests, browser tests, accessibility checks, and performance budgets.

**Tasks**

1. Initialize Biome and configure formatting and linting.
2. Add Vitest and a smoke unit test.
3. Add Playwright and a smoke browser test; configure it to start a preview server for the built site.
4. Add axe-core integration for Playwright.
5. Add Lighthouse CI configuration.
6. Add `fast-check` for property-based tests.
7. Add package scripts for all verification commands.

**Commands**

```bash
pnpm add -D @biomejs/biome vitest @playwright/test @axe-core/playwright @lhci/cli fast-check wrangler
pnpm exec biome init
pnpm exec playwright install --with-deps chromium
```

**Files**

- `biome.json`
- `vitest.config.ts`
- `playwright.config.ts`
- `lighthouserc.json`
- `package.json`
- `tests/unit/smoke.test.ts`
- `tests/e2e/smoke.spec.ts`

**Acceptance criteria**

- [ ] `pnpm lint` passes.
- [ ] `pnpm test` runs at least one unit test and passes.
- [ ] `pnpm test:e2e` runs at least one Playwright test and passes.
- [ ] `pnpm exec lhci autorun` runs against a built preview and reports results.
- [ ] CI can run all verification commands without interactive prompts.

### Step 0.4 — Design tokens, fonts, and base layout

**Goal:** The editorial paper + dark stage visual system exists as reusable tokens and primitives.

**Tasks**

1. Define tokens for color, typography, spacing, radii, shadows, z-index, and motion, using the starting values in `docs/technology.md` §3.21.
2. Self-host the three font families in `public/fonts/` with appropriate weights and subsets.
3. Create `BaseLayout.astro` with the paper background, header, footer, skip link, and main landmark.
4. Create `tokens.css`, `base.css`, and `story.css`.
5. Add a typographic specimen page or section for visual review.
6. Verify font loading does not cause visible layout shift.

**Files**

- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/styles/story.css`
- `src/layouts/BaseLayout.astro`
- `public/fonts/*`

**Acceptance criteria**

- [ ] All colors and spacing values used by components come from tokens.
- [ ] Fonts are self-hosted; no third-party font requests are made.
- [ ] The base layout has a skip link that becomes visible on focus.
- [ ] The header and footer are keyboard accessible.
- [ ] The page has no horizontal overflow at 320 px.
- [ ] The font fallback metrics are configured to minimize layout shift.

### Step 0.5 — Base SEO, 404, and content schema skeleton

**Goal:** Every page has correct metadata, a custom 404, and a typed story schema.

**Tasks**

1. Create `Seo.astro` with title, description, canonical, Open Graph, and social-card tags.
2. Add a custom `404.astro`.
3. Create `content.config.ts` with the story collection schema.
4. Add required fields: title, dek, slug, category, difficulty, visual mode, learning objectives, prerequisites, references, and status.
5. Create placeholder story entries for ACO and RANDU using the schema.
6. Add a build-time validation test that a missing required field fails.

**Files**

- `src/components/ui/Seo.astro`
- `src/pages/404.astro`
- `src/content.config.ts`
- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/content/stories/randu-lcg/index.mdx`
- `tests/unit/content-schema.test.ts`

**Acceptance criteria**

- [ ] Every route has a unique title and meta description.
- [ ] `404.astro` returns a 404 status and links home and to `/stories`.
- [ ] A story with a missing required field fails the build.
- [ ] The placeholder stories appear in the content collection.
- [ ] Canonical URLs are absolute and use the configured site URL.

### Step 0.6 — Cloudflare configuration, headers, and CI deployment

**Goal:** Every push to the main branch can deploy the static site to Cloudflare's free plan.

**Tasks**

1. Add `wrangler.jsonc` with the static assets directory and 404 handling.
2. Add `public/_headers` with baseline security headers and immutable caching for hashed assets.
3. Add an internal link checker that fails on broken relative links.
4. Create a GitHub Actions workflow that installs dependencies, lints, tests, builds, checks links, and deploys.
5. Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
6. Deploy once manually to verify the account and permissions.
7. Record the production URL in the repository documentation.

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
```

**Acceptance criteria**

- [ ] `pnpm build` completes without errors.
- [ ] `pnpm exec wrangler deploy --dry-run` succeeds.
- [ ] The production deployment returns 200 for `/` and `/stories`.
- [ ] The custom 404 is served for an unknown route.
- [ ] `curl -I` shows the security headers.
- [ ] Hashed assets show the immutable cache header.
- [ ] The GitHub Actions workflow succeeds from a clean checkout.
- [ ] The link checker passes on the built output and fails on a deliberately broken internal link.
- [ ] No Cloudflare paid service is required.

## 5. Phase 1 — Story runtime

The story runtime is built once and used by both stories. It is tested with a hidden development page before any real story content is written.

### Step 1.1 — Define core contracts

**Goal:** Stable TypeScript contracts for engines, scenes, renderers, and story configuration.

**Tasks**

1. Define `Engine<P, S>` with `reset`, `setParams`, `step`, `snapshot`, and `metrics`.
2. Define `SceneState` with camera, visible layers, layer opacity, highlight targets, and reveal progress.
3. Define `StageRenderer` with `mount`, `resize`, `setScene`, `setParams`, `setPaused`, and `dispose`.
4. Define `StoryConfig` with slug, engine factory, defaults, presets, scenes, and URL parameter schema.
5. Define `ChapterSpec` with id, title, and optional scene overrides.
6. Add an import-boundary lint rule or test that engines do not import UI or renderer code.

**Files**

- `src/engines/core/types.ts`
- `src/render/types.ts`
- `src/stories/registry.ts`
- `tests/unit/import-boundaries.test.ts`

**Acceptance criteria**

- [ ] All contracts compile in strict mode.
- [ ] A dummy engine and dummy renderer satisfy the interfaces.
- [ ] Engines have no DOM, Svelte, Astro, or Three.js imports.
- [ ] The scene state can describe both 2D and 3D scenes without renderer-specific fields.
- [ ] The story config can be imported without side effects.

### Step 1.2 — Seeded RNG and fixed-timestep clock

**Goal:** Deterministic randomness and a stable simulation clock.

**Tasks**

1. Implement a small seeded PRNG for simulation use.
2. Add a seed-to-state helper and a `randomInt`/`randomFloat` API.
3. Implement a fixed-timestep accumulator with a maximum number of substeps.
4. Add a speed multiplier and a pause flag.
5. Add tests for determinism, range, and large time deltas.

**Files**

- `src/engines/core/rng.ts`
- `src/engines/core/clock.ts`
- `tests/unit/rng.test.ts`
- `tests/unit/clock.test.ts`

**Acceptance criteria**

- [ ] The same seed produces the same sequence across runs.
- [ ] Different seeds produce different sequences in practice.
- [ ] Floats are in `[0, 1)`; integers are within the requested bounds.
- [ ] The clock never performs more than the configured maximum substeps per frame.
- [ ] A long tab-away gap does not cause a simulation spiral.
- [ ] Pausing stops simulation advancement.
- [ ] Unit tests cover all of the above.

### Step 1.3 — Scroll director

**Goal:** A reusable scroll controller that reports chapter entry, progress, and exit without hijacking scroll.

**Tasks**

1. Integrate GSAP and ScrollTrigger.
2. Integrate Lenis with ScrollTrigger, disabled on touch and reduced motion.
3. Create `ScrollDirector` with `registerChapter`, `unregisterChapter`, `onEnter`, `onProgress`, `onExit`, and `refresh`.
4. Ensure all triggers are scoped and reverted with `gsap.context()`.
5. Add cleanup on `astro:before-swap` and component destroy.
6. Add a development overlay showing the active chapter and progress (removed or dev-only in production).
7. Verify native scroll, keyboard scrolling, and browser back/forward.

**Commands**

```bash
pnpm add gsap lenis
```

**Files**

- `src/components/story/StoryController.svelte`
- `src/lib/scroll-director.ts`
- `src/styles/story.css`

**Acceptance criteria**

- [ ] Scrolling updates the active chapter and progress.
- [ ] The scrollbar remains visible and native.
- [ ] PageDown, PageUp, Arrow keys, Home, and End work.
- [ ] Lenis is disabled under reduced motion and on coarse pointers.
- [ ] Navigating between stories does not leave duplicate triggers.
- [ ] A stress test of ten navigations leaves no more than one set of active triggers.
- [ ] No console errors occur.

### Step 1.4 — Stage shell and Canvas 2D renderer

**Goal:** A persistent stage that mounts, resizes, renders layers, pauses offscreen, and disposes cleanly.

**Tasks**

1. Create `StoryStage.svelte` with a container, canvas, and overlay slot; mount it as a client-only island or guard all browser APIs inside `onMount`.
2. Implement `Canvas2DRenderer` with a 2D camera and layer list.
3. Handle `ResizeObserver`, device pixel ratio, and canvas backing-store size.
4. Implement a single RAF loop driven by the story controller.
5. Add `IntersectionObserver` and `visibilitychange` pause behavior.
6. Add layer primitives for lines, points, arcs, text-free shapes, and gradients.
7. Dispose the canvas, observers, and RAF loop on destroy.

**Files**

- `src/components/story/StoryStage.svelte`
- `src/render/canvas2d/Canvas2DRenderer.ts`
- `src/render/canvas2d/camera.ts`
- `src/render/canvas2d/theme.ts`
- `src/render/types.ts`

**Acceptance criteria**

- [ ] The build succeeds without evaluating canvas or `window` code during static generation.
- [ ] The canvas fills the stage without distortion.
- [ ] The backing store matches CSS size × capped DPR.
- [ ] Resizing updates the drawing immediately.
- [ ] The loop pauses when the stage leaves the viewport or the tab is hidden.
- [ ] The loop resumes correctly.
- [ ] Destroying the component removes all observers and listeners.
- [ ] No per-frame allocations occur in the steady-state draw path beyond documented buffers.

### Step 1.5 — Story controller, chapters, and progress rail

**Goal:** A complete scroll-story skeleton driven by MDX chapters.

**Tasks**

1. Create the `Chapter.astro` component with a stable `id`, title, and optional scene overrides.
2. Create `StoryController.svelte` to load a story config, build the engine, mount the renderer, and register chapters.
3. Create `ProgressRail.svelte` with chapter links, current position, and keyboard access.
4. Create `StageChrome.svelte` for play/pause, replay, speed, and settings.
5. Implement chapter entry, progress, and exit semantics.
6. Create a hidden development story page with at least four chapters and a simple moving object.
7. Exclude the development page from the production build or mark it `noindex`, and remove it from the sitemap.
8. Ensure deep links to a chapter activate the correct scene.

**Files**

- `src/components/story/Chapter.astro`
- `src/components/story/StoryController.svelte`
- `src/components/story/ProgressRail.svelte`
- `src/components/story/StageChrome.svelte`
- `src/pages/dev/story-smoke.astro`
- `src/stories/registry.ts`

**Acceptance criteria**

- [ ] The development story scrolls through four chapters.
- [ ] Each chapter activates its scene.
- [ ] Deep-linking to `#chapter-id` works.
- [ ] The progress rail reflects the active chapter.
- [ ] The stage remains pinned during the narrative.
- [ ] The page has a single stage element.
- [ ] The development page is not linked from the production navigation, is not in the sitemap, and is removed or `noindex` in production.

### Step 1.6 — Controls, keyboard support, and metrics

**Goal:** Accessible controls that update the engine live.

**Tasks**

1. Create `Slider.svelte` with a label, value readout, keyboard support, and numeric input.
2. Create `PresetPicker.svelte`, `Toggle.svelte`, and `SeedControl.svelte`.
3. Create `Metrics.svelte` with polite live-region updates at a low frequency.
4. Implement play/pause, replay chapter, and speed controls.
5. Add keyboard shortcuts scoped to the stage: Space toggles play/pause, arrows step, Escape leaves stage focus.
6. Add focus-visible styles and 44 px minimum touch targets.

**Files**

- `src/components/controls/*`
- `src/components/story/StageChrome.svelte`
- `src/styles/story.css`

**Acceptance criteria**

- [ ] Every control is reachable by Tab and operable by keyboard.
- [ ] Sliders announce their label and current value.
- [ ] Space toggles play/pause only when the stage has focus.
- [ ] Metrics update without announcing every frame.
- [ ] Touch targets meet the minimum size.
- [ ] Focus is always visible.
- [ ] Screen-reader reading order matches visual order.

### Step 1.7 — Reduced motion and article mode

**Goal:** The full story remains readable and understandable without animation.

**Tasks**

1. Detect `prefers-reduced-motion` and expose a manual motion toggle.
2. Disable autoplay, scroll scrubbing, camera motion, and smooth scrolling under reduced motion.
3. Provide step-forward and step-back controls for scenes.
4. Implement article mode: hide the stage, keep all prose, figures, formulas, code, and citations.
5. Persist the reader's choice if `localStorage` is available.
6. Add a no-JavaScript layout check.

**Files**

- `src/components/story/ArticleModeToggle.svelte`
- `src/components/story/StoryController.svelte`
- `src/lib/persistence.ts`
- `src/styles/story.css`

**Acceptance criteria**

- [ ] With reduced motion enabled, no animation starts automatically.
- [ ] Step controls advance and reverse the scene.
- [ ] Article mode hides the stage and shows all content.
- [ ] Article mode works with JavaScript disabled.
- [ ] The choice persists across reloads when storage is available.
- [ ] The story remains understandable in both modes.

### Step 1.8 — URL state and sharing

**Goal:** Shareable, restorable story state.

**Tasks**

1. Create a typed URL-state module with serialize, parse, validate, and clamp.
2. Define per-story parameter schemas and defaults.
3. Update the URL with `replaceState` on parameter changes, debounced.
4. Implement a share button that copies the canonical absolute URL.
5. Restore chapter, seed, and parameters on load.
6. Reject or clamp invalid values without crashing.
7. Add unit tests and an E2E reload test.

**Files**

- `src/engines/core/url-state.ts`
- `src/lib/clipboard.ts`
- `tests/unit/url-state.test.ts`

**Acceptance criteria**

- [ ] Serialize/parse round-trips for every parameter.
- [ ] Invalid values fall back to safe defaults.
- [ ] Reloading a shared URL restores the visible state.
- [ ] The share button copies an absolute URL.
- [ ] Repeated slider changes do not flood browser history.
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

1. Define parameters: city count, ant count, `α`, `β`, `ρ`, `Q`, speed, seed.
2. Initialize pheromone to a small positive value.
3. Construct one tour per ant using the probabilistic transition rule, falling back to a uniform choice when all weights are zero.
4. Deposit pheromone proportional to inverse tour length.
5. Evaporate and update pheromone.
6. Track best tour, best length, mean length, iteration, and a diversity/entropy metric.
7. Support `stepIteration()` for deterministic tests and `step(dt)` for the clock.
8. Handle edge cases: `α = 0`, `β = 0`, `ρ = 1`, one ant, two cities, collinear cities.
9. Expose a snapshot suitable for rendering without copying the entire graph every frame.

**Files**

- `src/engines/aco/engine.ts`
- `src/engines/aco/presets.ts`
- `src/engines/aco/types.ts`

**Acceptance criteria**

- [ ] The engine constructs valid tours.
- [ ] Transition probabilities are normalized over the allowed set.
- [ ] All-zero transition weights fall back to a uniform choice.
- [ ] Pheromone remains positive and finite.
- [ ] The best length never increases.
- [ ] A fixed seed produces identical results.
- [ ] Parameter changes apply without resetting the run unless the change requires a reset.
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
5. Draw the probability fan for the focal ant.
6. Add a compact convergence chart as an SVG/DOM component, not as canvas text.
7. Add layer toggles for debugging and for the lab.
8. Ensure labels are DOM overlays, not canvas text.

**Commands**

```bash
pnpm add d3-scale d3-shape
```

**Files**

- `src/render/canvas2d/layers/*`
- `src/render/canvas2d/Canvas2DRenderer.ts`
- `src/render/canvas2d/theme.ts`

**Acceptance criteria**

- [ ] Cities, edges, pheromone, ants, best tour, and probability fan are visible.
- [ ] Pheromone intensity is readable at early and late iterations.
- [ ] The best tour is distinguishable without relying on color alone.
- [ ] The convergence chart updates.
- [ ] Layer toggles work.
- [ ] The scene remains legible on a dark stage and at 360 px.

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

**Files**

- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/components/ui/Callout.astro`
- `src/components/ui/Predict.astro`
- `src/components/ui/Figure.astro`

**Acceptance criteria**

- [ ] All required chapters exist.
- [ ] The narrative explains the problem, the rules, the emergence, the parameters, and the limits.
- [ ] At least one predict-then-reveal interaction works.
- [ ] Applications and limitations sections are present.
- [ ] Key terms are defined in a glossary or inline.
- [ ] At least three citations are present and resolve.
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

1. Add controls for city count, ant count, `α`, `β`, `ρ`, speed, and seed.
2. Add city dragging, adding, removing, and map reset.
3. Add presets and a seed randomizer.
4. Add play, pause, step, and restart.
5. Add share URL.
6. Add a layer panel for pheromone, ants, best tour, and probability fan.
7. Add a "compare" mode if the SHOULD requirement is implemented; otherwise document its deferral.
8. Add a text summary of the current best tour and metrics.

**Files**

- `src/content/stories/ant-colony-optimization/index.mdx`
- `src/components/controls/*`
- `src/stories/aco/config.ts`

**Acceptance criteria**

- [ ] Every documented control works.
- [ ] Dragging a city updates distances, tours, and rendering.
- [ ] Adding and removing cities keep the instance valid.
- [ ] Reset restores a valid default map.
- [ ] Share restores the same state.
- [ ] The lab is usable by keyboard and touch.
- [ ] The text summary matches the visible best tour length.

### Step 3.6 — ACO responsive and performance pass

**Goal:** The story is comfortable on mobile and meets the frame budget.

**Tasks**

1. Test at 320, 360, 390, 768, 1024, 1440, and 1920 px.
2. Add a mobile stage layout that leaves room for controls and prose.
3. Reduce city and ant counts at the low quality tier.
4. Cap DPR and disable expensive effects on low-tier devices.
5. Profile the story with a 30-city and a 100-city instance.
6. Fix any long tasks or per-frame allocations.
7. Add a frame-time harness.

**Acceptance criteria**

- [ ] No horizontal overflow at any supported width.
- [ ] The stage and controls are usable at 360 px.
- [ ] Touch dragging works without scrolling the page unintentionally.
- [ ] The story averages at least 55 fps on the reference desktop and 45 fps on the reference mobile device.
- [ ] No long task exceeds 200 ms during normal scrolling.
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
2. Add a renderer factory keyed by story config.
3. Dynamically import the Three.js renderer only when requested.
4. Ensure the 2D story bundle does not include Three.js.
5. Add a loading state and a failure state for the 3D chunk.
6. Verify that the renderer contract is sufficient for both 2D and 3D scenes.

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

1. Implement a general LCG with `a`, `c`, `m`, and seed.
2. Add a fast, exact path for `m = 2^31`.
3. Add a BigInt reference path for arbitrary moduli.
4. Generate normalized values and consecutive triples.
5. Compute the RANDU plane index exactly: `(9x − 6y + z) / 2^31`.
6. Detect the 15 plane indices and compute the maximum gap.
7. Implement the low-bit check.
8. Implement a good seeded PRNG for comparison.
9. Add presets: RANDU, MINSTD, ANSI C, Numerical Recipes, PCG32, `xoshiro128**`.
10. Add validation for invalid parameters.

**Files**

- `src/engines/randu/lcg.ts`
- `src/engines/randu/planes.ts`
- `src/engines/randu/good-prng.ts`
- `src/engines/randu/presets.ts`
- `src/engines/randu/types.ts`

**Acceptance criteria**

- [ ] The fast path matches the BigInt reference for at least 10,000 outputs.
- [ ] All normalized values are in `[0, 1)`.
- [ ] Every RANDU triple satisfies `9x − 6y + z = k × 2^31`.
- [ ] A long run produces exactly 15 plane indices from −5 to 9.
- [ ] With an odd seed, every output is odd.
- [ ] The good PRNG does not satisfy the RANDU plane relation.
- [ ] Invalid parameters produce a validation error, not a crash.

### Step 4.4 — RANDU correctness tests

**Goal:** The mathematics is locked down before visualization.

**Tasks**

1. Add known-sequence tests for each preset.
2. Add the BigInt reference comparison.
3. Add plane relation and distinct-plane tests.
4. Add low-bit tests.
5. Add normalization and range tests.
6. Add a test for even-seed handling.
7. Add a test for `m` not a power of two.
8. Add a test that the comparison PRNG breaks the relation.

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
5. Clip planes to the unit cube.
6. Add a cube frame and axes with labels.
7. Add point size, opacity, and plane opacity controls.
8. Add a comparison cloud from the good PRNG.
9. Add a 2D pairs view for the pre-3D chapter, showing consecutive values as a scatter plot.
10. Add a 2D top/edge projection for the fallback.

**Files**

- `src/render/three/layers/point-cloud.ts`
- `src/render/three/layers/plane-family.ts`
- `src/render/three/layers/cube-frame.ts`
- `src/render/three/layers/comparison-cloud.ts`
- `src/render/three/theme.ts`

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
2. Define camera poses: 3/4, top, front, edge-on, plane-normal.
3. Create a GSAP timeline for point reveal, plane fade, camera moves, and comparison crossfade.
4. Start the tour on chapter entry unless reduced motion is active.
5. Pause the tour on pointer interaction and show a resume action.
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

- [ ] The tour plays automatically on chapter entry.
- [ ] The camera reaches each documented pose.
- [ ] Grabbing the camera pauses the tour.
- [ ] Resume returns to the scripted tour.
- [ ] Replay restarts the tour.
- [ ] The plane equation annotation appears at the edge-on pose.
- [ ] Reduced motion skips the tour and shows a coherent final view.
- [ ] No GSAP tweens remain after navigation.

### Step 5.3 — RANDU controls, presets, comparison, and metrics

**Goal:** A complete interactive parameter lab.

**Tasks**

1. Add the preset selector.
2. Add advanced controls for `a`, `c`, `m`, seed, and point count.
3. Add toggles for planes, color-by-plane, cube, axes, auto-rotate, and comparison.
4. Hide or disable the RANDU-specific plane overlay and metrics unless the active parameters satisfy the RANDU relation (`a = 65539`, `c = 0`, `m = 2^31`).
5. Add camera preset buttons.
6. Add metrics: distinct planes, maximum gap, period for known presets, low-bit result, sample triples.
7. Add regenerate and reset view.
8. Add share URL.
9. Debounce expensive regeneration and show a busy state.

**Files**

- `src/stories/randu/config.ts`
- `src/components/controls/*`
- `src/render/three/ThreeRenderer.ts`

**Acceptance criteria**

- [ ] All presets apply and regenerate the cloud.
- [ ] Advanced controls accept valid values and reject invalid ones.
- [ ] Metrics match unit-test values for RANDU.
- [ ] Selecting a non-RANDU preset, or changing `a`, `c`, or `m` away from RANDU, hides or disables the RANDU-specific plane overlay and metrics.
- [ ] Comparison toggles between RANDU and the good PRNG.
- [ ] Camera presets work.
- [ ] Share restores the same parameters and seed.
- [ ] Regeneration does not freeze the UI for more than 200 ms at the default point count.

### Step 5.4 — RANDU story prose

**Goal:** A complete narrative around the visualization.

**Tasks**

1. Write the chapters listed in `docs/stories.md`.
2. Include the LCG formula, RANDU parameters, and the derivation of the plane relation.
3. Include the low-bit warm-up failure.
4. Include the 2D pairs chapter before the 3D reveal.
5. Include the history of RANDU and Marsaglia's observation.
6. Include modern PRNGs and testing.
7. Include real-world applications and the distinction between simulation PRNGs and cryptographic RNGs.
8. Include limitations and appropriate-use guidance.
9. Add a glossary or inline definitions for key terms.
10. Add at least one predict-then-reveal interaction.
11. Add citations and further reading.
12. Verify article mode.

**Files**

- `src/content/stories/randu-lcg/index.mdx`
- `src/components/ui/Callout.astro`
- `src/components/ui/Predict.astro`
- `src/components/ui/Figure.astro`

**Acceptance criteria**

- [ ] All required chapters exist.
- [ ] The derivation is mathematically correct.
- [ ] The 15-plane claim is demonstrated, not just asserted.
- [ ] The low-bit failure is demonstrated.
- [ ] The comparison with a good PRNG is clear.
- [ ] Applications and limitations sections are present.
- [ ] Key terms are defined in a glossary or inline.
- [ ] At least three citations are present and resolve.
- [ ] Article mode contains the complete argument.
- [ ] The story does not overclaim that all LCGs are unusable; it explains the specific failure and the broader lesson.

### Step 5.5 — RANDU accessibility fallback

**Goal:** The 3D story works without WebGL and for users who cannot use a 3D canvas.

**Tasks**

1. Add a 2D top projection and an edge-on projection.
2. Add a text summary of the current point cloud and plane structure.
3. Add a sample data table of triples and plane indices.
4. Add camera preset buttons and a pause control.
5. Ensure the canvas is hidden from assistive technology and the summary is exposed.
6. Add keyboard access to all controls.
7. Test with WebGL disabled and with reduced motion.

**Files**

- `src/render/three/ThreeRenderer.ts`
- `src/components/story/StoryStage.svelte`
- `src/styles/three.css`
- `src/content/stories/randu-lcg/index.mdx`

**Acceptance criteria**

- [ ] With WebGL disabled, the fallback projections, summary, and table are visible.
- [ ] With reduced motion, no auto tour runs.
- [ ] All controls are keyboard accessible.
- [ ] The accessibility tree contains the summary, not the canvas pixels.
- [ ] The page remains understandable with JavaScript disabled.

### Step 5.6 — RANDU responsive and performance pass

**Goal:** The 3D story is usable and smooth on mobile.

**Tasks**

1. Test at 320, 360, 390, 768, 1024, 1440, and 1920 px.
2. Reduce point count and DPR at the low quality tier.
3. Disable antialiasing and expensive effects on low-tier devices.
4. Ensure one-finger orbit and two-finger zoom work without page scroll interference.
5. Profile the default 50,000-point scene and a 100,000-point scene.
6. Fix per-frame allocations and unnecessary geometry rebuilds.
7. Add a frame-time harness.
8. Verify context disposal on navigation.

**Acceptance criteria**

- [ ] No horizontal overflow at supported widths.
- [ ] Touch orbit and zoom work.
- [ ] The story averages at least 55 fps on the reference desktop and 45 fps on the reference mobile device.
- [ ] The default point count regenerates within 200 ms on the reference desktop.
- [ ] Quality tiers change point count and DPR.
- [ ] No WebGL context leak after ten navigations.
- [ ] The fallback remains available.

### Step 5.7 — RANDU end-to-end and visual tests

**Goal:** The 3D story is protected against regressions.

**Tasks**

1. Add E2E tests for chapter navigation, tour, pause, resume, replay, presets, advanced controls, comparison, camera presets, share, article mode, and reduced motion.
2. Add WebGL-disabled and context-loss tests.
3. Add screenshot tests with fixed camera, fixed seed, and frozen time.
4. Add an accessibility scan.
5. Add a mobile project.
6. Add a no-JavaScript reading test.

**Acceptance criteria**

- [ ] The RANDU E2E suite passes.
- [ ] Screenshots are stable across runs.
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

1. Generate a static Open Graph image per story at build time.
2. Add a default social image for non-story pages.
3. Add JSON-LD for stories and the site.
4. Add RSS for stories.
5. Verify `sitemap.xml` includes all routes.
6. Add `robots.txt`.

**Files**

- `src/lib/seo.ts`
- `src/pages/og/[...slug].png.ts`
- `src/pages/rss.xml.ts`
- `public/robots.txt`

**Acceptance criteria**

- [ ] Every page has Open Graph and social-card metadata.
- [ ] Every story has a generated image that returns 200.
- [ ] JSON-LD parses and validates.
- [ ] `sitemap.xml` includes all public routes.
- [ ] `robots.txt` points to the sitemap.
- [ ] The RSS feed contains both stories.

### Step 6.5 — Page transitions and final 404 polish

**Goal:** Navigation feels cohesive without breaking lifecycle cleanup.

**Tasks**

1. Enable progressive view transitions.
2. Add cleanup hooks for GSAP, Lenis, renderers, and observers.
3. Test navigation between the two stories repeatedly.
4. Style the 404 page to match the site.
5. Verify browser back/forward restores the correct scroll position.

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
2. Perform a keyboard-only pass.
3. Perform a screen-reader smoke test with at least two screen readers.
4. Check contrast for paper and dark-stage combinations.
5. Check 200% zoom and 320 px reflow.
6. Check reduced motion and article mode.
7. Check heading hierarchy, one `<h1>` per page, and meaningful link text.
8. Check that live metrics do not spam announcements.
9. Fix all serious and critical issues.
10. Document any known limitations.

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

1. Run Lighthouse CI on the home page, stories index, and both stories.
2. Create a bundle-size check with the explicit budgets from `docs/requirements.md` (200 KB for a 2D story, 450 KB for the 3D story, 300 KB for the Three.js chunk).
3. Profile scrolling and interaction on the reference desktop and mobile device.
4. Inspect long tasks and layout shifts.
5. Verify Three.js is absent from 2D pages.
6. Verify fonts do not cause layout shift.
7. Verify the production build contains no source maps or development-only code.
8. Fix regressions.
9. Record the baseline in the repository.

**Acceptance criteria**

- [ ] Lighthouse Performance ≥ 90 desktop and ≥ 80 mobile for story pages.
- [ ] LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms.
- [ ] Bundle budgets pass.
- [ ] No long tasks over 200 ms during normal use.
- [ ] Frame-rate targets pass.
- [ ] Three.js loads only on the RANDU page.
- [ ] No source maps are present in the production output.

### Step 7.3 — Cross-browser and device QA

**Goal:** The supported browser matrix works.

**Tasks**

1. Test current and previous major versions of Chrome, Edge, Firefox, and Safari.
2. Test current iOS Safari and Android Chrome.
3. Test touch, trackpad, mouse, and keyboard.
4. Test WebGL-disabled and reduced-motion modes.
5. Test slow network conditions.
6. File and fix defects.

**Acceptance criteria**

- [ ] Core reading and interaction paths pass on every target browser.
- [ ] No browser-specific layout breakage.
- [ ] Touch orbit and zoom work on mobile.
- [ ] WebGL fallback works on all browsers.
- [ ] No console errors.

### Step 7.4 — Security headers and CSP

**Goal:** Harden the static site without breaking the build.

**Tasks**

1. Verify baseline headers.
2. Verify external links use `rel="noopener noreferrer"` where appropriate.
3. Add a Content Security Policy compatible with Astro's generated scripts and styles.
4. If a strict CSP requires hashes or nonces, use the framework's supported mechanism or document a conservative fallback.
5. Test that analytics, fonts, and assets still load.
6. Add the headers to the deployment smoke test.

**Acceptance criteria**

- [ ] Security headers are present in production.
- [ ] CSP does not block required scripts, styles, fonts, or images.
- [ ] No `unsafe-eval` is required.
- [ ] The smoke test checks the headers.

### Step 7.5 — Analytics and privacy

**Goal:** Optional, privacy-friendly measurement.

**Tasks**

1. Decide whether to enable Cloudflare Web Analytics.
2. If enabled, add the beacon and update the privacy note.
3. Verify no cookies are set.
4. Verify no personal data is collected.
5. Ensure analytics never block rendering.

**Acceptance criteria**

- [ ] Analytics are off or cookie-less and disclosed.
- [ ] No consent banner is required.
- [ ] No tracking cookies are set.
- [ ] The privacy note matches behavior.

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

1. Add lint, type-check, unit tests, E2E tests, accessibility tests, build, link checking, bundle-size, and Lighthouse checks to CI.
2. Cache dependencies and Playwright browsers.
3. Upload test artifacts and screenshots on failure.
4. Require the CI checks before merging to main.
5. Document how to run the suite locally.

**Acceptance criteria**

- [ ] A clean pull request runs all checks.
- [ ] A deliberately broken engine test fails CI.
- [ ] A deliberately broken accessibility check fails CI.
- [ ] A bundle-budget regression fails CI.
- [ ] Artifacts are available for failed runs.

### Step 8.2 — Production deployment

**Goal:** A stable production release on Cloudflare.

**Tasks**

1. Confirm the production `site` URL and canonical URLs.
2. Run the full build from a clean checkout.
3. Deploy with Wrangler.
4. Run the post-deploy smoke script.
5. Verify both stories, 404, sitemap, robots, RSS, OG images, and headers.
6. Tag the release in Git.

**Acceptance criteria**

- [ ] Production returns 200 for `/`, `/stories`, both stories, `/about`, and `/colophon`.
- [ ] The custom 404 works.
- [ ] Sitemap, robots, RSS, and OG images are reachable.
- [ ] Security and cache headers are correct.
- [ ] Both stories work on desktop and mobile.
- [ ] No paid Cloudflare service is used.

### Step 8.3 — Custom domain and DNS

**Goal:** A branded, secure URL.

**Tasks**

1. Attach the custom domain to the Cloudflare project.
2. Configure DNS.
3. Verify HTTPS and redirects from the workers.dev URL if desired.
4. Update the canonical site URL and sitemap.
5. Redeploy and verify.

**Acceptance criteria**

- [ ] The custom domain serves the site over HTTPS.
- [ ] Canonical URLs use the custom domain.
- [ ] The old deployment URL redirects or is clearly non-canonical.
- [ ] No mixed-content warnings.

### Step 8.4 — Launch checklist

**Goal:** Nothing important is forgotten.

**Tasks**

1. Re-read `docs/requirements.md` and confirm all MUST requirements pass.
2. Confirm both stories meet the definition of done in `docs/stories.md`.
3. Confirm the README, docs, and colophon match reality.
4. Confirm the privacy note and analytics behavior.
5. Confirm the license and credits.
6. Confirm the development smoke page is removed or `noindex` and absent from the sitemap.
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

1. Monitor Cloudflare analytics and error reports.
2. Check Core Web Vitals in the field when data is available.
3. Triage user feedback.
4. Add regression tests for any reported defect.
5. Review dependency updates on a regular cadence.
6. Keep the backlog of future stories prioritized.

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
    "build": "astro check && astro build",
    "preview": "astro preview",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:a11y": "playwright test tests/e2e/a11y.spec.ts",
    "test:visual": "playwright test tests/e2e/visual.spec.ts",
    "check:links": "node scripts/check-links.mjs",
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
  site: 'https://example.com',
  output: 'static',
  integrations: [svelte(), mdx(), sitemap()],
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
      - uses: actions/setup-node@<current-major>
        with:
          node-version: lts/*
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - run: pnpm check:links
      - run: pnpm check:bundle
      - run: pnpm test:e2e
      - run: pnpm test:a11y
      - run: pnpm exec lhci autorun

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
| WebGL fallback | — | Yes | — | — |
| Deployment | — | Smoke | — | Manual |

### Appendix E — Definition of done for a story

A story is done only when:

- [ ] All chapters from `docs/stories.md` exist.
- [ ] The engine has unit-tested invariants.
- [ ] The renderer has all required layers.
- [ ] Parameters, presets, seed, reset, and share work.
- [ ] The lab is complete.
- [ ] Article mode and reduced motion are complete.
- [ ] The no-JavaScript reading path works.
- [ ] Accessibility checks pass.
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
