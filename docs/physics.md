# Physics

Engine: matter-js 0.20 (D1), accessed only through `PhysicsAdapter`.

## Why an adapter

The game and renderer must not know about Matter body objects. The adapter exposes:

- `addBody(init)` / `removeBody(id)` — level descriptors → bodies
- `step(dt)` → `Impact[]` for the step just taken
- `snapshot()` / `state(id)` — read-only entity state
- `launch(id, velocity)` — drag-derived launch
- `applyDamage(id, amount)` — health bookkeeping, `destroyedLastStep()` reports deaths
- `simulateTrajectory(origin, velocity, maxSteps)` — non-mutating aim preview
- `allSleeping()` / `wakeAll()` — settle detection

## Collision filtering

Categories (`group` is unused so category/mask stays readable):

| Category | Mask |
| --- | --- |
| `static` | everything |
| `object` | static, object, target, projectile |
| `target` | static, object, target, projectile |
| `projectile` | static, object, target — **not** other projectiles |

Pigs must not collide with each other or the launcher, otherwise a second pig
knocks the first one around and muddies impact damage.

## Impact energy

Matter's collision payload does not carry a usable speed value directly, so the
adapter computes relative velocity along the contact normal:

```
energy = |(vA - vB) · normal| * min(massA, massB)
```

`min(mass)` rather than the sum so a fast pig hitting a heavy wall does not score
the wall's mass as damage. Values are calibrated against material
`damageThreshold` (docs/tuning.md).

## Sleeping / settle

`engine.sleeping = true`, `sleepThreshold` 60 steps. Settle = all dynamic bodies
sleeping, **or** a 240-step timeout fallback (docs/tuning.md) so jitter can't stall
the phase machine.

## Determinism

Physics is stepped only at `FIXED_DT` from the accumulator, never at frame delta.
Headless tests advance an exact step count and assert outcomes (D8).

## M3 spike results — D1 validated

Run `node scratch/physics-spike/spike.ts`. All checks pass:

| Check | Measured |
| --- | --- |
| unsupported object falls | 117.5 units in 30 steps, vy 7.23 |
| circle rolls down a 20° incline | +87.6 units, angular velocity 0.071 |
| projectile knocks a tower over | max tilt 1.57 rad, bird displaced 216 units, 33 impacts |
| collision events report impact velocity | peak energy 84 at launch speed 22; ~49 at speed 18 (glass threshold 3) |
| bodies sleep when at rest | slept at step 92 (timeout budget 240) |
| pig keeps rolling momentum | rolls indefinitely on flat ground — see gotcha 7 |
| ballistic arc crosses the stage | landing distance at 45°: speed 12 → 1228 units, 14 → 1582, 22 → 3419 |

### Gotchas the spike exposed (must be honoured by M4)

1. **`Engine.update(engine, delta)` takes milliseconds**, not seconds — the delta is
   `1000/60`. Passing `1/60` makes the world effectively frozen, and there is no
   `Engine.step` in matter-js 0.20.
2. **Sleeping is `engine.enableSleeping = true`** (engine flag). The threshold is
   per-body: `body.sleepThreshold` (default 60). `engine.sleepThreshold` does not exist.
3. **Friction is `max(frictionA, frictionB)`**, so a high-friction ground stops a pig
   dead. Pigs need friction ≈ 0.02 to keep momentum; ground is 0.5.
4. **Static friction matters for toppling.** `frictionStatic: 0.6` on glass made towers
   slide as one piece; 0.05 lets a column tip (tilt 1.93 rad when struck above mid-height).
5. **Bodies must not overlap the ground.** A body whose lower edge overlaps a static
   gets pushed upward by the solver, which makes measurements lie. Compute placements
   as `groundTop - halfHeight`, not by eye.
6. **Impact energy needs computing ourselves.** `pair.collision` has no speed field;
   the adapter derives relative velocity along `pair.collision.normal`.
7. **Matter has no rolling resistance.** A pig on flat ground never slows down and
   never sleeps; `friction` barely affects rolling. The adapter damps linear and
   angular velocity by ×0.94 per step while a pig is in ground contact
   (docs/tuning.md), so pigs settle around step ~170.
8. **The option is `frictionAir`, not `airFriction`.** A misspelled option is silently
   ignored, which changed measured results between two spike runs.
9. **Ground must span the stage, or pigs leave it.** A ground static narrower than the
   stage lets a pig fly past the ground and keep falling forever; pigs crossing the
   level bounds must be removed (docs/adr.md D15).
10. **Gravity dominates the arc.** At gravity 1.0 the pig falls ~0.26 units per step²,
    so a flat launch from y=480 reaches the ground after ~52 steps and ~1000 units of
    travel at speed 19.8. An upward aim does not buy range — the drop grows with t².
    Keep targets within roughly 700 units of the cannon for a direct hit, or kill
    elevated ones with structural collapse (docs/tuning.md).
11. **Removing a support does not wake what rested on it.** A settled tower sleeps,
    and destroying a body produces no collision event, so a beam left with no leg
    keeps floating. `wakeNear` wakes every dynamic body whose bounds overlap the
    departing body, expanded by 40 units, before removal — and it wakes bodies that
    are *not yet* asleep, because an idle body sitting on a support has a sleep
    counter near the threshold and would fall asleep before gravity could move it.
    Measured: beam with one leg destroyed moved 708 → 771.6 with the fix, 708.4 without.
12. **Stone is effectively immune to a pig.** Stone health is `area/3200` clamped to 3
    (health 24 for a 60x80 block) and its damage threshold is 9; the hardest pig impact
    measured is ~75 energy, which at `DAMAGE_SCALE 0.3` spends ~2.5 health per hit. A
    stone roof therefore never breaks, so a level must never shelter a bird under stone —
    kill elevated birds by collapsing the glass structure beside them instead
    (docs/level-format.md).
13. **A bird on a perch needs a fall or a direct hit.** Feather health is ~0.7 and its
    threshold is 1, so a contact must carry roughly 3 units of energy. A bird nudged
    sideways along a beam, or dropped a few units, survives; a ~120-unit drop delivers
    ~7 and dies. Perch design must therefore break (thin glass beam) or fail completely
    (single column) — a two-column beam that merely tilts leaves the bird alive
    (docs/level-format.md rule 6).
14. **Settling can damage a level before the player acts.** Authored bodies placed a pixel
    apart collide on the first steps, and that contact spends health, so a level used to
    start partly damaged and visibly sinking. The game now simulates 90 steps with damage
    suppressed before handing control over (D27); suppression is a game-layer flag, not a
    physics-engine setting, so damage maths stays in one place.
15. **A blast is not an impact.** `adapter.explode()` charges health points and velocity
    directly, with linear falloff from the centre, because a blast has no collision partner
    and therefore no impact energy. Impact damage is normalized
    (`0.3 * energy / material.threshold`), so the two must not be confused: the bomb's
    authored `damage 14` becomes `14 * DAMAGE_SCALE = 4.2` health at the centre, which clears
    glass (0.5–2.4 hp) and chips wood (6 hp) but cannot erase a wood column in one blast.
    Bodies exactly at the centre take the full amount, not zero (`dist === 0` is a hit, not
    "no direction"), and a body already destroyed is skipped so a second blast cannot fling
    a corpse (docs/adr.md D34).

## What the M7 slice proved

Running the real level through the game layer in headless steps (`tests/game.test.ts`):
a flat full-pull shot shatters the tower and crushes the bird on the beam, a +16° shot
kills the bird standing in the open, pigs are consumed within ~100 steps, and the phase
machine reaches `won` / `lost` without hitting the timeout.

## Adapter implementation notes (for M4)

- Step with `Engine.update(engine, 1000 / 60)`; one adapter `step(dt)` call = one
  engine update, with `dt` validated to be `FIXED_DT`.
- Set `engine.enableSleeping = true`; keep `body.sleepThreshold` at 60.
- Categories/mask as the table above; `group` unused.
- `simulateTrajectory` builds a throwaway world containing only the statics plus one
  pig body, steps it, and discards it — the live world is never touched.
