# Stories

See the [README](../README.md) for the project overview and the other documentation files.

This document is the catalog of visual essays the site can display. The first public release contains exactly two:

1. **Ant Colony Optimization** — 2D.
2. **LCG / RANDU** — 3D.

Everything else is a future story and is not part of the initial release.

Each story follows the same shell, the same accessibility requirements, and the same definition of done. The detailed outlines below are the source of truth for the content and interaction design.

## 1. Story template

Every story has:

| Field | Meaning |
|---|---|
| **Title** | The public title. |
| **Slug** | The URL segment under `/stories/`. |
| **Dek** | One sentence that promises the argument. |
| **Category** | Optimization, Randomness, Graphs, Emergence, Physics, Generative, or Data. |
| **Visual mode** | `2d`, `3d`, or `mixed`; a 3D story also declares its fallback (`2d`). |
| **Difficulty** | Introductory, intermediate, or advanced; an optional note may describe a range. |
| **Prerequisites** | Concepts the reader should know. |
| **Learning objectives** | Three to eight concrete things the reader should be able to explain afterward. |
| **Chapters** | The narrative beats, each with a scene and a visual state. |
| **Layers** | The visual elements that can be composed on the stage. |
| **Interactions** | Parameters, presets, and direct manipulation. |
| **Metrics** | The numbers shown to make the behavior legible. |
| **Math and pseudocode** | The formal explanation. |
| **Edge cases** | Inputs that must not break the story. |
| **Accessibility fallback** | The non-visual and non-motion path. |
| **Acceptance criteria** | The story-specific checks. |
| **References** | Sources for the claims. |

### 1.1 Chapter shape

A chapter is short. It contains:

- A heading.
- One to three paragraphs of prose.
- A visual state: camera, visible layers, parameters, annotations.
- Optionally a formula, pseudocode highlight, callout, or predict-then-reveal prompt.

The rule is **one idea per screen**. If a chapter needs two ideas, split it.

### 1.2 Shared interaction patterns

- **Predict, then reveal:** ask the reader what will happen before changing a parameter, then reveal the result and explain it.
- **Preset comparison:** named parameter sets that demonstrate a specific behavior.
- **Seed control:** the same seed reproduces the same run; a new seed produces a new run.
- **Free-play lab:** all controls available, with reset and share.
- **Article mode:** the complete story as prose, without the stage.
- **Guided tour:** an automatic animation that can be paused, replayed, and interrupted.

## 2. Initial story: Ant Colony Optimization

### 2.1 Metadata

| Field | Value |
|---|---|
| **Title** | The Colony That Finds a Short Route |
| **Slug** | `ant-colony-optimization` |
| **Category** | Optimization |
| **Visual mode** | `2d` |
| **Difficulty** | Intermediate |
| **Difficulty note** | Starts at introductory level; assumes basic graphs and probability |
| **Length** | Long-form, ten chapters including the lab |
| **Prerequisites** | Basic graphs, distance, and probability |
| **Status** | Initial release |

**Dek:** A colony has no leader and no map. Yet, through pheromones and local decisions, it can find short routes through a set of cities.

### 2.2 Learning objectives

By the end, the reader should be able to:

1. Explain the traveling salesman problem and why it is hard.
2. Describe how one ant constructs a tour using pheromone and distance.
3. Explain the transition probability formula and the roles of `α` and `β`.
4. Explain pheromone deposit and evaporation, and why forgetting matters.
5. Explain stigmergy: indirect communication through a shared environment.
6. Explain how positive feedback produces an emergent solution.
7. Predict how extreme parameter values change the colony's behavior.
8. Name the limitations of Ant System and the situations where it is useful.

### 2.3 Chapters

| # | Chapter | Scene | Key idea |
|---|---|---|---|
| 1 | **The colony** | Overview of a city map; a single ant wanders; then a colony appears | Many simple agents can outperform one clever agent. |
| 2 | **The problem** | Cities connected by faint edges; a candidate tour is drawn | The goal is a short tour that visits every city once and returns. |
| 3 | **One ant's choice** | Zoom to a focal city; probability fan over allowed next cities | An ant chooses probabilistically, biased by pheromone and distance. |
| 4 | **The probability rule** | Formula overlay; probability fan updates as `α` and `β` change | `τ^α` rewards experience; `η^β` rewards short edges. |
| 5 | **Leaving a trace** | Completed tours; pheromone deposits appear on used edges | Each ant deposits `Q/L_k` on every edge it used, so shorter tours deposit more per edge; the shared trail is stigmergy. |
| 6 | **Forgetting** | Pheromone fades on unused edges; the map changes | Evaporation prevents stale paths from dominating forever. |
| 7 | **Emergence** | Pull back; the best tour emerges; convergence chart appears | A short tour becomes a visible, reinforced path. |
| 8 | **Tuning the colony** | Preset comparison: balanced, greedy, stagnant, forgetful | Parameters trade exploration against exploitation. |
| 9 | **When it fails** | Local optimum example; dynamic city map | ACO is a heuristic, not a guarantee. |
| 10 | **The lab** | Full sandbox | The reader can build, run, and share their own colony. |

### 2.4 Visual layers

- **City graph:** nodes and faint candidate edges.
- **Pheromone trails:** edge width and opacity proportional to pheromone, on a readable scale.
- **Ants:** moving dots with short trails, interpolated along chosen edges.
- **Best tour:** a distinct accent path with its length, plus a pattern or weight difference so it does not rely on color alone.
- **Probability fan:** arcs or bars showing the focal ant's top N next-city probabilities (default N = 8) plus an explicit "other (Σ)" bucket, with a textual ranked alternative.
- **Convergence chart:** best and mean tour length over iterations.
- **Annotations:** DOM labels anchored to cities and edges.
- **HUD:** iteration, best length, mean length, normalized diversity/entropy, colony size.

### 2.5 Parameters and presets

| Parameter | Range | Default |
|---|---|---|
| Cities | 2–150 | 30 |
| Ants | 1–200 | 40 |
| `α` (pheromone weight) | 0–5 | 1 |
| `β` (distance weight) | 0–10 | 2 |
| `ρ` (evaporation) | 0–1 | 0.5 |
| `Q` (deposit constant) | fixed at 1 in release 1 | 1 |
| Speed | 0.5×, 1×, 2×, 4× | 1× |
| Seed | integer | 42 |

`Q` is an internal constant in release 1; it is not a lab control and is not encoded separately in the URL. Structural parameter changes restart the run at iteration 0; see `docs/requirements.md` §2.6.1.

| Preset | Intent | Values |
|---|---|---|
| **Balanced** | A readable, effective colony | `α = 1`, `β = 2`, `ρ = 0.5` |
| **Greedy** | Distance dominates; the colony becomes short-sighted | `α = 0.5`, `β = 8`, `ρ = 0.5` |
| **Stagnant** | Pheromone dominates; early paths lock in | `α = 5`, `β = 1`, `ρ = 0.1` |
| **Forgetful** | Evaporation is strong; trails keep resetting | `α = 1`, `β = 2`, `ρ = 0.95` |

### 2.6 Metrics

- Best tour length.
- Mean tour length.
- Iteration number.
- Normalized diversity/entropy of the pheromone distribution.
- Optional: improvement since the previous iteration, and the number of distinct tours.

The diversity metric is normalized Shannon entropy over the per-edge pheromone mass:

```text
p_e = τ_e / Σ_f τ_f
H = −Σ_e p_e · ln(p_e) / ln(E)
```

where `E` is the number of edges. `H` is in `[0, 1]`: uniform pheromone gives `1`, and all pheromone on one edge gives `0`. If the total pheromone is zero, `H` is `1` (maximally undifferentiated). The formula is unit-tested with known distributions.

### 2.7 Math and pseudocode

**Transition probability** from city `i` to an unvisited city `j`:

```text
p_ij = (τ_ij^α · η_ij^β) / Σ_{l ∈ allowed} (τ_il^α · η_il^β)
```

where `η_ij = 1 / d_ij`.

**Deposit** for ant `k`:

```text
Δτ_ij^k = Q / L_k   if edge (i, j) is in ant k's tour
Δτ_ij^k = 0         otherwise
```

**Update**:

```text
τ_ij ← (1 − ρ) · τ_ij + Σ_k Δτ_ij^k
```

**Pseudocode**

```text
initialize pheromone τ
repeat
  for each ant k:
    build a tour by sampling allowed next cities
      using τ^α · η^β
    compute tour length L_k
  evaporate pheromone by ρ
  deposit Q / L_k on each edge used by ant k
  update best tour
until stopping condition
```

The story should use **Ant System** for transparency. It may mention Ant Colony System and Max-Min Ant System as refinements, but it must not silently implement a different variant.

**Applications.** ACO is used for vehicle routing, network design, scheduling, and dynamic combinatorial problems where a good-enough solution is more useful than a guaranteed optimum. It is a heuristic: it does not guarantee the shortest tour.

### 2.8 Edge cases

- One ant.
- Two cities.
- All cities collinear.
- `α = 0`: pheromone ignored; behavior becomes distance-greedy.
- `β = 0`: distance ignored; behavior becomes pheromone-driven.
- `ρ = 1`: full evaporation before deposit; unused edges may reach zero. The engine keeps values non-negative and finite; the renderer maps zero to a minimum visible width.
- Very high `α` or very low `ρ`: stagnation.
- Fewer ants than cities: still valid; ants choose among unvisited cities.
- A city dragged onto another city: distance zero; clamp the distance and keep the engine finite. Any city edit pauses the run, restarts it at iteration 0, and invalidates best/mean history.
- All transition weights zero: choose uniformly among the allowed cities instead of dividing by zero.
- A city edit is local to the session and is not included in a share URL; the UI says so. The structural city count follows the edited count, so a share restores a seeded map with that count rather than the edited coordinates.

### 2.9 Accessibility fallback

- Article mode includes the full explanation, formulas, and a static best-tour figure generated at build time.
- A text summary states the current best tour length and iteration.
- Metrics are exposed in a polite live region at a low frequency.
- Layer meaning is not encoded by color alone; the best tour uses a distinct pattern/weight.
- The probability fan has a required textual alternative: a ranked list of next-city probabilities, including the "other" bucket.
- Reduced motion replaces ant animation with discrete iteration steps.

### 2.10 Acceptance criteria

- [ ] All ten chapters exist.
- [ ] Every chapter has a scene and a coherent visual state.
- [ ] The probability fan shows normalized probabilities.
- [ ] The best tour is distinct and its length is correct.
- [ ] The convergence chart shows best and mean length.
- [ ] All four presets apply and produce visibly different behavior.
- [ ] City dragging, adding, removing, and reset work.
- [ ] The lab includes all controls, seed, reset, and share.
- [ ] Article mode is complete.
- [ ] Reduced motion works.
- [ ] Applications and limitations sections are present.
- [ ] Key terms are defined in a glossary or inline.
- [ ] At least one predict-then-reveal interaction exists.
- [ ] At least three citations resolve.
- [ ] The ACO invariants in `docs/requirements.md` pass.
- [ ] The story passes accessibility, mobile, and performance checks.

### 2.11 References

- Dorigo, M., Maniezzo, V., & Colorni, A. (1996). *Ant System: Optimization by a colony of cooperating agents.* IEEE Transactions on Systems, Man, and Cybernetics, 26(1), 29–41. https://doi.org/10.1109/3477.484436
- Dorigo, M., & Stützle, T. (2004). *Ant Colony Optimization.* MIT Press. https://mitpress.mit.edu/9780262042192/ant-colony-optimization/
- Stützle, T., & Hoos, H. H. (2000). *MAX–MIN Ant System.* Future Generation Computer Systems, 16(8), 889–914. https://doi.org/10.1016/S0167-739X(00)00043-1
- TSPLIB benchmark library: https://comopt.ifi.uni-heidelberg.de/software/TSPLIB95/

## 3. Initial story: LCG / RANDU

### 3.1 Metadata

| Field | Value |
|---|---|
| **Title** | Fifteen Planes: How RANDU Broke Randomness |
| **Slug** | `randu-lcg` |
| **Category** | Randomness |
| **Visual mode** | `3d` |
| **Fallback** | `2d` projection plus text and data table |
| **Difficulty** | Intermediate |
| **Length** | Long-form, ten chapters including the lab |
| **Prerequisites** | Modular arithmetic, basic probability, comfort with 3D plots |
| **Status** | Initial release |

**Dek:** A generator used for years looked random in one dimension, plausible in two, and collapsed onto fifteen planes in three.

### 3.2 Learning objectives

By the end, the reader should be able to:

1. Explain how a linear congruential generator works.
2. Explain why parameter choice determines the quality of the output.
3. Derive RANDU's 3D plane relation from its multiplier and modulus.
4. Explain why 2D tests can miss a failure that 3D exposes.
5. Explain why the low bits of an LCG are especially weak.
6. Compare RANDU with a modern seeded PRNG.
7. Explain why high-dimensional testing matters for simulation.

### 3.3 Chapters

| # | Chapter | Scene | Key idea |
|---|---|---|---|
| 1 | **The generator that looked fine** | 1D strip of RANDU outputs | A sequence can look random without being random. |
| 2 | **The machine** | LCG formula and parameter panel; one-step animation | `x_{n+1} = (a·x_n + c) mod m` is simple and deterministic. |
| 3 | **Choosing parameters** | Preset selector; parameter changes; RANDU history note; period and full-period notes | Not every `a`, `c`, `m` is a good choice; RANDU's multiplier was chosen for speed on early hardware. |
| 4 | **The lowest bit** | Bit-plane strip over 64–128 outputs, or a table of bit periods | With an odd seed, bit 0 is constant and higher bits have short periods. |
| 5 | **Two dimensions** | 2D scatter of consecutive pairs | Lattice lines appear under inspection; 3D makes the failure unmistakable. |
| 6 | **Three dimensions** | 3D point cloud of consecutive triples; orbit | The structure becomes sheets, not a cloud. |
| 7 | **Fifteen planes** | Edge-on camera; 15 planes fade in | Every triple lies on one of 15 parallel planes. |
| 8 | **Why fifteen** | Derivation overlay; plane equation | `9x − 6y + z = k·2^31`, with `k = −5 … 9`. |
| 9 | **What good looks like** | Crossfade to a good PRNG cloud; Marsaglia's 1968 observation | Uniformity in 3D is the visual test RANDU fails. |
| 10 | **The lab** | Full sandbox | Choose parameters, compare generators, and inspect the lattice. |

### 3.4 The mathematics

**LCG:**

```text
x_{n+1} = (a · x_n + c) mod m
u_n = x_n / m
```

**RANDU:**

```text
a = 65539
c = 0
m = 2^31
seed is odd in the canonical preset
```

`65539 = 2^16 + 3`, which could be implemented with a shift and an add on early hardware. That speed advantage is part of why the multiplier was chosen.

RANDU is multiplicative (`c = 0`), so its period is **2²⁹ = 536,870,912** for an odd seed. The state space is `2³¹`, but only odd states are reachable from an odd seed.

**Full-period conditions (for `c ≠ 0`, Hull–Dobell):**

```text
c and m are coprime
a − 1 is divisible by every prime factor of m
a − 1 is divisible by 4 if m is divisible by 4
```

For `m = 2^k`, this reduces to `c` odd and `a ≡ 1 (mod 4)`. A full period is necessary but not sufficient for good statistical behavior. These conditions do not describe RANDU, because RANDU has `c = 0`; its period is 2²⁹ and still fails in three dimensions.

**Derivation:**

```text
65539² mod 2^31 = 393225 = 6·65539 − 9
x_{n+2} ≡ 6·x_{n+1} − 9·x_n  (mod 2^31)
9·x_n − 6·x_{n+1} + x_{n+2} ≡ 0  (mod 2^31)
```

Normalize to `[0, 1)`. Every triple `(u_n, u_{n+1}, u_{n+2})` lies on a plane:

```text
9u − 6v + w = k,   k = −5, −4, …, 9
```

That is 15 parallel planes with normal `(9, −6, 1)` and spacing `1/√118 ≈ 0.092` in the unit cube.

The exact implementation checks the relation on integer states: `9x_n − 6x_{n+1} + x_{n+2}` is an exact multiple of `2^31`. Never divide normalized floats by `2^31`.

**Low-bit failure:**

With an odd seed, every RANDU output is odd, so `x_n mod 2 = 1` for every `n`. The story shows this as a constant bit 0 plus the short periods of bits 1–5, not as a flat parity strip.

An even seed is accepted with a warning: it shortens the period, and some even seeds are degenerate. Seed `2³⁰` is a fixed point and produces one plane, not fifteen. The all-odd claim is conditional on an odd seed.

**Comparison:**

Use a modern seeded PRNG such as `xoshiro128**` or PCG32. Generate the same number of triples and show that the cloud fills the cube without the RANDU plane relation.

**Applications and caution.** LCGs are used in simple simulations, games, teaching, and legacy systems. Modern simulation should use a tested PRNG, and cryptographic randomness requires a cryptographically secure generator, never an LCG. RANDU matters because a simulation can silently inherit structure from its random source.

**Limitations of this visualization.** The 15-plane family is exact for RANDU. For arbitrary LCG parameters, the lab shows the point cloud and, where known, the plane structure; a full 3D spectral test is future work. The comparison PRNG is illustrative, not a certification. The story teaches why high-dimensional testing matters, not how to certify a generator.

### 3.5 Visual layers

- **Point cloud:** consecutive normalized triples, one point per triple.
- **Plane family:** 15 translucent planes with the correct normal and offsets, clipped to the unit cube.
- **Cube frame:** the `[0, 1]³` boundary.
- **Axes:** `x_n`, `x_{n+1}`, `x_{n+2}` with ticks.
- **Color by plane:** a sequential palette indexed by `k`, with a colorbar.
- **Comparison cloud:** a good PRNG in a contrasting color.
- **Labels:** projected DOM labels for axes, selected planes, and the plane equation.
- **HUD:** point count, distinct planes, maximum gap, low-bit result, preset name.

### 3.6 Guided animation

The guided tour is a single six-act sequence spanning chapters 6–9. Entering a chapter seeks to the corresponding act; replay restarts the current act. It is automatic on chapter entry and interruptible at any time.

| Act | Visual | Camera |
|---|---|---|
| 1 | Points appear progressively | Slow orbit around the cube |
| 2 | Planes fade in | 3/4 view |
| 3 | The sheets become lines | Tween to the edge-on view, perpendicular to the plane normal |
| 4 | Points colored by plane | Return to 3/4 view |
| 5 | Comparison cloud fades in | Same 3/4 view |
| 6 | Free exploration | Orbit controls enabled |

Camera pose definitions:

- **Plane normal:** `(9, −6, 1)`. Looking along this vector shows the planes face-on.
- **Edge-on:** perpendicular to the normal, for example `(6, 9, 0)`. Looking along this vector shows the planes as lines.
- **3/4, top, front:** standard views used for orientation and comparison.

Controls: pause/resume, replay, skip, resume after interaction, and step-by-step under reduced motion.

### 3.7 Parameters and presets

| Parameter | Range / values | Default |
|---|---|---|
| Preset | RANDU, MINSTD, ANSI C, Numerical Recipes, PCG32, `xoshiro128**` | RANDU |
| `a` | integer 1–`m−1`; LCG presets only | 65539 |
| `c` | integer 0–`m−1`; LCG presets only | 0 |
| `m` | integer 2–2⁵³; LCG presets only | 2^31 |
| Seed | integer; even seeds accepted with a warning | 1 |
| Point count | 0–100,000 rendered triples | 50,000 |
| Planes | on/off | on |
| Color by plane | on/off | on |
| Auto-rotate | on/off | on until interaction |
| Comparison | off/on | off |

The advanced panel shows `a/c/m` only for LCG presets. PCG32 and xoshiro128** expose their own seed/state controls internally and do not pretend to be LCGs. Fewer than 3 triples shows an explanatory empty state.

The exact preset constants, seeding schemes, and first-output fixtures are in `docs/technology.md` §3.22.

**Preset notes:**

- **RANDU:** the failure case.
- **MINSTD:** a classic multiplicative LCG; useful for comparison.
- **ANSI C:** common in older software; low bits are weak.
- **Numerical Recipes:** a better-known LCG; still not a modern default.
- **PCG32:** a modern general-purpose PRNG.
- **xoshiro128\*\***: a fast modern PRNG suitable for simulation.

### 3.8 Metrics

- Point count (rendered triples).
- Distinct plane count (computed from the data; not hardcoded).
- Maximum plane gap: the largest difference between consecutive occupied plane indices, reported in `k` units and optionally as physical spacing `1/√118`.
- Low-bit result (conditional on odd seed).
- Period for known presets or small moduli.
- Sample triples with their plane index.
- Optional: a note that arbitrary-parameter 3D spectral testing is not performed in the first release.
- The metrics match unit tests at a fixed seed and run length; they do not claim 15 occupied planes when the data shows fewer.

### 3.9 Edge cases

- Even seed for RANDU: accept with a warning that the period is shortened and the all-odd claim does not apply. Do not rewrite the seed. Seed `2³⁰` is a documented degenerate case (one plane).
- `m < 2`: validation error or clamp with a notice.
- `a < 1`: validation error or clamp with a notice.
- Fewer than 3 triples: no triples; show an explanatory empty state.
- `m` not a power of two: use exact integer arithmetic; use the fast path only when `a × (m − 1) + c ≤ 2^53`.
- Very large `a` or `m`: validate against the safe numeric range or use BigInt.
- `a = 0` or `a = 1`: short or trivial sequences; show a warning.
- `c ≠ 0`: the lattice relation changes; do not display the RANDU-specific 15-plane claim.
- WebGL2 unavailable: show the 2D fallback.

### 3.10 Accessibility fallback

- A 2D top projection and an edge-on projection, generated at build time for article/no-JS mode and available interactively when the stage is enhanced.
- A text summary: point count, distinct planes, maximum gap, and whether the low bit is constant.
- A sample data table of triples and plane indices.
- Camera preset buttons and zoom buttons so orbiting is not required.
- A pause control for the guided tour and camera motion.
- No dependence on color alone: planes are also visible as geometry, and the table encodes the plane index numerically.
- With JavaScript disabled, the prose, formulas, and static figures remain readable; no empty stage is shown.

### 3.11 Acceptance criteria

- [ ] All ten chapters exist.
- [ ] The 3D point cloud renders the normalized triples.
- [ ] The 15 planes are correct and align with the points.
- [ ] The edge-on view makes the planes read as lines.
- [ ] The guided tour plays, pauses, resumes, and replays.
- [ ] Grabbing the camera pauses the tour.
- [ ] All presets apply and regenerate the cloud.
- [ ] Advanced `a`, `c`, `m`, seed, and point-count controls work.
- [ ] The comparison PRNG produces a visibly uniform cloud.
- [ ] The metrics match unit tests at a fixed seed and run length; the plane count is computed, not hardcoded.
- [ ] The low-bit failure is demonstrated with a bit-plane strip or table, and the even-seed warning is shown.
- [ ] The 2D fallback, summary, and data table work without WebGL2.
- [ ] Reduced motion and article mode work.
- [ ] Applications and limitations sections are present.
- [ ] Key terms are defined in a glossary or inline.
- [ ] At least one predict-then-reveal interaction exists.
- [ ] At least three citations resolve.
- [ ] The RANDU invariants in `docs/requirements.md` pass.
- [ ] The story passes accessibility, mobile, and performance checks.

### 3.12 References

- Marsaglia, G. (1968). *Random numbers fall mainly in the planes.* Proceedings of the National Academy of Sciences, 61(1), 25–28. https://doi.org/10.1073/pnas.61.1.25
- IBM Scientific Subroutine Package (1968). *System/360 Scientific Subroutine Package, Version III, Programmer's Manual.* IBM. (RANDU documentation; cite the specific manual edition used.)
- Knuth, D. E. *The Art of Computer Programming, Volume 2: Seminumerical Algorithms.* Addison-Wesley. https://www-cs-faculty.stanford.edu/~knuth/taocp.html
- O'Neill, M. E. *PCG: A Family of Simple Fast Space-Efficient Statistically Good Algorithms for Random Number Generation.* https://www.pcg-random.org/pdf/hmc-cs-2014-0905.pdf
- Blackman, D., & Vigna, S. *xoshiro / xoroshiro generators.* https://prng.di.unimi.it/
- L'Ecuyer, P. *Random number generation* chapters in simulation handbooks. (Cite the specific handbook chapter and edition used.)

## 4. Future story backlog

These are candidates, not commitments. They are listed to show the range of the format and to keep the shared runtime honest. None are part of the first release.

| Story | Category | Visual | Core interaction | 3D? | Priority |
|---|---|---|---|---|---|
| **Monte Carlo: Getting Answers by Guessing** | Randomness | Dots in a square, running estimate, error chart | Sample rate, seed, stratified vs uniform | No | High |
| **Simulated Annealing: Learning to Accept Bad News** | Optimization | Energy landscape and moving state | Temperature schedule, cooling rate, accept/reject | Optional surface | High |
| **Genetic Algorithm: Evolution on Purpose** | Optimization | Population of candidates, fitness landscape | Mutation, crossover, selection pressure | No | High |
| **Particle Swarm: A Flock That Optimizes** | Optimization | Particles and velocity trails | Inertia, cognitive/social weights | No | High |
| **A\*: The Shortest Path With a Compass** | Graphs | Grid or graph, open/closed sets, path | Heuristic, obstacles, weights | No | High |
| **Game of Life: Simple Rules, Endless Patterns** | Emergence | Cellular grid | Rule editor, brush, speed, patterns | No | Medium |
| **Ising Model: The Physics of Phase Transitions** | Physics | Spin lattice, magnetization chart | Temperature, lattice size, field | Optional 3D lattice | Medium |
| **Reaction–Diffusion: How Patterns Appear** | Emergence | Continuous field | Feed/kill rates, diffusion, brush | No | Medium |
| **N-Body: The Solar System in Your Browser** | Physics | Particles and trails | Mass, gravity, time step, trails | Yes | Medium |
| **PageRank: How the Web Votes** | Graphs | Directed graph, rank flow | Damping, graph edits, iterations | Optional | Medium |
| **FFT: Circles Within Circles** | Data | Epicycles and waveform | Frequency count, signal, reconstruction | No | Medium |
| **Neural Network: A Tiny Model Learns** | Data | Decision boundary and loss curve | Learning rate, hidden units, epochs | Optional surface | Medium |
| **Percolation: The Moment Everything Connects** | Emergence | Grid and cluster coloring | Occupancy probability, lattice size | No | Low |
| **Maze Generation: Randomness With a Plan** | Generative | Maze grid | Algorithm choice, speed, seed | No | Low |
| **Flow Fields: Drawing With Vectors** | Generative | Particle trails on a vector field | Noise scale, particle count, palette | No | Low |
| **Galton Board: The Bell Curve Appears** | Randomness | Falling balls and histogram | Peg count, ball count, bias | No | Low |
| **Random Walks: Why Averages Work** | Randomness | Walker paths and distribution | Step size, dimensions, walker count | Optional 3D | Low |
| **Sorting: Watching Order Emerge** | Data | Bars and swaps | Algorithm, array size, speed | No | Low |
| **Huffman Coding: Building a Language** | Data | Tree and frequency table | Text input, tree construction | No | Low |

### 4.1 Backlog rules

- A story is promoted only when its engine and visual argument are clear.
- 3D is used only when the third dimension carries the explanation.
- Every story must have a 2D or textual fallback.
- Every story must be valuable in article mode.
- Do not build a story merely because the algorithm is famous; build it because it has a visual argument.

## 5. Authoring checklist

Before a story is considered done:

- [ ] The hook is clear in the first screen.
- [ ] The learning objectives are concrete.
- [ ] Every chapter has one idea.
- [ ] The visualization carries the argument, not just decoration.
- [ ] At least one parameter has a surprising or instructive effect.
- [ ] At least one predict-then-reveal interaction exists.
- [ ] The math is correct and cited.
- [ ] Pseudocode matches the implementation.
- [ ] The limitations section is honest.
- [ ] The applications section is specific.
- [ ] The lab is genuinely explorable.
- [ ] The share URL restores the starting state, and any excluded local state (such as ACO map edits) is disclosed.
- [ ] The article mode is complete.
- [ ] The reduced-motion mode is complete.
- [ ] The no-JavaScript reading path works.
- [ ] The mobile layout works.
- [ ] The accessibility checks pass.
- [ ] The performance budgets pass.
- [ ] The visual regression tests pass.
- [ ] The metadata and social image exist.
- [ ] The story is linked from the home page and the index.

## 6. Content style

- Write for a curious reader, not for a specialist.
- Define a term before using it.
- Prefer concrete examples over abstractions.
- Use short paragraphs and generous whitespace.
- Do not hide the argument behind the animation.
- Do not overclaim: heuristics are not guarantees, and PRNGs are not all broken because RANDU was.
- Distinguish clearly between:
  - what the visualization shows,
  - what the algorithm guarantees,
  - what the reader should take away.
- Cite primary sources for historical and mathematical claims.
- Use consistent notation across prose, formulas, pseudocode, and UI labels.
