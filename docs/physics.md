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
| projectile knocks a tower over | max tilt 1.06 rad, bird displaced 206 units, 24 impacts |
| collision events report impact velocity | peak energy 49.7 at launch speed 22 (glass threshold 3) |
| bodies sleep when at rest | slept at step 92 (timeout budget 240) |
| pig keeps rolling momentum | 961 units in 200 steps |
| ballistic arc crosses the stage | 1562 units in 126 steps at v=(22,-11) |

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

## Adapter implementation notes (for M4)

- Step with `Engine.update(engine, 1000 / 60)`; one adapter `step(dt)` call = one
  engine update, with `dt` validated to be `FIXED_DT`.
- Set `engine.enableSleeping = true`; keep `body.sleepThreshold` at 60.
- Categories/mask as the table above; `group` unused.
- `simulateTrajectory` builds a throwaway world containing only the statics plus one
  pig body, steps it, and discards it — the live world is never touched.
