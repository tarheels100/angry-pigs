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
| rolling resistance | ×0.98 per step while grounded, for pigs **and birds** | adapter (`ROLLING_DAMPING`) | Matter has no rolling resistance, so a body on flat ground rolls forever and never sleeps. Raised from 0.94 because 0.94 stopped pigs too abruptly (playtest complaint). Measured: a bird pushed along the ground at speed 8 slept at step 134 after 109 units; before the bird was included it was still awake at step 240 after 327 units. Tests assert a pig launched at speed 12 rolls more than 120 units in 90 steps and that a rolling bird sleeps inside the settle window. |
| ground friction | kinetic 0.3, static 0.5 | `MATERIALS` | Matter takes `max(frictionA, frictionB)`, so the ground value governs pig and bird rolling as well. Lower kinetic friction lets bodies roll; static friction stays high so stacks hold. |
| `DAMAGE_SCALE` | 0.3 | game (`applySliceDamage`) | Damage per impact is `0.3 * energy / threshold`. Playtest said damage per impact was too high: at scale 1 a single hit erased a block and destruction was binary (0 or 3). Lowered again from 0.35 in M14 so structures survive several hits and topple instead of evaporating. |
| load warmup | 90 steps with damage suppressed | game (`settleWarmup`, D27) | Authored stacks used to fall a little on the first drawn frame and that settling chipped health, so levels started partly damaged. The world is simulated before the player gets control, and impacts spend no health during the window. |
| second shot during settling | allowed (`rules.launch()` accepts `aiming` or `settling`) | rules (D26) | Launch used to be accepted only from `aiming`, so firing again while debris was still settling was silently swallowed until the settle timeout expired. The bot and a real player both shoot without waiting. |
| `FLASH_STEPS` | 10 steps | game | A destroyed entity flashes for 10 steps as a fading display extra, then disappears (D17). |
| settle-timeout freeze | `adapter.freezeAll()` when the window expires | game (D16) | "Settled" must mean visually stopped; ~10 of 51 Stage 01 combinations end at the 240-step cap rather than in genuine sleep. |
| stars | 3 if shots ≤ ceil(targets/2), 2 if shots ≤ targets, else 1 | rules (D19) | Derived from the Stage 01 sweep: 4 of 51 pull combinations clear both targets in one shot. |
| `SCORE_PER_TARGET` | 1000 | rules | One number per bird; nothing else pays target score. |
| `AMMO_BONUS` | 500 per unused pig, on a win only | rules (D23) | Without it a one-shot clear and a three-shot clear score the same. Stars still come from shots used. |
| best-result key | `angry-pigs:best:<levelId>` in `localStorage` | save (D24) | Keeps score/stars/launches per stage; corrupt or blocked storage reads as "no record". |
| impact energy formula | `\|relV · normal\| * min(massA, massB)` | adapter | Measured peak ~84 for a speed-22 pig, ~49 for speed 18. Kept on `min(mass)` so a pig hitting a heavy wall does not score the wall's mass as damage. |
| glass damageThreshold | 4 | `MATERIALS` | Raised from 3 in M14: playtest complaint was that glass erased on almost any contact. A direct pig hit (~40–50 energy) still shatters a column; a rolling graze (~8) chips it instead. |
| wood density / friction / health | 0.0011 / 0.35 / 6, threshold 5 | `MATERIALS.wood` | New material (M14). Tougher than glass, weaker than stone; friction high enough that a plank holds a stack rather than sliding. Used for stage 03 tower legs. |
| stone damageThreshold | 9 | `MATERIALS` | A full-speed pig removes ~5 health; stone survives roughly three solid hits. |
| feather damageThreshold | 1.0 | `MATERIALS` | Birds are fragile: any real hit kills; a gentle nudge does not. Lowered from 1.4 so a bird dropped from a perch (~120 units) dies, which is what stage 02 and 03 kills depend on. |
| health area scaling | `area/3200`, clamped 0.35–3 | `healthFor()` | Large blocks take more hits; clamp stops huge walls becoming immortal. Divisor lowered from 4000 in M14 (blocks ~1.25× tougher), so a tower takes several hits and topples rather than vanishing. Perches are kept thin (beams 16 units tall) so a beam is still breakable. |
| camera fit padding | 120 world units | camera `fitZoom` | Zoom at load shows the whole level plus margin (D20). |
| `FOLLOW_RATE` | 6 units/s toward the projectile | camera `follow` | Fast enough to keep a flying pig on screen, slow enough that the camera never jitters. |
| `SHAKE_PIXELS` / `SHAKE_DECAY` | 9 px, 7/s | camera `shake` | Screen-space shake, capped at ±10 px and decayed to zero within a second; it never moves world coordinates, so physics is unaffected. |
| `SPRING_FULL` | 90 world units | cannon spring look | Pull at which the barrel spring reads as fully compressed (D28). Matches `maxPull`, so a max drag looks maxed. |
| `LOAD_DEPTH` / `RECOIL_DECAY` | 0.5 / 0.05 per step | cannon display extra | The waiting pig is drawn half-way down the barrel against the pull; the muzzle flash decays (D28). Presentation only. |
| trail `maxAge` / `maxPoints` / `minSpeed` | 24 steps / 40 points / speed 2 | motion trail (M15) | Ages out by step, so a trail never lingers after the pig lands; resting pigs leave no trail. |
| debris `gravity` / `fadeSteps` / `maxFragments` | 0.35 / 90 steps / 120 | fragment fall, fade window, cap (M16) | A heap fades within ~1.5 s; the cap bounds a big collapse. |
| music tempo range | 92–125 bpm, picked by level hash | generated soundtrack (M17) | Every stage gets its own pace; the range keeps it calm enough to sit under impact blips. |
| music note gains | 0.08 downbeat, 0.045–0.075 arp | relative loudness (M17) | Quiet enough that an impact or destruction still reads as an event. |
| debris `PILE_DAMPING` / `REST_SPEED` / `rollDamping` | 0.45 / speed 1 / 0.92 | landing friction and rest threshold (M16) | Debris stops fast rather than rolling across the stage. |
| particle life | 0.24–0.59 s, gravity 1400/s², cap 220 | `src/fx/particles.ts` | Debris reads as a burst and clears before the next shot. Deterministic seed, so a burst draws identically in two runs. |
| sfx envelopes | 0.08–0.4 s blips, gain 0.12–0.26 | `src/audio/sfx.ts` | Procedural oscillators, no assets (the artifact stays one file). Impact loudness scales with energy, capped at 1. |
| `DEBUG` overlay | F2 toggles bounds, ids, fps/steps | renderer | Dev diagnostics drawn in screen space after the camera transform (docs/checklist.md §1). |

## Stage sweeps (scratch/sweep-probe.ts, greedy-probe.ts)

Single-shot sweep, pull 20…`maxPull` step 5, angle −40°…+40° step 2.5° (495
combinations per stage). Re-measured after M14 (warmup, tougher blocks, glass threshold 4,
feather threshold 1.0, wood in stage 03):

| stage | wins | one-shot clears | birds killed | blocks fully gone | blocks untouched | partially damaged | settle timeouts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stage-01 | 75 | 75 | 425/990 | 0–3 | 336 | 252 | 97 |
| stage-02 | 19 | 19 | 265/990 | 0–3 | 266 | 344 | 131 |
| stage-03 | 10 | 10 | 150/990 | 0–2 | 407 | 198 | 84 |

Wins require at least one bird to die; a win is not necessarily a one-shot clear.
`scratch/greedy-probe.ts` and `tests/levels.test.ts` aim at the structure holding a bird
up, not at the bird itself — that is how a player clears a pedestal — and never repeat a
shot that killed nothing. With that bot: stage 01 clears in 1 pig, stage 02 in 2, stage 03
in 3, all inside the authored ammo.

**Difficulty order holds:** stage 01 easiest (75), stage 02 harder (19), stage 03 hardest
(10). Reaching a bird is now the hard part: blocks survive hits, so kills come from
collapse and falls.

**Level design rules (docs/level-format.md):** nothing critical may sit under stone, and a
bird must die by a *fall* or a *direct hit*, not by a graze. A bird riding a beam needs
either a breakable beam (thin glass) or a support whose failure drops it far enough to
kill (≥ ~120 units). Stone health at `area/3200` far exceeds any pig impact energy at
`DAMAGE_SCALE 0.3`, so a bird sheltered by a stone roof is unkillable
(docs/physics.md gotcha 12).

## Stage 01 reference shots (measured, scratch/sweep-probe.ts)

Two full-pull shots clear the stage — exactly what `tests/game.test.ts` asserts:

| aim (degrees, +y is down) | result |
| --- | --- |
| 0° (flat) | pig reaches the glass tower; columns shatter, the beam survives partially; the bird on the beam is crushed by the collapse |
| +20° (slightly down) | clears both birds in one shot — a three-star shot |
| −70° (nearly straight up) | misses everything; burns one pig — used to prove the lose path |

Measured peak impact energies for the flat full-pull shot (`scratch/impact-probe.ts`):
pig vs `block-1` 75.4, pig vs ground 53.9, pig vs `block-2` 24.4, ground vs falling
`block-3` 15.1, ground vs `bird-2` 7.2, debris grazes 1–5. With `DAMAGE_SCALE 0.3` the
75.4 hit spends ~7.5 glass health (destroys a 4.5 hp column) while the 24.4 hit leaves a
second column partially damaged — partial damage rather than binary destruction.

Birds are deliberately fragile: a feather bird is `health 2 × areaScale 0.35 = 0.7` with
threshold 1, so a 7.2-energy fall kills it while a 1.5 debris graze does not. That is a
starting point, not a tuned curve.

## Open tuning questions (resolve in the tuning pass)

- Pig damage model: pigs currently ignore damage entirely (D15); decide whether a pig
  takes damage from heavy hits instead.
- Stage 02 and 03 win rates (19 and 10 of 495 single-shot) are low by design — both birds
  need structural collapse. If playtests feel unfair, retune beam health or glass
  thresholds rather than adding more ammo.
- Wood is used once (stage 03 tower legs). More materials arrive with M18 pig types, where
  a heavy or bomb pig is the thing that breaks wood and stone.
