<script lang="ts">
  /**
   * Reader-facing switch between the illustrated article and the stage.
   *
   * The server renders the article; this control only exists after the story
   * island hydrates. That means it never appears as a dead button without
   * JavaScript. A real `<button aria-pressed>` keeps the state, name, and
   * keyboard contract native, and the controller owns persistence.
   */

  interface Props {
    /** True when the article layout is active and the stage is removed. */
    readonly articleMode: boolean;
    readonly onToggle: () => void;
  }

  let { articleMode, onToggle }: Props = $props();
</script>

<div class="article-toggle" data-article-mode-toggle>
  <button
    type="button"
    class="article-toggle__button"
    data-testid="article-mode-toggle"
    aria-pressed={articleMode}
    onclick={onToggle}
  >
    {articleMode ? 'Show interactive stage' : 'Read as article'}
  </button>
  <p class="article-toggle__note" data-article-mode-note>
    {articleMode
      ? 'The stage is off. Every chapter, formula, figure, and citation is still here.'
      : 'Article mode removes the stage and keeps the complete written argument.'}
  </p>
</div>

<style>
  .article-toggle {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs) var(--space-md);
    align-items: center;
  }

  .article-toggle__button {
    min-block-size: var(--tap-target);
    min-inline-size: var(--tap-target);
    padding: var(--space-2xs) var(--space-sm);
    border: var(--hairline) solid var(--color-rule-paper);
    border-radius: var(--radius-sm);
    background-color: var(--color-paper-raised);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    cursor: pointer;
  }

  .article-toggle__button:hover {
    border-color: var(--color-accent-paper);
    color: var(--color-accent-paper);
  }

  .article-toggle__button:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .article-toggle__button[aria-pressed='true'] {
    border-color: var(--color-accent-paper);
    color: var(--color-accent-paper);
  }

  .article-toggle__note {
    margin: 0;
    color: var(--color-paper-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }
</style>
