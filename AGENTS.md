# AGENTS.md

## Project

**Visualizations** is a fully static, scroll-driven site of interactive visual essays that explain algorithms from the inside. Release 1 contains exactly two stories: Ant Colony Optimization (Canvas 2D) and LCG/RANDU (Three.js), built on Astro + Svelte islands.

## Documentation

| File | Use |
|---|---|
| `README.md` | Product overview, experience principles, design direction, planned layout and commands. |
| `docs/implementation-plan.md` | **Primary task source.** Phases → steps → tasks + acceptance criteria, target file tree, package scripts, CI, troubleshooting. |
| `docs/requirements.md` | Normative functional/non-functional requirements (`FR-*`, `NFR-*`), algorithm invariants (`ACO-INV-*`, `RANDU-INV-*`), URL/validation contract, budgets. |
| `docs/technology.md` | Technology rationale and hard rules: contracts, renderer isolation, RANDU math, state, performance, tokens, licensing. |
| `docs/stories.md` | Story catalog, chapter outlines, parameters/presets, metrics, edge cases, accessibility fallbacks, references, authoring checklist. |

Docs are the source of truth. If implementation reveals a wrong contract, fix the doc in the same change. Do not pin dependency versions in docs; the lockfile is authoritative.

## Technology requirements

- **TypeScript everywhere, strict mode.** No loose types at module boundaries; `unknown` is forbidden at the renderer boundary (`technology.md` §4.3). `pnpm build` includes `astro check`, so type errors fail the build.
- **Stack:** Astro (static output), Svelte islands, MDX + typed content collections, GSAP/ScrollTrigger + Lenis, Canvas 2D (ACO), Three.js (RANDU, lazy), d3-scale/d3-shape, build-time KaTeX/Shiki, CSS custom properties, pnpm.
- **Decoupled and testable by design:**
  - `src/engines/**` must not import DOM APIs, Svelte, Astro, or Three.js; engines are pure, seeded, and fixed-timestep. Guard this with `tests/unit/import-boundaries.test.ts` (a lint rule is also acceptable).
  - `src/render/**` may import rendering libraries but not Svelte components; both renderers implement the same `StageRenderer` contract.
  - Scroll directs presentation only; it never owns simulation time or morphs engine parameters.
- **3D rule:** Three.js is dynamically imported only for 3D routes; it must never appear in the ACO or shared bundles. Detect WebGL2 and provide the 2D/text fallback.
- **Do not add** a CSS framework/component library, global state library, runtime math/highlighter, analytics, or any dependency without a documented role (`NFR-08`).
- **Conventions:** kebab-case files, PascalCase components, camelCase functions/variables. `trailingSlash: 'never'` must match Cloudflare `drop-trailing-slash`; use `/stories`, never `/stories/`.
- **Release gates, not polish:** accessibility (WCAG 2.2 AA, no-JS article mode, reduced motion), bundle budgets, p95 frame time, and deterministic visual regression are required.

## How to work

### Scope

- One agent session works on **at most one step**.
- Work through phases in order; later steps assume earlier contracts. Do not start story content before engine and renderer contracts are stable.
- Read the full step before editing: **Goal**, **Tasks**, **Files**, **Acceptance criteria**. Acceptance criteria are the test contract.

### Marking progress

Update `docs/implementation-plan.md` as part of the work:

- Completed task: prefix the numbered item, e.g. `1. (DONE) Initialize Git.`
- Completed step: only after **all tasks are done and all acceptance criteria are verified**, prefix the heading:
  `### (DONE) Step 0.1 — Initialize the repository and Astro project`
- Acceptance criteria: change `- [ ]` to `- [x]` **only for checks you actually verified**. Leave failed or unverified items unchecked and state the reason in the commit/response.
- Never mark a step done while a task or criterion is outstanding.

### Commits

Commit often — ideally after each task, and **at minimum after each step**. Before every commit:

1. Confirm the task/step is marked `(DONE)` and the passing criteria are checked in the plan.
2. Run the relevant checks; do not commit broken lint/typecheck/tests.
3. Include the plan update in the same commit as the code it describes.

Message format (exactly one of the three types):

```text
<feat|fix|improvement> <phase>.<step>.<task> <Description of work done>
```

Examples: `feat 0.1.1 Initialize Astro project`, `fix 2.2.4 Handle rho = 1 evaporation`, `improvement 1.2.3 Document clock substep cap`.

- `1.2.3` = phase 1, step 2, task 3. The task number is the task the commit completes; a step-closing commit uses the last completed task number.
- Use `improvement` for docs, refactors, and non-feature work; no `chore`, `docs`, or other types.

### Continuing work

When asked to "continue", "work on the next feature", or similar, do not rely on chat history: open `docs/implementation-plan.md` and find the **first step that is not `(DONE)`**, then its first task that is not `(DONE)`. Resume there.

## Commands

Not runnable yet (project not scaffolded). Once Phase 0 is complete, use these from `docs/implementation-plan.md` Appendix A:

| Command | Purpose |
|---|---|
| `pnpm dev` | Astro dev server (blocks the shell). |
| `pnpm build` | `build-figures` → `astro check` → `astro build`. **Run before E2E, link, bundle, and Lighthouse checks.** |
| `pnpm preview` | Preview the production build. |
| `pnpm lint` | `biome check .` + `astro check`. |
| `pnpm test` | Vitest unit tests. |
| `pnpm test:e2e` | Playwright against the built preview. |
| `pnpm test:a11y` | axe accessibility suite. |
| `pnpm test:visual` | Screenshot regression (fixed seeds, frozen time/scroll, Lenis disabled). |
| `pnpm check:links` | Internal link check; must fail on a deliberately broken link. |
| `pnpm check:citations` | External citation/link status. |
| `pnpm check:bundle` | Initial and route-total gzip budgets. |
| `pnpm exec lhci autorun` | Lighthouse desktop + mobile presets. |
| `pnpm deploy` | Build and deploy with Wrangler. |

Phase gates run the full set: `lint` → `test` → `build` → `check:*` → `test:e2e` → `test:a11y` → `test:visual` → `lhci`. Deployment is automated from `main`; do not deploy from feature branches.
