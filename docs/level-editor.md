# Level editor (M23)

An in-app editor for building a stage out of the existing blocks. It is not a second level
format: a draft expands through `src/levels/pieces.ts` into a `LevelDef`, which goes through the
same loader, validation, and physics a shipped stage uses (docs/level-format.md).

## Opening it

- Press `E`, or the **edit** button in the HUD.
- `E` or `Escape` again closes it and hands the pointer back to aiming.

While the panel is open a press on the stage **places** the armed piece (or **selects** the piece
under the pointer, if there is one). Aiming is suspended; the round is previewed live through
`game.loadLevel()`, so what you see is what the physics will do.

## The palette

Pick a piece with its button or its digit key. `1`..`0` map left to right:

| key | piece | what it makes |
| --- | --- | --- |
| 1 | column | one block, resting on the ground or at its own centre height |
| 2 | stack | a vertical pile of blocks (`blocks` counts them) |
| 3 | shelter | columns + lintel + roof + a screen wall |
| 4 | tower | legs, glass storeys, roof |
| 5 | beam + legs | a beam on N supports |
| 6 | bridge | a deck across a span with piers under it |
| 7 | barrier wall | a stacked wall in front of a shelter |
| 8 | ball | a circle; takes the pressed height, so it can sit on a beam |
| 9 | bird | a target bird — silhouette and facing included |
| — | scenery | tree, ridge, plinth; never carries the level (rule 7) |
| — | platform (static) | immovable ground or wall slab |

Digit keys arm the first nine pieces; the eleventh palette button arms the static slab, which no
digit can reach.

A new draft starts with the ground and the launcher's plinth, so the first thing a blank stage
needs is a bird and some structure.

## Editing a piece

Click it (on the stage or in the piece list). The controls show its parameters as −/+ steppers:
width, height, counts, material, centre height. `[` and `]` nudge it 10 units sideways. `d`
deletes the selected piece, `u` undoes (20 deep), `Enter` closes and plays.

Ammo is edited from the same panel: add `basic`, `heavy`, `bomb`, `cluster`, remove the last, and
step the launcher's max pull.

## Saving, loading, exporting

- **save** writes the draft to `localStorage` (`angry-pigs:draft`); **load saved** reads it back.
- **export** puts the level JSON in the panel's read-only box — the same JSON `src/levels/lXX.ts`
  holds, so paste it into a new level file. `editor.exportJson()` returns the same text.
- **open stage-XX** loads a shipped stage as a draft. Builder structures arrive as their expanded
  blocks (a shelter becomes its four blocks), which is honest: the export reproduces the level,
  not the call that built it.

The report line under the controls is the loader's own verdict: errors are what makes the stage
unloadable, warnings are things that are allowed but usually a mistake — two structures
interpenetrating, scenery over the playfield, no plinth under the launcher, no ground.

Solvability is **not** checked in the panel. A stage is solvable when
`scratch/greedy-probe.ts` clears it (docs/adr.md D38); the editor can only tell you the data is
legal.

## Where the code lives

- `src/levels/draft.ts` — the model: pieces, per-kind fields, expansion, footprints, validation,
  JSON round-trip. Testable headless (`tests/draft.test.ts`).
- `src/ui/editor.ts` — the DOM panel. It owns no simulation and no level data; its only route to
  the game is `onPreview(def)` → `game.loadLevel(loadLevel(def))` (`tests/editor.test.ts` drives
  it with a fake DOM).
- `src/main.ts` — wiring: the `E` key, the HUD button, pointer routing while open, store-backed
  save/load, and the `window.__editor` seam the browser test uses.
