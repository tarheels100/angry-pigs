# Verification checklist

Work top to bottom. Every step is either a command or a manual action with an
expected result. Record findings where each step says, so the next milestone has
measurements instead of guesses.

Status legend: `[ ]` not run, `[x]` run and passing, `[~]` run and found a problem,
`[/]` couldn't test or chose not to.

## 0. Baseline gate

- [x] `npm run check` — typecheck, 152 headless tests, build in one command.
      **Expected:** all pass, `dist/index.html` written (~135 KB inline, one `<script>`).
- [x] `npm run test:browser` — builds the artifact and drives it in headless Chromium.
      **Expected:** 24 pass. CI runs this and `npm run check:determinism` as one browser
      job, and `deploy` waits for it (`docs/adr.md` D22).

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
- [x] **The launcher repaints while aiming.** Pixel-sampled around the cannon: rest, drag,
      and post-shot each paint different pixels, so the barrel tilt, spring compression, and
      recoil flash are real (D28). Headless counterparts: `tests/themes.test.ts`.
- [x] **Motion trail.** `window.__trail.points()` is empty before a shot, non-empty
      mid-flight, and empty again after restart. Trail points age by step, so a recorded
      run replays identically (M15).
- [x] **Debris heap.** `window.__debris.fragments()` is empty before a shot, non-empty
      after a block is destroyed, never below `game.groundTop()`, and empty after restart
      (M16). Fragments pile upward per ground bucket and fade while at rest
      (`tests/fx.test.ts`).
- [x] **Generated soundtrack.** `window.__music.flavour()` starts with the stage, names the
      track in the HUD, and emits notes as the simulation advances; the next stage gets a
      different name and tempo, and a restart replays the same flavour (M17). Headless:
      `tests/audio.test.ts` asserts a seed replays the same sequence and mute silences
      output without forgetting the track.
- [x] **The HUD names the pig in the chamber.** On Stage 03 the `next-pig` stat reads
      `next basic`, then `next cluster` after one shot, then `next bomb`; firing the cluster
      puts several pigs in the registry at once (M18). Headless: `tests/hud.test.ts`,
      `tests/pigs.test.ts`.
- [x] **A bomb detonates against structure.** Stage 02 opens with a bomb; the measured
      winning aim (`window.__game` drag at pull 63, 18° up) produces `window.__explosions >= 1`.
      A soft landing on the ground produces none (D34). Headless: `tests/pigs.test.ts` and
      `tests/physics.test.ts` assert blast falloff, push, and that a destroyed body is not
      flung again.
- [x] **Title screen lists stages with best scores and starts the picked one.** The HUD
      `menu` button (or `Esc`) opens the overlay; three stage buttons read
      `play stage-01 · no record yet` on a fresh browser; picking stage 3 loads it
      (`level` stat `stage 3/3`, ammo 5) and closes the overlay (M19, D35).
- [x] **Options survive a reload.** `O` opens the options panel; cycling theme changes
      `window.__options().themeId`; a reload reads the same value back from
      `localStorage['angry-pigs:options']` and goes straight back to play, not the menu.
      Turning trail and debris off records nothing (`__trail.points()` and
      `__debris.fragments()` stay empty after a shot), and `forget best scores` clears the
      stage records so the title screen reads `no record yet` again.
- [x] **An open menu pauses the simulation.** With the overlay open, `launches` and step
      counts do not advance, and closing it resumes the loop. Headless counterpart:
      `tests/smoke.test.ts` asserts no further frames are queued while paused.
- [x] **Tab hidden, then resumed.** Hide the tab for ~10s during flight.
      **Result:** pigs resume in place — the loop discards surplus time (M5).
- [x] **Watch workflow.** Verified: start `npm run dev`, edit a source line, the rebuilt
      bundle is served (`sha256` of `dist/main.js` changes, the edited string appears in
      the served file). Reload is manual by design — no HMR.
      **Gotcha:** a comment-only edit does not change the bundle, so the hash stays put;
      that is expected, not a broken watcher.
- [~] **Touch.** Tap gestures are covered in Chromium (`hasTouch` contexts):
      `tests/browser/game.browser.mjs` asserts a canvas tap spends no ammo (a tap is a
      press, not a shot — D14) and a tap on the HUD restart button restarts the stage.
      Gesture-cancel/capture paths are covered headlessly by `tests/pointer.test.ts`.
      **Still manual:** a real finger drag (touch move + pointer capture) cannot be
      emulated; verify aim-by-drag on a device.
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
      scoring reads it. Sweep timeouts: 97 (stage-01), 131 (stage-02), 84 (stage-03).
- [x] **A level starts settled and undamaged.** `settleWarmup()` simulates 90 steps with
      damage suppressed before control is handed over (D27); a headless test asserts every
      block and bird begins at full health and resting. Notes complained objects fell a
      little on the first drawn frame and started partly damaged.
- [x] **A second shot does not wait for the settle timeout.** `rules.launch()` accepts
      `aiming` and `settling` (D26); a test fires during `settling` and asserts the shot
      launches, counts, and costs ammo.
- [x] **Materials are distinguishable.** Tron draws grain, speckle, a metal double wall
      and glass sheen; Pixel draws plank joints, brick courses, a metal band and
      translucent glass. `tests/themes.test.ts` asserts the recipes differ per material,
      and every palette covers `wood`.
- [x] **Entities read as characters.** A pig paints ears, snout, eyes, and a type mark per
      `variant`; a bird paints a wing, beak, and comb; the launcher tilts with `aimAngle`
      and compresses with `pull`; scenery props paint as trees and ridges. Asserted per
      theme in `tests/themes.test.ts`, and the death flash keeps only the body outline.
- [x] **Pig types change behaviour, not materials.** The registry (`src/game/pigs.ts`) drives
      radius, mass, damage multiplier, pigs-per-shot, and the blast recipe; every pig is still
      the `light` material (D33). Asserted in `tests/pigs.test.ts`: a cluster costs one ammo
      slot and spawns three staggered pigs carrying the `cluster` hint; a heavy pig's measured
      impact energy exceeds a basic pig's from the same aim; an unknown ammo id is a load error.
      Blast damage is converted once (`damage * DAMAGE_SCALE`), so a bomb clears glass and
      chips wood rather than erasing a wood column.
- [x] **Scenery cannot change outcomes.** `scenery` items are validated and loaded as
      display extras, never bodies (`tests/levels.test.ts`, D29).
- [x] **Effects stay out of the simulation.** Trail, debris, particles, and shake are
      presentation: `npm run check:determinism` steps the game without any of them and
      reports 0 mismatches, so art work cannot drift gameplay (D30, D31).
- [x] **Best results persist.** Browser test clears Stage 01, reloads the page, and
      asserts `localStorage['angry-pigs:best:stage-01']` holds the record and the HUD
      shows `best ★★★ 3500` with the stage restarted fresh (D24).
- [x] **Options persist, and corrupt settings cannot break the game.**
      `src/ui/options.ts` reads one JSON key (`angry-pigs:options`) field by field: a wrong
      type falls back to that field's default, and a blocked or corrupt store yields the
      defaults rather than throwing (`tests/options.test.ts`). An unknown theme id is stored
      as-is and falls back to tron only where the theme is looked up, so a theme removed in
      a later build still boots (D35).
- [x] **Determinism (cross-runtime).** `npm run check:determinism` bundles
      `scratch/sweep-entry.ts` twice — ESM for node, IIFE for chromium — and runs the
      same 72 combos (3 pulls × 8 angles × 3 stages) by stepping the game directly.
      **Result:** 0 mismatches; 3 wins, 9 combos hit the settle timeout. The entry
      records no timing, so there is nothing legitimate that can differ.
      Cross-machine drift would show up as a mismatch in CI, which runs this on Linux.
- [x] **Score.** Targets pay 1000; a clear pays 500 per unused pig (D23), so a
      one-shot Stage 01 clear scores 3500 vs 3000 for a two-shot clear.
- [x] **Partial destruction.** Damage per impact is `0.3 * energy / threshold`
      (`DAMAGE_SCALE`), so the sweep reports blocks gone 0–3 with partially damaged
      survivors instead of binary 0-or-3. Tron and Pixel both render partial damage from
      `health`/`healthMax`.

### Resolved (was deferred to milestone 11)

- [x] **White silhouettes linger where things died.** Fixed by D17: destroyed bodies
      leave `snapshot()`, and the game flashes their last state as a display extra that
      fades over `FLASH_STEPS = 10`. Particles, shake, and audio landed in M11.

## 3. Baseline data to tune against

Single-shot sweep, pull 20…`maxPull` step 5, angle −40°…+40° step 2.5°, 495
combinations per stage (`scratch/sweep-probe.ts <index>`):

| stage | wins | one-shot clears | birds killed | blocks fully gone | blocks untouched | partially damaged | settle timeouts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stage-01 | 75 | 75 | 425/990 | 0–3 | 336 | 252 | 97 |
| stage-02 | 19 | 19 | 265/990 | 0–3 | 266 | 344 | 131 |
| stage-03 | 10 | 10 | 150/990 | 0–2 | 407 | 198 | 84 |

Stage 01 reference shots (measured): a flat full pull shatters the columns and drops the
beam bird (`fall`); a +20° pull clears both birds in one shot (three stars); a −70° pull
misses everything and proves the lose path. Peak impact energies for the flat shot: pig
vs column 75.4, pig vs ground 53.9, pig vs second column 24.4, debris hits 1–15.

Clearability with the structure-aware bot (`scratch/greedy-probe.ts`, mirrored in
`tests/levels.test.ts`): stage 01 in 1 pig, stage 02 in 2, stage 03 in 2 — all inside the
authored ammo, which is now typed (`bomb` opens stage 02, `cluster` is stage 03's second
shot). The bot aims at the support holding a bird up and never repeats a shot that
killed nothing. The single-shot sweep still measures the **first** shot, so its counts are
unchanged by later typed ammo.

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
      **Gotcha found at M18:** inlining used `String.replace(tag, bundle)`, and JavaScript
      treats `$&`, `$'` and "$`" inside a replacement string as special patterns. Minified
      matter-js contains `$&`, so the entry tag and surrounding html were spliced *into* the
      middle of the bundle. `build-html.js` now splits and joins instead of replacing.

## 5. Where to record results

- Tuning constants and measured values: `docs/tuning.md`
- Physics behaviour and gotchas: `docs/physics.md`
- Anything decided rather than measured: `docs/adr.md`
- Theme contract and available themes: `docs/theme-contract.md`
- How browser checks are run: `docs/browser-testing.md`
