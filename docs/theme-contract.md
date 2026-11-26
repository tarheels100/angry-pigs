# Theme contract

A theme supplies exactly three things. It reads entity state; it never mutates it,
and it never reads collision, health-math, or level logic.

1. **Manifest** — `id`, `name`, and `palette` (background, outline, grid,
   per-material accents, pig/bird/cannon colours, aim guide, destroyed flash).
2. **Draw recipes** — `paintBackground`, `paintEntity`, `paintOverlay`, taking
   `(ctx, state | frame, viewport)`. `paintOverlay` receives a `RenderFrame`
   (`camera`, `phase`, `aim`), not physics internals. The renderer owns the camera
   transform, so themes draw in world coordinates and cannot change framing.
3. **Asset set** — optional sprites/fonts/audio keyed by manifest ids (v0 ships none).

## What a theme may read

`EntityState`: `kind`, `shape`, `material`, `x`, `y`, `angle`, `radius`,
`halfWidth`, `halfHeight`, `vx`, `vy`, `sleeping`, `destroyed`, `health`,
`impactEnergy`.

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
- `tron` (M10) — default: dark background, neon outlines, additive glow.
