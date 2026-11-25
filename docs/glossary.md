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
  step-count timeout fallback so a stuck level cannot hang.
- **stage / level** — one playable puzzle defined by JSON.
- **theme** — palette + draw recipes. Tron is the default theme (M10).
- **viewport** — world-units → canvas-pixel transform produced by the camera.
- **phase** — `aiming | in_flight | settling | won | lost | no_ammo` (M8).
