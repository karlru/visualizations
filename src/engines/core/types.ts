/**
 * Core simulation contracts and shared primitives.
 *
 * Engines are pure TypeScript. They must not import DOM APIs, Svelte, Astro,
 * Three.js, renderers, components, or story configurations. `tests/unit/
 * import-boundaries.test.ts` enforces that rule. Keeping engines pure lets the
 * same code run in the browser, in Node (unit tests and build-time figures),
 * and in a Web Worker without changes.
 *
 * All time values are simulated seconds. The clock in `engines/core/clock.ts`
 * owns wall-clock time and calls `step` with a fixed substep; scroll position
 * never reaches an engine directly.
 */

/** A point in two-dimensional scene space. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A point or direction in three-dimensional world space. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A reproducible integer seed. The same seed always identifies the same run. */
export type Seed = number;

/**
 * Renderer quality tier. Quality affects presentation cost (DPR, point counts,
 * antialiasing), never simulation mathematics.
 */
export type QualityTier = 'low' | 'medium' | 'high';

/**
 * A simulation engine.
 *
 * @typeParam P - The story's parameter object. Concrete and fully typed at use
 *   sites; it is never `unknown` or `any`.
 * @typeParam S - The render snapshot type. A snapshot is a cheap, read-only
 *   view of simulation state intended for one frame. Snapshots may reuse
 *   buffers or objects and consumers must not mutate them.
 * @typeParam M - The metrics type. Metrics are low-frequency UI values, not
 *   per-frame drawing data, and may allocate.
 */
export interface Engine<P extends object, S, M> {
  /**
   * Restore the run's starting state: iteration zero, the initial seed, and
   * the parameters currently held by the engine. Does not change parameters.
   */
  reset(): void;

  /**
   * Apply a complete parameter object.
   *
   * A structural change (for example city count or generator identity) restarts
   * the run at iteration zero and invalidates derived history. A presentation
   * change applies immediately. The engine, not the UI, owns that distinction
   * and keeps parameter changes deterministic.
   */
  setParams(params: P): void;

  /**
   * Advance the simulation by one fixed substep.
   *
   * @param dtSeconds Simulated seconds for this substep. Callers must pass a
   *   non-negative finite value from the fixed-timestep clock. The engine does
   *   not read wall-clock time, so replay and tests stay deterministic.
   */
  step(dtSeconds: number): void;

  /**
   * Return a cheap, read-only view for rendering.
   *
   * Implementations should avoid copying a whole graph or point cloud every
   * frame. Repeated calls without an intervening `step` may return the same
   * object.
   */
  snapshot(): Readonly<S>;

  /**
   * Return low-frequency metrics for the HUD and live region.
   *
   * The story controller calls this at UI frequency (chapter change, pause, or
   * a milestone), not once per animation frame.
   */
  metrics(): Readonly<M>;
}
