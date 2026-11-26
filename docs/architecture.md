# Architecture

Four layers, one-way dependency rule: `presentation → game → physics → core`.
Nothing writes upward. `game` never issues draw calls; `presentation` never
mutates simulation state.

| Layer | Modules | Responsibility |
| --- | --- | --- |
| core | `src/core/*` | fixed-timestep loop, event bus, entity registry, semantic entity state |
| physics | `src/physics/*` | Matter.js behind `PhysicsAdapter`, material properties, impacts, settle query |
| game | `src/game/*` | cannon, ammo, projectiles, targets, rules, scoring |
| presentation | `src/render/*`, `src/camera/*`, `src/input/*`, `src/ui/*`, `src/fx/*`, `src/audio/*` | theme draw recipes, viewport mapping, pointer input, HUD, particles/shake, procedural sound |

## Data flow

1. `Loop` accumulates real time and calls `Game.step(FIXED_DT)` N times.
2. `Game.step` calls `PhysicsAdapter.step(dt)`, which returns `Impact[]`.
3. Impacts are emitted on the `EventBus` as `impact`; damage decisions emit
   `destroyed`; a settle check emits `settled`, and rules emit `win` / `lose`.
4. Once per frame `Game.frame()` produces a read-only snapshot (`entities`,
   `aim`, `trajectory`).
5. `Renderer.draw(frame, entities)` paints it through the active theme; `Camera`
   supplies `frame.camera` and maps screen input into world coordinates.
6. Pointer input feeds `Game.beginAim/dragAim/releaseAim` in world coordinates.

`src/main.ts` is the wiring root: it owns canvas, camera, renderer, pointer, HUD, and
the loop, and subscribes to the event bus for messages. Simulation code (`core`,
`physics`, `game`, `levels`) never touches the DOM, which keeps it headless-testable.

## Contracts (M2)

- `PhysicsAdapter` — `src/physics/adapter.ts`
- `Theme` / `Viewport` — `src/render/theme.ts`
- `GameRules` — `src/game/rules.ts`
- `Game` / `Frame` — `src/game/game.ts`

## Rules of engagement

- Pointer input owns gestures, gameplay owns the decision. `src/input/pointer.ts`
  tracks which pointer is held, captures it to the canvas, reports moves only while
  a button is held, and distinguishes release from cancel. `Game.beginAim/dragAim/
  releaseAim/cancelAim` decide whether that gesture is a shot.
- The `Game` facade exposes `rules` and `cannon` as getters. `restart()` and
  `loadLevel()` build new instances; a captured value would keep pointing at the
  pre-restart cannon (empty ammo, no aim), which is the restart bug M7 shipped with.
- Themes map semantic state (`kind`, `material`, `health`, `destroyed`,
  `impactEnergy`) to appearance. They never read collision data or level logic.
- The entity registry is physics-backed plus a small set of display-only extras
  (the cannon and the pig waiting on it). Extras have no body, so they cannot
  influence the simulation; they exist only so the cannon reads as a cannon
  before the first launch.
- Levels are data. Adding a level must not require code changes.
- Simulation is deterministic: physics is stepped only at `FIXED_DT`, never at
  frame delta, so headless tests can assert outcomes by step count.
- Import specifiers use `.ts` extensions (esbuild bundles them; Node runs TS
  directly for tests). The shipped artifact is a single file, so no browser
  module resolution happens at runtime.
- Contracts are compile-checked by `tests/contracts.test.ts`, which implements
  `PhysicsAdapter`, `Theme`, and `GameRules` with dummies (M2). If a contract cannot
  be implemented without Matter or a DOM, it is too wide.
