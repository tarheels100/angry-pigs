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

## M3 spike results

To be recorded after the spike: measured fall arcs, rolling behaviour on an incline,
stack topple, and impact-energy magnitudes. If Matter.js fails any of these, D1 is
superseded.
