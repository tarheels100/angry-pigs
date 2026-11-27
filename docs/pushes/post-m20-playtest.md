# Push plan — post-M20 playtest fixes

## Work mode

`autonomous:` (user said "Work autonomously" after the playtest report). Finish line and
boundary below were adopted by the agent and are open to correction.

- **Finish line:** all eight playtest items addressed; `npm run check`,
  `npm run test:browser`, `npm run check:determinism` green; pushed and deployed. Then stop.
- **Boundary:** `src/render/**`, `src/fx/**`, `src/levels/**`, `src/main.ts`, `src/ui/**`,
  `src/audio/**`, `docs/**`. Physics *behaviour* (solver, damage model, scoring, pig rules)
  is not changed; only wake/support bookkeeping in the adapter may change, and any such
  change must be measured by a probe and recorded in `docs/tuning.md`.
- **Gate discipline:** every commit leaves `npm run check` green.

## The report (user playtest, 2026-11-26)

| # | symptom | kind | area |
| --- | --- | --- | --- |
| 1 | Loud cacophony of sound at the start of some levels | bug | audio |
| 2 | Music is on theme but bad — disable until revisited | instruction | audio |
| 3 | Pig/bird detail "not quite what I'm looking for": break out of circles into natural, recognizable shapes | art | render |
| 4 | Cannon doesn't resemble a cannon/launcher; rectangle with a barely visible tiny spring that doesn't follow the aim tilt | art | render |
| 5 | Particle effects are cool (keep) | confirmation | — |
| 6 | Birds too exposed; easily hit directly | level design | levels |
| 7 | Destroying the structure under an object/bird often leaves it hovering | bug | physics adapter / game |
| 8 | Returning from the menu never unpauses; restart does nothing; reload fixes it | bug | main/UI |

## Acceptance criteria

1. No audio burst at level load: the first notes must not fire in a cluster, and nothing
   plays before a user gesture.
2. Music off by default and clearly off in the HUD; the module stays for a later revisit,
   with tests still covering its generation.
3. Pigs read as pigs and birds as birds at a glance — silhouettes that are not circles:
   body + head + ears/snout for pigs, body + wing + beak for birds. Asserted by geometry
   (paint recipe emits more than one path per entity), not by pixels.
4. Launcher reads as a launcher: a barrel that visibly tilts with the aim, a mouth, a
   carriage/base, and a spring that scales with pull along the barrel axis.
5. Birds are protected: a bird must be reachable only by collapsing something it rides or
   by an arc that has to clear structure — assert per stage that no bird is reachable from
   a flat shot, and that every bird has ≥1 structural failure mode.
6. A body supported by a destroyed body falls: probe asserts each unsupported body's
   y-position changes after its support is removed, for a stack, a beam on two columns, and
   a bird riding a beam.
7. Closing the menu resumes the simulation: browser test asserts step count advances after
   `Escape` closes the overlay, and `R` restarts a live round.
8. Backgrounds and scenery scaled to the world: props are drawn at a scale that relates to
   the structures (trees taller than a bird diameter), with layered depth rather than a flat
   wash.

## Steps

### Bugs first (2 → 8 → 7)

- [x] Music disabled by default (item 2), and the load-time burst gone (item 1).
- [x] Menu unpause fix (item 8), reproduced in a browser test before fixing.
- [x] Support-removal hover fix (item 7), reproduced by a probe before fixing.

### Level protection (item 6)

- [x] Re-author stages so birds sit behind/above structure with a measured failure mode.
- [x] Re-run sweeps + greedy bot; record per-stage win counts and pigs needed.

### Art pass (items 3, 4, and the bland background)

- [x] Pig silhouette: head/ears/snout/legs, per-type marks; not a circle.
- [x] Bird silhouette: body/wing/beak/comb; not a circle.
- [x] Launcher: barrel that tilts to the aim, mouth, carriage, spring along the barrel.
- [x] Background: layered horizon, larger props (trees ≥ bird size), depth cue.
- [x] Theme tests updated to the new recipes; pixel theme follows the same contract.

### Extra scope the playtest added (not in the original plan)

- [x] HUD row wrapping so the restart button is on screen (`index.html`).
- [x] The artifact must inline its bundle (playtest item 5) — `build-html.js` + artifact test.
- [x] The game opens on the title screen (playtest item 1) — D35 extension.
- [x] The launcher stands on a plinth (playtest item 4) — level rule 10.

### Close

- [ ] Docs: `docs/tuning.md` (numbers), `docs/adr.md` (decisions), `docs/checklist.md`,
      `docs/theme-contract.md`, `docs/level-format.md`, `README.md`.
- [ ] All three gates green locally, CI green, live page verified.
- [ ] This file closed with outcome, gate results, deferred items.

## State to resume

- Branch `main`; HEAD at plan time: `216b6f7` (docs: vision works via strata).
- Last green gate run at close: `npm run check` (typecheck, 155 headless, build),
  `npm run test:browser` (27 pass), `npm run check:determinism` (144 combos, 0 mismatch).
- Seams for browser assertions: `window.__game`, `__camera`, `__trail`, `__debris`,
  `__music`, `__explosions`, `__options`, and now `__steps()` (`loop.stepsTaken()`).
- Measured stage-01 aims from the new cannon height (`scratch/aim-search.ts`): clear at
  `deg 0`, beam bird at `deg -20/-25`, open bird at `deg 10`, miss at `deg -70`.

## Running log

- **Items 2 + 1 (audio).** `music` added to `src/ui/options.ts` (default false); `src/main.ts`
  only ticks the scheduler while it is on; HUD shows `music off`; options panel gained the row.
  `tests/options.test.ts` and `tests/screens.test.ts` updated; the load-time burst is gone
  because no scheduler runs.
- **Item 8 (menu resume).** Reproduced with `scratch/step-probe.mjs`: pig frozen mid-flight,
  `R` did nothing. Cause: the title overlay was opened *before* `loop.start()`, so the pause
  never happened and closing never resumed. Fixed by `openOverlay()` + `loop.start()` in
  `screens.onClose`; added `window.__steps()` and two browser assertions.
- **Item 5 (artifact).** Reproduced: `file://` load requested `./dist/main.js`, which does not
  exist next to the artifact — the shipped page had no game at all. `build-html.js` now inlines
  the minified bundle; the artifact test asserts one request and no script src.
- **Item 7 (hovering rubble).** Reproduced with `scratch/hover-probe.ts`: a beam resting on a
  removed column stayed at its authored y. `wakeNear` now also wakes the bodies it was resting
  on, plus a support-chain sweep on destruction; the game keeps stepping (damage suppressed)
  after a round ends until the world sleeps. Probe now drops the beam ~56 units; the two-column
  tower drops only after both columns go (correct).
- **Items 3 + 4 + 8 (art).** Rewrote `paintPig`, `paintBird`, `paintCannon`, `paintScenery` in
  both themes; plinth prop kind added (`src/levels/index.ts`, all six levels); cannon origin
  moved to `y = 700`; `LOAD_DEPTH` 0.5 → 0.2. Theme tests extended (ears, beak, plinth masonry,
  pig/bird palette separation).
- **Aims re-measured** after the height change; five test aims and browser `WIN` updated.
  `npm run check` → typecheck clean, 155 tests pass. `npm run test:browser` → 27 pass.
  `npm run check:determinism` → 144 combos, 0 mismatches, 6 wins, 6 settle timeouts.
- **CI caught two gates my grep hid.** The deploy run on `335bea5` failed `npm run check`, and
  the log I read locally had been piped through `grep`, so the pipeline's exit code — not the
  gate's — decided whether the chain continued. Real failures: `tests/levels.test.ts` type
  errors (`SCENERY_KINDS.includes(string)` needs a `readonly string[]` view) and
  `tests/smoke.test.ts`, which drove frames while the title screen was still open and so
  asserted a loop that is legitimately paused. Both fixed; the smoke test now asserts the
  paused state (one queued frame, then none) and that `Escape` resumes and steps advance.
  Re-ran with `npm run check > log 2>&1; echo exit=$?` → 0, browser 27 pass, determinism 0
  mismatch. **Rule for this push: read a gate's exit code, never a filtered pipeline's.**

## Outcome

Playtest items 1-8 are fixed, with gates green:

| item | result |
| --- | --- |
| 1 audio burst on load | no scheduler runs; music off by default |
| 2 music weak | default off, still a toggle (D32 extension) |
| 3 pig/bird silhouettes | head, ears, snout, eyes, legs, per-type marks; egg body + wing + tail + beak + comb |
| 4 launcher floating | carriage + wheels + coil on a masonry plinth; barrel tilts |
| 5 reload needed | artifact inlines its bundle; `file://` and Pages work with one request |
| 6 birds too exposed | birds sit on pedestals/towers with structural failure modes; no bird under stone |
| 7 hovering rubble | support chain woken on destruction; world steps until asleep |
| 8 menu never unpauses | overlay opened after the loop, resumed on close; steps asserted |
| (found) HUD off-screen | canvas height now bounded by viewport; restart button visible |

Deferred, needing your call:

- **Item 6 judgement.** Stage 01 still has one bird reachable by a flat shot, by design
  (rule 1: a level needs at least one bird a good direct aim can take). If you want *every*
  bird behind structure, that rule changes and every stage gets re-authored.
- **Music quality.** Off by default; the generator stays. A real sound-design pass is M23.
- **Touch drag on a device.** Playwright emulates taps only; finger drag + pointer capture is
  still unverified (`docs/checklist.md` §1).

## Open questions (need the user)

- Should music stay reachable as an option (default off), or be removed from the options
  screen until the revisit? The plan assumes default off, still listed as a toggle.
- Item 3's target look is subjective. The plan asserts silhouettes are non-circular and
  recognizable by construction; a visual review (vision is available now) is the judgment
  layer. If the look is still wrong after the pass, that needs your description, not mine.

### CI round: a blank canvas behind the menu

The first CI run after the fixes failed two steps, both invisible locally because I read
filtered output instead of exit codes:

- `build` job, `npm run check` — two type errors in `tests/levels.test.ts`
  (`SCENERY_KINDS.includes(string)`) and `tests/smoke.test.ts`, which drove frames while the
  title screen was still open and so asserted a loop that is legitimately paused.
- `browser` job, `npm run test:browser` — the launcher-pixel test was flaky (passed on one run,
  failed on the next). Reproduced in a fresh clone: two of three runs failed.

Root cause of the flake, and a real bug the playtest did not name: the title screen pauses the
loop, and `refit()` resized the canvas without repainting, so a resize behind the panel left a
**blank canvas** — a pixel sample taken then read zeros. Fix in `src/main.ts`: the drawing moved
into `drawFrame()`, used by the loop's render callback; it is called once at load before the
title screen pauses the loop, and `refit()` repaints through a `repaint` seam. The browser test
also waits for the first painted frame before sampling.

Re-ran three times: `npm run test:browser` exit 0 each time (27 tests). `npm run check` exit 0.
`npm run check:determinism` exit 0 (144 combos, 0 mismatch). CI on `5c0b63d` completed success;
the live page (`https://tarheels100.github.io/angry-pigs/`) returns 200 and is byte-identical to
the local artifact (sha256 `f10f37cdc7ecf3e7…`).

**Gate discipline for the next push:** run a gate as `npm run <gate> > log 2>&1; echo exit=$?`.
A pipeline through `grep` reports grep's status, which hid two real failures here.

---

## Second playtest round (same slug, items renumbered by the report)

The player's next report: local `npm run dev:open` showed a blank dark page; the viewport
was "too zoomed in" with the launcher and most of the level off screen; the spring looked
oddly placed and small; the background field was far too fine (asked for >=5x); music
cacophony at level start (item 5 deferred); and the real difficulty problem — birds
reachable without breaking anything, levels ~35 bodies.

### Fixed in this round

- **Dev page blank.** `index.html` asked for `./main.js`; the dev server serves the repo
  root and the watch bundle lives at `/dist/main.js`, so the script 404'd and the page was
  a dark empty box. GitHub Pages was fine because `build-html.js` inlines the bundle into
  `dist/index.html`. `index.html` now points at `./dist/main.js` and `build-html.js`'s
  inlining tag matches. This is the dev/release path asymmetry README D6 warned about —
  it had not been checked for the *dev* page, only for the release artifact.
- **Viewport.** Two real bugs, both invisible at 1280x720:
  - `renderer.resize` wrote inline `style.width/height`, freezing the canvas at the size
    the page loaded with; CSS (`width: 100%`, `height: calc(100vh - 56px)`) stopped
    applying after a window change. It now sets only the backing store, and CSS owns the box.
  - `MIN_ZOOM = 0.5` clamped the *fit*, so a portrait window (fit ~0.25) cropped the level
    and pushed the launcher off screen. The floor is now `min(0.5, fitZoom())`, so "see the
    whole level" wins and manual zoom-out cannot go past the fit.
- **Camera seam was stale.** `window.__camera` handed out the camera instance captured at
  load, while `refit()` re-creates the camera on resize — probes read a frozen zoom. The
  seam is now closures over the live camera plus `__viewport()`. Verified: 1280x720 zoom
  0.738, 420x800 zoom 0.2475 (whole 1600-wide level visible), 1920x1080 zoom 1.138.
- **Spring.** Drawn *in the bore* on the barrel axis in both themes, compressing with the
  pull. Previously it hung below/outside the barrel as an unrelated squiggle.
- **Background scale >=5x.** Tron `GRID` 44 → 220 screen px; Pixel checker cell
  `BLOCK * 5` = 80 px with a 160 px period. Scenery props scaled ~5x too: trees 32-40x120-156
  → 170-210 x 680-720 (centres re-set to `groundTop - h/2` so bases stay on the ground),
  ridges 200-260x28-36 → 1200-1300 x 240-260. Props are art-only (D29), so outcomes and the
  determinism gate are untouched.
- **Music burst.** `createMusic` now gets `clock: () => loop.stepsTaken() * (1000/60)`, so a
  track starts at *current* simulated time instead of 0. With the old base clock, turning
  music on (or loading a level) mid-round replayed every note already elapsed — one note per
  frame until the scheduler caught up, which is the cacophony. The first stage's announcement
  moved after the loop exists, since the clock reads `loop.stepsTaken()`.

### Deferred, needs your call

- **Difficulty redesign** (report items 4 and 5): every bird buried behind/atop a structure
  that has to be broken first, and levels of 20-40 pieces. That changes level design rule 1
  and re-asserts winning aims and sweep results for all six stages, so it is its own push with
  a plan file. Tell me the finish line (e.g. "all six stages re-authored at 2400x1200, greedy
  bot clears each in 3-5 pigs, gates green") and I will run it.
- **Music quality** stays deferred to M23; only the burst bug is fixed.

### Gates

`npm run check` exit 0 (155 headless), `npm run test:browser` exit 0 (27),
`npm run check:determinism` exit 0 (144 combos, 0 mismatch). The DPR browser test changed:
the 16:9 CSS box is gone, so it now asserts the camera invariant instead — horizontal world
lines stay horizontal, world lengths map uniformly, and the zoom equals the viewport fit.

### Vision review of the current build

Screenshots (`scratch/shots/`, gitignored — regenerate with a Playwright probe) were read back
through the session model, which is the judgment layer `docs/browser-testing.md` describes;
numeric assertions stayed the gate. What the images showed:

- The launcher reads correctly now: carriage, wheels, plinth, barrel tilted by the aim, spring
  inside the bore.
- Trees and the ridge band are large enough to read as scenery.
- **Stage 1 is visibly sparse**: four bodies, one pedestal, one wall, and a bird sitting on bare
  ground mid-field. That is the difficulty complaint in picture form, and it is what the M21
  plan targets.
- **Portrait 420x800** shows the whole level but as a thin band with empty sky above and below.
  Unavoidable while levels are 1600 units wide; recorded as an open question in the M21 plan.
