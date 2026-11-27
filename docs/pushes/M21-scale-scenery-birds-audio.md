# Push plan: M21 — level scale, scenery rules, bird variety, then the audio system

## Work mode

**`autonomous:`** (user: "Work autonomously… until all requested work is complete, tests pass,
and work is committed/pushed, OR until a blocker requiring my input is reached.").

- **Finish line:** all five playtest items done *and* the Tone.js + Tonal soundtrack built;
  `npm run check`, `npm run test:browser`, `npm run check:determinism` green; pushed to
  `origin/main`; CI green; deployed artifact verified. Stop at a blocker needing the user.
- **Boundary:** `src/levels/**`, `src/core/**` (entity state), `src/render/**`, `src/camera/**`,
  `src/audio/**`, `src/main.ts`, `package.json`, `docs/**`, `tests/**`, `scratch/**`.
  Damage/impact maths in `src/physics/matterAdapter.ts` is *not* rewritten — tuning constants may
  change only if a measurement demands it. `docs/developer-notes.md` may only be edited by
  ticking an "Agent" box.

## Goal and acceptance criteria

1. **Scenery never hides gameplay.** No hills/ridges/mountains overlapping the playable band.
   Small props (trees, plinth) may sit in front or behind, but birds and blocks must stay
   readable. Verified by probe: no bird's screen position overlaps a scenery prop bbox.
2. **Birds face randomly left or right, and there are four bird looks.** Facing and variety are
   deterministic (seeded from the level id + bird index), so the determinism gate still holds.
3. **Neon borders on scenery props.** Bright coloured outlines; fills stay dark so props read as
   backdrop, not occlusion.
4. **Bigger, more complex levels.** Six stages, 24-40 bodies each, larger structures (multi-tier
   towers, walls, long spans), and no bird killable by a direct hit without breaking structure
   first. Difficulty order monotone; measured, recorded in `docs/tuning.md`.
5. **A real soundtrack.** Tonal for musical structure (scale, chords, progressions), Tone.js for
   playback (transport, synths, effects). It must sound ordered — chord progression + bass +
   melody — not random notes. Headless tests cover composition determinism; browser tests cover
   playback wiring. If the libraries need a decision change, update `docs/adr.md`.

## Steps

- [ ] **A. World width.** Extend the fixed world from 1600x900 to 2200x900 (keep height, so
      vertical framing and `groundTop = 840` stay). Measure landing distance; retune
      `powerScale` if the far end becomes unreachable. Record numbers.
- [ ] **B. Scenery rules.** Drop `ridge` from all levels; keep `plinth` + occasional small
      trees placed clear of structures. Add a probe that flags any bird overlapping a prop bbox.
- [ ] **C. Neon scenery borders.** Tron + Pixel: colourful per-kind outline, dark fill. Test.
- [ ] **D. Bird facing + varieties.** `birdFacing`/`birdVariant` derived from a seeded PRNG
      (level id + bird index); paint four distinct looks in both themes. Headless + browser tests.
- [ ] **E. Re-author all six levels** at 2200 wide with 24-40 bodies, larger structures, and
      shielded birds (rule 1 revised in `docs/level-format.md`, ADR entry).
- [ ] **F. Re-measure content:** sweep all six stages, greedy bot clears, shield probe. Record
      win counts and pigs-needed per stage in `docs/tuning.md`.
- [ ] **G. Re-derive test aim fixtures** from measurements (headless + browser win aims).
- [ ] **H. Gates + push** for the content/scenery phase; verify CI and the live artifact.
- [ ] **I. Audio system:** install `tone` + `@tonaljs/tonal`; pure composition module (chords,
      progression, rhythm, level-hash key) + browser-only playback module using Tone.Transport.
      Update D32 (scheduling clock, dependencies, artifact size). Wire options/HUD, mute/dispose.
- [ ] **J. Audio tests:** headless composition tests; browser test asserting the transport runs
      and toggling music starts/stops it without leaking nodes.
- [ ] **K. Close out:** gates + push, docs sweep (README, checklist, tuning, theme-contract,
      adr), tick the audio "Agent" box in `docs/developer-notes.md` with the footnote format.

## Gates

Run each as `npm run <gate> > log 2>&1; echo exit=$?` — never piped through `grep`.
`npm run check` · `npm run test:browser` · `npm run check:determinism`.

## State to resume

- Branch `main`. HEAD at push start: `4089296` (docs: M21 plan, vision review notes).
- Last green gates on `c9b1ddc`: `npm run check` 0 (155 headless), browser 0 (27),
  determinism 0 (144 combos, 0 mismatch).
- Baseline content (before this push): body counts stage 1 = 4, 2 = 7, 3 = 6, 4 = 9, 5 = 7,
  6 = 12; sweep win rates 75/19/10/12/8/4 of 495 combos per stage; greedy bot clears stage 1 in
  1 pig, stages 2-5 in 2, stage 6 in 4.
- `WORLD` = 1600x900 today, `groundTop` = 840, cannon origin (120, 700), `powerScale` 0.22,
  `DAMAGE_SCALE` 0.3, `IMPULSE_SCALE` 0.02, blast radius 130 (falls to zero at 130 units).
- Confirmed working by the user: `npm run dev`, and the music backlog fix.

## Open questions (asked, not blocking)

1. Artifact size after adding Tone.js + Tonal (bundle grows by roughly 300 KB minified). The
   user asked for the libraries, so proceed; report the final size.
2. Ammo budget per stage once stages grow — proceeding with 5-6 pigs, will report what the
   greedy bot actually needs.

## Supersedes

`docs/pushes/M21-level-scale-and-protection.md` was the proposal awaiting approval; the user
approved with an `autonomous:` instruction plus the scenery/bird/audio items, so this file is
the active contract.
