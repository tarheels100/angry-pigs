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

- [ ] Music disabled by default (item 2), and the load-time burst gone (item 1).
- [ ] Menu unpause fix (item 8), reproduced in a browser test before fixing.
- [ ] Support-removal hover fix (item 7), reproduced by a probe before fixing.

### Level protection (item 6)

- [ ] Re-author stages so birds sit behind/above structure with a measured failure mode.
- [ ] Re-run sweeps + greedy bot; record per-stage win counts and pigs needed.

### Art pass (items 3, 4, and the bland background)

- [ ] Pig silhouette: head/ears/snout/legs, per-type marks; not a circle.
- [ ] Bird silhouette: body/wing/beak/comb; not a circle.
- [ ] Launcher: barrel that tilts to the aim, mouth, carriage, spring along the barrel.
- [ ] Background: layered horizon, larger props (trees ≥ bird size), depth cue.
- [ ] Theme tests updated to the new recipes; pixel theme follows the same contract.

### Close

- [ ] Docs: `docs/tuning.md` (numbers), `docs/adr.md` (decisions), `docs/checklist.md`,
      `docs/theme-contract.md`, `docs/level-format.md`, `README.md`.
- [ ] All three gates green locally, CI green, live page verified.
- [ ] This file closed with outcome, gate results, deferred items.

## State to resume

- Branch `main`; HEAD at plan time: `216b6f7` (docs: vision works via strata).
- Last green gate run: `npm run check` at `216b6f7` (152 headless, 138 KB artifact).
- Known seams for browser assertions: `window.__game`, `__camera`, `__trail`, `__debris`,
  `__music`, `__explosions`, `__options`. A step-count seam is needed for item 8 and does
  not exist yet.

## Open questions (need the user)

- Should music stay reachable as an option (default off), or be removed from the options
  screen until the revisit? The plan assumes default off, still listed as a toggle.
- Item 3's target look is subjective. The plan asserts silhouettes are non-circular and
  recognizable by construction; a visual review (vision is available now) is the judgment
  layer. If the look is still wrong after the pass, that needs your description, not mine.
