# Verification checklist

Work top to bottom. Every step is either a command or a manual action with an
expected result. Record findings where each step says, so the next milestone has
measurements instead of guesses.

Status legend: `[ ]` not run, `[x]` run and passing, `[~]` run and found a problem,
`[/]` couldn't test or chose not to.

## 0. Baseline gate

- [x] `npm run check` — typecheck, 99 headless tests, build in one command.
      **Expected:** all pass, `dist/index.html` written (~115 KB inline, one `<script>`).
- [x] `npm run test:browser` — builds the artifact and drives it in headless Chromium.
      **Expected:** 9 pass. CI runs this as its own job and `deploy` waits for it
      (`docs/adr.md` D22).

## 1. Browser-only checks

Covered by `tests/browser/game.browser.mjs` unless marked manual. Serve with
`npm run dev` (one process: esbuild watch + static server), reload manually after edits.

- [x] **Offline artifact.** Browser test loads `dist/index.html` over `file://`.
      **Result:** canvas renders, HUD shows the stage, exactly **one** network request
      (the artifact itself), zero console errors. Levels are embedded (D6).
- [x] **Drag gesture.** Press → drag → release in a real browser.
      **Result:** a press alone fires nothing and spends no ammo; a drag past
      `MIN_DRAG` produces a pull and a trajectory preview; release launches the pig and
      spends one ammo (`launches: 1`, `ammoLeft: 3`).
- [x] **Resize during a drag.** Press, drag, resize the viewport, drag on, release.
      **Result:** the gesture survives the camera rebuild and still fires; the pull is
      re-derived in screen space, so it does not snap into a bogus shot.
- [x] **High-DPR display.** Browser context with `deviceScaleFactor: 2`.
      **Result:** `canvas.width === clientWidth * 2`, aspect ratio preserved; pointer
      mapping is in CSS pixels via `getBoundingClientRect`, so guide and pig line up.
- [x] **Theme swap paints different pixels.** Pixel-sampled at `(0,0)` via
      `getImageData`: each `t` press changes the RGB, and the theme is Tron by default.
      Cycling mid-flight is safe — themes read entity state only.
- [x] **Destroyed entities are not painted.** Destroyed bodies leave the snapshot (D17);
      a fading display extra flashes for `FLASH_STEPS` and then disappears. Verified in
      `tests/game.test.ts` (headless) and by theme tests.
- [x] **Debug overlay (F2).** Renders entity bounds + ids and fps/steps/elapsed counters
      in screen space; off by default (`tests/fx.test.ts`).
- [x] **Tab hidden, then resumed.** Hide the tab for ~10s during flight.
      **Result:** pigs resume in place — the loop discards surplus time (M5).
- [x] **Watch workflow.** Verified: start `npm run dev`, edit a source line, the rebuilt
      bundle is served (`sha256` of `dist/main.js` changes, the edited string appears in
      the served file). Reload is manual by design — no HMR.
      **Gotcha:** a comment-only edit does not change the bundle, so the hash stays put;
      that is expected, not a broken watcher.
- [/] **Touch.** Playwright cannot emulate a finger drag; gesture-cancel paths are
      covered headlessly by `tests/pointer.test.ts` (pointer capture, cancel, dispose).
      Manual check on a real touch device still yours.
- [x] **Pages deploy.** Published by the workflow on push to `main`.
      Verified: `https://tarheels100.github.io/angry-pigs/` returns 200, served bytes are
      sha256-identical to `dist/index.html`, one inline `<script>`, no absolute URLs, no
      `fetch(`. Live playtest (drag + fire) still yours to do.

## 2. Gameplay and simulation evaluation

Re-run `scratch/sweep-probe.ts` (greedy bot over pulls × angles) before and after each
tuning change; `scratch/greedy-probe.ts` proves clearability within authored ammo.

- [x] **Crush vs shatter.** Deaths now carry a `cause`: `impact` (the pig hit it),
      `crush` (debris hit it), `fall` (it hit the ground or a wall). Attribution comes
      from the last collision partner (`src/game/game.ts`), asserted in
      `tests/game.test.ts`: a +20° full pull on Stage 01 kills one bird by `impact` and
      one by `fall`. Blocks die by `impact`/`crush` as well.
      **Open:** scoring does not use the cause yet (docs/tuning.md).
- [x] **Pigs nudging ground birds.** Contact energy below the material threshold spends
      no health; a slow roll does not kill a target (`tests/physics.test.ts`).
- [x] **Settle timeout honesty.** When the window expires, `adapter.freezeAll()` zeroes
      velocity and sleeps everything (D16), so `settled` means visually stopped before
      scoring reads it. Sweep timeouts: 117 (stage-01), 144 (stage-02), 48 (stage-03).
- [~] **Determinism.** Same machine, same runtime: two sweep runs produced identical
      outcomes (only the printed `ms per call` line differed — exclude timing from any
      replay assertion). Cross-runtime/cross-machine check still pending: run the suite
      on another Node version or machine.
- [x] **Partial destruction.** Damage per impact is `0.35 * energy / threshold`
      (`DAMAGE_SCALE`), so the sweep reports blocks gone 0–4 with partially damaged
      survivors instead of binary 0-or-3. Tron and Pixel both render partial damage from
      `health`/`healthMax`.

### Resolved (was deferred to milestone 11)

- [x] **White silhouettes linger where things died.** Fixed by D17: destroyed bodies
      leave `snapshot()`, and the game flashes their last state as a display extra that
      fades over `FLASH_STEPS = 10`. Particles, shake, and audio landed in M11.

## 3. Baseline data to tune against

Greedy bot, full pull, angles −80°…+40°, 495 combinations per stage
(`scratch/sweep-probe.ts`):

| stage | wins | one-shot clears | birds killed | blocks fully gone | blocks untouched | partially damaged | settle timeouts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stage-01 | 92 | 92 | 437/990 | 0–3 | 295 | 216 | 117 |
| stage-02 | 30 | 30 | 339/990 | 0–3 | 187 | 481 | 144 |
| stage-03 | 52 | 52 | 238/990 | 0–4 | 309 | 495 | 48 |

Stage 01 reference shots (measured): a flat full pull shatters the columns and drops the
beam bird (`fall`); a +20° pull clears both birds in one shot (three stars); a −70° pull
misses everything and proves the lose path. Peak impact energies for the flat shot: pig
vs column 75.4, pig vs ground 53.9, pig vs second column 24.4, debris hits 1–15.

- Preview cost: `simulateTrajectory` is ~0.07 ms per call (120 steps, 7 bodies), so
  recomputing per pointermove is free at this scale. Re-measure before adding 100+ bodies.
- Level design rule discovered in the sweeps: nothing critical may be sheltered under
  stone (docs/level-format.md, docs/physics.md gotcha 12).

## 4. Contracts and CI gaps (all closed)

- [x] **Shot count and stars.** `RulesSnapshot.launches` plus `stars`, derived by
      `starsFor(launches, targetsTotal)` (D19). Kept in rules, not the HUD.
- [x] **Camera refit on level switch.** `levelLoaded` carries bounds; the camera
      re-frames zoom and centre, and follows the projectile during flight (D20).
- [x] **`PointerSource.dispose()`.** Detaches listeners and releases pointer capture;
      a second dispose is a no-op (test asserts listener state).
- [x] **Entity id namespace.** Display extras cannot shadow a live physics id and
      duplicate extras are rejected (`tests/entities.test.ts`).
- [x] **`npm run check`** script (`typecheck && test && build`), plus
      `.github/workflows/deploy.yml` running it, running the browser job, and publishing
      `dist/` so the gate is enforced rather than remembered. Uses Actions'
      `GITHUB_TOKEN`; no PAT committed.
- [x] **Artifact assertion test.** `tests/artifact.test.ts` rebuilds the artifact and
      rejects absolute URLs, root-absolute paths, and runtime `fetch`.

## 5. Where to record results

- Tuning constants and measured values: `docs/tuning.md`
- Physics behaviour and gotchas: `docs/physics.md`
- Anything decided rather than measured: `docs/adr.md`
- Theme contract and available themes: `docs/theme-contract.md`
- How browser checks are run: `docs/browser-testing.md`
