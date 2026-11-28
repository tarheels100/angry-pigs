# Push plan — M23: music handoff doc, level editor, blast + glass behaviour

## Work mode

- **mode:** `autonomous:`
- **finish line:** all four requested items done, `npm run check`, `npm run test:browser`, and
  `npm run check:determinism` green, work committed and pushed.
- **scope boundary:** no harness/provider config changes; no new audio asset pipeline (D6/D7
  still hold); determinism path (`core`/`physics`/`game`) stays RNG-free. The editor is
  presentation + level data only.

## Goal and acceptance criteria

1. **Music interface document.** `docs/music-interface.md` describes, in terms another agent can
   implement against, how a composition/track plugs into the existing audio code: the data shapes
   (`TrackSpec`, `TrackNote`), the pure composition contract, the playback contract
   (`MusicPlayer`), the plug-in point for *authored* tracks, the constraints (single-file artifact,
   one audio context, silent before a gesture, music off by default), and the tests that gate it.
   Acceptance: an agent can write a hand-authored track as data and the player picks it up without
   touching playback code — so a real plug-in seam exists (`src/audio/tracks.ts`).
2. **Level editor UI.** An in-app editor that composes a level from the `src/levels/pieces.ts`
   building blocks, previews it live, validates it with the existing loader, plays it, and exports
   level data that drops into `src/levels/`. Acceptance: place/remove pieces with the pointer, the
   exported JSON passes `validateLevel`, and the exported level is playable.
3. **Exploding pig.** A bomb must visibly blast level objects *away from itself*, not just chip
   them. Acceptance: measured displacement of surviving bodies in `scratch/blast-probe.ts` rises
   from the current near-zero push to a real shove, with the existing detonation rules (D34) kept.
4. **Glass breaks more easily.** Acceptance: measured — glass health/threshold lowered, sweep and
   greedy numbers recorded in `docs/tuning.md`, no stage becomes unwinnable.

## Steps

- [x] Baseline measurements: greedy bot pigs per stage, single-shot sweep, blast probe (current push).
- [x] `scratch/blast-probe.ts` — measure how far surviving bodies move after a detonation.
- [x] Blast fix: mass-aware push, bigger impulse, tumble; keep damage conversion and D34 trigger.
- [x] Re-measure blast; record numbers in `docs/tuning.md`.
- [x] Glass retune: lower `damageThreshold` / `health`; re-run sweep + greedy probes; record.
- [x] Authored-track seam: `src/audio/tracks.ts` registry + `MusicPlayerOptions.tracks`.
- [x] `docs/music-interface.md` — the handoff document for the composition author.
- [x] Level editor: `src/levels/draft.ts` (draft → `LevelDef`), `src/ui/editor.ts` (DOM panel),
      wiring in `src/main.ts` (place-on-click, preview, play, export/import).
- [x] Editor tests: headless model tests + a browser test that places a piece and exports JSON.
- [x] Docs: `docs/level-format.md` editor section, `docs/adr.md` entries, `docs/checklist.md`,
      `docs/level-editor.md`.
- [x] Full gates: `npm run check`, `npm run test:browser`, `npm run check:determinism`.
- [ ] Commit and push.

## Running log

- **Baseline.** HEAD `4a83c84`, `npm run check` green (160 headless tests). `scratch/greedy-probe.ts`:
  stage-01 2 pigs, 02 2, 03 2, 04 3, 05 3, 06 3, all cleared. `scratch/blast-probe.ts` (old physics):
  6 survivors, max moved **0 units**, peak speed 0.06 units/step — the complaint confirmed, a blast
  pushed nothing. (`scratch/detonation-probe.ts` measures pigs killed by a blast, which was already
  fine; the missing behaviour is displacement.)
- **Blast.** Rewrote `explode` in `src/physics/matterAdapter.ts`: wake → push → damage; push scaled
  by `REFERENCE_SHOVE_MASS / body.mass` clamped 0.35..1.2; `LIFT` 0.4 upward tilt; `SPIN` 0.06
  angular velocity along the outward direction; no RNG. `IMPULSE_SCALE` in `src/game/game.ts` swept
  0.02 → 1 → 1.5 → 2 → 2.5 → 3 with `scratch/blast-probe.ts` (numbers in docs/tuning.md). 2.5 and 3
  broke `check:determinism` (5 mismatches, node vs chromium); **2** is clean and shoves survivors up
  to 141 units (mean 53, peak 5.53 units/step).
- **Determinism at scale 2.** `scratch/determinism-probe.ts` (`npm run check:determinism`):
  144 combos, node vs chromium, **0 mismatches**; settle timeouts rose 8/144 → 14/144 because a
  shoved heap takes longer to rest. No combo changed outcome.
- **Glass.** `src/physics/materials.ts`: glass `health` 4 → 3, `damageThreshold` 4 → 2.5. No
  headless test hard-codes glass health, so the change is measured, not asserted; the sweep was
  re-run (`scratch/sweep-probe.ts`) per stage and recorded in docs/tuning.md.
- **Plans.** Greedy plans re-derived against the new physics; `WINNING_PLANS` in
  `tests/levels.test.ts` and `PLANS` in `tests/browser/game.browser.mjs` updated to match
  (docs/tuning.md table). stage-02 now needs 3 pigs (its shelter survives the first blast),
  stage-04 needs 2 (glass gives way).
- **Music seam.** `src/audio/tracks.ts` (registry + `validateTrack`, field-qualified errors),
  `src/audio/trackLibrary.ts` (one authored track for `stage-01`), `TrackSpec` gained `leadGain`,
  `bassGain`, `leadNote`, `bassNote`; `notesFor` treats `melody[i] === 0` as a rest that keeps its
  slot; `SCALE_TYPES` exported. `playback.ts` gained `MusicPlayerOptions.tracks` (default
  `trackFor`) and `MusicPlayer.spec()`; `main.ts` calls `installAuthoredTracks()`. Headless tests in
  `tests/audio.test.ts`; browser test asserts the HUD shows the authored track name.
- **Editor.** `src/levels/draft.ts` (pieces → `LevelDef`, footprints, validation, JSON round-trip),
  `src/ui/editor.ts` (palette, click-to-place/select, −/+ steppers, undo, save/load/export),
  `hud.ts` edit button, `main.ts` wiring (`E`, pointer routing, store-backed save/load,
  `window.__editor`), `index.html` panel styles. Elevated placement is a draft-side `y` field:
  `expandPiece` offsets the builder output vertically, so `src/levels/pieces.ts` stayed unchanged.
- **Editor DOM constraint.** The panel uses only `createElement`, `appendChild`, `removeChild`,
  `textContent`, `className`, `style`, `setAttribute` — the stubs `tests/editor.test.ts` provide.
  Two closure bugs found by those tests (a `close()` referenced before definition, and a local
  `close` shadowing the handler) fixed by extracting `openPanel()` / `closePanel()`.
- **Browser blast test.** The first version measured after the heap settled and found nothing
  displaced (1.1 units) because the bomb landed outside the structure band; the test now restarts
  the stage per aim, fires the measured aims `[63@-10, 75@-20, 90@-5, 45@-25]`, waits for a blast
  recorded inside the shelter band (`window.__blasts`), samples 18 steps after detonation, and
  asserts a survivor inside `radius * 1.5` moved more than 20 units.
- **Gates.** `npm run check`: typecheck clean, 181 headless tests pass, build ok.
  `npm run test:browser`: 32 pass, 0 fail. `npm run check:determinism`: 144 combos, 0 mismatches,
  DETERMINISTIC.

## State to resume

- branch `main`; HEAD at start `4a83c84`.
- last green gate run: `npm run check` + `npm run test:browser` + `npm run check:determinism`, all
  green, with `IMPULSE_SCALE = 2`, glass `health` 3 / `damageThreshold` 2.5.
- constants discovered: shove clamp 0.35..1.2, `LIFT` 0.4, `SPIN` 0.06, determinism ceiling
  `IMPULSE_SCALE` ≤ 2, browser blast band x 620..1520 / y 540..880 for stage-02.
- probe outputs kept: `scratch/m23-blast-baseline.txt`, `scratch/m23-sweep-after.txt`,
  `scratch/m23-greedy-baseline.txt`, `scratch/m23-browser.txt`.

## Gates

- `npm run check` (typecheck + headless tests + build)
- `npm run test:browser` (chromium against `dist/index.html`)
- `npm run check:determinism` (node vs chromium outcomes on the sweep entry)
- probes: `scratch/greedy-probe.ts`, `scratch/sweep-probe.ts`, `scratch/blast-probe.ts`,
  `scratch/shield-probe.ts`

## State to resume

- branch `main`, HEAD `4a83c84` at start; baseline `npm run check` green (160 headless tests).
- last green gate run: `npm run check` at HEAD `4a83c84`.

## Open questions

- Editor placement model: DOM-only numeric controls vs click-to-place on the stage. Chosen:
  click-to-place with a palette, because "intuitive" is the requirement; numeric fields stay for
  fine tuning.
- Whether the editor ships in the release artifact or dev-only. Chosen: shipped, opened with `E`
  / a HUD button, because the exported level is the point of the tool and there is no dev-only
  build surface in this repo.

## Final outcome

All four requested items are done and the gates are green:

1. **Music handoff.** `docs/music-interface.md` + the authored-track seam (`src/audio/tracks.ts`,
   `src/audio/trackLibrary.ts`), so a track is data a composer edits without touching playback.
   A track for `stage-01` ships as the example.
2. **Level editor.** `E` or the HUD button opens a palette-driven panel that places pieces on the
   stage, previews through `game.loadLevel`, validates with the real loader, saves to
   `localStorage`, and exports `LevelDef` JSON. Headless + browser tests cover it.
3. **Exploding pig.** Mass-aware outward shove applied before damage, with lift and tumble;
   survivors move up to 141 units where they used to move 0. `IMPULSE_SCALE` capped at 2 because
   determinism fails above it.
4. **Glass.** health 3, threshold 2.5; sweep and greedy numbers recorded; no stage unwinnable.

Gate results: `npm run check` (typecheck + 181 headless tests + build) green, `npm run test:browser`
32/32, `npm run check:determinism` 144 combos with 0 mismatches.

Deferred / follow-up, none of it part of this request:

- The authored track has not been listened to; headless Chromium has no audio output.
- The editor has no duplicate/copy-piece and no multi-select; undo is 20 deep.
- `check:determinism` sweeps the sweep entry only; a blast-heavy stage-02 plan is not in that
  sweep, so a future impulse change needs its own determinism probe.
- The greedy bot still treats a blast as an ordinary hit; it does not aim *at* a detonation.
