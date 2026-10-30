<script lang="ts">
  /**
   * Generic city-handle overlay for the stage.
   *
   * The shell passes world-space points and two renderer-backed projection
   * callbacks; this component never knows whether those points are cities,
   * nodes, or something else. Pointer drags use the live camera to unproject
   * client coordinates, and every handle is a focusable button with arrow-key
   * nudging, so the map editor is usable without a drag gesture.
   *
   * On coarse pointers, dragging is opt-in: when `editMode` is off the handles
   * keep native vertical page scrolling, and only the explicit Edit map mode
   * captures the drag with `touch-action: none`.
   */

  import type { StoryMapPoint } from '../../stories/runtime';

  interface Props {
    readonly points: readonly StoryMapPoint[];
    readonly selected: number | null;
    /** Coarse-pointer edit mode. Fine pointers may always drag. */
    readonly editMode: boolean;
    readonly coarse: boolean;
    /** World-space distance for one arrow-key nudge. */
    readonly nudgeStep: number;
    /** Bumped by the host whenever the camera or stage geometry changes. */
    readonly revision: number;
    readonly project: (x: number, y: number) => StoryMapPoint | null;
    readonly unproject: (clientX: number, clientY: number) => StoryMapPoint | null;
    readonly onSelect: (index: number) => void;
    readonly onMove: (index: number, point: StoryMapPoint) => void;
    readonly onNudge: (index: number, dx: number, dy: number) => void;
  }

  let {
    points,
    selected,
    editMode,
    coarse,
    nudgeStep,
    revision,
    project,
    unproject,
    onSelect,
    onMove,
    onNudge,
  }: Props = $props();

  let draggingIndex = -1;
  let dragPointerId = -1;

  let positions = $derived.by(() => {
    // Reading `revision` registers the camera/stage update as a dependency even
    // when the point list itself is unchanged.
    void revision;
    return points.map((point, index) => ({
      index,
      point,
      screen: project(point.x, point.y),
    }));
  });

  let dragEnabled = $derived(editMode);

  function handlePointerDown(event: PointerEvent, index: number): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!dragEnabled) return;

    event.preventDefault();
    event.stopPropagation();
    draggingIndex = index;
    dragPointerId = event.pointerId;
    onSelect(index);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers may not be capturable; the drag still works while
      // the pointer stays over the handle.
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (draggingIndex < 0 || event.pointerId !== dragPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = unproject(event.clientX, event.clientY);
    if (point !== null) onMove(draggingIndex, point);
  }

  function handlePointerUp(event: PointerEvent): void {
    if (draggingIndex < 0) return;
    draggingIndex = -1;
    dragPointerId = -1;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released.
    }
  }

  function handleKeydown(event: KeyboardEvent, index: number): void {
    const step = nudgeStep * (event.shiftKey ? 5 : 1);
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        onNudge(index, step, 0);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        onNudge(index, -step, 0);
        return;
      case 'ArrowUp':
        event.preventDefault();
        onNudge(index, 0, step);
        return;
      case 'ArrowDown':
        event.preventDefault();
        onNudge(index, 0, -step);
        return;
      default:
        return;
    }
  }
</script>

<div
  class="map-overlay"
  data-story-map
  data-map-editing={editMode ? 'true' : 'false'}
  data-map-coarse={coarse ? 'true' : 'false'}
>
  {#if editMode}
    {#each positions as entry (entry.index)}
      {#if entry.screen}
        <button
          type="button"
          class="map-overlay__handle"
          class:map-overlay__handle--selected={selected === entry.index}
          data-city-handle
          data-city-index={entry.index}
          data-city-x={entry.point.x.toFixed(6)}
          data-city-y={entry.point.y.toFixed(6)}
          style:transform={`translate3d(${entry.screen.x}px, ${entry.screen.y}px, 0) translate(-50%, -50%)`}
          style:touch-action={dragEnabled ? 'none' : 'auto'}
          aria-label={`City ${entry.index + 1}. Use arrow keys to move it, or drag it.`}
          aria-pressed={selected === entry.index}
          onpointerdown={(event) => handlePointerDown(event, entry.index)}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
          onpointercancel={handlePointerUp}
          onlostpointercapture={handlePointerUp}
          onkeydown={(event) => handleKeydown(event, entry.index)}
          onclick={() => onSelect(entry.index)}
        >
          <span class="map-overlay__dot" aria-hidden="true"></span>
          <span class="map-overlay__index" aria-hidden="true">{entry.index + 1}</span>
        </button>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .map-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    overflow: hidden;
    pointer-events: none;
  }

  .map-overlay__handle {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    display: grid;
    place-items: center;
    inline-size: var(--tap-target);
    block-size: var(--tap-target);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-stage-ink);
    cursor: grab;
    pointer-events: auto;
  }

  .map-overlay__handle:active {
    cursor: grabbing;
  }

  .map-overlay__dot {
    position: absolute;
    inline-size: 0.85rem;
    block-size: 0.85rem;
    border: var(--hairline) solid var(--color-stage-ink);
    border-radius: var(--radius-pill);
    background-color: color-mix(in srgb, var(--color-stage) 65%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-stage) 55%, transparent);
    transition: border-color var(--duration-quick) var(--ease-out);
  }

  .map-overlay__index {
    position: relative;
    z-index: 1;
    color: var(--color-accent-stage);
    font-family: var(--font-mono);
    font-size: 0.55rem;
    font-weight: var(--weight-semibold);
    line-height: 1;
    pointer-events: none;
  }

  .map-overlay__handle--selected .map-overlay__dot {
    border-color: var(--color-accent-stage);
  }

  .map-overlay__handle:hover .map-overlay__dot,
  .map-overlay__handle:focus-visible .map-overlay__dot {
    border-color: var(--color-accent-stage);
  }

  .map-overlay__handle:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
    border-radius: var(--radius-pill);
  }

  .map-overlay__handle--selected {
    border-radius: var(--radius-pill);
    box-shadow: inset 0 0 0 2px var(--color-accent-stage);
  }

  @media (prefers-reduced-motion: reduce) {
    .map-overlay__dot {
      transition: none;
    }
  }
</style>
