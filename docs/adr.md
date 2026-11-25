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
