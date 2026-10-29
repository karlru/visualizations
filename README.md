# Algorithm Stories

> Working title. Interactive, scroll-driven visual essays that explain algorithms from the inside.

Algorithm Stories is a static website for people who learn best by seeing a system move. Each story takes one algorithm or computational idea and turns it into a visual narrative: a pinned stage, animated scenes, changing parameters, annotations, math, pseudocode, and a free-play lab at the end.

The site is designed to be:

- **A story first** — the reader scrolls through an argument, not a documentation page.
- **Interactive** — parameters change a running simulation immediately.
- **Transparent** — the underlying logic is shown through formulas, pseudocode, metrics, and explanations.
- **Composed** — several visual layers are assembled step by step, with prose in between.
- **Readable without motion** — an article mode and reduced-motion mode preserve the full explanation.
- **Fast and free to host** — the site is fully static and deploys to Cloudflare's free plan.

## Initial stories

The first release contains exactly two stories:

| Story | Topic | Visual mode |
|---|---|---|
| **The Colony That Finds a Short Route** | Ant Colony Optimization on a TSP | 2D canvas |
| **Fifteen Planes: How RANDU Broke Randomness** | Linear congruential generators, RANDU, and the 3D lattice failure | 3D WebGL |

Both are described in detail in [`docs/stories.md`](docs/stories.md). Everything else is a future addition to the backlog.

## Experience principles

1. **One idea per screen.** Chapters are short; the visualization carries the argument.
2. **Show, then name.** The reader sees the behavior before the formal definition.
3. **Direct manipulation.** Sliders, presets, seeds, and camera controls change the running system.
4. **The lab is part of the story.** Each story ends with a sandbox, not a dead end.
5. **Never trap the reader.** Native scrolling, pause controls, article mode, keyboard access, and reduced motion are mandatory.
6. **Craft over volume.** Two polished stories beat ten unfinished demos.
7. **3D only when the third dimension is the point.** RANDU qualifies; a bar chart does not.

## Design direction

The visual language is **editorial paper + dark instrument panel**:

- Warm paper chrome, ink typography, a vermilion accent.
- Serif display type, grotesk body type, monospace data.
- Visualizations live in a near-black stage with luminous trails, particles, and labels.
- The contrast between readable paper and the dark computational stage is the signature of the site.

## Technology at a glance

The documentation deliberately does not pin versions. Use the latest stable release of each tool when the project is initialized; the lockfile is the source of truth.

- **Astro** for a static, content-first site.
- **Svelte** islands for interactive controls and the story shell.
- **TypeScript** for the simulation engines, renderers, and UI.
- **GSAP + ScrollTrigger** for scroll orchestration and pinned scenes.
- **Lenis** for smooth scrolling that preserves native scroll behavior.
- **Canvas 2D** for the ACO story.
- **Three.js** (lazy-loaded) for the RANDU 3D story.
- **DOM and SVG** for annotations, charts, math, and accessible text.
- **KaTeX** and **Shiki** at build time for math and code highlighting.
- **CSS custom properties** and scoped styles for a bespoke design system.
- **Cloudflare Workers static assets** for free static hosting.
- **GitHub Actions + Wrangler** for continuous deployment.

The full rationale, alternatives, and trade-offs are in [`docs/technology.md`](docs/technology.md).

## Architecture at a glance

```text
MDX chapters (pre-rendered prose, math, pseudocode)
        │  chapter markers
        ▼
StoryController (one persistent Svelte island)
  ├─ ScrollDirector      GSAP ScrollTrigger + Lenis
  ├─ SceneRegistry       per-story configuration (enter / progress / exit)
  ├─ Engine              pure TypeScript, seeded, fixed timestep
  ├─ RendererAdapter     Canvas2D or Three.js
  └─ UI                  controls, metrics, annotations, progress rail
```

The three systems are deliberately separate:

- **Simulation** is pure, deterministic, and testable.
- **Rendering** draws snapshots and is replaceable.
- **Scroll** directs scenes and camera moves; it does not own simulation time.

## Documentation (table of contents)

| Document | What it covers |
|---|---|
| [`docs/requirements.md`](docs/requirements.md) | Precise, testable functional and non-functional requirements, scope, and acceptance criteria. |
| [`docs/technology.md`](docs/technology.md) | Technology choices, rationale, architecture fit, alternatives considered, and risks. |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | Step-by-step implementation instructions with acceptance criteria for every step. |
| [`docs/stories.md`](docs/stories.md) | The story catalog, detailed outlines for the two initial stories, and the future backlog. |

## Planned repository layout

```text
/
├─ README.md
├─ docs/
│  ├─ requirements.md
│  ├─ technology.md
│  ├─ implementation-plan.md
│  └─ stories.md
├─ public/
├─ scripts/
├─ src/
└─ tests/
```

The detailed, canonical tree is in [`docs/implementation-plan.md`](docs/implementation-plan.md) §3. This README intentionally shows only the top-level shape so the two trees cannot drift.

## Local development

The project is documented but not yet scaffolded. Once the implementation plan has been executed, the expected commands are:

```bash
pnpm install
pnpm dev          # local development server
pnpm build        # build static figures, type-check, and build the static site
pnpm preview      # preview the production build locally
pnpm lint         # Biome plus Astro/Svelte checks
pnpm test         # unit tests
pnpm test:e2e     # end-to-end and accessibility tests
pnpm test:visual  # visual regression screenshots
pnpm check:links  # internal link check
pnpm check:bundle # initial and route-total bundle budgets
pnpm deploy       # build and deploy to Cloudflare
```

Prerequisites: the current Node LTS release, pnpm, and a Cloudflare account for deployment.

## Deployment

The site is fully static. Cloudflare Workers static assets serve the build output directly; requests for static assets are not charged on the free plan. There is no server, database, or API to operate. The deployment uses `drop-trailing-slash` routing so `/stories` and `/stories/<slug>` are served without a redirect.

Deployment is automated from the main branch with GitHub Actions and Wrangler. Preview deployments are optional. The exact setup is described in [`docs/implementation-plan.md`](docs/implementation-plan.md).

Release 1 has no analytics beacon and no tracking cookies. Reader preferences are stored locally in `localStorage` and are not transmitted.

## Status

- Documentation: implementation-ready for the initial two-story release.
- Implementation: not started.
- Scope: ant colony optimization and LCG/RANDU only. Additional stories are listed in the backlog but are not part of the first release.

## Contributing and authoring

Every story follows the same shell and the same definition of done. The authoring checklist, chapter structure, and acceptance criteria live in [`docs/stories.md`](docs/stories.md). Implementation conventions and test commands live in [`docs/implementation-plan.md`](docs/implementation-plan.md).

## License

Code is licensed under the MIT License. Original prose and illustrations are licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). Third-party fonts and libraries keep their own licenses; credits are listed on the colophon page. GSAP is used under its standard license and is credited on the colophon.
