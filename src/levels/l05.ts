import type { LevelDef } from './index.ts';

/** Stage 05 — the grove. A platform rests on two wood trunks, so its bird needs both
 * trunks gone: a two-shot puzzle by support count rather than by ammo
 * (docs/level-format.md rule 4). A second bird rides a narrow glass perch on a single
 * column, so one hit on the column drops it ~120 units (rule 6). A low stone wall makes
 * flat shots die before the structures; stone is never a roof over a bird (rule 1).
 * Ground top = 840; a resting body's centre is groundTop - halfSize.
 */
export const LEVEL_05: LevelDef = {
  name: 'stage-05',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 420, maxPull: 90, powerScale: 0.22, ammo: ['bomb', 'heavy', 'basic', 'cluster'] },
  statics: [
    { type: 'ground', x: 800, y: 860, w: 1600, h: 40 },
    // Flat shots die here; arcs pass over (docs/level-format.md rule 2).
    { type: 'wall', x: 620, y: 800, w: 50, h: 80 },
  ],
  objects: [
    // Trunks: wood, tops = 690. Both must fail for the platform to drop.
    { type: 'block', material: 'wood', x: 860, y: 765, w: 34, h: 150 },
    { type: 'block', material: 'wood', x: 1020, y: 765, w: 34, h: 150 },
    // Platform beam (centre 680, top 670).
    { type: 'block', material: 'wood', x: 940, y: 680, w: 240, h: 20 },
    // Perch: single glass column (top = 640) with a narrow beam (top 626).
    { type: 'block', material: 'glass', x: 1300, y: 745, w: 26, h: 190 },
    { type: 'block', material: 'glass', x: 1300, y: 633, w: 90, h: 14 },
  ],
  targets: [
    // Riding the platform (beam top = 670).
    { type: 'ball', material: 'feather', x: 940, y: 650, r: 20, target: true },
    // Balanced on the perch beam (top = 626).
    { type: 'ball', material: 'feather', x: 1300, y: 606, r: 20, target: true },
  ],
  scenery: [
    // The grove: props only, never bodies (docs/adr.md D29).
    { kind: 'tree', x: 500, y: 762, w: 40, h: 156 },
    { kind: 'tree', x: 700, y: 780, w: 30, h: 120 },
    { kind: 'tree', x: 1180, y: 770, w: 36, h: 140 },
    { kind: 'ridge', x: 1380, y: 826, w: 240, h: 28 },
  ],
};
