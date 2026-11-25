# Level format v0

Authored as JSON in `src/levels/`, imported and compiled into the bundle at build
time (D6). Coordinates are world units; the stage is 1600x900 with +y downward.

```jsonc
{
  "name": "stage-01",
  "bounds": { "width": 1600, "height": 900 },
  "cannon": { "x": 120, "y": 480, "maxPull": 90, "powerScale": 0.42, "ammo": ["basic", "basic", "heavy"] },
  "statics": [ { "type": "ground", "x": 0, "y": 860, "w": 1600, "h": 40 } ],
  "objects": [ { "type": "block", "material": "glass", "x": 900, "y": 800, "w": 40, "h": 120 } ],
  "targets": [ { "type": "ball", "material": "feather", "x": 1100, "y": 780, "r": 24 } ]
}
```

## Fields

| Field | Meaning | Notes |
| --- | --- | --- |
| `bounds` | world extents, also the camera fit target | fixed aspect 16:9 for v0 |
| `cannon.x/y` | origin of the launcher | not a physics body |
| `cannon.maxPull` | drag cap in world units | bounds launch power |
| `cannon.powerScale` | launch speed per unit of pull | tuned in M7/M8 |
| `cannon.ammo` | pig variants, consumed one per launch | unused variants allowed for later |
| `statics[]` | ground/wall rectangles | `x,y` is the centre; `w,h` full size |
| `objects[]` | damageable movable bodies | `block` uses `w,h`, `ball` uses `r` |
| `objects[].target` | marks a bird | counted for win/lose |
| `targets[]` | shorthand for `objects` with `target: true` | loader merges both |
| `material` | key into `src/physics/materials.ts` | drives mass, friction, restitution, health |

## Loader responsibilities (M9)

- validate against this schema and fail with a **named field** error, not a crash;
- merge `objects` + `targets` into one entity list, assigning stable ids
  (`block-3`, `bird-1`);
- reject bodies outside `bounds`, overlapping statics, and empty `ammo`.

## Notes

- `x, y` are body centres, matching Matter body positions, so the renderer and
  physics agree.
- Health is `healthFor(material, area)`, so the same material at a larger size is
  tougher (see docs/tuning.md).
