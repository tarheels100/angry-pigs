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

## D15 — Pig consumption rules (from M3 spike)
**Decision.** A pig is removed when any of these is true: it leaves the level bounds,
its speed stays below 1.2 for 45 consecutive steps, or the settle timeout expires.
Removed pigs stop colliding and stop counting toward the settle check.
**Why.** Matter models no rolling resistance, so a pig that lands on flat ground rolls
forever and never sleeps. Without an explicit consumption rule the world would never
settle and the phase machine (M8) would hang. Pigs flying past the stage edge also need
removing, or they fall forever.
**Rejected.** Raising pig friction (stops pigs ~400 units, too short for a 1600-unit
stage); relying on sleeping alone (never happens on flat ground).

## D16 — Settle timeout freezes the world
**Decision.** When a round's settle window expires instead of bodies sleeping, the game
calls `adapter.freezeAll()` (zero velocity + sleeping) before deciding win/lose.
**Why.** Measurements showed ~10 of 51 Stage 01 combinations ending at the 240-step cap
with pigs still visibly moving. Scoring on a state the player can see is not moving is
a lie; "settled" must mean at rest.
**Rejected.** Scoring on the timeout as-is (ghost motion at the win banner); removing
the cap (a stuck world would hang the phase machine).

## D17 — Destroyed bodies leave the snapshot; flashes are display extras
**Decision.** A destroyed body is removed from the physics world and from
`snapshot()`. The game keeps its last state as a short-lived display extra
(`FLASH_STEPS = 10`) carrying `fade`, so themes can flash it and then it disappears.
**Why.** Corpses in the snapshot produced permanent white silhouettes wherever things
died, because the placeholder theme paints `destroyed` in the flash colour. Rendering
must be driven by a lifetime, not by stale state (docs/checklist.md).
**Rejected.** Keeping corpses in the snapshot (permanent artifacts); deleting them
instantly (no visible feedback for a kill).

## D18 — Playwright as a dev dependency for browser tests
**Decision.** `playwright` is a dev-only dependency; `npm run test:browser` runs
real-browser tests separately from the dependency-free `npm test`.
**Why.** Pointer capture, DPR mapping, resize during a drag, `file://` loading and
theme pixels cannot be proven by a fake canvas. Headless Chromium gives assertions
instead of manual visual checks.
**Rejected.** Hand-written CDP client (zero deps, ~150 lines of plumbing to maintain);
staying manual (every input claim stays unverified across machines). This deviates from
D2's "esbuild is the only dev tool": build tooling stays single, test tooling is added.

## D19 — Stars derived from shots used
**Decision.** `starsFor(launches, targetsTotal)`: 3 stars if `launches <= max(1,
ceil(targetsTotal/2))`, 2 if `launches <= targetsTotal`, else 1. `stars` is part of the
rules snapshot, meaningful only when phase is `won`.
**Why.** From the Stage 01 sweep, clearing both targets in one shot happened in 4 of 51
pull combinations after retuning — one-shot clears are rare, so they should be worth
the top tier. The rule scales with target count instead of hardcoding Stage 01.
**Rejected.** Score-based stars (score is a constant per target today, so it encodes
nothing about skill); hand-picked thresholds.

## D21 — Presentation effects subscribe to events
**Decision.** Particles, camera shake, and sound live in the presentation layer
(`src/fx/`, `src/audio/`, camera) and are driven only by `GameEvents`. The game and
physics layers emit events and know nothing about effects.
**Why.** M11 must not leak into simulation: a theme or an effect change has to stay a
presentation-only diff, and headless tests must keep asserting physics without a canvas
or an audio context. Events already carry what effects need (position, energy, cause).
**Rejected.** A "effects" object inside `GameRules` (coupling, and rules would need
canvas/audio types); deriving effects by polling entity state (misses one-shot events
like `destroyed`).
**Notes.** Audio is procedural WebAudio oscillators — no asset files, so the artifact
stays a single HTML file. The `AudioContext` is created on the first pointer press
because browsers reject audio before a gesture, and `M` mutes without unsubscribing.

## D22 — Browser tests run against the built artifact
**Decision.** `npm run test:browser` builds `dist/` and drives `dist/index.html` in
headless Chromium over both `file://` and `http://`. The dev server listens on port 0
(an OS-assigned ephemeral port) and is closed in an `after()` hook. CI runs it as a
separate job, and `deploy` waits for both `build` and `browser`.
**Why.** What ships is the artifact, not `src/`. Offline `file://` loading, request
counts, DPR backing-store size, pointer capture across a resize, and painted pixels can
only be observed in a real browser, and asserting them against the source bundle would
prove the wrong thing.
**Rejected.** Fixed test ports (collide with a leftover listener and tempt process
killing); running browser tests inside `npm run check` (adds Chromium startup to every
local iteration).

## D23 — Unused pigs pay a bonus on a clear
**Decision.** On a win, `score += ammoLeft * 500` (`src/game/rules.ts`). Stars stay
derived from shots used (D19); the bonus only affects score.
**Why.** Without a bonus, a one-shot clear and a three-shot clear score identically, so
the HUD number encodes nothing about efficiency. The bonus is a game-layer rule, so it
cannot leak into physics or presentation.
**Rejected.** Baking the bonus into stars (stars already encode efficiency, and two
mechanisms would fight); multiplying target score by a per-level constant (unexplained
per stage).

## D24 — Best results persist in localStorage
**Decision.** `src/game/save.ts` keeps the best `score`/`stars`/`launches` per stage in
`localStorage` behind a `KeyValueStore` interface; `src/main.ts` supplies a
`localStorage` adapter when one exists and probes a write first, otherwise an in-memory
store. Corrupt or blocked storage is treated as "no record".
**Why.** Pages has no server (docs/deployment.md), and the deployment constraint says
persistence is `localStorage`. Injecting the store keeps headless tests deterministic and
keeps the artifact fetch-free. A record is kept only when it is strictly better: higher
score, then more stars, then fewer shots.
**Rejected.** Saving every attempt (unbounded growth for no benefit); a JSON file or
IndexedDB (needs a build step or async plumbing for one number per stage); persisting in
the rules object (rules are rebuilt on restart and must not read browser state).

## D25 — Rolling resistance covers birds as well as pigs
**Decision.** `src/physics/matterAdapter.ts` applies `ROLLING_DAMPING` (×0.98 per step)
to any body of kind `pig` or `bird` that is in ground contact, tracked by
`collisionActive`/`collisionEnd`.
**Why.** D15 fixed the pig case, but the same defect existed for birds: a bird knocked
onto the ground rolled for 240 steps (327 units) without ever sleeping, so those rounds
ended only at the settle timeout (D16) rather than at rest. Measured after the change:
sleeps at step 134 after 109 units (`scratch/bird-roll-probe.ts`). Targets must not be
consumed the way pigs are, so damping is the fix, not a rest rule.
**Rejected.** Applying damping to blocks (a toppled beam should slide as debris);
raising bird friction (Matter takes `max(frictionA, frictionB)`, so it would change how
birds rest on beams, not just how they roll); consuming settled birds like pigs (a bird
is a target, not ammo).

## D26 — A shot is legal while debris is settling
**Decision.** `rules.launch()` accepts `aiming` and `settling`; `game.releaseAim()` refuses
`in_flight`, `won`, `lost`, and `ready`, and refuses when ammo is spent.
**Why.** Launch was accepted only from `aiming`, so a player (or the aiming bot) who fired
again while debris was still coming to rest had the gesture accepted by the cannon and the
shot silently swallowed until the 240-step settle timeout expired. Playtests read that as
"the cannon stopped responding". Firing into a settling pile is the intended Angry Birds
rhythm.
**Rejected.** Auto-waiting for the settle timeout before accepting a shot (a dead interface
either way); letting a shot fire during flight (two pigs at once makes attribution and
camera follow ambiguous); making `launch()` return a boolean (rules already expose phase).

## D27 — A level settles before the player gets control
**Decision.** `game.settleWarmup()` steps the world `SETTLE_WARMUP_STEPS` (90) times with
damage suppressed, before `levelLoaded` and after `restart()`. Suppression is a flag in the
game layer, not a physics-engine option.
**Why.** Bodies authored a pixel apart collide in the first steps; that settling spent
health and moved stacks, so a level appeared to "fall slightly on first draw" and started
partly damaged, which muddied the baseline for every shot. 90 steps is enough for Matter's
60-step sleep threshold to bring authored stacks to rest (docs/physics.md gotcha 14).
**Rejected.** Placing bodies with exact contact (Matter still nudges them); disabling sleep
during load (more movement, not less); suppressing damage inside the adapter (damage maths
belongs to the game layer); freezing bodies at load (a frozen world reads as settled and
stops collapse when the first pig lands).
