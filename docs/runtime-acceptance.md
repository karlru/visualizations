# Story runtime acceptance matrix

Step 1.9 proves the shared story runtime on the built preview before Phase 2
starts. This note maps every `FR-STORY-*` requirement in
[`requirements.md`](./requirements.md) §2.2 to the browser tests that verify it.
All rows were run on 2026-10-30 with `pnpm lint`, `pnpm test`, `pnpm build`,
`pnpm check:links`, and `CI=1 pnpm test:e2e`. Step 3.3 added the public ACO
route; `tests/e2e/aco-story.spec.ts` extends the same runtime checks to the real
story and its ten chapters.

## Runtime architecture

- `src/stories/loader.ts` is the story-module registry. It accepts a slug
  (`ant-colony-optimization`, `story-smoke`, `pulse-smoke`) and dynamic-imports
  the matching module. A page passes `storyKey` to `StoryController`; the
  controller never imports a concrete story, engine, or renderer.
- `src/stories/runtime.ts` closes over a story's concrete `P`/`S`/`M` types and
  exposes a non-generic `StoryModuleView` plus `StoryRuntime`. The controller
  works with primitive `StoryParamBag` params and a
  `StageRenderer<StoryParamBag, object>` facade; the adapter owns every cast and
  the engine snapshot is taken inside the facade, so no `unknown` reaches a
  renderer.
- Each story module supplies its renderer factory and metric/structural
  describer. `src/stories/aco/module.ts` is the only place that names
  `AcoEngine`, `Canvas2DRenderer`, and `createAcoLayers()`; the development
  modules keep the fixture renderer and `controlPanel: 'fixture'` panel.
- `src/layouts/StoryLayout.astro` and `src/pages/stories/[...slug].astro` render
  a content entry whose slug has a module. The MDX body is passed to the
  controller as server-rendered children, so the article is always the default.
- A second fixture, `/dev/pulse-smoke`, has its own engine, defaults, presets,
  scenes, chapter map, URL schema, and page. It reuses the same controller,
  `Chapter.astro`, rail, chrome, and runtime. Adding it required no controller
  internals.
- Every chapter entry resets the engine, clock, step counter, and simulated
  time, then records a deterministic entry snapshot before the next frame. The
  hook is exposed as `window.__storyRuntimeDebug.entryState()` and mirrored to
  `data-entry-*` attributes on `[data-story-controller]`.
- Both development pages stay in the production build for Playwright, but are
  `noindex`, unlinked, and filtered out of the sitemap. The ACO route is public
  and appears in the sitemap.

## Requirement → test

| Requirement | Verifying test(s) | Result |
|---|---|---|
| FR-STORY-01 one persistent stage | `story-runtime-acceptance.spec.ts` → “FR-STORY-01/02/03/04/14 one controller runs both story configs…”; `story-runtime.spec.ts` → “the stage stays pinned…” | PASS |
| FR-STORY-02 stable ids and deep links | `story-runtime-acceptance.spec.ts` → FR-01/02/03/04/14 test; “FR-STORY-16 deep link, forward scroll…” | PASS |
| FR-STORY-03 scroll updates chapter and scene | `story-runtime-acceptance.spec.ts` → FR-01/02/03/04/14 test; `story-runtime.spec.ts` → “four chapters scroll…” | PASS |
| FR-STORY-04 progress rail | `story-runtime-acceptance.spec.ts` → FR-01/02/03/04/14 test; `story-runtime.spec.ts` → “progress rail reflects…” | PASS |
| FR-STORY-05 pause/resume simulation and camera | `story-runtime-acceptance.spec.ts` → “FR-STORY-05 pause freezes simulation and rendering…” | PASS |
| FR-STORY-06 replay current chapter | `story-runtime-acceptance.spec.ts` → “FR-STORY-06 replay restarts…” | PASS |
| FR-STORY-07 four speeds | `story-runtime-acceptance.spec.ts` → “FR-STORY-07 every speed option…” | PASS |
| FR-STORY-08 offscreen/hidden pause | `story-runtime-acceptance.spec.ts` → “FR-STORY-08 offscreen and hidden…” | PASS |
| FR-STORY-09 article mode | `motion-article.spec.ts` → “article mode removes the stage…” and “article mode has no serious…”; `story-runtime-acceptance.spec.ts` → FR-STORY-13 widths test | PASS |
| FR-STORY-10 reduced motion | `motion-article.spec.ts` → “starts paused…”, “scene step controls…”, “manual motion preference…”; `story-runtime-acceptance.spec.ts` → FR-STORY-20 preferences | PASS |
| FR-STORY-11 native scrolling | `scroll.spec.ts` → document scroller, PageDown/arrows/Home/End, back/forward | PASS |
| FR-STORY-12 fast forward/reverse settles | `story-runtime-acceptance.spec.ts` → “FR-STORY-12 fast forward and reverse…” | PASS |
| FR-STORY-13 resize and DPR | `story-runtime-acceptance.spec.ts` → “FR-STORY-13 runtime flows at 360 px and 1440 px…”; `canvas-stage.spec.ts` → CSS × DPR and high-density cap | PASS |
| FR-STORY-14 keyboard play/pause and chapter nav | `controls.spec.ts` → Space/arrow/Escape/Tab tests; `story-runtime.spec.ts` → rail keyboard test | PASS |
| FR-STORY-15 share restores chapter/seed/params and discloses local edits | `story-runtime-acceptance.spec.ts` → “FR-STORY-15/16 a shared mid-run URL…”; `url-state.spec.ts` → share button | PASS |
| FR-STORY-16 URL restore and clamping | `story-runtime-acceptance.spec.ts` → FR-STORY-15/16 and FR-STORY-16 convergence; `url-state.spec.ts` → valid/invalid URL tests | PASS |
| FR-STORY-17 no uncaught errors | Every browser test attaches `console` error and `pageerror` listeners; all end with `expect(errors).toEqual([])` | PASS |
| FR-STORY-18 no-JS article | `no-js.spec.ts` → both development stories, prose/formula/figure/citation, no stage | PASS |
| FR-STORY-19 navigation disposal | `story-runtime-acceptance.spec.ts` → “FR-STORY-19 ten round-trips…”; `story-runtime.spec.ts` → teardown; `scroll.spec.ts` → ten navigations | PASS |
| FR-STORY-20 preference persistence (SHOULD) | `story-runtime-acceptance.spec.ts` → “FR-STORY-20 article mode and reduced-motion…”; `motion-article.spec.ts` → persistence tests | PASS |

## Convergence evidence

`FR-STORY-16 deep link, forward scroll, reverse scroll, and reload converge…`
compares the full entry record (`chapter`, `scene`, `seed`, structural
parameters, presentation params, `steps: 0`, simulated seconds, keyframe) from
four entry paths. The records must be deeply equal. `FR-STORY-15/16 a shared
mid-run URL…` additionally takes a share mid-run and proves the copied URL
reopens at the same starting entry.

## Screen capture

`scripts/capture-runtime.mjs` (also `pnpm capture:runtime`) starts the preview,
records about 14 seconds of `/dev/story-smoke` at 1440×900 through scroll,
pause/resume, 2× speed, article mode, and share, and writes:

```text
test-results/design-review/story-runtime-review.webm
```

`test-results/` is ignored; the capture is a review artifact, not a committed
binary.
