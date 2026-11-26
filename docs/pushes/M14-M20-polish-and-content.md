# Push plan — M14–M20: polish, materials, pig types, audio, UI, content

**Work mode:** `autonomous:` (user request: sort `docs/post-m13-notes.md` into milestones,
document them, then work autonomously until objectives are complete or a blocker is hit).

**Finish line:** every milestone M14–M20 implemented and checked; `npm run check`
(typecheck + headless tests + build), `npm run test:browser`, and
`npm run check:determinism` green; pushed to GitHub Pages and verified byte-identical.

**Scope boundary:** `src/**`, `tests/**`, `docs/**`, `index.html`, `README.md`,
`scratch/**`, `package.json` scripts. No new runtime dependencies — the artifact must stay
a single self-contained file with zero network requests (docs/deployment.md), so the
soundtrack stays procedural WebAudio rather than Tone.js/Strudel.

**Blocker policy:** if an objective needs a new dependency, a real device, or a subjective
aesthetic judgement I cannot verify, stop that milestone, record it in this file, and
continue with the next one.

## Milestones derived from docs/post-m13-notes.md

Mapping of each note to a milestone (note text abbreviated):

| note | milestone |
| --- | --- |
| objects fall slightly on first draw → pre-settle / pause damage until control | M14 |
| glass breaks too easily; stronger materials for some structures | M14 |
| multiple material types (glass, wood, stone); visually distinct | M14 |
| pigs/birds drawn as pigs/birds, on theme; detailed cannon (tilting barrel + compressing spring); motion trail; varied backgrounds/scenery | M15 |
| destroyed objects crumble into physically-modelled particles that fall into a heap and fade, on a background layer | M16 |
| Tron-inspired procedural soundtrack, non-looping, one track flavour per level | M17 |
| pig types: bomb (explodes on impact), heavy (breaks through / topples heavy structures), cluster (shotgun spread) | M18 |
| title screen; options screen only because real options now exist | M19 |
| richer structures; static platforms up in trees (background layer) protecting birds | M20 |

## Steps

### M14 — load stability + material realism

- [x] Damage is paused while a level settles: `Game.settleWarmup()` steps the world with
      damage suppressed, so nothing starts partly damaged. Browser + headless assertion.
- [x] `wood` material added (`MaterialId`), with per-theme colours; glass made tougher and
      damage scale retuned; sweeps re-measured (`scratch/sweep-probe.ts`, greedy probe).
- [x] Materials visually distinct in Tron and Pixel (outline shape/texture per material).
- [x] A level ships a stone/metal structure whose bird is still reachable (design rule check).
- [x] Docs: `docs/tuning.md` rows, `docs/level-format.md` material list, `docs/physics.md`,
      `docs/theme-contract.md` (new palette entry), ADR.

### M15 — entity art, cannon art, motion trail, scenery

- [x] Stylized pigs and birds drawn per theme (Tron + Pixel + placeholder), still contract-only.
- [x] Cannon drawn as a barrel that tilts to the aim and compresses a coil spring with pull;
      launch animation (recoil) after fire.
- [x] Motion trail behind flying pigs (presentation-only, deterministic).
- [x] Background scenery: trees/silhouettes as display-only extras from level data.
- [x] Theme contract extended with the new state fields (`variant`, cannon aim, scenery kind)
      and documented; theme tests updated.

### M16 — debris heaps

- [x] `src/fx/debris.ts`: fragments with gravity that land and pile into a heap per column,
      then fade; painted behind entities via an ordered fx layer.
- [x] Spawned on `destroyed` events; cleared on level load; deterministic.
- [x] Renderer gains fx ordering (behind/front) without theme changes.

### M17 — procedural soundtrack

- [ ] `src/audio/music.ts`: seeded generative Tron-ish track; per-level flavour (scale,
      tempo, waveform); never repeats the same sequence; starts on `levelLoaded`, stops on
      mute/dispose.
- [ ] Injected clock for headless tests; asserts deterministic given a seed + level id.
- [ ] Options: sound on/off applies to music too; HUD message shows the track name.

### M18 — pig types

- [ ] Pig type registry (`src/game/pigs.ts`): basic, heavy, bomb, cluster — radius,
      material, count, spread, damage multiplier, explosion radius/impulse.
- [ ] Level ammo lists use type ids; loader validates them.
- [ ] Bomb explodes on impact: radial impulse + area damage through adapter API.
- [ ] Cluster fires a spread of small pigs from one launch.
- [ ] Heavy pig tops glass/wood and topples stone; sweeps show it used somewhere.
- [ ] Tests: pig spawn counts, explosion impulse/damage, cluster spread, ammo consumption.

### M19 — title + options screens

- [ ] Title screen overlay (DOM, like HUD) with stage list and best scores; start button.
- [ ] Options screen: theme, sound, debris, trail; persisted via the existing
      `KeyValueStore`; reset-best button.
- [ ] Keyboard shortcuts kept (T/R/N/P/M/F2) and shown in the options list.
- [ ] Browser test: options persist across reload; title screen start loads a stage.

### M20 — content escalation

- [ ] Stage 04: a large precarious structure (many blocks) that collapses into a heap.
- [ ] Stage 05: bird on a static platform high up, tree scenery, structures shielding it.
- [ ] Stage 06: mixed materials + pig-type payload (bomb/cluster/heavy).
- [ ] Sweeps + greedy-probe clearability within authored ammo for all stages.
- [ ] README roadmap rows + `docs/checklist.md` baselines updated.

## Gates (run per milestone and at close)

- `npm run check` — typecheck + headless tests + build
- `npm run test:browser`
- `npm run check:determinism`
- sweeps: `node --experimental-strip-types scratch/sweep-probe.ts <0..n>`

## Log

- 2026-11-26 — plan written. HEAD `3d13050` (branch `main`). Gates at start: 106
  headless, 12 browser, determinism 0 mismatches. No work started yet.
- 2026-11-26 — **M14 done.** Warmup (`SETTLE_WARMUP_STEPS = 90`, damage suppressed, D27),
  `wood` material, glass threshold 3 → 4, `DAMAGE_SCALE` 0.35 → 0.3, feather threshold
  1.4 → 1.0, health divisor 4000 → 3200, material textures in Tron and Pixel, stage 02
  rebuilt (tower + pedestal, both birds die by a fall), stage 03 near tower given wood
  legs. Two bugs found on the way: a second shot was swallowed while settling (fixed by
  D26), and the aiming bot aimed at birds instead of supports (fixed in
  `scratch/greedy-probe.ts` and `tests/levels.test.ts`). Gates: 110 headless, 12 browser,
  determinism 0 mismatches. Sweeps: 75 / 19 / 10 wins of 495; clearable in 1 / 2 / 3 pigs.
- 2026-11-26 — **M15 done.** Pig faces (ears, snout, nostrils, eyes, per-type marks), bird
  wing/beak/comb/eye, cannon barrel tilt + spring compression + recoil blink drawn from
  `pull`/`aimAngle`/`recoil` on the display extra (D28), step-aged trail in the new
  `behind` layer (D30), `scenery` props (`tree`, `ridge`) validated and loaded as extras
  that never become bodies (D29). `variant` hints are stamped by the entity registry
  (`setVariant`/`clearVariants`). Gates: 118 headless, 15 browser, determinism 0 mismatches.
- 2026-11-26 — **M16 done.** `src/fx/debris.ts` (D31): fragments fall, land on
  `LoadedLevel.groundTop`, pile upward per 24-unit bucket, fade after `fadeSteps` at rest,
  capped at 120. Spawned from `destroyed` events sized by the block, cleared on
  `levelLoaded`. Gates: 120 headless, 16 browser, determinism 0 mismatches (effects are
  outside the simulation path).
- Deviation note: the renderer gained named `behind`/`front` layers (a pipeline change,
  D30). M15's acceptance wording says "no changes outside `src/render/themes/` plus
  presentation modules"; layering is draw-order behaviour owned by the renderer, and themes
  still change appearance only — the pixel assertions in `tests/browser/game.browser.mjs`
  and the theme-only imports in `tests/themes.test.ts` still hold.
