# Design decision log

Decisions are only changed by adding a superseding entry, never by editing history.

## D1 — Physics engine: Matter.js behind a `PhysicsAdapter`
**Decision.** Use matter-js 0.20 as the rigid-body engine; all access goes through
the `PhysicsAdapter` interface in `src/physics/adapter.ts`.
**Why.** Rigid bodies, friction/restitution, sleeping and collision events cover the
physics requirements without hand-writing a solver. The adapter keeps Rapier or a
custom engine swappable and keeps core/game testable in Node.
**Rejected.** Writing our own solver (months of work, easy to get wrong); Rapier
(wasm payload complicates the single-file artifact); cannon-es (heavier API than needed).
**Status.** Validated by the M3 spike — see docs/physics.md for measured behaviour.

## D2 — Language and build: TypeScript + esbuild + zero-dep dev server
**Decision.** TypeScript sources bundled by esbuild. Dev = `node server.js`
(zero-dependency `node:http` static server) plus `npm run watch`. Release =
`npm run build`, which inlines the bundle into a single self-contained
`dist/index.html`.
**Why.** esbuild rebuilds in ~8ms, and the same tool covers dev watch and release
minification. A hand-written static server keeps the toolchain tiny. HMR adds little
for a canvas game that repaints the whole scene every frame.
**Rejected.** Vite (dev server + bundler we don't need, extra config and dependency
tree); plain JS with JSDoc (weakens the compile-checked layer contracts).
**Deviation from README.** `typescript` and `@types/node` are dev dependencies for
`npm run typecheck` (esbuild strips types without checking them). README D2/M1
correspondingly list esbuild + typescript + @types/node.

## D3 — Entities: registry + behaviour modules, not a full ECS
**Decision.** Small entity registry keyed by id, with behaviour as plain modules.
**Why.** Dozens of bodies per level; an ECS adds indirection with no benefit.
**Rejected.** ECS frameworks (eventea, bitECS) — premature for this object count.

## D4 — Rendering: Canvas 2D, single canvas + DOM HUD
**Decision.** Canvas 2D for the stage; DOM overlay for HUD text.
**Why.** Glow/bloom compositing is achievable with 2D composite operations; DOM is
cheaper than canvas-drawn UI for HUD.
**Rejected.** WebGL (deferred as an optimisation), a UI framework, rendering HUD in canvas.

## D5 — Themes are data + draw recipes
**Decision.** A theme supplies a palette, per-entity-type draw recipes, and an
optional asset set. Entities expose semantic state only.
**Why.** Swapping visual style becomes swapping a manifest, satisfying the
modularity requirement. Validated in M12 by shipping a second theme.
**Rejected.** Style constants scattered in renderer code; theme-specific fields on
entity state.

## D6 — Levels are data, compiled into the bundle
**Decision.** JSON level files in `src/levels/`, imported and bundled at build time.
**Why.** Levels are content, enabling a later level editor. No runtime fetch means
GitHub Pages and offline-from-disk behave identically.
**Rejected.** Runtime `fetch()` of level JSON (breaks offline), levels as code
(levels would need recompiles per tweak).

## D7 — Assets: procedural first
**Decision.** Geometry drawn procedurally; audio synthesized with WebAudio. No
binary assets until the Tron theme needs them.
**Why.** Tron style is geometric, and an asset-free repo keeps the single-file
artifact and offline path trivial.
**Rejected.** Pre-baked sprite sheets and audio files (adds fetches and asset tooling).

## D8 — Testing: `node --test`, no test framework
**Decision.** Node's built-in test runner on TS sources via native type stripping;
headless replay harness for physics scenarios.
**Why.** Node 22 runs `.ts` directly, so tests need no build step; deterministic
fixed-timestep simulation lets us assert outcomes without a browser.
**Rejected.** Vitest (extra dependency and config for no gain here).

## D9 — Import specifiers carry `.ts` extensions
**Decision.** `import { x } from './types.ts'`.
**Why.** Node's ESM loader requires extensions for direct TS execution; esbuild
resolves them when bundling. tsconfig sets `allowImportingTsExtensions` with `noEmit`.
**Rejected.** Extensionless specifiers (break `node --test`).

## D10 — Damage model: HP-based, any collision above a threshold
**Decision.** Objects and birds carry health from their material; every collision
whose impact energy exceeds the material's `damageThreshold` removes health, and an
entity at 0 health is destroyed. Objects are not one-shot.
**Why.** Supports knockable towers (a glass block survives a glancing hit and shatters
on a solid one) and makes structure collapse a legitimate way to kill birds.
**Rejected.** One-hit destruction (no tower feel, no material differentiation on
impact); HP tied to entity type instead of material (materials would stop mattering).

## D11 — Birds die from falls and collapse, not only direct hits
**Decision.** A bird takes damage from any collision above its threshold, including
landing after a fall or being crushed by a collapsing tower.
**Why.** Consequence of D10; the damage rule is energy-threshold, not "who hit me".
**Rejected.** Direct-hit-only death — it makes tall towers pointless and reads as
arbitrary to the player.

## D12 — Aim constraint: free drag, capped pull, no downward plunge
**Decision.** Pointer drag sets a pull vector from the cannon origin, clamped to
`maxPull`. Launch velocity = `-pull * powerScale` (slingshot direction). The launch
angle is clamped to ±75° from horizontal so a pig cannot be fired into the ground.
**Why.** Free drag is the familiar Angry Birds interaction; the pull cap bounds
power and the angle clamp removes the degenerate "shoot at the floor" case.
**Rejected.** Fixed angle range (too rigid for aiming), unconstrained angle
(wasted ammo on self-inflicted ground hits).

## D13 — Fixed world units, letterboxed canvas
**Decision.** World is 1600x900 units; the canvas is CSS-sized to the window and the
camera fits `bounds`, preserving aspect. Pointer coordinates are mapped back through
the camera so touch and mouse aim identically at any window size.
**Why.** Levels and tuning constants stay readable in world units, independent of
viewport size.
**Rejected.** World sized to the window (levels would change with browser size).

## D14 — First release scope: 8–12 stages
**Decision.** Ship 8–12 levels, increasing complexity.
**Why.** Enough variety to prove the level system and material model without making
level authoring the bulk of the work.
**Rejected.** One level (can't evaluate tuning), 20+ levels (content outruns tuning).
