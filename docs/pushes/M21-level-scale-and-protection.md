# Push plan: M21 — level scale and bird protection

## Work mode

**Awaiting an explicit `autonomous:` go-ahead.** The playtest report asked for items 4 and 5
(birds too exposed, levels too small / ~35 bodies), which is a multi-layer content push with
design decisions in it, so per `AGENTS.md` rule 3 it gets a plan and then a check-in.

Proposed contract if you approve:

- **Mode:** `autonomous:`
- **Finish line:** all six stages re-authored inside the fixed world with 24-40 bodies each,
  every bird shielded so no direct pig hit can kill it without breaking structure first;
  greedy bot clears stage 1 in 2 pigs and stages 2-6 in 3-5; `npm run check`,
  `npm run test:browser`, `npm run check:determinism` green; pushed and deployed.
- **Boundary:** `src/levels/**`, `docs/level-format.md`, `docs/tuning.md`, `docs/adr.md`,
  `docs/checklist.md`, `README.md`, test aim fixtures in `tests/levels.test.ts` /
  `tests/game.test.ts` / `tests/browser/game.browser.mjs`, probes in `scratch/`.
  Not touched: physics maths (`src/physics/**` damage model), themes, audio, camera.

## Goal and acceptance criteria

1. **No exposed birds.** Today stage 1 has a bird sitting on bare ground at `x=660`, and the
   sweep finds 75 winning combos for it — a flat shot kills it with no structure involved.
   Acceptance: for every bird, the pig's approach path is blocked by at least one destructible
   block, and killing the bird requires either (a) breaking that block, or (b) collapsing a
   support the bird rides on. Verified by probe, not by eye.
2. **24-40 bodies per stage.** Current counts: stage 1 = 4, stage 2 = 7, stage 3 = 6, stage 4
   = 9, stage 5 = 7, stage 6 = 12. Acceptance: 24-40 bodies, with at least three separate
   structures per stage so a single blast cannot clear the stage.
3. **Difficulty order stays monotone.** Sweep win rates must rise in difficulty: stage 1
   easiest, stage 6 hardest. Record the numbers in `docs/tuning.md`.
4. **The world does not change.** `WORLD` stays 1600x900 (D13): the physics adapter and the
   out-of-bounds consumption rule are built on it, so "bigger" means denser and taller builds,
   not a bigger world. If you want a bigger world, that is a separate decision (adapter
   recreation per level, bounds in D13, sweep re-baseline) — say so and I will plan it.

## Steps

- [ ] Write a probe that reports, per stage: body count, and for each bird whether a direct
      line from the launch origin reaches it without crossing a block. Baseline the current
      six stages before editing anything.
- [ ] Revise rule 1 in `docs/level-format.md`: "a bird must be shielded so no launch angle
      kills it directly" replaces "at least one bird reachable by a flat shot", with the
      collapse route still allowed. Record the change in `docs/adr.md`.
- [ ] Re-author stage 1: keep it readable, 24-26 bodies, bird behind a wood/glass screen.
- [ ] Re-author stages 2-4: multi-tier structures (wood legs, glass storey, stone only as
      side walls per rule 3), 28-34 bodies, at least three structures.
- [ ] Re-author stages 5-6: finale density 36-40 bodies, keeping rule 9 (blast distance) and
      rule 4 (a structure with one bird needs a failure mode).
- [ ] Re-measure: `scratch/sweep-probe.ts` over all six stages, `scratch/greedy-probe.ts`,
      the shield probe from step 1. Write results to `docs/tuning.md`.
- [ ] Re-derive test aim fixtures from measurements (browser tests hardcode degrees and win
      aims; headless tests do the same). Use the greedy probe's winning pulls, not guesses.
- [ ] Gates: `npm run check`, `npm run test:browser`, `npm run check:determinism`, then push
      and verify the deployed artifact byte-identical.
- [ ] Close out this file with outcome, gate results, deferred items.

## Gates

`npm run check` · `npm run test:browser` · `npm run check:determinism`. Run each as
`npm run <gate> > log 2>&1; echo exit=$?` (never piped through `grep` — see
`docs/pushes/post-m20-playtest.md`).

## State to resume

- Branch `main`, HEAD after the viewport/layout fix commit.
- Last green gate run: `npm run check` exit 0 (155 headless), browser 27 pass, determinism
  144 combos 0 mismatch, on commit `c9b1ddc`.
- Current measured sweep win rates (baseline): stage 1 75/495, stage 2 19/495, stage 3 10/495,
  stage 4 12/495, stage 5 8/495, stage 6 4/495. Greedy bot: stage 1 in 1 pig, 2-5 in 2, 6 in 4.
- Body counts above are the baseline; the shield probe has not been written yet.

## Open questions for the user

1. **Bigger world or denser levels?** Denser keeps determinism and the adapter contract; a
   bigger world changes D13 and every measurement. Which one?
2. **Ammo** stays 4-6 pigs per stage. If stages grow to 40 bodies, is 5 pigs still the right
   budget, or 6-7? Difficulty target = pigs needed, so tell me the target.
3. **Touch on portrait.** A 420x800 window shows the whole 1600-wide level as a thin band; any
   wide level is cramped in portrait. Options: a landscape hint, or per-level portrait bounds.
   Not in this push unless you say so.
