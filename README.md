# angry-pigs

An Angry Birds–style game where the projectiles are **pigs**, the launcher is an
abstract light-powered cannon, and the targets are **birds**. Visual style is
"Tron": glowing neon on a dark background, smooth curves, clean geometric lines.

## Overview

**Status:** M1–M19 complete. The game runs in a browser from a single self-contained
`dist/index.html`: three stages, drag aim, trajectory preview, typed ammo (basic, heavy,
bomb, cluster) with a bomb blast and a cluster spread, per-impact damage with partial
destruction, crush/fall attribution, star scoring, camera follow and re-framing, a level
warm-up so nothing starts partly damaged, glass/wood/stone materials that take several
hits, pigs and birds drawn as characters, a launcher whose barrel tilts and whose spring
compresses, a motion trail, scenery props, debris heaps that pile and fade, a generated
soundtrack with one flavour per stage, a title screen listing stages with best scores and
an options screen whose settings survive a reload, the Tron theme (default) plus a Pixel
theme proving the theme contract, and deployed to GitHub Pages
(`https://tarheels100.github.io/angry-pigs/`).
Gates: `npm run check` (typecheck + 152 headless tests + build), `npm run test:browser` (24
Playwright tests against the built artifact), and `npm run check:determinism` (the same
bundle run in node and chromium, 72 combos, 0 mismatches) — all three run in CI. Best
results and options persist in `localStorage` (D24, D35).

Remaining open work is tuning and feel rather than plumbing — see the open questions in
`docs/tuning.md` and the manual touch check in `docs/checklist.md`.

On each level the player gets a fixed number of launches. Launch pigs from the
cannon to destroy every bird target on the stage. Destroying all birds within the
launch budget clears the level; running out of pigs with birds still standing
fails it.

## Requirements

- Realistic physics: ballistic projectile motion, and physical response of targets
  and other movable objects when struck. Unsupported objects fall, round objects
  roll downhill.
- Projectiles destroy movable objects and targets on impact. Objects vary in
  resilience based on material.
- Runs in the browser with HTML and JS, with no server-side component.
- Deployable to **GitHub Pages** (static HTTPS hosting) and playable from a plain
  static file host.
- Modular engine: the presentation/theme layer can be swapped out (Tron neon →
  pixel art → sleek cartoon) without touching simulation logic.

## Architecture at a glance

Four layers, each replaceable, communicating only through narrow interfaces:

| Layer | Responsibility | Knows about |
| --- | --- | --- |
| `core` | fixed-timestep loop, entity registry, event bus, game state machine | nothing below it |
| `physics` | rigid bodies, collision events, material properties | core (via adapter interface) |
| `game` | rules: cannon, ammo, projectiles, targets, win/lose, scoring | core + physics |
| `presentation` | camera, renderer, themes, input, HUD, debug overlay | core + physics state, read-only |

`game` never issues draw calls; `presentation` never mutates simulation state.

**One-way dependency rule:** `presentation → game → physics → core`. No upward
writes. This is what makes theme swapping a data/config change rather than a
code change.

## Design decisions

| # | Topic | Decision | Rationale |
| --- | --- | --- | --- |
| D1 | Physics | Use **Matter.js** behind a thin `PhysicsAdapter` interface | Rigid bodies, friction/restitution, sleeping, and collision events cover the requirements without hand-writing a solver. The adapter keeps Rapier/plane/custom engines swappable and keeps core testable in Node. |
| D2 | Language/build | **TypeScript + esbuild** watch mode, plus a ~30-line zero-dependency `server.js` (`node:http`). No Vite, no UI framework. | esbuild bundles in ~8ms, so watch rebuilds are instant; it also produces the release bundle, so one tool covers dev and build. A hand-written static server keeps the repo at one dev dependency. HMR adds little for a canvas game that redraws the whole scene each frame; a framework would add state management we don't need. `typescript` (type-check only) and `@types/node` are the only other dev deps — esbuild strips types without checking them. |
| D3 | Entities | Small entity registry + per-entity behavior modules (not a full ECS) | Object count is low (dozens of bodies per level); a full ECS is unnecessary complexity. |
| D4 | Rendering | Canvas 2D, single canvas + DOM overlay for HUD | Glow/bloom compositing is straightforward in 2D; DOM is cheaper than canvas-drawn UI for HUD. WebGL deferred as an optimization (M10). |
| D5 | Themes | Theme = data: palette, glyph/sprite sets, draw recipes per entity type | Swapping style becomes swapping a theme manifest. See "Theme contract" below. |
| D6 | Levels | Data-driven JSON levels in `src/levels/` | Levels are content, not code; enables a level editor later (M8). |
| D7 | Assets | Procedural/synthesized first (vector shapes, WebAudio tones); art assets only when the Tron theme needs them | Tron style is geometric, so it can be drawn procedurally. Keeps the repo asset-free through the first playable slice. |
| D8 | Testing | **`node --test`** for pure logic (materials, settle detection, win/lose); headless replay harness for physics scenarios | Node 22 runs TS directly via native type stripping, so tests need no build step. Simulation is deterministic with a fixed timestep, so gameplay outcomes can be asserted without a browser. |

## Theme contract

A theme provides three things; nothing else:

1. **Manifest** — palette, background treatment, glow parameters, per-entity-type
   draw recipe id.
2. **Draw recipes** — functions that take `(entityState, context)` and paint. They
   read state; they never mutate it.
3. **Asset set** — optional sprites/fonts/audio keyed by the manifest ids.

Entities expose *semantic* state (`kind`, `material`, `health`, `destroyed`,
`impactEnergy`), never appearance. A theme maps semantic state to visuals, so
"bird destroyed" works identically in Tron and pixel-art themes.

## Level format (v0)

```jsonc
{
  "name": "stage-01",
  "bounds": { "width": 1600, "height": 900 },
  "cannon": { "x": 120, "y": 480, "maxPull": 90, "ammo": ["basic", "basic", "heavy"] },
  "statics": [ { "type": "ground", "x": 0, "y": 860, "w": 1600, "h": 40 } ],
  "objects": [ { "type": "block", "material": "glass", "x": 900, "y": 800, "w": 40, "h": 120 } ],
  "targets": [ { "type": "bird", "material": "feather", "x": 1100, "y": 780, "r": 24 } ]
}
```

Materials carry mass, restitution, and hit points (glass low HP/high fragility,
stone high HP). Targets are a subset of objects marked `target` for win tracking.

Levels are authored as JSON files and compiled into the bundle at build time, so a
release needs no runtime level fetching. Loading JSON at runtime is allowed for
development convenience, but the shipped build must not depend on it (see
"Running & deployment").

## Running & deployment

**Dev:** `npm run dev` launches the game in one command — `scripts/dev.js` bundles
`src/main.ts` in esbuild watch mode in-process and spawns the static server, so
`http://localhost:5173` is playable immediately; `npm run dev:open` also opens the
browser. esbuild is the only build tool (`typescript` and `@types/node` exist
solely for `npm run typecheck`). Editing a file rebuilds `dist/main.js`; reload the
page manually. The two halves can still run in separate terminals as
`npm run watch` + `npm run serve`. Because esbuild bundles, import specifiers do not
need `.js` extensions — but the shipped artifact is a single file, so no browser
module resolution happens at runtime. Source specifiers use `.ts` extensions so
`node --test` can run TS directly.

**Controls:** press, then **drag** — the pull is the vector from the cannon origin to
the pointer (launch direction is the opposite, clamped to `maxPull` and ±75° from
horizontal), so the *pointer position* sets the shot, not the press point. A press alone
shows no guide and fires nothing; releasing without a drag (or with a pull under 12
units) cancels and costs no ammo. The HUD Restart button does the same as `R`.

| Key | Effect |
| --- | --- |
| `R` | restart the current stage |
| `N` / `P` | next / previous stage (wraps) |
| `1` / `2` / `3` | jump straight to stage 1 / 2 / 3 |
| `T` | cycle themes — tron (default), placeholder, placeholder-dark, pixel |
| `M` | mute / unmute sound |
| `O` | options screen (theme, sound, debris, trail, forget best scores) |
| `Esc` | open the title screen; `Esc` again closes it |
| wheel | zoom the camera |
| `F2` | debug overlay: entity bounds, ids, fps, step count |

The HUD's `menu` button opens the same title screen, and each listed stage shows its best
result. An open menu pauses the simulation, so nothing steps or scores behind it (D35).

On a win the stage advances automatically after ~1.4s; on a fail, restart with `R`.

```jsonc
"scripts": {
  "dev":          "node scripts/dev.js",  // esbuild watch + static server, one process
  "dev:open":     "node scripts/dev.js --open",
  "serve":        "node server.js",
  "watch":        "esbuild src/main.ts --bundle --watch=forever --format=iife --outfile=dist/main.js",
  "build":        "esbuild src/main.ts --bundle --minify --legal-comments=none --format=iife && node build-html.js",
  "test":         "node --test \"tests/**/*.test.ts\"",
  "test:browser": "npm run build && node --test \"tests/browser/*.browser.mjs\"",
  "check:determinism": "node scripts/determinism.js",
  "check":        "npm run typecheck && npm test && npm run build",
  "typecheck":    "tsc --noEmit"
}
```

**Release artifact:** a **single self-contained `index.html`** (all JS inlined, levels
embedded). This is the artifact that gets deployed and shared, and it satisfies two
hosting cases at once:

- **GitHub Pages** — publish `dist/index.html`. Static HTTPS hosting, so the browser
  module/CORS restrictions that block `file://` do not apply.
- **Offline** — the same file double-clicks from disk; nothing is fetched at runtime.

**GitHub Pages constraints (must hold from M1 onward):**

1. **Relative paths only.** Pages serves under `/username/repo/`, so every URL the
   page references is relative (`./favicon.svg`, `./theme.css`). Never root-absolute
   (`/src/...`). Level JSON is embedded at build time, so no level URL exists in the
   shipped bundle.
2. **Static output only.** No server-side code, no runtime data writes; persistence
   is `localStorage`.
3. **Deploy `dist/`, not `src/`.** Pages does not build. A GitHub Action runs
   `npm run build` and publishes `dist/` (or `dist/` is committed).
4. **No runtime fetch dependency in the shipped bundle** — keeps Pages and offline
   behavior identical.

## Docs map

Everything an agent needs to get oriented, filled in as the roadmap progresses:

- `docs/architecture.md` — layer boundaries, dependency rule, event flow
- `docs/adr.md` — design decision log (mirrors the table above, with rationale as it changes)
- `docs/physics.md` — engine choice, adapter API, tuning constants, determinism notes
- `docs/theme-contract.md` — theme interface + how to add a theme
- `docs/level-format.md` — schema and per-field notes
- `docs/glossary.md` — pig / cannon / bird / stage / settle / material definitions
- `docs/tuning.md` — gameplay tuning log (launch caps, HP values, settle windows)
- `docs/deployment.md` — dev server, esbuild pipeline, GitHub Pages steps and constraints
- `docs/checklist.md` — verification checklist: browser checks, simulation evaluation,
  measured baselines, and the contract/CI items that were closed
- `docs/browser-testing.md` — how real-browser checks are run (Playwright harness,
  `npm run test:browser`) and why the artifact rather than the source is tested
- `AGENTS.md` — working rules for agents, including the rule that a large push writes
  and keeps its work plan
- `docs/pushes/` — one permanent record per large push: plan, step-by-step progress,
  measurements, gates run, and a closing outcome section. Files here are never deleted;
  they are how work resumes after an interrupted session
- `docs/post-m13-notes.md` — backlog of polish and content ideas collected after M13;
  candidate scope for the next push

## Roadmap

Numbered milestones. Each has deliverables and an acceptance check; an milestone is
done only when its check passes.

| # | Milestone | Depends on | Status |
| --- | --- | --- | --- |
| 1 | Repo scaffold, tooling, stubs | — | done |
| 2 | Design decisions + interface contracts in docs | 1 | done |
| 3 | Physics spike (throwaway prototype) | 2 | done |
| 4 | Physics adapter layer | 3 | done |
| 5 | Core engine: loop, events, entity registry | 2 | done |
| 6 | Minimal renderer + placeholder theme | 4, 5 | done |
| 7 | **Vertical slice** — aim, launch, destroy, visible result | 4, 5, 6 | done |
| 8 | Game rules & state machine | 7 | done |
| 9 | Level system + camera follow | 8 | done |
| 10 | Tron theme (default) | 7 | done |
| 11 | Polish: particles, audio, shake, debug overlay | 8, 10 | done |
| 12 | Theme-swap proof (second theme) | 10 | done |
| 13 | Tests, tuning, single-file build & Pages deploy | 8, 9, 11 | done |
| 14 | Load stability + material realism (warmup, wood, tougher glass) | 13 | done |
| 15 | Entity art: pigs/birds drawn as pigs/birds, cannon art, motion trail, scenery | 14 | done |
| 16 | Debris heaps: destroyed objects crumble into falling fragments on a back layer | 14, 11 | done |
| 17 | Procedural soundtrack, one flavour per level | 11 | done |
| 18 | Pig types: basic, heavy, bomb, cluster | 14 | done |
| 19 | Title screen + options screen (real options, persisted) | 15, 17 | done |
| 20 | Content escalation: big collapses, tree platforms, mixed materials | 14–18 | planned |

### 1. Repo scaffold, tooling, stubs

**Deliverables:** TS project with the scripts from "Running & deployment"
(`package.json`, tsconfig, esbuild + `typescript` + `@types/node` as dev
dependencies), the ~30-line
`server.js` static server with a MIME map and no-cache headers, `build-html.js`
that inlines the bundle into a single self-contained `index.html`, `.gitignore`,
directory skeleton (`src/core`, `src/physics`, `src/game`, `src/render/themes`,
`src/input`, `src/camera`, `src/levels`, `src/ui`), module stubs with exported type
signatures but no logic, a canvas-shell `index.html`, and empty docs files from the
docs map — including `docs/deployment.md`.

**Acceptance:** `npm run dev` serves a blank canvas over `http://localhost`; the
single-file build opens and renders from disk with zero network requests; all
paths are relative; `npm run build` succeeds; stubs type-check
(`tsc --noEmit`) with no circular imports.

### 2. Design decisions + interface contracts

**Deliverables:** `docs/adr.md` with D1–D8 resolved (including the open questions
below), and the three load-bearing interfaces written as real TypeScript types:
`PhysicsAdapter`, `Renderer`/`Theme`, `GameRules`. Written *before* implementations
so stubs from M1 match the contracts rather than being guessed.

**Acceptance:** contracts compile, and each decision has a one-paragraph rationale
plus a "rejected alternative" note.

### 3. Physics spike

**Deliverables:** throwaway prototype in `scratch/physics-spike/`: a ramp, rolling
circles, falling stacked blocks, one projectile fired at a stack. No game code.

**Acceptance:** unsupported objects fall, circles roll down an incline, a projectile
knocks a stack over, collision events report impact velocity. This validates Matter.js
(or forces the alternative) before anything is built on it. Prototype is deleted or
kept out of `src/`.

### 4. Physics adapter layer

**Deliverables:** `PhysicsAdapter` implementation wrapping Matter.js: world setup,
body creation from level descriptors, material registry (mass/restitution/HP),
collision event stream with impact energy, `step(dt)`, sleep/settle query,
collision filtering (projectiles vs projectiles and projectiles vs launcher),
impulse application for cannon launches.

**Acceptance:** the spike scenarios reproduce through the adapter API; physics layer
imports no rendering or gameplay code.

### 5. Core engine

**Deliverables:** fixed-timestep accumulator loop (physics stepped at a fixed `dt`,
rendered at frame rate), event bus (`launch`, `impact`, `destroyed`, `settled`,
`win`, `lose`), entity registry mapping entities ↔ bodies, pause/resume, and a
frame-state snapshot for the renderer.

**Acceptance:** loop runs headless in Node at a deterministic step count; events fire
in order under a scripted simulation.

### 6. Minimal renderer + placeholder theme

**Deliverables:** Canvas 2D renderer that draws entity state as plain shapes from a
`placeholder` theme (flat colors, no glow), plus viewport/scale mapping from world
coordinates to canvas.

**Acceptance:** bodies from the spike render as correct shapes/positions, updating
each frame. This proves the state → render pipeline before gameplay exists.

### 7. Vertical slice

**Deliverables:** one hard-coded test stage with cannon, one bird, a few blocks.
Pointer drag on the cannon (mouse + touch) with a max pull radius, launch impulse
scaled by pull distance, dotted trajectory preview computed by cloning the physics
world and simulating the arc, pig destroys bird on direct hit, pig consumed when it
settles.

**Acceptance:** a user can drag, aim, launch, and watch the bird die, with no win/lose
logic involved. This is the highest-risk integration point, so it is done early.

### 8. Game rules & state machine

**Deliverables:** state machine `AIMING → IN_FLIGHT → SETTLING → WIN | LOSE | OUT_OF_AMMO`;
settle detection (all bodies asleep, or a timeout fallback so a stuck level never
hangs); ammo consumption and remaining-ammo bonus score; win when zero targets
remain, lose when ammo is exhausted with targets standing; restart; scoring and stars;
impact-based damage applied through the material HP registry.

**Acceptance:** scripted replays (headless) produce win, lose, and timeout outcomes
from level data alone.

### 9. Level system + camera

**Deliverables:** level loader with schema validation and clear error messages,
`src/levels/` JSON content (8–12 stages, increasing complexity), level select menu,
per-level restart, level complete/fail HUD, and camera that pans to follow the in-flight
pig, zooms out to fit, and returns to overview when settled.

**Acceptance:** all shipped levels load and are playable end to end; malformed level
data fails with a named field error rather than a crash.

### 10. Tron theme (default)

**Deliverables:** the real visual identity: dark background, neon palette, glowing
outlines via additive compositing/soft bloom, light-cannon with glowing muzzle, pigs
and birds as geometric glyphs, material-differentiated glow colors, destroyed-target
flash. Rendered through draw recipes only, no gameplay hooks.

**Acceptance:** the vertical slice looks like the intended art direction; theme code
contains no collision, HP, or level logic.

### 11. Polish

**Deliverables:** impact sparks and debris particles, destroyed-target burst, launch
pulse, WebAudio synthesized SFX (launch, impact by material, destroy, win/lose) and
optional ambient tone, subtle screen shake, a debug overlay toggled by key (`F2`)
showing collider wireframes, body velocities, and sleep state, and the destroyed-entity
treatment: destroyed bodies leave the entity snapshot and the white flash becomes a
short-lived overlay keyed on elapsed steps, so no theme paints a permanent silhouette
where something died.

**Acceptance:** effects are driven purely by semantic events; audio muted toggle works;
overlay reveals no visual artifacts in shipped levels.

### 12. Theme-swap proof

**Deliverables:** a second theme (`pixel` or `cartoon`) registered through the theme
contract only, switchable at runtime, plus `docs/theme-contract.md` updated with the
actual steps taken.

**Acceptance:** switching themes changes appearance with **zero** changes outside
`src/render/themes/`. Any change elsewhere is a contract violation to fix.

### 13. Tests, tuning, build

**Deliverables:** `node --test` suites for material damage math, settle detection,
win/lose; headless replay tests for a couple of levels; physics/gameplay tuning pass
recorded in `docs/tuning.md`; the single-file release build verified against both
targets — pushed to a GitHub Pages branch and checked live, plus opened from disk
offline; `docs/deployment.md` written with the actual steps taken; README updated to
match reality.

**Acceptance:** `npm test` green; the deployed Pages URL plays all shipped levels;
the offline copy plays identically with no network requests; tuning log shows every
gameplay constant has a documented reason.

### 14. Load stability + material realism

**Deliverables:** a level is simulated (damage suppressed) before the player gets control
so nothing starts partly damaged or mid-fall; a `wood` material with its own look; glass
made tougher and the damage scale retuned so structures take several hits and topple;
materials visually distinct in Tron and Pixel; a stage with a wood structure whose bird is
still reachable.

**Acceptance:** headless test asserts every body starts at full health and resting; a test
asserts a block survives one hit with visible partial health; sweeps re-measured in
`docs/tuning.md`; every stage still clearable within authored ammo.

### 15. Entity art, cannon art, motion trail, scenery

**Deliverables:** pigs drawn as pigs and birds as birds (ears, snout, wings, beak) in each
theme; a cannon with a barrel that tilts to the aim and a coil spring that compresses with
pull, plus a recoil after firing; a deterministic motion trail behind flying pigs;
background scenery props from level data (trees, silhouettes) painted behind entities.

**Acceptance:** theme tests assert each theme paints the new shapes through the contract
only (`variant`, cannon aim state); browser tests assert painted pixels change when the
aim changes; no changes outside `src/render/themes/` plus presentation modules.

**Delivered (M15).** Pig face (ears, snout, nostrils, eyes) with per-type marks, bird wing
+ beak + comb, cannon barrel tilt (`aimAngle`) and spring compression (`pull`) plus a
decaying recoil flash (D28), a step-aged motion trail in the `behind` layer (D30), and
`scenery` props (`tree`, `ridge`) that are validated but never bodies (D29). The one
change outside the theme files is the renderer's named `behind`/`front` layers, which is
pipeline behaviour, not appearance.

### 16. Debris heaps

**Deliverables:** fragments spawned on destruction that have gravity, land, pile into a
heap, and fade; painted on a layer behind live entities; cleared on level load.

**Acceptance:** headless test asserts fragments settle into a heap near the destruction
point and disappear after their lifetime; deterministic for a given seed.

**Delivered (M16).** `src/fx/debris.ts`: fragments fall under a local gravity constant,
land on the level's `groundTop`, pile upward per ground bucket, and fade while at rest
(D31). They paint behind entities and collide with nothing, so gameplay stays identical —
the determinism gate still reports 0 mismatches.

### 17. Procedural soundtrack

**Deliverables:** a generative WebAudio track that does not loop the same sequence, with a
per-level flavour (tempo, scale, waveform); starts on level load; respects the sound
option; a track name shown in the HUD.

**Acceptance:** headless test with an injected clock asserts the note sequence is
deterministic for a seed and differs between levels; the artifact stays one file with no
audio assets.

### 18. Pig types

**Deliverables:** a pig-type registry (`basic`, `heavy`, `bomb`, `cluster`) with radius,
material, count, spread, damage multiplier and explosion radius; level ammo lists use type
ids and the loader validates them; a bomb explodes on impact (radial impulse + area
damage); a cluster fires a spread of small pigs; a heavy pig tops glass and wood and
topples stone.

**Acceptance:** tests assert spawn counts, explosion impulse and damage, cluster spread,
and ammo consumption; sweeps show at least one stage needs a non-basic pig to clear.

### 19. Title + options screens

**Deliverables:** a title screen listing stages with best scores and a start action; an
options screen with theme, sound, debris, trail, and reset-best, persisted through the
`KeyValueStore`; keyboard shortcuts listed.

**Acceptance:** browser test asserts an option change survives a reload and the title
screen's start loads a stage; no network requests.

### 20. Content escalation

**Deliverables:** a large precarious structure that collapses into a heap; a bird on a
high static platform with tree scenery and structures shielding it; a stage mixing
materials and pig types.

**Acceptance:** `scratch/greedy-probe.ts` and `tests/levels.test.ts` clear every stage
within authored ammo; the difficulty order in `docs/tuning.md` still holds.

## Later / optional

- Level editor (M9 schema makes levels data-only, so an editor is additive)
- More pig types beyond M18: bouncy, splitting (ammo list in level data already supports it)
- WebGL renderer for bloom and larger level object counts
- Accessibility: reduced-motion mode, high-contrast theme, keyboard-only aiming
- Deterministic replay export for debugging

## Open questions — resolved in M2

See `docs/adr.md` D10–D14 for the reasoning behind each.

1. **Destructible structures vs. single-hit objects → HP-based damage.** Objects and
   birds carry material health; collisions above the material's energy threshold
   remove health. A glass block survives a glancing hit and shatters on a solid one,
   so knockable towers work.
2. **Bird death rule → any collision above threshold.** Falls and tower collapse
   kill birds; the rule keys off impact energy, not "who hit me".
3. **Aim constraint → free drag, capped pull, ±75° from horizontal.** Launch
   velocity is `-pull * powerScale`; downward plunges are clamped out.
4. **Canvas size / aspect → fixed 1600x900 world units, letterboxed canvas, camera
   fits level bounds.** Pointer coordinates are mapped through the camera so mouse
   and touch aim identically at any window size.
5. **Level count → 8–12 stages** for first release.
