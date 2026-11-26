# Working plan (session scratch)

Kept in-repo so a compacted context still has the plan. Delete when the push ends.

## Goal of this push
Playwright harness + roadmap as far as possible without a blocker I cannot resolve.
Tuning is deferred ("working game first"), except the two physics asks below.

## User asks (explicit)
1. Set up Playwright now if helpful. → done (dev dep + chromium binaries installed).
2. Pig rolling friction too HIGH → pigs stop too soon. Change: damping 0.94 → 0.98,
   ground kinetic friction 0.5 → 0.3 (frictionStatic stays 0.5 so stacks still hold).
3. Damage per impact too HIGH → Change: DAMAGE_SCALE 0.35 in game layer; blocks keep
   partial health (intermediate states).
4. Don't over-tune; scoring/physics tuning can happen later without wasting progress.

## Sequence (each step = commit)
- [x] Playwright installed (`playwright` dev dep, chromium binaries).
- [x] A. Physics/damage tuning + freeze-on-settle + destroyed bodies leave snapshot
      + flash fade extras + healthMax/fade fields. ADRs D16, D17, D18, D19. Tests 65 pass.
      Measured: wins 4/51, one-shot clears 4/51, blocks gone 0–3 with partial damage,
      10 combos hit the settle timeout (now frozen).
- [x] B. §4 contract items: PointerSource.dispose() (detaches listeners, releases
      capture), entity id namespace guard in EntityRegistry.setExtras (extra cannot
      shadow a live physics id; duplicates rejected). Tests: pointer dispose, registry
      collision + duplicate, game extras during flight. 69 pass.
- [x] C. M9: levels l02/l03 authored + `validateLevel` export + `levelAt` wrap; camera
      `setWorld`/`follow`/`zoomBy`; main.ts level flow (advance on win after 1.4s, R
      restart, N/P level step, wheel zoom, theme cycle), HUD level label + stars,
      `levelLoaded` now carries bounds so the camera re-frames. ADR D20.
      Sweep numbers (pull 20..maxPull step 5, angle -40..40 step 2.5, 495 combos each):
        stage-01: won 92, one-shot clears 92, kills 437/990, blocks gone 0..3, none 295,
                  partial damage rounds 216, settle timeouts 117
        stage-02: won 30, one-shot clears 30, kills 339/990, blocks gone 0..3, none 187,
                  partial damage 481, timeouts 144
        stage-03: won 52, one-shot clears 52, kills 238/990, blocks gone 0..4, none 309,
                  partial damage 495, timeouts 48
      Level design rule discovered: nothing critical may be sheltered under stone —
      stone health (area/12) is far above any pig impact energy at DAMAGE_SCALE 0.35,
      so sheltered birds are unkillable. Recorded in level-format.md + physics gotchas.
      Greedy bot probe: scratch/greedy-probe.ts (clears every stage within authored ammo).
      78 tests pass; levels.test.ts costs ~3.5s. 78 pass.
- [ ] D. M10: tron theme (default) — neon outlines, glow, grid. Registry only.
- [ ] E. M11: particles + WebAudio SFX + shake + debug overlay (F2).
- [ ] F. M12: second theme (`pixel`) through contract only; verify diff touches themes/ only.
- [ ] G. M13: browser tests (file:// offline, drag gesture, theme swap pixels, resize
      mid-drag, DPR mapping, no-fetch route, win/lose flow), tuning doc, README status.
- [ ] H. Docs sweep: theme-contract (healthMax/fade), tuning (measured), physics gotchas,
      checklist statuses, README status + roadmap, docs map entry for this file. Delete
      this working-plan before the final commit.

## Decisions made this push (write into docs/adr.md)
- D16 settle-timeout freeze: when the settle window expires, `adapter.freezeAll()`
  (zero velocity + sleeping) so `settled` means visually stopped.
- D17 destroyed bodies leave the snapshot; presentation flashes them from the
  `destroyed` event via short-lived display extras with `fade`. Fixes the lingering
  white silhouette without waiting for M11.
- D18 Playwright as a dev dependency, `npm run test:browser` separate from `npm test`.
  Deviation from D2 (esbuild-only) recorded here.
- D19 stars derived from shots used vs targets (sweep: 6/51 combos clear 2 birds in one shot).
- D20 camera follows the projectile during flight, refits to level bounds on load.
- Damage maths lives in the game layer (`applySliceDamage`), thresholds stay in materials.

## Test seam for browser tests
`window.__game` + `window.__camera` exposed in main.ts (narrow, read-only). Must be
asserted as present in browser tests only; keep it out of the shipped API surface story.

## Notes / gotchas found
- Replay determinism: exclude timing lines; same machine two sweep runs identical.
- `dist/` is gitignored; Pages publishes via Actions artifact (verified sha256-identical).
- `esbuild --legal-comments=none` needed so matter-js license URL isn't in artifact.
- Windows: `/tmp` in git-bash is not `C:\tmp` — node fs paths differ; use sha256sum in bash.
- Node 22.23.3 local; CI node-version 22.
- gh CLI not installed; GitHub API works unauthenticated (repo public) for runs/pages checks.

## Current state
- Steps A, B, C committed (HEAD after C: 78 tests pass, `npm run check` gate, Pages live).
- Scratch probes: `scratch/sweep-probe.ts` (outcome sweep, takes a level index arg),
  `scratch/impact-probe.ts` (peak impact energy census), `scratch/greedy-probe.ts`
  (multi-pig clear check), `scratch/main-probe.mjs` (main.ts wiring under DOM stubs).
  Bundle .ts probes with esbuild to .cjs before running.
- Next: step D (tron theme, default theme), then E (M11 effects/SFX/debug overlay).
