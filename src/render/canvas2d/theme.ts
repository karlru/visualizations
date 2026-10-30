/**
 * Canvas colour theme — the drawing-side mirror of `styles/tokens.css`.
 *
 * There is deliberately no second palette in this file. Every colour is read
 * from the live CSS custom property, so changing a token changes the canvas on
 * the next mount without a code edit. `CANVAS_THEME_TOKENS` is the documented
 * mapping; `themeFromStyle` is separated from `readCanvasTheme` so the mapping
 * can be unit-tested with a stub style declaration.
 *
 * `readCanvasTheme` may only run in a browser (renderer `mount`), never at
 * module scope or during static generation.
 */

/** Typed canvas palette. Values are CSS colour strings. */
export interface CanvasTheme {
  /** Paper background and paper-side ink, for light surfaces drawn on canvas. */
  readonly paper: string;
  readonly paperRaised: string;
  readonly ink: string;
  readonly muted: string;
  /** Stage background and its raised/inset variants. */
  readonly stage: string;
  readonly stageRaised: string;
  readonly stageInset: string;
  /** Ink and muted text on the stage. */
  readonly stageInk: string;
  readonly stageMuted: string;
  /** Editorial accent, warm amber, and cool data highlight. */
  readonly accent: string;
  readonly amber: string;
  readonly cool: string;
  /** Hairline rule on the stage. */
  readonly rule: string;
  readonly focus: string;
}

/**
 * Canvas theme key → CSS custom property. Keep this table in sync with
 * `tokens.css`; `tests/unit/canvas2d.test.ts` checks every key is mapped and
 * every mapped property exists in `tokens.css`.
 */
export const CANVAS_THEME_TOKENS: Readonly<Record<keyof CanvasTheme, string>> = {
  paper: '--color-paper',
  paperRaised: '--color-paper-raised',
  ink: '--color-ink',
  muted: '--color-paper-muted',
  stage: '--color-stage',
  stageRaised: '--color-stage-raised',
  stageInset: '--color-stage-inset',
  stageInk: '--color-stage-ink',
  stageMuted: '--color-stage-muted',
  accent: '--color-accent-stage',
  amber: '--color-amber',
  cool: '--color-cool',
  rule: '--color-rule-stage',
  focus: '--color-focus',
} as const;

/** The subset of `CSSStyleDeclaration` used by the theme reader. */
export interface ThemeStyleSource {
  getPropertyValue(property: string): string;
}

/**
 * Build a theme from any style-like source. Missing custom properties throw:
 * a canvas with silently wrong colours is worse than a visible mount error that
 * the host can report and replace with its fallback content.
 */
export function themeFromStyle(style: ThemeStyleSource): CanvasTheme {
  const read = (property: string): string => {
    const value = style.getPropertyValue(property).trim();
    if (value.length === 0) {
      throw new Error(`Canvas theme token ${property} is empty. Load tokens.css before mounting.`);
    }
    return value;
  };

  return {
    paper: read(CANVAS_THEME_TOKENS.paper),
    paperRaised: read(CANVAS_THEME_TOKENS.paperRaised),
    ink: read(CANVAS_THEME_TOKENS.ink),
    muted: read(CANVAS_THEME_TOKENS.muted),
    stage: read(CANVAS_THEME_TOKENS.stage),
    stageRaised: read(CANVAS_THEME_TOKENS.stageRaised),
    stageInset: read(CANVAS_THEME_TOKENS.stageInset),
    stageInk: read(CANVAS_THEME_TOKENS.stageInk),
    stageMuted: read(CANVAS_THEME_TOKENS.stageMuted),
    accent: read(CANVAS_THEME_TOKENS.accent),
    amber: read(CANVAS_THEME_TOKENS.amber),
    cool: read(CANVAS_THEME_TOKENS.cool),
    rule: read(CANVAS_THEME_TOKENS.rule),
    focus: read(CANVAS_THEME_TOKENS.focus),
  };
}

/**
 * Read the palette from a live element (normally the stage container).
 * Browser-only: call from `mount`, not at import time.
 */
export function readCanvasTheme(element?: Element): CanvasTheme {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    throw new Error('readCanvasTheme requires a browser DOM. Call it inside mount().');
  }

  const source = element ?? document.documentElement;
  return themeFromStyle(getComputedStyle(source));
}
