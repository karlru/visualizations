# Requirements

See the [README](../README.md) for the project overview and the other documentation files.

This document defines what the application must do. Requirements are written so that they can be verified against the finished site. Each requirement has an identifier, a priority, and a verification method.

- **MUST** — required for the first public release.
- **SHOULD** — expected for the first public release unless it conflicts with a MUST; may be deferred with a documented reason.
- **COULD** — nice to have; not a release blocker.
- **Verification** — the primary way the requirement is checked: unit test, end-to-end test, accessibility audit, Lighthouse, bundle check, deployment check, or manual review.

## 1. Scope

### 1.1 In scope

The first public release contains:

- A static marketing and index surface: home page, stories index, about page, colophon, and 404 page.
- A reusable scroll-driven story runtime.
- One 2D story: **Ant Colony Optimization** on the traveling salesman problem.
- One 3D story: **LCG / RANDU**, including an interactive 3D point cloud, plane visualization, guided animation, and parameter lab.
- Full prose, math, pseudocode, metrics, citations, article mode, reduced-motion mode, and responsive layouts.
- Static deployment to Cloudflare's free plan with no server-side runtime.

### 1.2 Out of scope for the first release

- User accounts, authentication, profiles, comments, or user-submitted content.
- A database, CMS, API, server-side rendering, or edge functions.
- Payments, subscriptions, newsletters, or advertising.
- Internationalization and localized content.
- Offline/PWA support, push notifications, or background sync.
- A site-wide search feature.
- Monte Carlo and other stories beyond ACO and RANDU.
- Exact 3D spectral testing for arbitrary LCG parameters. The first release visualizes RANDU's known plane family and lets users explore other presets; general lattice-basis reduction is future work.
- Multiplayer, collaboration, or real-time shared sessions.
- Native mobile applications.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| **Story** | A single long-form interactive essay about one algorithm or computational idea. |
| **Chapter** | A narrative section of a story that owns a scroll range and a scene state. |
| **Stage** | The persistent visual area that hosts the simulation and camera. |
| **Scene** | A named configuration of layers, parameters, camera, and animation for a chapter. |
| **Engine** | A pure TypeScript simulation with no DOM dependencies. |
| **Lab** | The free-play sandbox at the end of a story. |
| **Article mode** | A mode that hides the stage and presents the story as a conventional illustrated article. |
| **Guided tour** | An automatic camera and reveal animation that can be paused, replayed, and interrupted by the user. |
| **Preset** | A named set of parameters. |
| **Seed** | The deterministic starting state of a simulation. |
| **Quality tier** | A performance profile that adjusts particle counts, device pixel ratio, and effects. |
| **DPR** | Device pixel ratio; the ratio of physical pixels to CSS pixels. |
| **LCP** | Largest Contentful Paint; when the largest visible content element finishes rendering. |
| **CLS** | Cumulative Layout Shift; a measure of unexpected layout movement. |
| **INP** | Interaction to Next Paint; a measure of interaction responsiveness. |
| **CSP** | Content Security Policy; a browser security header. |
| **WCAG** | Web Content Accessibility Guidelines. |
| **ACO** | Ant Colony Optimization. |
| **LCG** | Linear congruential generator. |
| **PRNG** | Pseudorandom number generator. |
| **RNG** | Random number generator. |
| **Structural parameter** | A parameter that changes the simulation rule or the city/generator set; applying it restarts the run at iteration 0. |
| **Presentation parameter** | A parameter that changes only how the run is presented, such as speed, quality tier, layer visibility, or camera. |
| **Initial JS** | Entry chunk plus shared chunks plus eagerly loaded chunks before first interaction. |
| **Route-total JS** | All JavaScript loaded on a route, including lazy chunks such as Three.js. |
| **Reference desktop** | MacBook Air M1 (2020), 8 GB, current Chrome, 1440×900, AC power, no CPU throttling. |
| **Reference mobile** | iPhone 13 current iOS Safari at 390×844; Pixel 6a current Android Chrome at 412×915. |
| **Generator** | An abstraction over LCG, PCG32, and xoshiro128** with a common reset/next API. |

### 1.4 Measurement definitions

| Environment | Definition |
|---|---|
| Reference desktop | MacBook Air M1 (2020), 8 GB, current Chrome, 1440×900, AC power, no CPU throttling |
| Reference mobile | iPhone 13, current iOS Safari, 390×844; Pixel 6a, current Android Chrome, 412×915 |
| CI proxy | Playwright Chromium, 1440×900 and 390×844, 4× CPU throttle for the mobile profile |
| Lighthouse | Desktop preset and mobile preset, both configured in `lighthouserc.json` |

- Bundle sizes are measured with **gzip level 9**. Initial JS is entry + shared + eagerly loaded chunks before first interaction. Route-total JS includes lazy chunks such as Three.js.
- Frame-rate targets are **p95 frame time** over a 10-second fixed workload, not an average. 55 fps ≈ 18.2 ms; 45 fps ≈ 22.2 ms.
- INP is measured in Playwright with `web-vitals` and scripted interactions. Lighthouse lab runs cover LCP, CLS, and TBT, not INP.
- Visual regression runs in CI with artifact upload and frozen time, scroll, fonts, and Lenis.
- Lighthouse runs both the desktop and mobile presets for story pages.

## 2. Functional requirements

### 2.1 Site shell and navigation

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-SITE-01 | The site MUST serve a home page at `/`. | MUST | Deployment smoke test; page returns 200 with expected title. |
| FR-SITE-02 | The site MUST serve a story index at `/stories` without a redirect. | MUST | Deployment smoke test; page lists both initial stories. |
| FR-SITE-03 | The site MUST serve `/stories/ant-colony-optimization` and `/stories/randu-lcg` without a redirect. | MUST | Deployment smoke test; both return 200. |
| FR-SITE-04 | The site MUST serve `/about` and `/colophon`. | MUST | Deployment smoke test; both return 200. |
| FR-SITE-05 | Unknown routes MUST render a custom 404 page with a link back to the home page and story index. | MUST | Request a nonexistent route; 404 status and custom content. |
| FR-SITE-06 | The header MUST link to Home, Stories, and About. | MUST | E2E navigation test; all links work. |
| FR-SITE-07 | The footer MUST link to the source repository, the colophon, and the story index. | MUST | E2E link check. |
| FR-SITE-08 | All internal links MUST resolve without a 404, redirect chain, or unintended trailing-slash redirect. | MUST | Automated link checker in CI. |
| FR-SITE-09 | Every page MUST have a unique `<title>` and meta description. | MUST | Automated metadata test. |
| FR-SITE-10 | Navigation between pages SHOULD use progressive view transitions where supported, with a normal page load fallback. | SHOULD | Manual review in supported and unsupported browsers. |
| FR-SITE-11 | The home page MUST present the two initial stories with a title, one-sentence description, category, and link. | MUST | E2E content assertion. |
| FR-SITE-12 | The story index MUST distinguish the two initial stories from future/backlog entries. | MUST | Visual and DOM inspection. |

### 2.2 Story runtime

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-STORY-01 | Each story MUST use exactly one persistent stage when the interactive stage is active. | MUST | Manual inspection; E2E asserts one stage element. |
| FR-STORY-02 | Every chapter MUST have a stable, human-readable ID and a canonical deep-linkable `#chapter-id` fragment. | MUST | Navigating to `#chapter-id` scrolls to the chapter and activates its scene. |
| FR-STORY-03 | Scroll progress MUST determine the active chapter and update the stage without a page reload. | MUST | E2E scroll test; active chapter changes; scenes render. |
| FR-STORY-04 | The story MUST provide a visible progress rail showing chapter names and the current position. | MUST | E2E visibility and state assertion. |
| FR-STORY-05 | The reader MUST be able to pause and resume the simulation, guided tour, and automatic camera motion at any time. | MUST | E2E click pause; frame/time counters and tour/camera motion stop; resume works. |
| FR-STORY-06 | The reader MUST be able to replay the current chapter from its beginning. | MUST | E2E replay test; scene resets to the chapter start. |
| FR-STORY-07 | The story MUST provide a speed control with at least `0.5×`, `1×`, `2×`, and `4×`. | MUST | E2E parameter assertion; simulation advances at the selected relative rate. |
| FR-STORY-08 | The story MUST pause simulation and animation when the stage is outside the viewport or the tab is hidden. | MUST | E2E hides the page or scrolls away; test hook reports paused. |
| FR-STORY-09 | Article mode MUST hide the stage and present every chapter, figure, formula, and citation as a readable article. | MUST | E2E toggle; all prose remains visible; no stage. |
| FR-STORY-10 | Under `prefers-reduced-motion: reduce`, the story MUST NOT autoplay or scrub animation; it MUST offer step-by-step controls and static or discrete states. An override may only reduce motion further, never enable it. | MUST | Playwright emulates reduced motion; no autoplay; controls present. |
| FR-STORY-11 | The story MUST preserve native scrolling; it MUST NOT hijack, block, or invert scroll direction. | MUST | Manual and E2E: scrollbar visible, keyboard PageDown/Arrow keys work, browser back/forward work. |
| FR-STORY-12 | Scene transitions MUST settle into a coherent state when the reader scrolls quickly or in reverse. | MUST | Manual fast-scroll pass; no blank, frozen, or contradictory state. |
| FR-STORY-13 | The stage MUST resize correctly on viewport changes and use the device pixel ratio without blurring. | MUST | Resize test at multiple viewport sizes; canvas size matches CSS size × DPR. |
| FR-STORY-14 | The story MUST provide a keyboard-operable play/pause control and chapter navigation. | MUST | Keyboard-only E2E pass. |
| FR-STORY-15 | The story MUST expose a share action that copies a URL restoring the current chapter, seed, and structural parameters as the run's starting state. Custom ACO map edits are excluded and the UI MUST say so. | MUST | E2E share test; copied URL reloads the same starting state; map-edit notice appears. |
| FR-STORY-16 | The story MUST restore state from URL parameters on load and clamp or reject invalid values according to §2.6.1, without crashing. | MUST | Unit and E2E tests with valid and invalid parameters. |
| FR-STORY-17 | The story MUST emit no uncaught errors or unhandled promise rejections during normal use. | MUST | Playwright console and page-error listeners. |
| FR-STORY-18 | The story prose, formulas, citations, and static figures MUST be present in the pre-rendered HTML and remain readable with JavaScript disabled. With no JavaScript, the article layout is the only layout; no empty stage placeholder is shown. | MUST | Disable JavaScript; all chapter text, formulas, citations, and figures are visible; no empty stage. |
| FR-STORY-19 | The story MUST dispose simulation, renderer, scroll triggers, tour tweens, and event listeners when navigating away. | MUST | Navigation stress test; no duplicate canvases, RAF loops, tour tweens, or ScrollTriggers. |
| FR-STORY-20 | The story SHOULD remember reader preferences (article mode, reduced-motion override, quality tier) across visits, using `localStorage` when available. | SHOULD | Reload test with `localStorage` available. |

### 2.3 Ant Colony Optimization story

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-ACO-01 | The ACO story MUST model the traveling salesman problem on a 2D Euclidean city set. | MUST | Unit test: distances and tour lengths are correct. |
| FR-ACO-02 | The story MUST implement the Ant System: probabilistic edge choice, pheromone deposit, and evaporation. | MUST | Unit tests for transition probabilities, deposit, and update. |
| FR-ACO-03 | The story MUST expose at least these parameters: city count, ant count, `α`, `β`, `ρ`, speed, and seed. `Q` is fixed at `1` in release 1. | MUST | E2E control presence and state changes. |
| FR-ACO-04 | Structural parameter changes MUST apply to the running simulation without a page reload and MUST restart the run at iteration 0 with the same seed. Presentation changes apply immediately without a reset. | MUST | E2E changes each parameter; the visualization or metrics update; a reset notice appears for structural changes. |
| FR-ACO-05 | The stage MUST visualize cities, all-pairs candidate edges, pheromone intensity, ants, and the best tour. | MUST | Visual inspection; layer toggles. |
| FR-ACO-06 | The stage MUST show a probability fan or equivalent explanation for the focal ant's next-city choice. The fan MUST show the top N candidates (default N = 8) plus an explicit "other (Σ)" bucket, with labeled probabilities summing to 1. | MUST | Visual inspection; DOM assertion that labels sum to 1 within tolerance; textual ranked alternative. |
| FR-ACO-07 | The story MUST display at least: best tour length, mean tour length, iteration number, and a normalized diversity/entropy metric defined in `docs/stories.md` §2.6. | MUST | DOM assertions after simulation steps; unit test for the entropy formula. |
| FR-ACO-08 | The story MUST provide presets for balanced, greedy, stagnant, and forgetful behavior. | MUST | E2E preset application; parameter values change. |
| FR-ACO-09 | The reader MUST be able to drag cities, add cities, remove cities, and reset the map. A city edit pauses the run, rebuilds distances, restarts at iteration 0, invalidates best/mean history, and is not included in shares. | MUST | Pointer E2E test; distances and rendering update; reset notice appears. |
| FR-ACO-10 | The best tour MUST be visually distinct through color, weight, and pattern, and its length MUST be shown numerically. | MUST | Visual inspection; grayscale review; DOM metric. |
| FR-ACO-11 | A convergence chart MUST plot best and mean tour length over iterations. | MUST | Chart renders; values update. |
| FR-ACO-12 | The pseudocode panel MUST highlight the active line as the story introduces each rule. | MUST | Scene change updates the highlighted line. |
| FR-ACO-13 | The story MUST include the transition, deposit, and evaporation formulas rendered at build time. | MUST | DOM contains rendered math. |
| FR-ACO-14 | The story MUST include at least these chapters: hook, problem definition, one ant, probability rule, pheromone deposit, evaporation, emergence, parameters, limits, and lab. | MUST | DOM chapter assertions. |
| FR-ACO-15 | The story MUST end with a free-play lab containing all controls, presets, seed, reset, and share. | MUST | E2E lab test. |
| FR-ACO-16 | The ACO engine MUST be deterministic for a given run identity: seed, structural parameter set, city set, and start iteration. | MUST | Unit test: two runs with the same run identity produce identical tours and metrics. |
| FR-ACO-17 | The story SHOULD support a side-by-side comparison of two parameter sets on the same city map. | SHOULD | Visual and E2E test. |
| FR-ACO-18 | The ACO story MUST remain usable at a 360 px viewport width. | MUST | Mobile E2E; no horizontal overflow; controls reachable. |
| FR-ACO-19 | The ACO story MUST handle edge cases without crashing: 1 ant, 2 cities, `α = 0`, `β = 0`, `ρ = 1`, and all cities collinear. | MUST | Unit and E2E edge-case tests. |
| FR-ACO-20 | The ACO story MUST provide a text summary of the current best tour and metrics for screen readers. | MUST | Accessible-name and live-region assertions. |
| FR-ACO-21 | The ACO story MUST provide keyboard-operable camera framing controls (overview, focus city, best tour, convergence) and zoom buttons, so camera control does not require pointer dragging. | MUST | Keyboard-only E2E; preset buttons change the framing. |
| FR-ACO-22 | The engine MUST bound worst-case work at 150 cities × 200 ants by capping simulated iterations per frame and degrading quality rather than blocking the main thread. | MUST | Frame-time harness at worst-case parameters; no long task over 200 ms. |

### 2.4 LCG / RANDU story

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-RANDU-01 | The story MUST implement an exact generator abstraction supporting LCG presets with configurable multiplier, increment, modulus, and seed, plus PCG32 and xoshiro128**. | MUST | Unit tests against known sequences and a BigInt reference. |
| FR-RANDU-02 | The story MUST provide a RANDU preset with `a = 65539`, `c = 0`, `m = 2^31`, and odd seed. | MUST | E2E preset assertion; engine values. |
| FR-RANDU-03 | The story MUST render a 3D scatter plot of consecutive triples normalized to `[0, 1)`. The point-count control counts rendered triples; fewer than 3 triples shows an explanatory empty state. | MUST | Visual inspection; 3D canvas present; point count matches rendered triples. |
| FR-RANDU-04 | The story MUST render the 15 parallel planes for RANDU and allow them to be toggled. | MUST | Unit test for plane indices; visual inspection; toggle test. |
| FR-RANDU-05 | The reader MUST be able to orbit and zoom the 3D view with mouse, touch, and keyboard-accessible camera presets. | MUST | Manual and E2E interaction tests. |
| FR-RANDU-06 | The story MUST provide an automatic guided tour spanning chapters 6–9 that reveals points, planes, an edge-on view, and a comparison cloud. Entering a chapter seeks to its act; replay restarts the current act. | MUST | E2E: tour starts on chapter entry; pause and replay work. |
| FR-RANDU-07 | The guided tour MUST pause when the reader grabs the camera and offer a resume action. | MUST | Pointer interaction test; "Resume tour" appears and works. |
| FR-RANDU-08 | The story MUST provide camera presets: 3/4, top, front, edge-on, and plane-normal. Edge-on is perpendicular to the plane normal; plane-normal looks along `(9, −6, 1)`. | MUST | E2E camera preset buttons change the view; pose assertions. |
| FR-RANDU-09 | The story MUST expose presets for RANDU, MINSTD, ANSI C, Numerical Recipes, PCG32, and `xoshiro128**`. `a/c/m` controls appear only for LCG presets. | MUST | Preset selector lists all; selecting applies parameters and the correct generator panel. |
| FR-RANDU-10 | The reader MUST be able to change `a`, `c`, `m`, seed, and point count in an advanced panel where the active generator supports them. | MUST | E2E control test; point cloud regenerates; PCG32/xoshiro hide `a/c/m`. |
| FR-RANDU-11 | The story MUST compare RANDU against a good seeded PRNG with the same point count. | MUST | Toggle/crossfade test; comparison cloud renders. |
| FR-RANDU-12 | The story MUST display at least: distinct plane count, maximum plane gap, sample triples, and low-bit behavior. The displayed metrics are computed from the data; the UI MUST NOT hardcode 15 occupied planes. | MUST | DOM assertions; values match unit tests at fixed seed and run length. |
| FR-RANDU-13 | The story MUST demonstrate that every RANDU output with an odd seed is odd. With an even seed it MUST warn that the period is shortened and that the all-odd claim does not apply. | MUST | Unit test; visible bit-plane strip or histogram. |
| FR-RANDU-14 | The story MUST provide a 2D pairs view showing the lattice structure before the 3D reveal. | MUST | Chapter renders 2D view; visual inspection. |
| FR-RANDU-15 | The story MUST include at least these chapters: hook, LCG mechanics, parameter choice, low-bit failure, 2D pairs, 3D triples, 15 planes, derivation, comparison with a good PRNG, and lab. | MUST | DOM chapter assertions. |
| FR-RANDU-16 | The story MUST end with a lab containing presets, advanced parameters, toggles, camera presets, seed, reset, and share. | MUST | E2E lab test. |
| FR-RANDU-17 | The LCG engine MUST use the exact fast path only when `a × (m − 1) + c ≤ 2^53`, and MUST use exact integer arithmetic (for example `Math.imul`, split multiplication, or BigInt) for other moduli and presets where the fast path is unsafe. | MUST | Unit tests with BigInt reference, including ANSI C. |
| FR-RANDU-18 | The story MUST detect WebGL2 and provide a non-WebGL2 fallback: a 2D projection, a textual summary, and a sample data table. | MUST | Disable WebGL2 or simulate context loss; fallback content visible. |
| FR-RANDU-19 | The RANDU story MUST remain usable at a 360 px viewport width and on touch devices. | MUST | Mobile E2E; orbit and controls work. |
| FR-RANDU-20 | The story MUST handle invalid input without crashing: even seed (accepted with a warning), `m < 2`, `a < 1`, and fewer than 3 triples. | MUST | Unit and E2E validation tests. |
| FR-RANDU-21 | The story SHOULD highlight the plane equation when the camera reaches the edge-on view. | SHOULD | Visual inspection; annotation appears. |

### 2.5 Content and education

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-CONTENT-01 | Every story MUST have a title, dek, learning objectives, difficulty label, and a list of prerequisites or assumed knowledge. | MUST | Frontmatter schema and DOM assertions. |
| FR-CONTENT-02 | Every story MUST include at least one "predict, then reveal" interaction. | MUST | E2E interaction exists and reveals an explanation. |
| FR-CONTENT-03 | Every story MUST include a limitations or failure-modes section. | MUST | DOM content assertion. |
| FR-CONTENT-04 | Every story MUST include real-world applications. | MUST | DOM content assertion. |
| FR-CONTENT-05 | Every story MUST include a further-reading section with at least three citations. Citations MUST use stable URLs or DOIs where available; external link checking is part of the citation review. | MUST | DOM content assertion; link resolution check and manual citation review. |
| FR-CONTENT-06 | Mathematical notation MUST be rendered at build time and MUST remain readable in article mode. | MUST | DOM contains rendered math in both modes. |
| FR-CONTENT-07 | Pseudocode MUST be syntax-highlighted at build time and MUST remain readable in article mode. | MUST | DOM contains highlighted code. |
| FR-CONTENT-08 | Every story MUST include a glossary or inline definitions for its key terms. | MUST | DOM content assertion. |
| FR-CONTENT-09 | Every chapter MUST be readable as prose without the visualization. | MUST | Article mode review; no missing references. |
| FR-CONTENT-10 | Story metadata MUST be typed and validated at build time; a missing required field MUST fail the build. | MUST | Introduce a missing field in a test fixture; build fails. |
| FR-CONTENT-11 | Every chapter ID in MDX MUST have a matching scene, and every scene MUST reference an existing chapter. | MUST | Bidirectional build-time test; a renamed or typo'd chapter ID fails the build. |
| FR-CONTENT-12 | The article/no-JavaScript path MUST include static figures for the best-tour and RANDU 2D projections. | MUST | Build output contains the figures; no-JS E2E asserts they are visible. |

### 2.6 State, sharing, and persistence

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-STATE-01 | Story parameters, seed, and chapter MUST be encodable in the URL. The chapter is the `#chapter-id` fragment; parameters and seed are query fields. | MUST | Unit test for serialize/parse round trip, including the fragment. |
| FR-STATE-02 | Reloading a shared URL MUST restore the same starting state (chapter, seed, structural parameters); it does not promise to restore a mid-run frame or custom map edits. | MUST | E2E reload test from a shared URL; engine state at iteration 0 matches. |
| FR-STATE-03 | Invalid or out-of-range URL values MUST follow §2.6.1: clamp numeric values with a notice, reject unknown enums, and never crash or silently apply nonsense. | MUST | Unit and E2E invalid-parameter tests, one case per table row. |
| FR-STATE-04 | The share action MUST copy a canonical absolute URL containing the query string and the current chapter fragment. | MUST | Clipboard assertion. |
| FR-STATE-05 | Reader preferences MAY be stored in `localStorage`; simulation state MUST NOT depend on it. This is the same preference feature as FR-STORY-20 and shares its SHOULD priority. | SHOULD | Manual test; clearing storage resets preferences only. |
| FR-STATE-06 | URL updates MUST use `replaceState` or equivalent so that parameter and chapter changes do not flood browser history. | MUST | History length check after repeated slider and chapter changes. |

#### 2.6.1 Reproducibility, URL, and validation contract

A run is identified by `(story, seed, structural parameters, city set or generator state, start iteration)`. The binding rules are:

- A **structural** parameter change restarts the run at iteration 0 with the same seed. A **presentation** change does not.
- Chapter entry resets deterministically. Scrolling interpolates camera, opacity, and reveal only; it never morphs engine parameters.
- The URL encodes the run's **starting state**, not the current frame. Sharing from mid-run restarts at iteration 0.
- ACO city edits pause the run, rebuild distances, restart at iteration 0, invalidate best/mean history, and are not included in share URLs.
- An ACO add or remove updates the structural `cities` field to the edited count. A share link therefore restores a **seeded** map with that count, never the edited coordinates; the UI states this beside the map editor and share action. A city-count change or map reset regenerates the seeded map.
- Deep-link entry, forward-scroll entry, reverse-scroll entry, and reload MUST converge on the same state at chapter entry.
- The same elapsed simulation time at 30, 60, and 120 fps MUST produce the same engine state within tolerance.

**URL schema**

| Part | Encoding |
|---|---|
| Story | Path: `/stories/<slug>` |
| Chapter | Fragment: `#<chapter-id>` (canonical) |
| Parameters | Query string |

| Story | Field | Type | Default | Range / notes |
|---|---|---|---|---|
| ACO | `seed` | integer | `42` | |
| ACO | `cities` | integer | `30` | 2–150 |
| ACO | `ants` | integer | `40` | 1–200 |
| ACO | `alpha` | number | `1` | 0–5 |
| ACO | `beta` | number | `2` | 0–10 |
| ACO | `rho` | number | `0.5` | 0–1 |
| ACO | `speed` | enum | `1` | `0.5`, `1`, `2`, `4` |
| RANDU | `generator` | enum | `randu` | `randu`, `minstd`, `ansi-c`, `numerical-recipes`, `pcg32`, `xoshiro128**` |
| RANDU | `seed` | integer | `1` | Even seeds allowed with a warning |
| RANDU | `points` | integer | `50000` | Rendered triples; 0–100,000 |
| RANDU | `a`, `c`, `m` | integer | preset | LCG only; omitted for PCG32/xoshiro |

Visual toggles are presentation state and are not required in the URL. While scrolling, the story updates the fragment with `history.replaceState`; this adds no history entry and does not scroll. On load, parameters are validated, layout is measured, then a valid fragment is resolved with `scrollTo` after the pin offset is known.

**Validation rules**

| Situation | Behaviour |
|---|---|
| Numeric value outside range | Clamp to the nearest valid value; show an inline "adjusted to X" notice; do not crash. |
| Unknown enum or preset | Fall back to the default; show a notice. |
| Invalid typed input in an advanced field | Show an inline error; keep the last valid value; do not commit. |
| Structurally invalid combination | Clamp to the nearest valid combination and show a notice. |
| RANDU even seed | Accept; warn that the period is shortened and the all-odd claim does not apply. Do not rewrite the seed. |
| Fewer than 3 RANDU triples | Show an explanatory empty state; do not render a point cloud. |
| `m < 2`, `a < 1`, `c < 0` | Validation error or clamp with a notice; never crash. |

ACO supports 2–150 cities and 1–200 ants in the UI; the engine supports 1 city for edge-case tests. RANDU point count counts rendered triples and generates `triples + 2` outputs. RANDU advanced fields are numeric inputs, not sliders. `Q` is fixed at 1 in release 1.

### 2.7 Accessibility

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-A11Y-01 | The site MUST meet WCAG 2.2 Level AA. | MUST | axe automated scan plus manual checklist covering non-text contrast, focus-not-obscured, target size, and 200% zoom. |
| FR-A11Y-02 | All interactive controls MUST be reachable and operable by keyboard, including camera framing and zoom in both stories. | MUST | Keyboard-only E2E pass; camera preset buttons and zoom controls work. |
| FR-A11Y-03 | Focus MUST be visible, MUST not be obscured by a pinned stage or sticky chrome, and MUST not be trapped. | MUST | Manual keyboard pass at 200% zoom; focus-ring contrast check. |
| FR-A11Y-04 | Every canvas or 3D stage MUST have a text alternative describing its current content and state, updated at a low frequency such as chapter change, pause, or a 2-second milestone. | MUST | DOM assertion; screen-reader pass; no per-frame announcements. |
| FR-A11Y-05 | The story MUST respect `prefers-reduced-motion` and MUST provide an explicit motion toggle. The toggle may only reduce motion further; it MUST NOT enable motion that the OS preference disabled. | MUST | Emulation test; toggle test. |
| FR-A11Y-06 | Any automatically moving content that lasts more than five seconds MUST be pausable. | MUST | Pause test. |
| FR-A11Y-07 | Text and essential UI MUST meet a 4.5:1 contrast ratio; large text MUST meet 3:1. The token set in `docs/technology.md` §3.21 MUST pass a Phase 0 contrast test on both paper and stage. | MUST | Automated contrast scan, Phase 0 token test, and manual sampling. |
| FR-A11Y-08 | Information MUST NOT be conveyed by color alone; shapes, labels, patterns, line weights, or a data table MUST also encode meaning. | MUST | Manual review with grayscale simulation; DOM/table assertions. |
| FR-A11Y-09 | The layout MUST remain usable at 200% zoom and at 320 px CSS width without loss of content or function, including when the stage is pinned. | MUST | Browser zoom and viewport tests; pinned-stage overlap check. |
| FR-A11Y-10 | Touch targets MUST be at least 44 × 44 CSS pixels; this is an internal standard stricter than WCAG 2.2 AA. | MUST | Automated bounding-box check. |
| FR-A11Y-11 | Live metrics MUST update politely (`aria-live="polite"`) and MUST NOT announce every frame; updates occur at chapter change, pause, or a low-frequency milestone. | MUST | DOM and screen-reader check. |
| FR-A11Y-12 | Decorative canvas content MUST be hidden from assistive technology, while meaningful summaries remain available. | MUST | Accessibility tree inspection. |

### 2.8 Performance

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-PERF-01 | The initial JavaScript for a 2D story page MUST NOT exceed 200 KB gzip level 9. Initial means entry, shared, and eagerly loaded chunks before first interaction. | MUST | Bundle-size check in CI; reports initial and route-total. |
| FR-PERF-02 | The initial JavaScript for the 3D story page MUST NOT exceed 450 KB gzip level 9, excluding the lazy Three.js chunk. The Three.js chunk MUST NOT exceed 300 KB gzip, and route-total JavaScript on the 3D story MUST NOT exceed 700 KB gzip. | MUST | Bundle-size check in CI; reports initial and route-total. |
| FR-PERF-03 | Three.js MUST be loaded only on pages that use 3D and MUST NOT appear in the ACO or shared bundles. | MUST | Build output analysis; ACO chunk scan for Three. |
| FR-PERF-04 | Story pages MUST reach Lighthouse Performance ≥ 90 on desktop and ≥ 80 on mobile, using both Lighthouse presets. | MUST | Lighthouse CI with desktop and mobile configurations. |
| FR-PERF-05 | Story pages MUST reach LCP ≤ 2.5 s and CLS ≤ 0.1 in Lighthouse, and INP ≤ 200 ms in a Playwright `web-vitals` harness with scripted interactions. Lighthouse does not report INP. | MUST | Lighthouse CI for LCP/CLS/TBT; Playwright web-vitals for INP. |
| FR-PERF-06 | Animation MUST meet at least 55 fps (p95 frame time ≤ 18.2 ms) on the reference desktop and at least 45 fps (p95 ≤ 22.2 ms) on the reference mobile device, over a fixed 10-second workload. | MUST | Frame-time harness with fixed workload and p95 reporting. |
| FR-PERF-07 | The site MUST avoid long tasks over 200 ms during the defined normal-scroll and interaction workload. | MUST | PerformanceObserver long-task trace. |
| FR-PERF-08 | The renderer MUST cap device pixel ratio and expose a quality-tier setting. | MUST | Canvas backing-store check; settings UI. |
| FR-PERF-09 | The site MUST pause rendering when the stage is offscreen or the tab is hidden. | MUST | E2E test hook. |
| FR-PERF-10 | Navigating between stories MUST release GPU and simulation resources; no more than one active WebGL context may remain. | MUST | Context count test and manual stress test. |
| FR-PERF-11 | RANDU bulk generation on the BigInt path MUST run off the main thread or in chunks with a busy state; 100,000-triple generation MUST NOT block the UI for more than 200 ms per task. | MUST | Long-task trace at 100,000 triples with a non-power-of-two modulus. |
| FR-PERF-12 | When the worst-case workload exceeds the frame budget, the engine MUST reduce simulated iterations per frame and expose a visible quality notice rather than freeze. | MUST | Frame-time harness at 150 cities × 200 ants. |

### 2.9 SEO and metadata

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-SEO-01 | Every page MUST be pre-rendered as static HTML. | MUST | Build output contains HTML for every route. |
| FR-SEO-02 | Every page MUST have a canonical URL. | MUST | DOM assertion. |
| FR-SEO-03 | The site MUST generate `sitemap-index.xml` (and its numbered sitemap files) and `robots.txt`. | MUST | Build output and HTTP checks; robots points to `/sitemap-index.xml`. |
| FR-SEO-04 | Every page MUST have Open Graph and social-card metadata. | MUST | DOM assertion. |
| FR-SEO-05 | Every story MUST generate a static Open Graph image. | MUST | Build output; image request returns 200. |
| FR-SEO-06 | Story pages MUST include valid JSON-LD describing an `Article` with headline, description, datePublished, author, image, and publisher. | MUST | JSON-LD parse and schema validation. |
| FR-SEO-07 | Heading levels MUST be hierarchical and each page MUST have exactly one `<h1>`. This MUST be checked at build time as well as in the DOM test. | MUST | Build-time heading check and DOM assertion. |
| FR-SEO-08 | Story prose MUST be crawlable without executing JavaScript. | MUST | Fetch raw HTML and assert chapter text. |
| FR-SEO-09 | The site MUST generate an RSS feed containing both stories. | MUST | Build output and feed parse; both story URLs and titles present. |

### 2.10 Responsive behavior

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-RESP-01 | The site MUST work at 320, 360, 390, 768, 1024, 1440, and 1920 px viewport widths. | MUST | Playwright viewport matrix. |
| FR-RESP-02 | There MUST be no horizontal scrolling at any supported width. | MUST | Automated `scrollWidth <= clientWidth` check. |
| FR-RESP-03 | On mobile, the stage MUST remain usable without covering the controls or the prose entirely. | MUST | Manual and screenshot review. |
| FR-RESP-04 | Mobile scrolling MUST remain native; smooth-scroll libraries MUST be disabled or configured not to fight touch scrolling. | MUST | Manual touch test. |
| FR-RESP-05 | The 3D stage MUST support one-finger orbit and two-finger zoom without trapping vertical page scroll. On coarse pointers, vertical drag scrolls the page by default; an explicit Orbit mode may capture the gesture while active. Zoom buttons and camera presets MUST provide a single-pointer alternative to two-finger zoom. | MUST | Touch E2E or manual device test; WCAG 2.5.1 single-pointer review. |
| FR-RESP-06 | Tables, formulas, and pseudocode MUST remain readable at 320 px through wrapping or horizontal scrolling within their own container. | MUST | Visual review at 320 px. |

### 2.11 Hosting, security, and privacy

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-OPS-01 | The production build MUST be deployable to Cloudflare's free plan without any paid service. | MUST | Deploy to a free account; all routes work. |
| FR-OPS-02 | The site MUST NOT require a server, database, or API at runtime. | MUST | Static output inspection; network panel. |
| FR-OPS-03 | The site MUST be served over HTTPS with a valid certificate. | MUST | Deployment check. |
| FR-OPS-04 | Security headers MUST include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy`. | MUST | `curl -I` assertions. |
| FR-OPS-05 | Hashed build assets MUST be served with long-lived immutable caching. | MUST | Response header check. |
| FR-OPS-06 | The site MUST NOT set tracking cookies or collect personal data by default. | MUST | Network and cookie inspection. |
| FR-OPS-07 | If analytics are enabled, they MUST be cookie-less, privacy-friendly, and disclosed on the colophon or privacy page. | MUST | Network inspection and content review. |
| FR-OPS-08 | External links MUST use `rel="noopener noreferrer"` where appropriate. | MUST | DOM assertion. |
| FR-OPS-09 | The site SHOULD provide a Content Security Policy compatible with the built output. | SHOULD | Header check and console test. |

### 2.12 Quality and testing

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-QA-01 | Unit tests MUST cover simulation invariants, RNG determinism, URL state, and data validation. | MUST | Test suite and coverage report. |
| FR-QA-02 | End-to-end tests MUST cover both stories, chapter navigation, play/pause, replay, lab controls, sharing, and article mode. | MUST | Playwright suite. |
| FR-QA-03 | Accessibility tests MUST run in CI with axe and fail on serious or critical violations. | MUST | CI result. |
| FR-QA-04 | Visual regression screenshots MUST exist for both stories at fixed seeds and fixed scroll positions. | MUST | Playwright screenshot tests. |
| FR-QA-05 | The build or CI pipeline MUST fail on TypeScript errors, lint errors, missing content fields, or broken internal links. | MUST | CI result. |
| FR-QA-06 | The production build MUST be tested with JavaScript disabled for prose readability. | MUST | Playwright project with JavaScript disabled. |

## 3. Non-functional requirements

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| NFR-01 | A new contributor MUST be able to add a story by creating one content entry, one story config, and an optional renderer without modifying the story shell; each module MUST have a single clear responsibility. | MUST | Dry-run authoring test using the dev smoke story as the third example; code review checklist. |
| NFR-02 | Simulation code MUST be framework-agnostic and free of DOM, Svelte, or Three.js imports. | MUST | Import-boundary test or lint rule. |
| NFR-03 | Rendering code MUST be replaceable: Canvas 2D and Three.js MUST implement the same stage contract. | MUST | Type-level contract and code review. |
| NFR-04 | The site MUST remain functional if WebGL2 is unavailable; the RANDU story MUST fall back to 2D and text. | MUST | WebGL2-disabled test. |
| NFR-05 | The site MUST remain usable with JavaScript disabled for reading, even though interactivity is unavailable. The no-JS default is the article layout. | MUST | No-JS test. |
| NFR-06 | The site MUST support the current major versions of Chrome, Edge, Firefox, and Safari, plus current iOS Safari and Android Chrome. CI covers current Chromium, Firefox, and WebKit; current Safari, iOS Safari, and Android Chrome are manually checked on real devices. Previous major versions are best-effort, not a release gate. | MUST | Playwright three-engine matrix plus a documented manual device pass. |
| NFR-07 | The site MUST recover from a lost WebGL context with a visible message and a retry action. | MUST | Simulated context-loss test. |
| NFR-08 | Dependencies MUST be minimized and justified; no library may be added without a documented role. Named additions include `web-vitals` for the INP harness, `astro-og-canvas` for OG images, and `@astrojs/rss` for the feed. | MUST | Dependency review against `docs/technology.md`. |
| NFR-09 | All third-party assets and fonts MUST be self-hosted or served from the same origin, except explicitly optional analytics. | MUST | Network inspection. |
| NFR-10 | The production bundle MUST NOT include source maps or development-only code. | MUST | Build output inspection. |

## 4. Algorithm correctness requirements

These are the invariants that make the visualizations trustworthy. They are separate from the UI requirements.

### 4.1 ACO

| ID | Requirement | Verification |
|---|---|---|
| ACO-INV-01 | A constructed tour visits every city exactly once and returns to the starting city. | Unit test with property-based generation. |
| ACO-INV-02 | For every construction step, the transition probabilities over allowed cities are non-negative and sum to 1 within floating-point tolerance. | Unit test. |
| ACO-INV-03 | Pheromone values remain non-negative and finite for all valid parameter sets. A value of zero is allowed; the renderer maps zero to a minimum visible width. | Unit test. |
| ACO-INV-04 | Evaporation with `ρ = 1` removes all pheromone before deposit; the next iteration remains finite. | Unit test. |
| ACO-INV-05 | For a fixed run identity (seed, structural parameters, city set, start iteration), two runs produce identical tours and metrics. | Unit test. |
| ACO-INV-06 | The best tour length is non-increasing across iterations for a fixed city set since the last reset. | Unit test. |
| ACO-INV-07 | Coincident cities and all-zero transition weights do not produce `NaN` or `Infinity`; the engine falls back to a finite distance or a uniform choice. | Unit test. |
| ACO-INV-08 | The diversity/entropy metric is normalized to `[0, 1]`: uniform pheromone yields 1 and all pheromone on one edge yields 0. | Unit test with known distributions. |

### 4.2 LCG / RANDU

| ID | Requirement | Verification |
|---|---|---|
| RANDU-INV-01 | For `m = 2^31`, the implementation matches a BigInt reference implementation for at least 10,000 consecutive outputs. | Unit test. |
| RANDU-INV-02 | Every normalized value is in `[0, 1)`. | Unit test. |
| RANDU-INV-03 | For every consecutive triple of integer states, `9x − 6y + z` is an exact multiple of `2^31`. The check is performed on integers, not normalized floats. | Unit test. |
| RANDU-INV-04 | A run of 50,000 triples with seed `1` produces exactly 15 distinct plane indices, from −5 to 9. Separate tests assert that small runs can occupy fewer than 15 and that seed `2^30` produces one plane. | Unit test. |
| RANDU-INV-05 | With an odd seed, every RANDU output is odd. | Unit test. |
| RANDU-INV-06 | The comparison PRNG does not satisfy the RANDU plane relation. | Unit test. |
| RANDU-INV-07 | For an odd seed, the RANDU period is 2²⁹; the story does not claim a full period for the multiplicative generator. | Unit test and content review. |

## 5. Release acceptance criteria

The first public release is accepted only when all of the following are true:

- [ ] All MUST requirements in this document pass.
- [ ] Both initial stories are complete, including lab, article mode, and citations.
- [ ] The site is deployed to Cloudflare's free plan and all routes return the expected status.
- [ ] Lighthouse thresholds from FR-PERF-04 and FR-PERF-05 are met on both story pages.
- [ ] There are zero serious or critical axe violations.
- [ ] Keyboard-only and screen-reader smoke tests pass.
- [ ] Reduced-motion and no-JavaScript reading modes are verified.
- [ ] The 3D story works with WebGL2 disabled and recovers from context loss.
- [ ] The browser matrix from NFR-06 passes for the core reading and interaction paths: three-engine CI plus the documented manual device pass.
- [ ] Visual regression screenshots pass in CI for both stories at fixed seeds and scroll positions.
- [ ] The bundle budgets from FR-PERF-01 and FR-PERF-02 pass.
- [ ] No uncaught console errors occur during the E2E suite.
- [ ] The documentation matches the implemented behavior.
- [ ] There are no open P0 or P1 defects.

## 6. Verification map

| Area | Primary verification |
|---|---|
| ACO correctness | `tests/unit/aco.test.ts`, property tests |
| RANDU correctness | `tests/unit/randu.test.ts`, BigInt reference |
| URL state | `tests/unit/url-state.test.ts` |
| Story runtime | `tests/e2e/story-runtime.spec.ts` |
| ACO story | `tests/e2e/aco.spec.ts` |
| RANDU story | `tests/e2e/randu.spec.ts` |
| Accessibility | `tests/e2e/a11y.spec.ts`, axe, manual checklist |
| Performance | Lighthouse CI (desktop + mobile), bundle-size script, frame-time harness, Playwright `web-vitals` INP harness |
| Responsive | Playwright viewport matrix |
| Deployment | Post-deploy smoke script |
| Security headers | `curl -I` assertions in the smoke script |
| Visual regression | Playwright screenshots in CI with fixed seeds, frozen time, disabled Lenis, and font waiting |
| No-JS reading | Playwright project with JavaScript disabled |
| Citations | Stable URL/DOI review plus external link check |

### 6.1 Verification commands

After the implementation is complete, the requirement suite is exercised with:

```bash
pnpm lint
pnpm test
pnpm build
pnpm check:links
pnpm check:bundle
pnpm test:e2e
pnpm test:a11y
pnpm test:visual
pnpm exec lhci autorun
```

Manual checks cover screen-reader behavior, cross-browser interaction, touch gestures, reduced motion, and the real-device frame-rate target.

## 7. Deferred requirements

The following items are explicitly deferred from release 1:

| Requirement | Reason |
|---|---|
| FR-ACO-17 (side-by-side comparison) | SHOULD; useful but not required for the core argument. |
| FR-STORY-20 / FR-STATE-05 (preference persistence) | SHOULD; nice-to-have. |
| FR-SITE-10 (view transitions) | SHOULD; progressive enhancement. |
| FR-OPS-09 (CSP) | SHOULD; decide mechanism before launch if implemented. |
| FR-RANDU-21 (plane-equation highlight) | SHOULD; annotation polish. |

A deferred item that is implemented must still meet the same accessibility and test standards as a MUST.
