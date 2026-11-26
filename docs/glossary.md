# Glossary

- **pig** — projectile launched from the cannon. Consumed when it settles.
- **bird** — target. The level is cleared when no birds remain.
- **cannon** — light-powered launcher. Aim state only, not a physics body in v0.
- **object** — any movable body (block, ball). Objects are damageable; birds are a
  subset marked `target`.
- **static** — immovable body (ground, wall). Infinite health.
- **material** — named physical + resilience profile (glass, stone, metal, feather,
  ground, light). See `src/physics/materials.ts`.
- **impact energy** — relative contact speed along the contact normal, mass-weighted.
  The single number damage and effects key off.
- **settle** — no dynamic body is moving. Detected by "all bodies sleeping" with a
  step-count timeout fallback so a stuck level cannot hang. When the timeout expires the
  world is frozen first (D16), so a `settled` round is visually at rest.
- **consumed** — a pig leaves the simulation: it rested, left the bounds, or the flight
  window expired (D15). Pigs are consumed, not damaged.
- **cause** — attribution carried by `destroyed` events: `impact` (the pig hit it),
  `crush` (debris hit it), `fall` (it hit the ground or a wall).
- **fx layer** — presentation effects (particles, shake, sound) driven by events and
  drawn after entities; not part of a theme (D21).
- **stage / level** — one playable puzzle defined by JSON.
- **theme** — palette + draw recipes. Tron is the default theme (M10); pixel (M12)
  exists to prove the contract is theme-swappable with no pipeline change.
- **viewport** — world-units → canvas-pixel transform produced by the camera.
- **phase** — `aiming | in_flight | settling | won | lost | no_ammo` (M8).
