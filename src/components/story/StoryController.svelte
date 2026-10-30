<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    type ScrollChapterEvent,
    ScrollDirector,
    type ScrollDirectorDebugState,
  } from '../../lib/scroll-director';

  interface Props {
    /** CSS selector for chapter elements. One director owns every match. */
    chapterSelector?: string;
    /** Render the development overlay. `?scroll-debug=1` also enables it. */
    debug?: boolean;
  }

  let { chapterSelector = '[data-story-chapter]', debug = false }: Props = $props();

  let activeChapterId = $state<string | null>(null);
  let activeProgress = $state(0);
  let lastEvent = $state('');
  let status = $state<'pending' | 'ready' | 'destroyed'>('pending');
  let debugEnabled = $state(debug);
  let lenisState = $state('off');
  let progressLabel = $derived(activeProgress.toFixed(3));

  let director: ScrollDirector | null = null;
  let mounted = false;

  /**
   * The debug overlay is opt-in only: a `debug` prop on the island, or
   * `?scroll-debug=1` / `?debug=1` for a local or Playwright session. Story
   * pages never pass the prop, so production readers do not get the overlay.
   */
  const applyDebugFlag = (): void => {
    const params = new URLSearchParams(window.location.search);
    debugEnabled =
      debug || params.get('scroll-debug') === '1' || params.get('debug') === '1';
  };

  const syncLenisState = (state: ScrollDirectorDebugState): void => {
    lenisState = state.lenis.enabled ? 'on' : state.lenis.reason;
  };

  const report = (kind: 'enter' | 'progress' | 'exit') => (event: ScrollChapterEvent): void => {
    if (!mounted) return;
    activeChapterId = event.id;
    activeProgress = event.progress;
    lastEvent = kind;
  };

  const cleanup = (): void => {
    if (!mounted && !director) return;
    mounted = false;

    const instance = director;
    director = null;
    instance?.destroy();

    if (window.__scrollDirector === instance) {
      delete window.__scrollDirector;
      delete window.__scrollDirectorDebug;
    }

    document.removeEventListener('astro:before-swap', handleBeforeSwap);
    window.removeEventListener('pagehide', handlePageHide);

    status = 'destroyed';
    const root = document.documentElement;
    if (root.dataset.scrollController === 'ready') {
      delete root.dataset.scrollController;
    }
  };

  const handleBeforeSwap = (): void => {
    cleanup();
  };

  const handlePageHide = (): void => {
    cleanup();
  };

  onMount(() => {
    mounted = true;
    applyDebugFlag();

    // A second controller on the same page must not leave a second trigger set.
    window.__scrollDirector?.destroy();
    window.__scrollDirectorMounts = (window.__scrollDirectorMounts ?? 0) + 1;

    const instance = new ScrollDirector({
      onEnter: report('enter'),
      onProgress: report('progress'),
      onExit: report('exit'),
      onActiveChange: (change) => {
        if (!mounted) return;
        activeChapterId = change.id;
        activeProgress = change.progress;
      },
    });
    director = instance;

    const elements = Array.from(document.querySelectorAll<HTMLElement>(chapterSelector));
    for (const element of elements) {
      const spec = {
        ...(element.dataset.scrollStart ? { start: element.dataset.scrollStart } : {}),
        ...(element.dataset.scrollEnd ? { end: element.dataset.scrollEnd } : {}),
      };
      instance.registerChapter(element, spec);
    }

    instance.refresh();
    syncLenisState(instance.debugState());

    window.__scrollDirector = instance;
    window.__scrollDirectorDebug = () => instance.debugState();
    document.documentElement.dataset.scrollController = 'ready';

    // Late font swaps change chapter heights. Re-measure once they settle.
    // There is deliberately no separate RAF loop: the GSAP ticker is the only
    // animation driver, and Lenis advances from that ticker.
    void document.fonts.ready.then(() => {
      if (mounted) {
        instance.refresh();
        syncLenisState(instance.debugState());
      }
    });

    document.addEventListener('astro:before-swap', handleBeforeSwap);
    window.addEventListener('pagehide', handlePageHide);

    status = 'ready';

    return cleanup;
  });

  onDestroy(cleanup);
</script>

<div
  class="story-controller"
  data-story-controller={status}
  data-active-chapter={activeChapterId ?? undefined}
  data-scroll-progress={progressLabel}
  data-scroll-event={lastEvent || undefined}
  data-lenis-state={lenisState}
>
  {#if debugEnabled}
    <aside class="scroll-debug" data-scroll-debug aria-hidden="true">
      <p class="scroll-debug__row">
        <span class="scroll-debug__label">chapter</span>
        <code class="scroll-debug__value" data-scroll-active>{activeChapterId ?? '—'}</code>
      </p>
      <p class="scroll-debug__row">
        <span class="scroll-debug__label">progress</span>
        <code class="scroll-debug__value" data-scroll-progress-label>{progressLabel}</code>
      </p>
      <div class="scroll-debug__track">
        <span class="scroll-debug__bar" style:transform={`scaleX(${activeProgress})`}></span>
      </div>
      <p class="scroll-debug__row">
        <span class="scroll-debug__label">lenis</span>
        <code class="scroll-debug__value" data-scroll-lenis>{lenisState}</code>
      </p>
      <p class="scroll-debug__row">
        <span class="scroll-debug__label">event</span>
        <code class="scroll-debug__value" data-scroll-event-label>{lastEvent || '—'}</code>
      </p>
    </aside>
  {/if}
</div>
