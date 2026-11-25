# Tuning log

Every gameplay/physics constant needs a reason here. Change the constant and this
file together.

| Constant | Value | Where | Reason |
| --- | --- | --- | --- |
| `FIXED_DT` | 1/60 s | `src/core/loop.ts` | Deterministic steps at 60 Hz; headless tests assert by step count. |
| gravity Y | 1.0 | Matter world default | Matter's default gravity scale is tuned for pixel-ish units; keeps fall arcs readable at 1600x900 world units. Confirmed in M3 spike. |
| air friction | 0.001 | `WorldInit.airFriction` | Slight damping so pigs don't drift forever; low enough to keep arcs ballistic. |
| sleep threshold | 60 steps | Matter engine | A body must be near-still for ~1 s before sleeping; matches "settle" feel. |
| settle timeout | 240 steps (4 s) | settle detection | Fallback so a jittering body can't block the phase machine forever. |
| cannon `maxPull` | 90 world units | level data | Pull distance cap; keeps power bounds predictable. |
| cannon `powerScale` | TBD (M7) | level data | Speed per unit of pull; tuned in M7 so a full pull crosses the stage. |
| material densities | see materials.ts | `src/physics/materials.ts` | Relative mass ordering: metal > stone > glass > feather. |
| health area scaling | `area/4000`, clamped 0.35–3 | `healthFor()` | Large blocks take more hits than small ones; clamp stops huge walls becoming immortal. |
| damage threshold | per material | `src/physics/materials.ts` | Energy needed per health point; glass shatters, stone resists. |

## Open tuning questions (resolve in M8)

- Launch speed per pull: how far should a full pull carry a pig?
- Impact energy scale: Matter relative-velocity magnitudes need calibration against
  the damage thresholds above.
- Bird death rule (open question 2 in README): direct hits only vs. fall/collapse damage.
