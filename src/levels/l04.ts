import type { LevelDef } from './index.ts';

/** Stage 04 — one big collapse. A two-storey tower: wood legs hold a glass beam, and a
 * second glass storey rides that beam. Hitting the wood legs takes the whole structure
 * down, so both elevated birds die by a fall rather than by a direct hit
 * (docs/level-format.md rules 4 and 6). The third bird sits on a pedestal with two
 * columns, so it needs both gone: the stage is a three-shot escalation rather than a
 * lucky single shot. Wood needs several hits, so the stage is a heavy-pig stage: a basic
 * pig chips the legs, a heavy pig takes them out. A low stone wall makes flat shots die
 * before the structures; stone is never a roof over a bird (rules 1, 2).
 * Ground top = 840; a resting body's centre is groundTop - halfSize.
 */
export const LEVEL_04: LevelDef = {
  name: 'stage-04',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.22, ammo: ['heavy', 'heavy', 'bomb', 'basic', 'cluster'] },
  statics: [
    { type: 'ground', x: 800, y: 860, w: 1600, h: 40 },
    // Flat shots die here, so the tower must be reached by an arc.
    { type: 'wall', x: 620, y: 800, w: 50, h: 80 },
  ],
  objects: [
    // Tower legs: wood, tops = 720. Wood friction holds the stack (docs/tuning.md).
    { type: 'block', material: 'wood', x: 880, y: 780, w: 34, h: 120 },
    { type: 'block', material: 'wood', x: 980, y: 780, w: 34, h: 120 },
    // First floor: glass beam (centre 712, top 704) riding the legs.
    { type: 'block', material: 'glass', x: 930, y: 712, w: 170, h: 16 },
    // Second storey: glass columns (tops = 602) on that beam.
    { type: 'block', material: 'glass', x: 890, y: 652, w: 26, h: 100 },
    { type: 'block', material: 'glass', x: 970, y: 652, w: 26, h: 100 },
    // Roof beam (centre 594, top 586). Not stone: a bird must be reachable by collapse.
    { type: 'block', material: 'glass', x: 930, y: 594, w: 150, h: 16 },
    // Far pedestal: two wood columns (tops = 670) under a wood beam (top 654). Both
    // columns must fail for the bird to fall — the two-shot puzzle from rule 4, and wood
    // friction means one broken column still holds the beam.
    { type: 'block', material: 'wood', x: 1340, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'wood', x: 1420, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'wood', x: 1380, y: 662, w: 120, h: 16 },
    // Stone only as an obstacle a flat shot dies on, never over a bird.
    { type: 'block', material: 'stone', x: 1560, y: 800, w: 60, h: 80 },
  ],
  targets: [
    // Riding the first floor (beam top = 704).
    { type: 'ball', material: 'feather', x: 930, y: 684, r: 20, target: true },
    // Riding the roof (beam top = 586) — falls ~150 units when the tower goes.
    { type: 'ball', material: 'feather', x: 930, y: 566, r: 20, target: true },
    // Balanced on the pedestal beam (top = 654).
    { type: 'ball', material: 'feather', x: 1380, y: 634, r: 20, target: true },
  ],
  scenery: [
    { kind: "plinth", x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 480, y: 490, w: 190, h: 700 },
    { kind: 'tree', x: 1200, y: 500, w: 170, h: 680 },
    { kind: 'ridge', x: 1480, y: 710, w: 1300, h: 260 },
  ],
};
