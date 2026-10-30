# Technology

See the [README](../README.md) for the project overview and the other documentation files.

This document explains the technology choices behind Algorithm Stories, why they are a good fit, how the pieces connect, and which alternatives were considered and rejected.

The document intentionally does **not** pin versions. Use the latest stable release of each tool when the project is initialized. The lockfile is the source of truth for reproducible builds. Version upgrades are deliberate, tested changes, not automatic floating updates.

## 1. Constraints that drive the decisions

1. **The site must be static.** There is no server, database, or runtime API.
2. **Hosting must be free on Cloudflare.** The build output must deploy to Cloudflare's free plan.
3. **The experience must be highly interactive.** Parameters must change live simulations.
4. **The experience must be scroll-driven.** A pinned stage, camera moves, and chapter transitions are core.
5. **The site must be fast on mid-tier mobile devices.** Canvas and 3D work must be budgeted.
6. **The content must remain readable without motion or JavaScript.** Accessibility and SEO are not optional.
7. **The design must be bespoke.** A generic component library or utility-first default look is not acceptable.
8. **The architecture must support future stories.** Adding a new algorithm should not require rewriting the story shell.

## 2. Decision summary

| Layer | Choice | Role |
|---|---|---|
| Site framework | **Astro** | Static site generation, content collections, MDX, islands, routing, build-time assets |
| Interactive UI | **Svelte** | Islands for the story shell, controls, metrics, and settings |
| Language | **TypeScript** | Simulation engines, renderers, UI contracts, tests |
| Content | **MDX + typed content collections** | Prose, chapters, figures, math, code, and story metadata |
| Scroll orchestration | **GSAP + ScrollTrigger** | Pinned scenes, scroll progress, timelines, camera cues |
| Smooth scrolling | **Lenis** | Smooth native scrolling that integrates with ScrollTrigger |
| 2D rendering | **Canvas 2D** | ACO graph, pheromone trails, ants, probability fans |
| 3D rendering | **Three.js**, lazy-loaded | RANDU point cloud, planes, orbit camera, guided tour |
| Overlays and charts | **DOM + SVG** | Annotations, labels, metrics, charts, accessible text |
| Chart primitives | **d3-scale, d3-shape, d3-color** | Scales, paths, palette interpolation, and geometry without full D3 DOM rendering |
| Math | **KaTeX at build time** | Static, high-quality formulas with no runtime math library |
| Code highlighting | **Shiki at build time** | Static, themed pseudocode with no runtime highlighter |
| Styling | **CSS custom properties + scoped styles** | Design tokens and bespoke layout without utility-class noise |
| State | **Svelte runes + engine state + URL state** | Local UI state, simulation state, shareable state |
| Package manager | **pnpm** | Fast, strict, reproducible installs |
| Lint and format | **Biome + `astro check`** | One fast tool for TypeScript/JS/CSS; Astro/Svelte markup is covered by the framework checker because Biome's HTML support is experimental |
| Unit tests | **Vitest** | Fast tests for engines, math, and URL state |
| End-to-end tests | **Playwright** | Browser tests, accessibility, visual regression, viewport matrix |
| Accessibility testing | **axe-core via Playwright** | Automated WCAG checks in CI |
| Performance testing | **Lighthouse CI + `web-vitals` + bundle-size checks** | LCP/CLS/TBT, INP, and budget enforcement |
| OG images | **astro-og-canvas** | Build-time social images with local fonts |
| RSS | **@astrojs/rss** | Static feed for both stories |
| Hosting | **Cloudflare Workers static assets** | Free static hosting, global CDN, custom domain, SSL |
| Deployment | **GitHub Actions + Wrangler** | Reproducible CI and production deploys |
| Analytics | **None in release 1** | No beacon, no privacy disclosure complexity; revisit later |

## 3. Detailed decisions

### 3.1 Astro as the site framework

**Why Astro**

- **Static by default.** Every route is pre-rendered to HTML. This matches the Cloudflare constraint and keeps hosting simple.
- **Content-first.** Typed content collections and MDX are a natural fit for long-form stories, chapters, references, and story metadata.
- **Islands architecture.** Prose ships as HTML with zero JavaScript; only the stage, controls, and other interactive pieces hydrate. A 2D story does not pay for the 3D renderer, and a landing page does not pay for the story runtime.
- **Per-page bundles.** Astro and its bundler split story code so that Three.js is loaded only by the RANDU story.
- **Built-in support for sitemaps, RSS, view transitions, and static assets.** These are site-level concerns that should not be rebuilt.
- **Framework-agnostic islands.** If the UI framework choice changes later, the content and routing layers remain.

**Why not the alternatives**

| Alternative | Why it was not chosen |
|---|---|
| **Next.js static export** | Capable, but heavier and more server-oriented. The App Router, caching model, and client/server boundary add complexity that a static content site does not need. |
| **Nuxt** | Good framework, but no advantage over Astro for this content model. The Vue ecosystem is not a requirement. |
| **SvelteKit with static adapter** | Excellent for app-like sites, but its routing and data model are app-first. Astro's content collections and zero-JS prose are a better fit for a story library. |
| **Eleventy** | Great static-site generator, but weaker support for typed content, islands, and interactive component composition without additional plumbing. |
| **Plain Vite + custom router** | Maximum control, but we would rebuild routing, content collections, MDX integration, sitemap generation, and islands. Not a good use of effort. |
| **Remix / React Router** | Server-oriented and heavier than needed. Static export is possible but not the primary design. |

### 3.2 Svelte for interactive islands

**Why Svelte**

- **Small runtime.** The story shell and controls stay lightweight, which matters for the JavaScript budget.
- **Fine-grained reactivity.** Sliders and metrics update without a virtual DOM or broad re-renders. The canvas stays imperative.
- **Excellent fit for control panels.** Local component state, derived values, and lifecycle hooks map cleanly to the story UI.
- **No JSX ceremony.** The story shell is mostly markup, styles, and a small amount of state.
- **Framework-agnostic core.** All simulation and rendering code is plain TypeScript, so Svelte is replaceable at the UI boundary.

**Why not the alternatives**

| Alternative | Why it was not chosen |
|---|---|
| **React** | The largest ecosystem, but a larger runtime and more ceremony for a site that does not need a component library. Canvas rendering is imperative either way. A valid fallback if contributor familiarity becomes more important than bundle size. |
| **Vue** | Capable and pleasant, but no meaningful advantage over Svelte for this use case. |
| **Solid** | Excellent performance and a small runtime, but a smaller ecosystem and less contributor familiarity. |
| **Vanilla TypeScript** | Would require hand-rolled reactive state, lifecycle management, and component composition for every control. The simulation core remains vanilla regardless. |

### 3.3 TypeScript everywhere

The simulation engines are the most correctness-sensitive part of the project. TypeScript provides:

- Explicit parameter and snapshot types.
- Compile-time checks at the engine/renderer/UI boundaries.
- Safer refactors when adding a third renderer or a new story.
- Better test authoring and editor support.

Strict mode is required. Simulation code must not import DOM, Svelte, or Three.js types, which keeps it testable and portable to a Web Worker if needed.

### 3.4 MDX and typed content collections

Stories are content, not hard-coded page components. Astro content collections provide:

- A schema for title, dek, category, difficulty, learning objectives, prerequisites, references, and visual mode.
- Build-time validation: a missing required field fails the build.
- MDX for prose with embedded `<Chapter>`, `<Callout>`, `<Predict>`, `<Figure>`, and `<Pseudocode>` components.
- Separation between narrative content and scene mechanics. Chapter IDs connect MDX prose to a TypeScript scene registry.

This keeps the authoring experience close to writing an article while preserving precise control over the visualization.

### 3.5 GSAP + ScrollTrigger for scroll orchestration

**Why GSAP + ScrollTrigger**

- **Pinning and scrubbing are first-class.** The story needs a stage that stays fixed while prose scrolls past, with reliable progress values.
- **Timelines compose well.** Chapter entry, camera moves, layer fades, and reveal sequences can be sequenced and reversed.
- **Mature cross-browser behavior.** Scroll measurement, refresh, and pinning edge cases are handled by a library with a long track record.
- **Cleanup model.** `gsap.context()` makes it possible to scope and revert all animations when navigating between stories.
- **Free to use.** The relevant plugins are available without a paid license.

**Why not the alternatives**

| Alternative | Why it was not chosen |
|---|---|
| **Motion** | Excellent for UI motion and simpler scroll-linked effects, but pinning and complex scroll timelines are less robust than ScrollTrigger. Shipping both Motion and GSAP would duplicate responsibilities. |
| **Scrollama** | Lightweight and good for step detection, but it deliberately avoids pinning and detailed scrubbing. We would still need a second system for the stage. |
| **Native CSS scroll-driven animations** | Great for progress bars, simple parallax, and reveals. Not sufficient for stateful simulation scenes, cross-browser consistency, or complex camera choreography. Use them only as progressive enhancement for simple effects. |
| **Locomotive Scroll** | Heavier and historically associated with scroll-jacking. Native scroll is a requirement. |
| **Custom IntersectionObserver implementation** | Feasible for step detection, but rebuilding pinning, progress interpolation, and refresh behavior is unnecessary risk. |

### 3.6 Lenis for smooth scrolling

Lenis provides inertial smoothing while preserving native scroll position, keyboard scrolling, and browser navigation. It integrates cleanly with ScrollTrigger and is small.

It is configured conservatively:

- Disabled on touch devices where native momentum is better.
- Disabled under reduced motion.
- Never used to block or remap scroll direction.
- Destroyed and recreated on page transitions.

**Alternative:** native scrolling only. This is the fallback if Lenis causes measurable jank or accessibility issues on any target browser.

### 3.7 Canvas 2D for the ACO story

**Why Canvas 2D**

- The ACO scene is a graph with hundreds of edges, dozens of ants, pheromone intensity, and animated probability arcs. SVG would create too many DOM nodes and make per-frame updates expensive.
- Canvas gives exact control over blending, trails, glow, and text-free annotations.
- It works everywhere without a GPU requirement.
- The scene is 2D; WebGL would add complexity without a visual benefit.

**Why not the alternatives**

| Alternative | Why it was not chosen |
|---|---|
| **SVG** | Good for charts and labels, poor for hundreds of animated edges and particles. DOM updates and layout costs dominate. |
| **PixiJS** | A strong 2D WebGL renderer, but an unnecessary abstraction for this workload. It would add bundle size and a second rendering model. |
| **WebGL directly** | More control but much more code. The ACO scene does not need it. |
| **D3 DOM rendering** | Excellent for static or low-frequency charts, not for a live agent simulation. Use D3 modules only for scales and geometry. |

### 3.8 Three.js for the RANDU story

**Why Three.js**

- The RANDU failure is inherently three-dimensional: consecutive triples lie on 15 parallel planes. A 2D chart cannot make the argument as clearly.
- Three.js provides a mature `Points` primitive for large point clouds, transparent meshes for planes, an orbit camera, and reliable WebGL lifecycle handling.
- It is tree-shakeable enough to keep the 3D story chunk within budget.
- It can be lazy-loaded only on the RANDU route.
- The same renderer can later support surfaces, 3D networks, and instanced lattices.

**Why not the alternatives**

| Alternative | Why it was not chosen |
|---|---|
| **React Three Fiber** | Requires React, which is not the UI framework. Adds a reconciler on top of a scene that is already imperative. |
| **Threlte** | A good Svelte-native wrapper for Three.js. It is a reasonable option if many 3D stories are added, but for one dynamic point-cloud story it adds an abstraction layer without removing the need for raw buffer updates. |
| **Plotly 3D** | Fast to prototype, but a large bundle, a generic visual style, and limited control over animation, camera choreography, and plane rendering. |
| **regl / OGL** | Smaller low-level WebGL libraries, but we would rebuild orbit controls, point sprites, plane geometry, and label projection. Not worth it for a small number of stories. |
| **Babylon.js** | Capable and feature-rich, but heavier than needed and oriented toward games and full 3D applications. |
| **Hand-rolled 3D projection on Canvas 2D** | Avoids a dependency, but depth sorting, transparency, orbit controls, and clipping are easy to get wrong. Three.js is the pragmatic choice. |
| **WebGPU** | Not necessary for this workload and adds browser-support risk. Revisit only if a future story needs massive GPU compute. |

**Implementation rule:** Three.js is loaded dynamically by the 3D renderer adapter. It must not appear in the shared story bundle or any 2D page bundle.

### 3.9 DOM and SVG for overlays, annotations, and charts

Canvas and WebGL are good at pixels, not at accessible text. The following stay in the DOM:

- Chapter prose, headings, captions, and citations.
- Axis labels, annotations, leader lines, and callouts.
- Metric readouts and live summaries.
- Small charts (convergence, error, distributions) where SVG is sufficient.
- Controls, presets, and settings.

This keeps text crisp at any zoom, selectable, translatable, and available to assistive technology. For 3D, labels are projected from world coordinates into positioned DOM elements rather than rendered into the canvas.

### 3.10 d3-scale and d3-shape, not full D3

The project needs scales, color interpolation, line/area generators, and simple geometry. It does not need D3's data joins or DOM selection layer.

- `d3-scale` handles linear and log scales.
- `d3-shape` handles line and area paths for charts.
- Small d3 color/interpolation modules provide palette interpolation where needed.
- Custom canvas and Three.js code handles the rest.

**Release-1 dependency roles (NFR-08):**

| Package | Role | Shipped? |
|---|---|---|
| `d3-scale` | Linear axes for the ACO convergence chart. | Yes, in the story island. |
| `d3-shape` | Best/mean line generators for the convergence chart. | Yes, in the story island. |
| `d3-color` | Parses token colours and builds the cached pheromone intensity ramp on the canvas. | Yes, in the ACO island. |
| `@types/d3-color`, `@types/d3-scale`, `@types/d3-shape` (dev) | Type declarations for the three d3 modules; the runtime packages do not bundle them. | No. |
| `tsx` (dev) | Runs `scripts/build-figures.mjs` with its TypeScript engine imports at build time. | No; never in a browser bundle. |

No charting framework, DOM-join library, or global state library is added.

This keeps the bundle small and avoids mixing D3's DOM paradigm with imperative rendering.

### 3.11 KaTeX at build time

Math is rendered to static HTML during the build. There is no runtime math library and no layout shift from math rendering.

- Formulas are authored in MDX and rendered by the build.
- Math is available in article mode and with JavaScript disabled.
- A custom stylesheet matches the editorial typography.
- KaTeX fonts are self-hosted and subset where practical.

**Alternatives:** MathJax is more feature-complete but heavier at runtime. Temml/MathML is lighter and more semantic, but styling consistency and browser behavior are less predictable across the target matrix. KaTeX is the safer default.

### 3.12 Shiki at build time

Pseudocode is highlighted during the build and shipped as static HTML. This avoids a runtime highlighter and lets the design use a custom theme that matches the site.

- Line-level highlighting is controlled by data attributes, not by re-highlighting at runtime.
- Code remains readable in article mode and with JavaScript disabled.
- Code blocks can be horizontally scrollable on narrow screens without breaking the layout.

**Alternatives:** Prism and highlight.js are capable, but they either add runtime work or require more custom integration for build-time output.

### 3.13 CSS custom properties and scoped styles

The design is bespoke: editorial paper, dark instrument panel, custom type scale, canvas-specific colors, and motion tokens. Utility-first CSS would add noise and make the visual system harder to reason about. CSS-in-JS would add runtime cost and complicate static rendering.

The approach:

- Global design tokens in CSS custom properties: color, type, spacing, radius, motion, z-index.
- Scoped Astro/Svelte styles for components.
- A small number of shared utility classes for layout primitives.
- Canvas colors read from a typed theme object that mirrors the CSS tokens.

**Alternative:** Tailwind is a valid choice for speed, but it is not required and can be added later for layout utilities if the team prefers it.

### 3.14 State management

There is no global state library. The state has three distinct homes:

1. **Simulation state** lives inside the engine. It is updated by a fixed-timestep loop and exposed through snapshots and metrics.
2. **UI state** lives in Svelte runes: active chapter, playing/paused, speed, article mode, quality tier.
3. **Shareable state** lives in the URL: story slug, chapter fragment, seed, structural parameters.

This separation prevents a UI store from becoming a second, inconsistent copy of the simulation. URL state is serialized and parsed by a small, unit-tested module.

Structural parameter changes restart the run at iteration 0 with the same seed; presentation changes apply immediately. The URL therefore encodes the run's starting state, not a mid-run frame. The full rules are in `docs/requirements.md` §2.6.1.

**Alternatives:** Redux, Zustand, and similar stores are unnecessary for a single-page story with a local engine. They would add indirection without solving a real problem.

### 3.15 Web Workers and bulk generation

The engines are written so they can run in a Worker. The ACO and default RANDU workloads run on the main thread with a fixed timestep. Two cases are predictably too expensive for a synchronous main-thread path:

- RANDU BigInt generation at up to 100,000 triples with a non-power-of-two modulus.
- The ACO worst case of 150 cities × 200 ants at 4× speed.

The plan is:

1. Implement on the main thread with a fixed timestep.
2. Measure frame time and long tasks.
3. Use a Worker or chunked async generation for the RANDU BigInt path, with a busy state.
4. Cap ACO iterations per frame and degrade quality rather than block.
5. If a Worker is added, use a small typed message protocol and transferable arrays. Avoid `SharedArrayBuffer`, which would require cross-origin isolation headers.

**Why not start every engine in a Worker:** they add lifecycle, serialization, and debugging complexity. They are a performance tool, not an architectural requirement. The BigInt bulk path is the exception because it is predictably over budget.

### 3.16 Testing and quality tools

- **Vitest** for pure logic: ACO invariants, LCG exactness, plane detection, URL parsing, deterministic seeds, and property-based tests with `fast-check`.
- **Playwright** for browser behavior: scroll chapters, controls, sharing, article mode, reduced motion, no-JavaScript reading, viewport matrix, and WebGL smoke tests.
- **axe-core** for automated accessibility checks.
- **Lighthouse CI** for performance, accessibility, best-practices, and SEO budgets, with desktop and mobile presets.
- **`web-vitals`** in Playwright for the INP harness; Lighthouse lab does not report INP.
- **Visual regression** with fixed seeds, frozen simulation time, fixed scroll positions, disabled Lenis, and `document.fonts.ready`; it runs in CI with artifact upload.
- **Biome** for TypeScript, JavaScript, and CSS. Astro/Svelte markup support is experimental and requires `html.experimentalFullSupportEnabled`; `astro check` covers the framework templates. This combination is the documented lint story.

The full verification strategy is in `docs/requirements.md` §1.4 and §6, and the concrete commands are in `docs/implementation-plan.md` Appendices A and C.

### 3.17 Cloudflare Workers static assets

**Why Workers static assets**

- The build output is a directory of static files. Cloudflare serves those files directly from its global network.
- Static asset requests are not charged on the free plan; the site does not need a Worker script or any paid service.
- Custom domains and SSL certificates are available on the free plan.
- A `_headers` file can set security and caching headers for static assets. It applies to the assets-only deployment; if a Worker script is added later, headers must be set in the Worker response instead.
- `assets.html_handling: "drop-trailing-slash"` is required so that `/stories` and `/stories/<slug>` are served without a redirect. Astro's `trailingSlash` setting, internal links, canonicals, the sitemap, and the link checker must all use the same non-trailing-slash convention.
- Astro's sitemap integration emits `sitemap-index.xml` and `sitemap-0.xml`, not `sitemap.xml`.
- GitHub Actions can build and deploy with Wrangler using an API token.

**Why not the alternatives**

| Alternative | Why it was not chosen |
|---|---|
| **Cloudflare Pages** | Also a good fit, with Git integration and a generous free build allowance. It remains a fallback. Workers static assets is chosen because it is the current documented path and keeps the deploy artifact explicit. |
| **Netlify / Vercel** | Good developer experience, but the hosting requirement specifically names Cloudflare's free plan. |
| **GitHub Pages** | Free and simple, but weaker control over headers, caching, and custom domains, and no integrated Cloudflare CDN configuration. |
| **S3 + CloudFront** | More infrastructure and potential cost for no benefit. |
| **A VPS** | Violates the static, zero-operations constraint. |

**Why not SSR or edge functions:** The site has no dynamic data, authentication, or personalization. Static HTML is faster, cheaper, more cacheable, and easier to secure. If a future feature requires a backend, it can be added as a separate Worker without changing the story architecture.

### 3.18 GitHub Actions and Wrangler

- CI runs lint, type-check, unit tests, end-to-end tests, accessibility checks, visual regression, bundle checks, and the production build.
- Playwright CI installs Chromium, Firefox, and WebKit. Current Safari, iOS Safari, and Android Chrome are checked manually on real devices.
- Deployment runs only from the main branch after all checks pass.
- Secrets are stored in GitHub Actions secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Preview deployments are optional; if added, they must not share production state or analytics.
- The build is reproducible: frozen lockfile, explicit package manager via `packageManager`, and a single build command.

### 3.19 Analytics and privacy

Release 1 ships **without analytics**. There is no beacon, no third-party script, and no consent banner.

If analytics are added later, use Cloudflare Web Analytics:

- Cookie-less.
- No personal data.
- No consent banner required.
- Disclosed on the colophon or privacy page.

No advertising, tracking pixels, session recording, or third-party embeds are included by default. `localStorage` is used only for reader preferences, stored on the device and not transmitted.

### 3.20 Fonts and typography

The design uses three self-hosted open-source families:

| Role | Family | Why |
|---|---|---|
| Display | **Instrument Serif** | Editorial, high-contrast, distinctive at large sizes. |
| Body | **Geist** | Neutral, highly legible, variable, excellent for long reading. |
| Data/code | **JetBrains Mono** | Clear tabular figures and a technical voice for metrics and pseudocode. |

Fonts are self-hosted, subset with `subfont` or `fonttools`, preloaded only when critical, and paired with metric-compatible fallbacks to reduce layout shift. No third-party font CDN is used. `public/fonts/` is unhashed, so `_headers` gives it an explicit long-lived cache rule (for example one week with revalidation) rather than the immutable hashed-asset rule.

### 3.21 Design tokens

The visual system is intentionally small and token-driven:

| Token | Value | Use |
|---|---|---|
| Paper | `#F2EFE6` | Page background |
| Ink | `#141414` | Body text and rules |
| Paper muted | `#5F5B54` | Secondary paper text; 5.87:1 on paper |
| Accent on paper | `#B23A1A` | Links and small accent text; 5.20:1 on paper |
| Stage | `#0B0C0E` | Visualization background |
| Stage ink | `#F2EFE6` | Stage text; 17.02:1 on stage |
| Stage muted | `#9A948A` | Stage captions; 6.50:1 on stage |
| Accent on stage | `#E4572E` | Stage highlights and pheromones; 5.31:1 on stage |
| Focus | `#3A6EA5` | Focus ring; 4.62:1 on paper, 3.68:1 on stage |
| Warm amber | `#FFB25E` | Ants, trails, warm data (graphics/large text) |
| Cool accent | `#7CF5C4` | Best tour, comparison data (graphics/large text) |

Vermilion `#E4572E` may be used for large text and non-text graphics on paper only where it meets the 3:1 large-text/graphics threshold; it is not the body-text or small-link color on paper. A Phase 0 unit test asserts every text/UI token pair on both backgrounds. The token values and contrast ratios above are normative.

Motion uses long, calm easing curves in the 400–900 ms range with a strong ease-out; no bouncy springs for explanatory content. The stage starts as a framed paper inset and can expand to full-bleed for key acts. Canvas colors are read from a typed theme object that mirrors these tokens.

### 3.22 Generator abstraction and RANDU math

FR-RANDU-01 and FR-RANDU-09 require a common abstraction because PCG32 and xoshiro128** are not LCGs:

```ts
interface Generator {
  readonly kind: 'lcg' | 'pcg32' | 'xoshiro128';
  reset(seed: number): void;
  nextUint32(): number;
  nextFloat(): number; // [0, 1)
  readonly period?: number;
}
```

LCG presets expose `a`, `c`, and `m`. PCG32 uses a 64-bit state and increment; xoshiro128** uses four 32-bit words seeded by splitmix32. The advanced panel and URL schema expose generator-specific fields only.

| Preset | `a` | `c` | `m` |
|---|---|---|---|
| RANDU | 65539 | 0 | 2³¹ |
| MINSTD | 16807 | 0 | 2³¹−1 |
| ANSI C | 1103515245 | 12345 | 2³¹ |
| Numerical Recipes | 1664525 | 1013904223 | 2³² |

Known-sequence tests use exact first-output fixtures plus a BigInt reference, including PCG32 and xoshiro128** seeding.

The fast double-precision path is allowed only when `a × (m − 1) + c ≤ 2⁵³`. This is a per-`(a, m)` rule: RANDU, MINSTD, and Numerical Recipes are safe; **ANSI C is not** (≈ 2.37 × 10¹⁸ > 2⁵³) and needs `Math.imul`, split multiplication, or BigInt.

RANDU is multiplicative (`c = 0`). Its period is **2²⁹ = 536,870,912** for an odd seed. Hull–Dobell applies to `c ≠ 0` and does not describe RANDU. The plane index is computed from integer state as `(9x − 6y + z) / 2³¹`; normalized floats are never divided by `2³¹`.

The point-count control counts rendered triples and generates `triples + 2` outputs. `distinctPlaneCount` and `maxPlaneGap` are computed from data, not hardcoded. A 50,000-triple run with seed `1` yields exactly `{−5…9}`; small runs can yield fewer, and seed `2³⁰` is a fixed point with one plane. Even seeds are accepted with a warning, and the all-odd low-bit claim is conditional on an odd seed. The low-bit chapter uses a bit-plane strip or bit-period table, not a flat parity strip.

### 3.23 Article-first rendering and static figures

The static HTML default is the article layout. The stage is an enhancement inserted after hydration. With JavaScript disabled, there is no empty stage; `<Predict>` is built on `<details>/<summary>`; all prose, formulas, and static figures remain visible.

A build-time `scripts/build-figures.mjs` imports the engines with fixed seeds and writes the ACO best-tour figure and the RANDU 2D projections. These figures are referenced by MDX, so article and no-JS modes have real figures rather than client-only canvases.

The script runs through `node --import tsx`; `tsx` is a dev-only executable that executes the TypeScript engine imports and never ships to the browser. The ACO figure is committed at `src/assets/figures/aco-best-tour.svg` and imported inline, so it participates in the no-JS HTML and inherits the page's colour tokens. The output is deterministic: fixed seed and iteration count, locale-independent number formatting, and no timestamps.

### 3.24 Licensing, analytics, and operations

- Code is MIT; original prose is CC BY 4.0. GSAP is credited under its standard license; fonts and libraries keep their own licenses.
- Release 1 has no analytics beacon and no tracking cookies. `localStorage` stores reader preferences only.
- CSP uses Astro's generated scripts/styles with a documented hash/nonce or conservative fallback; `frame-ancestors 'none'`; consider HSTS.
- Rollback is redeploying the previous tagged commit or `wrangler rollback`.
- `_headers` applies to static assets; if a Worker response is added later, headers must be set in the Worker.

## 4. How the pieces fit

### 4.1 Runtime architecture

```text
MDX chapters ──► static HTML (prose, math, code, citations)
      │
      │ data-chapter markers
      ▼
StoryController (Svelte island)
  ├─ ScrollDirector ── GSAP ScrollTrigger + Lenis
  ├─ SceneRegistry ─── TypeScript scene definitions
  ├─ Engine ────────── pure TypeScript, seeded, fixed timestep
  ├─ RendererAdapter ─ Canvas2D or Three.js
  └─ UI / DOM ──────── controls, metrics, annotations, progress rail
```

### 4.2 Build-time pipeline

```text
Astro build
  ├─ content collections ── schema validation
  ├─ MDX ─────────────────── prose + KaTeX + Shiki
  ├─ pages ───────────────── static HTML per route
  ├─ islands ─────────────── per-story client bundles
  ├─ sitemap / RSS / OG images
  └─ dist/ ───────────────── static assets
```

### 4.3 Renderer contract

Both renderers implement the same small interface:

```ts
interface StageRenderer<P, S> {
  mount(container: HTMLElement): Promise<void>;
  resize(width: number, height: number, dpr: number): void;
  setScene(scene: SceneState): void;
  setParams(params: P): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

type CameraState =
  | { kind: '2d'; panX: number; panY: number; zoom: number }
  | { kind: '3d'; position: Vec3; target: Vec3; up: Vec3; fov: number };

interface ChapterSpec {
  id: string;
  title: string;
  scene: string;
  params?: Record<string, unknown>;
  pseudocodeLine?: number;
  annotations?: string[];
  reducedMotionSteps?: number;
  tourAct?: number;
}
```

- `Canvas2DRenderer` owns a 2D camera, layers, and drawing.
- `ThreeRenderer` owns a Three.js scene, orbit controls, and label projection.
- The story controller does not know which renderer is active.
- `setParams` is generic, not `unknown`; renderers may expose optional label-registration and camera-query hooks.
- The 3D adapter is dynamically imported only when a story requests it.
- The stage is an enhancement over the server-rendered article layout; the static build never evaluates canvas or WebGL code.
- A fake-3D contract test in Step 1.1 exercises async mount, a 3D camera pose, and label registration before Phase 4.

The story controller passes typed params and a discriminated camera state; `unknown` is not used at the renderer boundary.

### 4.4 Scroll semantics

- Chapter entry sets parameters, resets the run deterministically, eases the camera, and starts the scene.
- Chapter progress interpolates deterministic presentation values only: camera pose, layer opacity, and reveal progress.
- Scroll never morphs engine parameters. A structural change restarts the run at iteration 0; a presentation change applies immediately.
- Chapter exit settles into a coherent state; stochastic runs are never rewound by scrolling upward.
- Scenes that must scrub exactly (for example, a single tour construction) use a precomputed deterministic keyframe sequence; arbitrary stochastic runs are not precomputed.
- The lab runs freely with no scroll coupling.
- The guided tour owns the camera while playing; scroll scrubbing is suspended, pointer grab pauses the tour, and resume returns to the scripted timeline.
- Reduced motion replaces animation with static keyframes and step controls.

This avoids the common failure mode where simulation time is tied directly to scroll position, causing skipped states, rewinds, and jank. The state and URL rules are in `docs/requirements.md` §2.6.1.

### 4.5 Performance strategy

- One driver: GSAP ticker → fixed-timestep clock → engine → renderer. Lenis and ScrollTrigger update scroll only.
- Pause rendering and simulation when the stage is offscreen or the tab is hidden.
- Cap device pixel ratio; expose a quality tier.
- Use `setDrawRange` for progressive point reveals.
- Reuse typed arrays and GPU buffers; do not allocate per frame.
- Batch DOM metric updates to a low frequency.
- Lazy-load Three.js only for the 3D story.
- Self-host and subset fonts.
- Avoid shadows, post-processing, and per-frame allocations in 3D.
- Dispose geometries, materials, textures, listeners, tour tweens, and WebGL contexts on navigation.
- Run RANDU BigInt bulk generation in a Worker or in chunks; cap ACO iterations per frame at the worst-case workload.
- Measure p95 frame time, not an average; the budgets are in `docs/requirements.md` §2.8.

### 4.6 3D rendering patterns for future stories

RANDU is the first 3D story, but the renderer is designed to support other visual arguments without changing the story shell. The main patterns are:

| Pattern | Use case | Three.js approach |
|---|---|---|
| **Point cloud** | RANDU triples, n-body particles, random walks | `Points` with a single `BufferGeometry`, typed position/color attributes, `setDrawRange` for progressive reveal |
| **Surface** | Optimization landscapes, loss surfaces, response surfaces | Grid mesh with vertex colors, contour overlay, and a marker for the current state |
| **Network** | 3D graph layouts, force-directed graphs | `LineSegments` for edges, `InstancedMesh` for nodes, DOM labels for selected nodes |
| **Instanced volume** | Ising lattices, 3D cellular automata | `InstancedMesh` of cubes or cells, color by state, camera inside or outside the lattice |

Shared helpers:

- `ThreeStage` — renderer, scene, camera, orbit controls, resize, visibility, context-loss handling, dispose.
- `CameraDirector` — scripted poses versus free orbit, with interruption and resume.
- `LabelProjector` — world-to-screen projection for DOM labels.
- `createPointCloud`, `createPlaneFamily`, `createCubeFrame`, `createAxes`, `createSurface`, `createInstancedLattice` — reusable scene builders.
- `theme.ts` — canvas colors mirrored from the CSS tokens.

Rules for every 3D story:

- Detect **WebGL2**; current Three requires WebGL2. If it is unavailable, render the fallback.
- Lazy-load Three.js; never include it in a 2D page bundle.
- Use one WebGL context at a time and dispose it on navigation.
- Use DOM labels instead of in-canvas text.
- Provide a 2D projection, a textual summary, and a data table as the accessibility fallback.
- Avoid shadows and post-processing unless a story proves they are necessary.
- Clip transparent planes and volumes to their domain to limit overdraw. For RANDU, use Six local clipping planes for the unit cube or pre-clip the geometry; do not rely on a visual approximation.
- Test on a real mid-tier mobile device; cap DPR and point counts by quality tier.
- On coarse pointers, keep vertical page scroll native. One-finger orbit uses horizontal drag or an explicit Orbit mode; two-finger zoom has button alternatives.
- Handle iOS Safari viewport resizing with `100dvh`/`visualViewport` and debounced `ScrollTrigger.refresh()`.

## 5. Alternatives considered as a group

| Decision area | Chosen | Rejected | Core reason |
|---|---|---|---|
| Static site framework | Astro | Next.js, Nuxt, SvelteKit, Eleventy, plain Vite | Best content model and zero-JS prose for a story library |
| UI framework | Svelte | React, Vue, Solid, vanilla | Small runtime and fine-grained reactivity |
| Scroll engine | GSAP + ScrollTrigger | Motion, Scrollama, native CSS, custom observers | Most reliable pinning and timeline control |
| Smooth scroll | Lenis | Locomotive, native only | Small, native-preserving, integrates with ScrollTrigger |
| 2D renderer | Canvas 2D | SVG, PixiJS, WebGL, D3 DOM | Right level of control for animated graphs |
| 3D renderer | Three.js | R3F, Threlte, Plotly, regl/OGL, Babylon, hand-rolled | Mature, lean enough, lazy-loadable |
| Math | KaTeX build-time | MathJax, Temml | Static output, good typography, no runtime |
| Code highlighting | Shiki build-time | Prism, highlight.js | Static output and custom themes |
| Styling | CSS custom properties | Tailwind, CSS-in-JS, component library | Bespoke design and no runtime styling |
| State | Svelte runes + URL + engine | Redux, Zustand, MobX | No need for a global store |
| Hosting | Cloudflare Workers static assets | Pages, Netlify, Vercel, GitHub Pages, S3 | Free static hosting with header control |
| Testing | Vitest + Playwright + axe + Lighthouse | Jest, Cypress, manual QA | Fast unit tests and real-browser coverage |

## 6. Version and upgrade policy

- Do not pin versions in documentation. Documentation describes intent and constraints.
- The lockfile pins exact versions for reproducibility.
- Use the latest stable release at initialization.
- Upgrade one dependency family at a time.
- Run lint, type-check, unit tests, end-to-end tests, accessibility checks, visual regression, and bundle budgets after every upgrade.
- Never upgrade Three.js, GSAP, Astro, or Svelte without a visual and behavioral regression pass.
- Remove unused dependencies promptly.

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scroll jank on low-end devices | Poor reading experience | Fixed timestep, quality tiers, DPR cap, pause offscreen, avoid layout reads in RAF |
| 3D performance on mobile | Dropped frames | Lazy load, point-count limits, no post-processing, cap DPR, test on real devices |
| Transparent 3D planes cause overdraw | Fill-rate cost | Six local clipping planes to the cube, low opacity, limit plane count to 15 |
| GSAP lifecycle leaks with view transitions | Duplicate animations | Remount the story island on slug change, `gsap.context()`, explicit cleanup, navigation stress tests |
| State/URL non-reproducibility | Broken share links and tests | Structural changes reset the run; URL stores starting state; chapter reset is deterministic |
| BigInt generation blocks the UI | Frozen page | Worker or chunked generation with a busy state at 100,000 triples |
| Mobile gesture conflict | Reader cannot scroll | Vertical scroll stays native; explicit Orbit mode; button alternatives |
| Token contrast failure | Accessibility defect | Phase 0 contrast test; separate stage/paper text and accent tokens |
| Bundle growth | Slow first load | Per-story code splitting, lazy Three.js, budget checks in CI |
| Accessibility regressions | Exclusion and legal risk | axe in CI, keyboard tests, reduced-motion tests, manual screen-reader pass |
| Content correctness | Loss of trust | Unit-tested invariants, cited sources, review checklist |
| Over-abstraction | Slow development | Build only the interfaces needed by the two initial stories; generalize after a third use case |
| WebGL2 unavailability | Broken 3D story | 2D projection fallback, textual summary, data table, retry UI |

## 8. What we deliberately do not use

- **No SSR or edge rendering.** The site is static.
- **No database or CMS.** Content is versioned in the repository.
- **No authentication or user accounts.**
- **No CSS framework or component library** as the primary design system.
- **No global state library.**
- **No runtime math or syntax-highlighting library.**
- **No Service Worker/PWA** in the first release.
- **No WebGPU** in the first release.
- **No third-party embeds** (videos, charts, social posts) that would compromise performance or privacy.
- **No automatic dependency updates** without a test pass.

These omissions are deliberate scope control, not permanent prohibitions. Each can be revisited when a concrete story requires it.
