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

## D28 — The launcher is drawn from aim state on a display extra
**Decision.** The cannon stays a display-only entity (D12). The game writes `pull`,
`aimAngle`, and `recoil` onto its `EntityState`; themes turn those into a tilting barrel,
a compressing spring, and a muzzle flash that decays `RECOIL_DECAY` per step. The waiting
pig is drawn part-way down the barrel, `LOAD_DEPTH` of the pull back along the launch
direction.
**Why.** "Cannon tilts, spring compresses" is a look, and the only honest source for it is
the aim state the game already computes. Passing it as state keeps the theme a data-driven
recipe (docs/theme-contract.md) instead of a theme that reaches into `Cannon`.
**Rejected.** Drawing the cannon from the pointer position (a press without a drag would
tilt the barrel); making the cannon a physics body (it would collide with the pig it just
launched); storing a barrel angle in the game layer (the aim already carries the direction).

## D29 — Scenery is art, never a body
**Decision.** `LevelDef.scenery` holds props (`tree`, `ridge`) validated by the loader and
added as display extras. They are painted in the `behind` layer and collide with nothing.
**Why.** Background props should not change outcomes. A prop that is a body would alter
collisions, sleep behaviour, and sweeps, and the determinism gate would drift with art work.
**Rejected.** Static bodies marked non-colliding via collision filters (still participate in
sleep/wake bookkeeping); drawing props inside `paintBackground` (the background is screen
space, so props would not scale or pan with the camera).

## D30 — Presentation layers name their depth
**Decision.** `Renderer.draw(frame, entities, { behind, front })`. Trail and debris paint in
`behind`; particles and flashes in `front`. Draw order is background → behind → entities →
overlay → front, and it belongs to the renderer, not the theme.
**Why.** A trail or a debris heap must sit under the game objects, and a theme must not be
able to reorder it: layering is pipeline behaviour, appearance stays in the theme.
**Rejected.** An unsorted `fx` array (order became an accident of wiring); painting debris in
`paintEntity` (entities are drawn per body, and debris is not a body).


## D31 — Debris is a presentation heap, not a physics pile
**Decision.** A destroyed block spawns fragments in `src/fx/debris.ts`: they fall under a
local gravity constant, land on the level's `groundTop`, pile upward per ground bucket,
and fade after `fadeSteps` at rest. They paint in the `behind` layer using material
colours and never collide with anything.
**Why.** "Fragments pile into heaps" is a look. Real bodies would need a second body set,
would push live blocks around, and would make every sweep outcome depend on how many
fragments a theme wants. Keeping them presentation-side keeps the determinism gate about
the simulation (docs/checklist.md §2).
**Rejected.** Static bodies added per fragment (pollutes the snapshot and win/lose entity
counts); Matter debris with collision filters (still consumes solver time and can wake
live bodies via `wakeNear`); fading fragments instantly (no heap, which is the point of M16).


## D32 — The soundtrack is generated, and shares one audio context
**Decision.** `src/audio/music.ts` derives a track from the level id: a stable hash picks
tempo (92–125 bpm), waveform, scale, and root, and a seeded PRNG writes the note sequence.
Notes are scheduled on **simulated** time (`loop.stepsTaken()`) in the same context the
impact sounds use.
**Why.** Shipping audio would break D6 (one self-contained file, offline). Generating it
means every stage gets its own flavour for free as content grows, and the same seed replays
the same track. Simulated time keeps the music aligned with the game and lets headless tests
assert the sequence without an AudioContext.
**Rejected.** Bundling audio files (artifact size, and a new asset pipeline); scheduling on
wall-clock time (a backgrounded tab drifts the track out of sync with the simulation); a
second AudioContext (browsers cap contexts, and sfx already owns one unlocked by the first
gesture).
**Consequence.** The WebAudio surface in `src/audio/sfx.ts` became the shared contract
(`ParamLike`, `GainNodeLike`, `OscillatorNodeLike`) with ramp methods optional, so a test
fake can implement less than the browser does. `unlock()` returns the context so the
soundtrack can reuse it.

## D33 — Pig types are data in the game layer, not physics concepts
**Decision.** `src/game/pigs.ts` is a registry of pig types (`basic`, `heavy`, `bomb`,
`cluster`). A level's ammo list is a list of these ids, validated at load. The spec's
*physical* fields (`radius`, `massScale`) go into `BodyInit`, so the adapter keeps only
the generic body contract; its *gameplay* fields (`damageMultiplier`, `count`/`spread`,
`explosion`) are read by the game layer, which calls `adapter.explode()`.
**Why.** M18 asks for pigs that behave differently. Expressing that as data keeps the
physics adapter engine-neutral (D1, D10): Matter never learns what a bomb is, and a future
engine swap does not need to. Levels stay declarative, and themes already style pigs from
the `variant` hint the registry stamps (docs/theme-contract.md).
**Rejected.** Giving each pig type its own body type or material (materials describe what
a thing is made of, not what it does — `docs/physics.md`); implementing blast damage inside
the Matter adapter (it would be an engine-specific behaviour and would bypass the damage
conversion the game layer owns).

## D34 — A bomb detonates against structure, and the blast uses the impact conversion
**Decision.** A bomb pig detonates only when it hits a block or a bird with impact energy
above `explosion.threshold`. Landing on ground or a wall is not a detonation. The blast is
issued through `adapter.explode()` with `damage * DAMAGE_SCALE` and `impulse * IMPULSE_SCALE`,
so the authored recipe is a roughness number like an impact, not literal health.
**Why.** "Solid hit" must mean *something breakable*, otherwise a bomb that lands softly on
the floor erases the stage, and a stage becomes a coin flip about where the pig settles.
Scaling by the same constants as impact damage (D15, tuning) keeps one conversion surface:
`bomb.damage 14` becomes 4.2 health at the centre, which clears glass (0.5–2.4 hp) and chips
wood (6 hp) without deleting a wood column outright.
**Rejected.** Detonating on any collision (including ground: it made soft landings a win);
detonating on a timer or on the first contact after launch (a timer makes the shot's outcome
independent of where it lands, which is the whole point of aiming); applying blast damage in
normalized `energy/threshold` units (there is no impact energy at a blast — the centre is a
chosen point, not a collision).

## D35 — Menus are DOM chrome, and an open menu pauses the loop
**Decision.** The title screen and options screen are DOM overlays (`src/ui/screens.ts`)
inside `#app`, not canvas art, and options are persisted through the same `KeyValueStore`
the best results use (D24). While an overlay is open `src/main.ts` stops the loop
(`loop.stop()`), and closing it restarts the loop.
**Why.** The theme contract (docs/theme-contract.md) is about *entity and background art*;
a menu is a list of buttons with text, which no theme should have to draw, and a theme swap
must not change what a menu looks like. Pausing is the honest way to keep a menu from being
a gameplay surface: the overlay covers the canvas so pointer input cannot aim, but stopping
the loop also means steps, the soundtrack scheduler, and score cannot advance behind a menu
that looks like it did.
**Rejected:** drawing the menu through the theme pipeline (it would push UI state into the
contract and make every theme implement a menu); leaving the loop running while a menu is
open (steps and music would advance during a pause, which is exactly the bug D32 avoided by
scheduling on simulated time); a separate settings module with its own storage (two storage
surfaces would drift).

## D35 (extension) — the title screen is what you land on

Playtest item 1: "opening the game always takes you into the menu but unpaused". Two fixes
in `src/main.ts`:

- The title overlay is opened **after** `loop.start()`, via a `openOverlay()` helper that
  stops the loop. Opening it before the loop existed made the pause a no-op, and the panel
  then looked like a menu that did not pause anything.
- `screens.onClose` and `closeOverlay()` both call `loop.start()`. Resuming from the panel's
  own resume button previously did nothing, so the round stayed frozen until a reload.

The product decision: the game opens on the stage list, not straight into stage 01. That is
what makes best scores and stage picking visible at once, and it is the moment a player
expects to choose. `window.__steps()` (the `loop.stepsTaken()` seam) is asserted at 0 behind
the panel, so "menu pauses simulation" is a tested claim rather than a hope.

Browser tests that act on a live round dismiss the overlay inside `open()`; the title-screen
tests navigate directly and assert the panel state.

## D32 (extension) — music ships off

Playtest items 1 and 2: the burst at level load and the track itself were both unwanted.
`music` became a persisted option defaulting to **false** (`src/ui/options.ts`), and
`src/main.ts` only ticks the scheduler while it is on. The generated track stays in the
bundle — the module, its tests, and the options row remain, so revisiting the soundtrack is
a toggle rather than a rebuild. Sound effects keep their default of on, because an impact
blip is feedback, not ambience.

## D36 — the canvas box is CSS-owned; the camera owns framing

**Date:** playtest after M20 · **Status:** accepted

`renderer.resize()` sets the backing store only (`canvas.width/height = css * dpr`). It used
to write inline `style.width/height`, which froze the canvas at the size the page loaded with:
resizing or a portrait window left the stage at its original box while the camera reframed,
and the level looked wrong and cropped. CSS now decides the box (`width: 100%`,
`height: calc(100vh - 56px)`); the camera fits `bounds` inside whatever box it gets, so there
is no 16:9 constraint to preserve.

The zoom floor became `min(0.5, fitZoom())`. A hard 0.5 floor exceeded the fit for a narrow
window (fit ~0.25) and pushed the launcher off screen — the "too zoomed in" report. Fitting
the whole level outranks a minimum zoom; manual zoom-out stops at the fit.

`window.__camera` is closures over the live camera plus `window.__viewport()`, because
`refit()` re-creates the camera on resize and the old seam handed out a frozen instance.
Consequences: the DPR browser test asserts the camera invariant (uniform zoom, level fits)
instead of a CSS aspect ratio; and any future layout change is a CSS edit, not a renderer
change.

## D37 — stages scale up through reusable pieces, not hand-placed blocks

**Date:** playtest after M20 · **Status:** accepted

The stages read as too small and hand-authored coordinates had drifted into the structures.
`src/levels/pieces.ts` added builders (`standing`, `stackUp`, `hut`, `platform`, `tower`,
`barrierWall`, `bridge`, `pedestal`) that place everything relative to `GROUND_TOP`, so a
level is written as "a hut here, a tower there" and geometry cannot overlap by accident. The
world widened from 1600 to 2200 units so three zones fit with clear failure modes between
them; `powerScale` went 0.22 → 0.3 to keep the pigs reachable across that distance.

Scenery grew with the world: props are now roughly 5x larger and sit **under and behind** the
playfield, where a projectile cannot pass through them. That is what makes them scenery rather
than obstacles (docs/level-format.md rule 7). A `plinth` prop kind grounds the launcher, which
otherwise read as a floating muzzle.

Consequences: levels are short to write and safe to audit; `barrierWall` no longer staggers
half-blocks, because a cantilevered narrow wall topples during the load warmup and arrives
already damaged — masonry joints are theme art, not physics.

## D38 — level rules are enforced by measurement, not by review

**Date:** playtest after M20 · **Status:** accepted

"Every bird is sheltered", "nothing critical under stone", "props clear of gameplay" and
"no interpenetration" are now checked by `scratch/shield-probe.ts`, which loads every registered
level and fails on any violation. Reachability is measured by `scratch/reachTable.ts`, which
simulates every pull/angle pair and records whether a pig's path **descends** onto a roof, and
`scratch/roof-reach-report.ts` pairs that with each bird's shelter.

The point is a negative result: a shot that flies *over* a roof does not kill the bird under it.
The earlier probes counted those as lethal because they sampled only the endpoint. The greedy
bot now aims at shelter roofs and only fires when the measured path descends onto one, which
makes the bot's plan a real difficulty measurement instead of an optimistic guess.

Consequence: stage difficulty is quoted as "pigs the greedy bot needs" plus "shots that hit the
shelter roof", both reproducible from the repo.

## D39 — a bird names its silhouette; the theme draws it

**Date:** playtest after M20 · **Status:** accepted

Birds were three identical discs with an outline. `LevelObject.variant` (and `BodyInit.variant`)
carry a presentation hint — `runner`, `worker`, `broody` — that the physics adapter rides along
into `EntityState`, and each theme keeps a shape table keyed by it: a runner is long and low
with one comb spike, a broody bird is round and tall with four. Themes fall back to `worker` for
an unknown variant, so adding a bird kind is level data plus one shape entry, never a pipeline
change.

Consequences: the simulation never reads `variant` (it is not in any scoring or collision path),
and the theme contract gains a documented vocabulary (docs/theme-contract.md). Pig art already
used the same mechanism for pig type ids.

## D40 — the soundtrack is composed with Tonal and played by Tone.js

**Date:** M22 · **Status:** accepted, supersedes D32's scheduling

The M17 track was two oscillator blips per eighth note: no harmony, no rhythm, and a note
backlog when enabled mid-round. The soundtrack is now split in two:

- `src/audio/composition.ts` (game layer, pure, no audio): the stage name seeds a tempo, a
  scale, a four-chord progression, and a melody built from the chord tones of each bar. Tonal
  supplies pitch grammar, so notes are real note names in a key rather than random Hz.
- `src/audio/playback.ts` (presentation layer): Tone.js synths on Tone's transport, looping the
  composed bar. Tone owns the clock, which is what kills the backlog — a track starts where the
  transport is, so a paused menu cannot queue elapsed notes.

Music still defaults to off (D32 stands as the shipping decision) and stays silent until the
pointer gesture unlocks audio. The artifact gate no longer forbids the string `fetch(` in the
bundle: Tone ships an unused notation loader, and dead code is not a dependency. The real
guarantee is the browser test that boots the artifact with every network request aborted
(`tests/browser/game.browser.mjs`), which is what D6 actually promises.

Consequence: the bundle grew to ~450 KB minified, still one file, and headless tests cover the
composition while the browser covers playback.
