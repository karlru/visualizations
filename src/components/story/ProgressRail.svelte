<script lang="ts">
  import type { RailChapterInfo } from '../../lib/chapter-metadata';

  interface Props {
    /** Chapters in document order. */
    chapters: readonly RailChapterInfo[];
    /** Active chapter id, or null before hydration. */
    activeId: string | null;
    /** Progress through the active chapter, in [0, 1]. */
    progress: number;
    /** Zero-based index of the active chapter; -1 when none is active. */
    activeIndex: number;
    /** Navigate to a chapter. When omitted, the anchor's default navigation runs. */
    onNavigate?: (id: string) => void;
  }

  let { chapters, activeId, progress, activeIndex, onNavigate }: Props = $props();

  let nav: HTMLElement | null = null;

  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

  let overallProgress = $derived(
    chapters.length === 0 || activeIndex < 0
      ? 0
      : clamp01((activeIndex + clamp01(progress)) / chapters.length),
  );
  let percent = $derived(Math.round(overallProgress * 100));

  function links(): HTMLAnchorElement[] {
    if (nav === null) return [];
    return Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[data-chapter-link]'));
  }

  function handleKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (
      key !== 'ArrowDown' &&
      key !== 'ArrowRight' &&
      key !== 'ArrowUp' &&
      key !== 'ArrowLeft' &&
      key !== 'Home' &&
      key !== 'End'
    ) {
      return;
    }

    const items = links();
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    const start = Math.max(current, 0);
    let next = start;

    if (key === 'Home') next = 0;
    else if (key === 'End') next = items.length - 1;
    else if (key === 'ArrowDown' || key === 'ArrowRight') next = (start + 1) % items.length;
    else next = (start - 1 + items.length) % items.length;

    event.preventDefault();
    items[next]?.focus();
  }

  function handleClick(event: MouseEvent, id: string): void {
    if (onNavigate === undefined) return;
    event.preventDefault();
    onNavigate(id);
  }

  function formatNumber(value: number): string {
    return String(value).padStart(2, '0');
  }
</script>

<nav
  bind:this={nav}
  class="story-rail"
  aria-label="Chapters"
  data-progress-rail
  data-active-chapter={activeId ?? undefined}
  data-rail-progress={overallProgress.toFixed(4)}
  onkeydown={handleKeydown}
>
  <div class="story-rail__head">
    <p class="story-rail__label">Chapters</p>
    <p class="story-rail__count data" aria-hidden="true">
      {activeIndex < 0 ? '—' : formatNumber(activeIndex + 1)} / {formatNumber(chapters.length)}
    </p>
  </div>

  <div
    class="story-rail__track"
    role="progressbar"
    aria-label="Story progress"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={percent}
    aria-valuetext={`${percent}% of the story`}
  >
    <span class="story-rail__bar" style:transform={`scaleX(${overallProgress})`}></span>
  </div>

  <ol class="story-rail__list">
    {#each chapters as chapter, index (chapter.id)}
      <li class="story-rail__item">
        <a
          class="story-rail__link"
          class:story-rail__link--active={chapter.id === activeId}
          href={`#${chapter.id}`}
          data-chapter-link={chapter.id}
          aria-current={chapter.id === activeId ? 'location' : undefined}
          onclick={(event) => handleClick(event, chapter.id)}
        >
          <span class="story-rail__number data" aria-hidden="true">{formatNumber(index + 1)}</span>
          <span class="story-rail__title">{chapter.title}</span>
        </a>
      </li>
    {/each}
  </ol>
</nav>

<style>
  .story-rail {
    display: grid;
    gap: var(--space-2xs);
    margin-block-end: var(--space-xs);
  }

  .story-rail__head {
    display: flex;
    gap: var(--space-sm);
    align-items: baseline;
    justify-content: space-between;
  }

  .story-rail__label,
  .story-rail__count {
    margin: 0;
    color: var(--color-paper-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .story-rail__track {
    block-size: var(--space-3xs);
    overflow: hidden;
    border-radius: var(--radius-pill);
    background-color: var(--color-rule-paper);
  }

  .story-rail__bar {
    display: block;
    block-size: 100%;
    inline-size: 100%;
    background-color: var(--color-accent-paper);
    transform-origin: left center;
    transition: transform var(--duration-instant) linear;
  }

  .story-rail__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs) var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .story-rail__item {
    min-inline-size: 0;
  }

  .story-rail__link {
    display: inline-flex;
    gap: var(--space-3xs);
    align-items: baseline;
    min-block-size: var(--tap-target);
    padding-block: var(--space-2xs);
    border-block-end: var(--rule-strong) solid transparent;
    color: var(--color-paper-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    text-decoration: none;
    transition:
      color var(--duration-quick) var(--ease-out),
      border-color var(--duration-quick) var(--ease-out);
  }

  .story-rail__link:hover {
    color: var(--color-ink);
  }

  .story-rail__link--active {
    border-block-end-color: var(--color-accent-paper);
    color: var(--color-ink);
  }

  .story-rail__number {
    color: var(--color-paper-muted);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
  }

  .story-rail__link--active .story-rail__number {
    color: var(--color-accent-paper);
  }

  @media (max-width: 40rem) {
    .story-rail__list {
      gap: var(--space-3xs) var(--space-xs);
    }

    .story-rail__link {
      font-size: var(--text-xs);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .story-rail__bar,
    .story-rail__link {
      transition: none;
    }
  }
</style>
