# Push record — M13 closeout, tuning, and coverage (retroactive)

Written after the work landed, because `AGENTS.md` (the push-plan rule) was added at the
end of this push. Everything below is reconstructed from commits, probes, and the docs;
it is kept as the permanent record of the push and as the resume point if a later session
picks the deferred items up.

## Goal and acceptance criteria

- Close the last open items of the M1–M13 roadmap: death attribution, ammo bonus score,
  best-result persistence, cross-runtime determinism, browser tests, touch coverage.
- Every tuning change must be measured by a probe, not guessed.
- Gates green locally **and** in CI: `npm run check`, `npm run test:browser`,
  `npm run check:determinism`.

## Steps (all done)

- [x] Death attribution (`impact` / `crush` / `fall`) in `src/game/game.ts`, using
      collision partner tracking.
- [x] Ammo bonus on a clear: `score += ammoLeft * 500` (`src/game/rules.ts`), ADR D23.
- [x] Best results per stage in `localStorage` behind a `KeyValueStore`
      (`src/game/save.ts`), ADR D24; HUD shows `best ★★★ 3500`.
- [x] Cross-runtime determinism: `scripts/determinism.js` bundles
      `scratch/sweep-entry.ts` as ESM for node and IIFE for Chromium, runs 72 identical
      combos. **Result: 0 mismatches** (3 wins, 11 settle timeouts). Added to the CI
      browser job.
- [x] Playwright server lifecycle fixed: `startServer(0)` (ephemeral port) instead of a
      fixed port, so no leftover listener can collide and nothing needs killing.
- [x] Score/persistence browser test (clear → reload → stored best, stage restarts fresh).
- [x] Stage 02/03 redesign around support failure modes (single-column pedestal tips;
      two-column tower collapses). New level design rule 4 in `docs/level-format.md`.
- [x] `feather.damageThreshold` 2 → 1.4 so a bird rolling off a tilting beam dies.
- [x] **Bug fix:** birds rolled forever. `ROLLING_DAMPING` now covers kind `bird` as well
      as `pig` (`groundedRoll`) — ADR D25. Measured: bird pushed at speed 8 slept at step
      134 after 109 units (was awake at step 240 after 327 units). Regression test added;
      probe `scratch/bird-roll-probe.ts`.
- [x] Touch tap coverage: `hasTouch` contexts in `tests/browser/harness.mjs`; canvas tap
      spends no ammo (D14), HUD restart tap restarts the stage.
- [x] Docs sweep: `docs/tuning.md` (rolling resistance, ammo bonus, persistence key, new
      sweep table), `docs/checklist.md`, `docs/adr.md` (D21–D25), `docs/level-format.md`,
      `docs/physics.md`, `docs/theme-contract.md`, `README.md`. `docs/working-plan.md`
      deleted — replaced by this `docs/pushes/` convention.

## Gates, as recorded

- `npm run check` — typecheck clean, **106** headless tests pass, artifact built
  (116.8 KB inline).
- `npm run test:browser` — **12** Chromium tests pass.
- `npm run check:determinism` — 72 combos, **0 mismatches** node vs Chromium.
- Single-shot sweeps (495 combos/stage): stage-01 94 wins / 93 timeouts, stage-02
  35 wins / 59 timeouts, stage-03 39 wins / 45 timeouts. `scratch/greedy-probe.ts`
  clears every stage within authored ammo.
- Pages deploy: published on push to `main`, served bytes sha256-identical to
  `dist/index.html`.

## Commits in this push

`54da00b` (score/persistence/determinism) → `6126a09` (docs) → `eb48223` (stage retune) →
`509b62f` (bird rolling resistance, D25) → `3d13050` (touch-tap coverage). Branch `main`,
HEAD `3d13050` at the time this record was written.

## Deferred / needs the user

- **Real finger drag on a touch device.** Chromium emulates taps only; touch move +
  pointer capture must be checked on hardware (`docs/checklist.md` §1).
- **Determinism across machines/Node versions** — CI runs the check on Linux, which
  covers the runtime dimension; deeper hardware variation is unverified.
- Backlog of polish and content ideas lives in `docs/post-m13-notes.md` (detailed
  cannon, pig/bird art, title screen, procedural soundtrack, tougher materials,
  debris heaps, pig types). The next large push should start its own
  `docs/pushes/<slug>.md` plan and treat that file as the candidate scope.
