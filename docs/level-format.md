# Level format v0

Authored as JSON in `src/levels/`, imported and compiled into the bundle at build
time (D6). Coordinates are world units; the stage is 1600x900 with +y downward.

```jsonc
{
  "name": "stage-01",
  "bounds": { "width": 1600, "height": 900 },
  "cannon": { "x": 120, "y": 480, "maxPull": 90, "powerScale": 0.22, "ammo": ["basic", "basic", "heavy"] },
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
  physics agree. Bodies resting on the ground are placed at `groundTop - halfSize`.
- Health is `healthFor(material, area)`, so the same material at a larger size is
  tougher (see docs/tuning.md).
- A level is simulated for `SETTLE_WARMUP_STEPS` (90) steps with damage suppressed
  before the player gets control (D27), so authored stacks rest and nothing starts
  partly damaged. Author bodies that rest, not bodies already leaning on each other.

## Design rules (learned from the sweeps)

1. **Never shelter a bird under stone.** Stone health and its damage threshold make it
   immune to a pig at `DAMAGE_SCALE 0.3` (docs/physics.md gotcha 12); an unreachable
   bird under a stone roof makes the stage unwinnable. Kill elevated birds by collapsing
   the glass structure beside them.
2. **Keep direct-hit targets within ~700 units of the cannon**; beyond that a flat shot
   reaches the ground first, so distant birds must die by collapse.
3. **Every stage must be clearable within its authored ammo.** `scratch/greedy-probe.ts`
   is the check: it fires a greedy bot at each stage and asserts a win. The bot aims at
   the structure holding a bird, like a player does, and never repeats a shot that killed
   nothing.
4. **Give every bird a failure mode.** A beam balanced on a single column tips when the
   column is hit, so one well-aimed shot kills; a beam on two columns needs both columns
   gone, so it is a two-shot puzzle. Pick the support count to set difficulty rather than
   adding ammo.
5. **Do not rely on blocks being fully destroyed.** The sweep shows many runs leave
   partially damaged blocks standing (docs/tuning.md), which is intended — damage is
   per impact, not per level.
6. **A bird must die by a fall or a direct hit, never a graze.** A feather bird needs
   roughly 3 units of impact energy, so a perch has to either break (thin glass, since
   health scales with area — keep beams ~16 units tall) or drop the bird about 120 units
   to the ground. A bird nudged sideways along a beam survives, and a stage that depends
   on it is unfair.

## Materials available (v0)

| material | role | note |
| --- | --- | --- |
| `glass` | fragile structure | shatters on a solid hit, chips on a graze |
| `wood` | tougher structure | survives several hits; friction holds a stack (stage 03 tower legs) |
| `stone` | scenery and obstacles | unbreakable by a pig at the current scale — never a roof over a bird |
| `metal` | heavy payload / immovable obstacle | very high health; reserved for M18 pig types |
| `feather` | birds (targets) | fragile; dies from a fall or a direct hit |
| `light` | pigs (projectiles) | rolls, never takes damage (D15) |
| `ground` | statics | infinite health |
