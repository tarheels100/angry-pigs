# Theme contract

A theme supplies exactly three things. It reads entity state; it never mutates it,
and it never reads collision, health-math, or level logic.

1. **Manifest** — `id`, `name`, and `palette` (background, outline, grid, per-material
   accents for every `MaterialId` including `wood`, pig/bird/cannon colours, aim guide,
   destroyed flash). A palette must cover all materials, because a level may use any of
   them.
2. **Draw recipes** — `paintBackground`, `paintEntity`, `paintOverlay`, taking
   `(ctx, state | frame, viewport)`. `paintOverlay` receives a `RenderFrame`
   (`camera`, `phase`, `aim`), not physics internals. The renderer owns the camera
   transform, so themes draw in world coordinates and cannot change framing.
3. **Asset set** — optional sprites/fonts/audio keyed by manifest ids (v0 ships none).

`paintBackground` is painted in screen space, before the camera transform, so its scale is
in CSS pixels while everything else is in world units (~1600x900). A fine field reads as
noise next to the stage — the playtest asked for >=5x, and both themes now use a 220 px grid
or an 80 px checker cell. Scale it against the world, not against the window.

Presentation effects are **not** themes. Particles, camera shake, and sound subscribe to
`GameEvents` and draw through the renderer's layers (D21): `behind` paints under entities
(motion trail, debris heaps), `front` paints above them (particles, flashes). Draw order —
background, `behind`, entities, overlay, `front` — is owned by the renderer, so a theme
cannot reorder it (D30). A theme may not emit sound or spawn particles, because effects
must keep working for every theme.

Menus are **not** themes either. The title and options screens (M19) are DOM overlays
(`src/ui/screens.ts`) with their own stylesheet in `index.html`, so a theme swap cannot
change them and no theme has to implement a list of buttons (D35).

## What a theme may read

`EntityState`: `kind`, `shape`, `material`, `x`, `y`, `angle`, `radius`,
`halfWidth`, `halfHeight`, `vx`, `vy`, `sleeping`, `destroyed`, `health`,
`healthMax`, `fade`, `variant`, `impactEnergy`, and on the cannon extra only
`pull`, `aimAngle`, `recoil`.

`healthMax` lets a theme show partial damage (cracks, tilt) without knowing damage
maths. `fade` is set only on short-lived display extras — a destroyed body is not in
the snapshot at all (D17), so a theme never paints a permanent silhouette. `variant` is
a hint that is not appearance: a pig's ammo type id (`basic`, `heavy`, `bomb`, `cluster`),
or a scenery prop kind (`tree`, `ridge`). The theme
decides how to draw it, and the simulation never reads it. `pull`, `aimAngle`, and
`recoil` carry the launcher's aim state (D28) so a theme can draw a tilting barrel and a
compressing spring without reaching into `Cannon`.

Semantic state, not appearance: "bird destroyed" renders identically in any theme.
Add a field here only if a theme genuinely needs the *state*, not the style.

## Adding a theme

1. Create `src/render/themes/<id>.ts` returning a `Theme`.
2. Register it in the theme registry and make it selectable at runtime.
3. Switching themes must change appearance with **zero** changes outside
   `src/render/themes/`. Any change elsewhere is a contract violation to fix —
   this is M12's acceptance check.

## Available themes

- `placeholder` (M6) — flat colours, no glow; used to prove the state → render
  pipeline before art exists. Instances capture their own palette, so a variant
  proves a theme swap changes colours without touching the pipeline.
- `tron` (M10) — default: dark background, neon outlines, additive glow, grid.
- `pixel` (M12) — chunky solids snapped to a 4-unit grid, checkerboard background, no
  glow, damage painted as missing chunks. Added as registry entries only: `npm run
  test:browser` asserts painted pixels change, and `tests/themes.test.ts` asserts theme
  files import nothing outside the contract.

## Entity art

Entities are drawn as characters, not primitives (M15): a pig gets ears, a snout, eyes,
legs, and type marks keyed on `variant`; a bird gets an egg body, wing, tail, beak, and
comb; the launcher gets a barrel that tilts with `aimAngle`, a coil that compresses with
`pull`, and a carriage that reaches the ground; scenery props are drawn from `variant`
(`tree`, `ridge`, `plinth`). The carriage bottom is `pivot + 56` world units, which is where
the level's `plinth` prop puts its cap — the launcher must look built on something, not
float in the air (playtest item 4). A destroyed flash keeps only the body outline,
so the flash never paints a face (D17). All of it is a recipe inside `paintEntity`.

## Material texture

A theme may draw material *texture* inside a block (plank grain, brick courses, a metal
double wall, glass sheen), derived from `material` plus the palette colour only. Two
themes render the same material completely differently — Tron reads materials as
construction, Pixel as masonry — and neither reads physics (docs/post-m13-notes.md,
M14). This is a recipe inside `paintEntity`, not a new pipeline stage.
