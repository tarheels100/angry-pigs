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
| `cannon.ammo` | pig type ids, consumed one per launch | `basic`, `heavy`, `bomb`, `cluster`; `pig` is an alias for `basic` (M18) |
| `statics[]` | ground/wall rectangles | `x,y` is the centre; `w,h` full size |
| `objects[]` | damageable movable bodies | `block` uses `w,h`, `ball` uses `r` |
| `objects[].target` | marks a bird | counted for win/lose |
| `targets[]` | shorthand for `objects` with `target: true` | loader merges both |
| `material` | key into `src/physics/materials.ts` | drives mass, friction, restitution, health |

## Loader responsibilities (M9)

- validate against this schema and fail with a **named field** error, not a crash;
- merge `objects` + `targets` into one entity list, assigning stable ids
  (`block-3`, `bird-1`);
- reject bodies outside `bounds`, overlapping statics, and empty `ammo`;
- reject an `ammo` entry that is not a pig type id (`unknown pig type: rocket`).

## Notes

- `x, y` are body centres, matching Matter body positions, so the renderer and
  physics agree. Bodies resting on the ground are placed at `groundTop - halfSize`.
- Health is `healthFor(material, area)`, so the same material at a larger size is
  tougher (see docs/tuning.md).
- A level is simulated for `SETTLE_WARMUP_STEPS` (90) steps with damage suppressed
  before the player gets control (D27), so authored stacks rest and nothing starts
  partly damaged. Author bodies that rest, not bodies already leaning on each other.

## scenery (M15)

Background props. `kind` is one of the kinds `SCENERY_KINDS` names ("tree", "ridge",
"plinth"); a prop is validated and painted behind entities, but it never becomes a physics
body, so props cannot change outcomes (docs/adr.md D29).

```json
"scenery": [
  { "kind": "plinth", "x": 120, "y": 798, "w": 150, "h": 84 },
  { "kind": "tree", "x": 560, "y": 770, "w": 36, "h": 140 },
  { "kind": "ridge", "x": 1300, "y": 820, "w": 260, "h": 40 }
]
```

A prop needs `r`, or `w` and `h`. Positions must be inside `bounds`.

A prop needs `r`, or `w` and `h`. Positions must be inside `bounds`.

## ammo: pig types (M18)

`cannon.ammo` is a list of pig type ids from `src/game/pigs.ts` (docs/adr.md D33):
`basic`, `heavy`, `bomb`, `cluster` (`pig` is an alias for `basic`). The id sets the body
size and mass, how much damage the pig delivers, how many pigs leave the launcher, and
whether a solid hit detonates. Types are gameplay, not materials: every pig is built from
the `light` material and gets a `variant` hint so themes can style it (docs/theme-contract.md).

Author ammo as a *plan*, not a pile of identical shots: stage 02 opens with a bomb to clear
glass, stage 03 spends a cluster on the wide tower. A stage that needs five identical shots
to clear is under-designed — add a failure mode instead (rule 4).

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
7. **Scenery never carries the level.** If a bird or a block depends on a prop, make it an
   `objects` entry, not `scenery` (D29).
8. **A bomb must have something breakable to hit.** Detonation needs a block or bird within
   the blast and impact energy above the threshold (D34); a bomb that only meets the ground
   is a wasted shot. Place glass where a bomb lands, and remember the blast chips wood rather
   than clearing it.
9. **Distance is the blast's difficulty control.** A bomb's blast falls off linearly to zero
   at its radius (130 units today), so the structures beside the landing point die and the
   ones beyond it survive. Stage 06 puts its wood tower past that radius on purpose: the bomb
   takes the near glass chain in one pig, and the wood tower still needs the heavy pig
   (docs/tuning.md). Falling debris is a second, less predictable reach — measure the sweep
   before assuming a chain stops where you drew it.
10. **The launcher stands on something.** Every level places a `plinth` prop under the cannon
    and sets `cannon.y` so the carriage (`pivot + 56`) lands on its cap. A launcher floating
    in mid-air reads as broken (playtest item 4). The plinth is scenery, so it changes no
    physics; move the cannon and the plinth together.

## Materials available (v0)

| material | role | note |
| --- | --- | --- |
| `glass` | fragile structure | shatters on a solid hit, chips on a graze |
| `wood` | tougher structure | survives several hits; friction holds a stack (stage 03 tower legs) |
| `stone` | scenery and obstacles | unbreakable by a pig at the current scale — never a roof over a bird |
| `metal` | heavy payload / immovable obstacle | very high health; structure only — pigs use `light` plus a `massScale` |
| `feather` | birds (targets) | fragile; dies from a fall or a direct hit |
| `light` | pigs (projectiles) | rolls, never takes damage (D15) |
| `ground` | statics | infinite health |

11. **Author structures with `pieces.ts`, not hand-placed y values.** `standing`, `stackUp`,
    `hut`, `platform`, `tower`, `barrierWall`, `bridge` and `pedestal` place everything
    relative to `GROUND_TOP`, so a block cannot accidentally overlap its neighbour. Hand-typed
    coordinates were how stage 02 ended up with pigs inside a wall (docs/adr.md D37).
12. **The probes are the gate, not the eye.** Before shipping a level run
    `scratch/shield-probe.ts` (every bird sheltered by roof + screen wall, no stone roof, props
    clear of the playfield, no interpenetration) and `scratch/roof-reach-report.ts` (which
    shelter roofs a measured trajectory actually descends onto). A shot that flies *over* a roof
    does not kill the bird beneath it — endpoint sampling said it did, and the stages were
    unwinnable (docs/adr.md D38).

## Stage layout at 2200 wide

World bounds are 2200 x 900 (`docs/tuning.md`). A stage reads as three zones: launcher and
first shelter around x 600-760, the middle puzzle at 1100-1450, and the far zone at 1600-1950.
Barrier walls belong in front of a shelter, not behind it — a flat shot lands short of the wall
and dies there, so the wall is only worth building when the intended solution is an arc that
clears it and descends (rule 2, and the landing table in `docs/tuning.md`).

## bird variants

A bird object may carry `variant`: `runner`, `worker`, or `broody`. It is presentation only
(docs/theme-contract.md) — the physics adapter rides it into `EntityState` so the theme picks a
silhouette. Mixing variants in a stage is what makes a nest read as a nest instead of a row of
copies (docs/adr.md D39).
