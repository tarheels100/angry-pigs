# Tuning log

Every gameplay/physics constant needs a reason here. Change the constant and this
file together.

| Constant | Value | Where | Reason |
| --- | --- | --- | --- |
| `FIXED_DT` | 1/60 s | `src/core/loop.ts` | Deterministic steps at 60 Hz; headless tests assert by step count. |
| Matter delta | `1000/60` ms | adapter `step()` | matter-js takes milliseconds; passing seconds freezes the world (M3 spike). |
| gravity Y | 1.0 (scale 0.001) | Matter world default | Spike: ~0.26 units/step² acceleration, 117 units of fall in 30 steps. Readable arcs at 1600x900 world units. |
| air friction | 0.001 | body option | Slight damping so pigs don't drift forever; still ballistic (1562 units at v=(22,-11)). |
| pig friction / static friction | 0.02 / 0.02 | `MATERIALS.light` | Matter takes `max(frictionA, frictionB)`; a grabby pig on the ground stops in ~400 units. At 0.02 a pig rolls 961 units. |
| ground friction / static | 0.5 / 0.5 | `MATERIALS.ground` | Enough to hold stacked objects, not enough to stop a rolling pig. |
| glass static friction | 0.05 | `MATERIALS.glass` | At 0.6 towers slide as one block; at 0.5-0.6 a struck column stays upright. 0.05 tips a column (1.93 rad). |
| sleep threshold | 60 steps per body | `body.sleepThreshold` | A body must be near-still ~1 s before sleeping; measured settle at step 92 for a dropped box. |
| settle timeout | 240 steps (4 s) | settle detection | Fallback so a jittering body can't block the phase machine forever. |
| cannon `maxPull` | 90 world units | level data | Pull distance cap; bounds launch power. |
| cannon `powerScale` | 0.22 | level data | Full pull (90) → launch speed ~19.8. Measured landing distance at 45°: speed 12 → 1228 units, 14 → 1582, 16 → 1977, 22 → 3419. 19.8 makes a flat shot from y=480 touch ground around x=1250, so a 1600-unit stage is reachable without overshoot. 0.14 (speed 12.6) was too weak: no aim angle reached a target (scratch/slice-probe.ts). |
| pig removal | speed < 1.2 for 45 steps, out of bounds, or 240 steps in flight | game (D15) | Pigs are consumed, not damaged; the dwell guard stops a pig nudging along forever. |
| `MIN_DRAG` | 12 world units | game | A release must drag at least this far from the cannon to fire; a plain click cancels and spends no ammo (src/input/pointer.ts owns the gesture). |
| `wakeNear` margin | 40 world units | adapter | When a body is destroyed or removed, dynamic bodies whose bounds overlap it (expanded by this margin) are woken. Matter does not wake a body whose support disappears, so a beam with no leg floats (docs/physics.md gotcha 11). |
| pig rolling resistance | ×0.98 per step while grounded | adapter | Matter has no rolling resistance, so a pig on flat ground rolls forever and never sleeps. Raised from 0.94 because 0.94 stopped pigs too abruptly (playtest complaint). A test asserts a pig launched at speed 12 rolls more than 120 units in 90 steps. |
| ground friction | kinetic 0.3, static 0.5 | `MATERIALS` | Matter takes `max(frictionA, frictionB)`, so the ground value governs pig rolling as well. Lower kinetic friction lets pigs roll; static friction stays high so stacks hold. |
| `DAMAGE_SCALE` | 0.35 | game (`applySliceDamage`) | Damage per impact is `0.35 * energy / threshold`. Playtest said damage per impact was too high: at scale 1 a single hit erased a block and destruction was binary (0 or 3). Retuned sweep: blocks go 0–3 gone with partially damaged survivors; wins 4/51 combinations. |
| `FLASH_STEPS` | 10 steps | game | A destroyed entity flashes for 10 steps as a fading display extra, then disappears (D17). |
| settle-timeout freeze | `adapter.freezeAll()` when the window expires | game (D16) | "Settled" must mean visually stopped; ~10 of 51 Stage 01 combinations end at the 240-step cap rather than in genuine sleep. |
| stars | 3 if shots ≤ ceil(targets/2), 2 if shots ≤ targets, else 1 | rules (D19) | Derived from the Stage 01 sweep: 4 of 51 pull combinations clear both targets in one shot. |
| `SCORE_PER_TARGET` | 1000 | rules | One number per bird; nothing else pays target score. |
| `AMMO_BONUS` | 500 per unused pig, on a win only | rules (D23) | Without it a one-shot clear and a three-shot clear score the same. Stars still come from shots used. |
| best-result key | `angry-pigs:best:<levelId>` in `localStorage` | save (D24) | Keeps score/stars/launches per stage; corrupt or blocked storage reads as "no record". |
| impact energy formula | `\|relV · normal\| * min(massA, massB)` | adapter | Measured peak ~84 for a speed-22 pig, ~49 for speed 18. Kept on `min(mass)` so a pig hitting a heavy wall does not score the wall's mass as damage. |
| glass damageThreshold | 3 | `MATERIALS` | A direct pig hit (~40-50 energy) shatters glass; a rolling graze (~8) does not. |
| stone damageThreshold | 9 | `MATERIALS` | A full-speed pig removes ~5 health; stone survives roughly three solid hits. |
| feather damageThreshold | 1.4 | `MATERIALS` | Birds are fragile: any real hit kills; a gentle nudge does not. Raised threshold 2 → 1.4 so a bird that rolls off a tilting beam dies instead of surviving at low contact energy (stage 02/03 sweeps left birds alive on broken supports). |
| health area scaling | `area/4000`, clamped 0.35–3 | `healthFor()` | Large blocks take more hits; clamp stops huge walls becoming immortal. |
| camera fit padding | 120 world units | camera `fitZoom` | Zoom at load shows the whole level plus margin (D20). |
| `FOLLOW_RATE` | 6 units/s toward the projectile | camera `follow` | Fast enough to keep a flying pig on screen, slow enough that the camera never jitters. |
| `SHAKE_PIXELS` / `SHAKE_DECAY` | 9 px, 7/s | camera `shake` | Screen-space shake, capped at ±10 px and decayed to zero within a second; it never moves world coordinates, so physics is unaffected. |
| particle life | 0.24–0.59 s, gravity 1400/s², cap 220 | `src/fx/particles.ts` | Debris reads as a burst and clears before the next shot. Deterministic seed, so a burst draws identically in two runs. |
| sfx envelopes | 0.08–0.4 s blips, gain 0.12–0.26 | `src/audio/sfx.ts` | Procedural oscillators, no assets (the artifact stays one file). Impact loudness scales with energy, capped at 1. |
| `DEBUG` overlay | F2 toggles bounds, ids, fps/steps | renderer | Dev diagnostics drawn in screen space after the camera transform (docs/checklist.md §1). |

## Stage sweeps (scratch/sweep-probe.ts, greedy-probe.ts)

Single-shot sweep, pull 20…`maxPull` step 5, angle −40°…+40° step 2.5° (495
combinations per stage). Re-measured after the pedestal redesign and `feather 1.4`:

| stage | wins | one-shot clears | birds killed | blocks fully gone | blocks untouched | partially damaged | settle timeouts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stage-01 | 94 | 94 | 445/990 | 0–3 | 295 | 215 | 107 |
| stage-02 | 36 | 36 | 366/990 | 0–4 | 187 | 479 | 49 |
| stage-03 | 38 | 38 | 229/990 | 0–3 | 306 | 495 | 48 |

Wins require at least one bird to die; a win is not necessarily a one-shot clear.
`scratch/greedy-probe.ts` confirms every stage is clearable within its authored ammo
(stage-01 and stage-03 clear in one shot, stage-02 in one).

**Difficulty order holds:** stage 01 is the easiest (94), stage 02 harder (36), stage 03
hardest (38 with a tall pedestal that only an arc can reach). Stage 03's pedestal was
first tried at height 220 — that pushed wins to 42 but the greedy bot could not clear it
within authored ammo, so it was rejected as unfair (docs/level-format.md rule 3).

**Level design rule:** nothing critical may sit under stone. Stone health
(`area/4000` with a 3 clamp) far exceeds any pig impact energy at `DAMAGE_SCALE 0.35`,
so a bird sheltered by a stone roof is unkillable (docs/physics.md gotcha 14).

## Stage 01 reference shots (measured, scratch/sweep-probe.ts)

Two full-pull shots clear the stage — exactly what `tests/game.test.ts` asserts:

| aim (degrees, +y is down) | result |
| --- | --- |
| 0° (flat) | pig reaches the glass tower; columns shatter, the beam survives partially; the bird on the beam is crushed by the collapse |
| +20° (slightly down) | clears both birds in one shot — a three-star shot |
| −70° (nearly straight up) | misses everything; burns one pig — used to prove the lose path |

Measured peak impact energies for the flat full-pull shot (`scratch/impact-probe.ts`):
pig vs `block-1` 75.4, pig vs ground 53.9, pig vs `block-2` 24.4, ground vs falling
`block-3` 15.1, ground vs `bird-2` 7.2, debris grazes 1–5. With `DAMAGE_SCALE 0.35` the
75.4 hit spends ~8.8 glass health (destroys a 3.6 hp column) while the 24.4 hit leaves a
second column at 0.1 hp — partial damage rather than binary destruction.

Birds are deliberately fragile: a feather bird is `health 2 × areaScale 0.35 = 0.7` with
threshold 2, so a 7.2-energy fall kills it while a 1.5 debris graze does not. That is a
starting point, not a tuned curve.

## Open tuning questions (resolve in the tuning pass)

- Whether rolling resistance should also apply to birds/balls that roll on the ground
  (currently pigs only).
- Pig damage model: pigs currently ignore damage entirely (D15); decide whether a pig
  takes damage from heavy hits instead.
- Stage 02 and 03 win rates (~36–38/495 single-shot) are low by design — both birds
  need structural collapse. If playtests feel unfair, retune beam health or glass
  thresholds rather than adding more ammo.
