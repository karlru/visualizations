/**
 * Canonical Ant System formulas from `docs/stories.md` §2.7.
 *
 * The TeX lives here rather than inline in the MDX so the formulas are plain
 * data: unit tests can assert the documented transition, deposit, and update
 * rules, and the MDX only composes a labelled `<Math>` block around them.
 *
 * Rendering is build-time only (`Math.astro` calls `katex.renderToString` with
 * `throwOnError`), so a malformed expression fails `pnpm build` instead of
 * shipping broken math. There is no runtime math library.
 */

/** Transition probability, with the inverse-distance definition of η. */
export const ACO_TRANSITION_TEX = String.raw`p_{ij} = \frac{\tau_{ij}^{\alpha}\,\eta_{ij}^{\beta}}{\sum_{l \in \mathrm{allowed}} \tau_{il}^{\alpha}\,\eta_{il}^{\beta}}, \qquad \eta_{ij} = \frac{1}{d_{ij}}`;

/**
 * Deposit for one ant. `Q` is the engine's fixed constant `1` in release 1, so
 * the formula stays symbolic and is never a lab or URL parameter.
 */
export const ACO_DEPOSIT_TEX = String.raw`\Delta\tau_{ij}^{k} = \begin{cases} \frac{Q}{L_k} & \text{if edge } (i,j) \text{ is in ant } k\text{'s tour}, \\[0.4em] 0 & \text{otherwise.} \end{cases}`;

/** Evaporate first, then add every ant's deposit. */
export const ACO_UPDATE_TEX = String.raw`\tau_{ij} \leftarrow (1-\rho)\,\tau_{ij} + \sum_{k} \Delta\tau_{ij}^{k}`;

/** Human-readable labels used by the visible formula captions. */
export const ACO_FORMULA_LABELS = Object.freeze({
  transition: 'Transition probability',
  deposit: 'Deposit for one ant',
  update: 'Evaporation and update',
});
