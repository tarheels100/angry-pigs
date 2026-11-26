# Verification checklist

Work top to bottom. Every step is either a command or a manual action with an
expected result. Record findings where each step says, so the next milestone has
measurements instead of guesses.

Status legend: `[ ]` not run, `[x]` run and passing, `[~]` run and found a problem.
				`[/]` couldn't test or chose not to

## 0. Baseline gate

- [x] `npm run check` — typecheck, tests, build in one command.
      **Expected:** 58 tests pass, `dist/index.html` written.

## 1. Browser-only checks

Headless tests cannot cover these (`tests/browser.*` does not exist yet — see
`docs/browser-testing.md`). Serve with `npm run dev`, then reload after each edit.

- [x] **Offline artifact.** Open `dist/index.html` directly with `file://`, no server.
      **Expected:** canvas renders, drag fires pigs, zero console errors, zero network
      requests (D6: levels are embedded, nothing fetches).
- [x] **Resize during a drag.** Press and hold mid-drag, then resize the window
      (or toggle device emulation).
      **Expected:** the pull stays coherent — it must not jump because `refit()`
      rebuilds the camera. If the aim snaps, fix by re-deriving the pull in screen
      space or re-fitting without discarding the gesture.
- [/] **High-DPR display.** Load on a 2x screen (or force `devicePixelRatio`).
      **Expected:** pointer mapping matches the drawn geometry; the guide and the pig
      line up. Mapping uses CSS pixels via `getBoundingClientRect`, so this should be
      correct — confirm, don't assume.
- [/] **Touch.** Finger-drag past a canvas edge; trigger a browser gesture cancel;
      tap Restart.
      **Expected:** moves keep arriving (pointer capture), a cancelled gesture never
      fires a shot, Restart works on tap.
- [x] **Tab hidden, then resumed.** Hide the tab for ~10s during flight.
      **Expected:** pigs resume in place, no teleport (loop discards surplus time).
- [x] **Theme cycling mid-flight.** Press `t` while a pig is in the air.
      **Expected:** the second theme looks visibly different; destroyed entities are
      not painted.
      **Note:** the colour change passes, but "destroyed entities are not painted" is
      not true today — corpses render white until milestone 11 (see the deferred item
      in section 2). Treat that half of this check as pending.
- [ ] **Watch workflow.** Edit a source file, reload manually, confirm the new bundle
      is served (no HMR by design).
- [x] **Pages deploy.** Published by the workflow on push to `main`.
      Verified: `https://tarheels100.github.io/angry-pigs/` returns 200, the served
      bytes are sha256-identical to `dist/index.html`, there is one inline `<script>`,
      no absolute URLs, and no `fetch(`. Live playtest (drag + fire) still yours to do.

## 2. Gameplay and simulation evaluation

Re-run `scratch/sweep-probe.ts` (`node scratch/sweep-probe.cjs` after bundling, or
`node --experimental-strip-types` style run) before and after each tuning change.

- [ ] **Crush vs shatter.** Count bird deaths caused by direct pig impact vs by
      falling debris. Today both flow through the same `impactEnergy` path.
      **Record:** counts per sweep combination, in `docs/tuning.md`.
- [x] **Pigs nudging ground birds.** Let a slow pig roll into a bird on the ground.
      **Expected:** tiny contact energy must not kill a target through the floor.
      If it does, raise the damage floor rather than lowering bird health.
- [ ] **Settle timeout honesty.** Several shots end at 239 steps — the
      `SETTLE_TIMEOUT` cap, not genuine rest.
      **Decision to record in `docs/adr.md`:** should the timeout also freeze bodies
      (`wakeAll`, zero velocity) so "settled" means visually stopped before M8 scores
      on it?
- [~] **Determinism.** Same machine, same runtime: two sweep runs produced identical
      outcomes (only the printed `ms per call` timing line differed — exclude timing
      from any replay assertion). Cross-runtime/cross-machine check still pending:
      run the suite on another Node version or machine.
- [x] **Partial destruction.** Retuned: damage per impact is `0.35 * energy / threshold`
      (`DAMAGE_SCALE`), so the sweep now reports blocks gone 0–3 with partially
      damaged survivors instead of binary 0-or-3. Intermediate visuals (cracks/tilt from
      `health`/`healthMax`) land with the Tron theme. Re-measured after the change:
      wins 4/51, one-shot clears 4/51.

### Resolved (was deferred to milestone 11)

- [x] **White silhouettes linger where things died.** Fixed by D17: destroyed bodies
      leave `snapshot()`, and the game flashes their last state as a display extra that
      fades over `FLASH_STEPS = 10`. A test asserts corpses disappear and that `fade`
      is in range. Particles/audio/shake remain milestone 11 work.

## 3. Baseline data to tune against

Stage 01 sweep, 51 pull combinations (`scratch/sweep-probe.ts`):

| pull | outcome |
| --- | --- |
| 30 units | kills nothing at every angle, destroys 0 blocks — 17 combinations of wasted ammo |
| 45 units | kills the ground bird at most angles; wins only at -15°/-10° |
| 90 units (full) | destroys 3 blocks + ground bird at -5°..10°; wins at 15°..30° |

- 6/51 combinations clear both birds in one shot — that is the star-3 data point.
  Derive star thresholds from this distribution, not from an invented rule.
- Preview cost: `simulateTrajectory` is 0.07 ms per call (120 steps, 7 bodies), so
  recomputing per pointermove is free at this scale. Re-measure before M10 with
  100+ bodies.

## 4. Contracts and CI gaps to close before M9

- [x] **Shot count and stars.** `RulesSnapshot.launches` already counted shots; added
      `stars`, derived by `starsFor(launches, targetsTotal)` (D19). Kept in rules, not
      the HUD.
- [ ] **Camera refit on level switch.** `main.ts` captures `bounds` once and `refit()`
      uses it, so a level with different bounds renders at the wrong zoom. Re-fit on
      `loadLevel` and add a test asserting zoom changes.
- [ ] **`PointerSource.dispose()`.** Level switching that recreates the source would
      leak canvas listeners. Add it while the API is small.
- [ ] **Entity id namespace.** Display extras (`cannon`, `cannon-pig`) share the
      registry with physics ids (`pig-1`). Assert extras cannot collide with physics
      ids.
- [x] **`npm run check`** script (`typecheck && test && build`), plus
      `.github/workflows/deploy.yml` running it and publishing `dist/` so the gate is
      enforced rather than remembered. Uses Actions' `GITHUB_TOKEN`; no PAT committed.
- [x] **Artifact assertion test.** `tests/artifact.test.ts` rebuilds the artifact and
      rejects absolute URLs, root-absolute paths, and runtime `fetch`. Build now strips
      legal comments so matter-js's license URL is not in the shipped file.

## 5. Where to record results

- Tuning constants and measured values: `docs/tuning.md`
- Physics behaviour and gotchas: `docs/physics.md`
- Anything decided rather than measured: `docs/adr.md`
