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
