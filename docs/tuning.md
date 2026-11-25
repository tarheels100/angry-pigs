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
| cannon `powerScale` | 0.14 | level data | Full pull (90) → launch speed ~12.6. Measured landing distance at 45°: speed 12 → 1228 units, 14 → 1582, 22 → 3419. 12.6 puts a full pull near the far end of a 1600-unit stage; 22 overshoots the stage entirely. |
| pig rolling resistance | ×0.94 per step while grounded | adapter | Matter has no rolling resistance, so a pig on flat ground rolls forever and never sleeps. Damping velocity and angular velocity while in ground contact stops a full-pull pig at ~step 170 instead of never. |
| impact energy formula | `\|relV · normal\| * min(massA, massB)` | adapter | Measured peak ~84 for a speed-22 pig, ~49 for speed 18. Kept on `min(mass)` so a pig hitting a heavy wall does not score the wall's mass as damage. |
| glass damageThreshold | 3 | `MATERIALS` | A direct pig hit (~40-50 energy) shatters glass; a rolling graze (~8) does not. |
| stone damageThreshold | 9 | `MATERIALS` | A full-speed pig removes ~5 health; stone survives roughly three solid hits. |
| feather damageThreshold | 2 | `MATERIALS` | Birds are fragile: any real hit kills; a gentle nudge does not. |
| health area scaling | `area/4000`, clamped 0.35–3 | `healthFor()` | Large blocks take more hits; clamp stops huge walls becoming immortal. |

## Open tuning questions (resolve in M8)

- Impact energy thresholds vs. tower-collapse damage (gentle crushes) not measured yet.
- Whether rolling resistance should also apply to birds/balls that roll on the ground.
- Remaining-ammo bonus score and star thresholds.
