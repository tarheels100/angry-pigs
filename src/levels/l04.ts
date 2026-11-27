import type { LevelDef } from './index.ts';
import { GROUND_TOP, barrierWall, bird, bridge, hut, tower } from './pieces.ts';

/**
 * Stage 04 — the long bridge yard.
 *
 * One long deck carried by four piers is the scale piece: birds sit underneath it, so the span
 * is a single structure with several failure modes (knock a pier, hit the deck from above, blast
 * a pier with a bomb). A stone wall in front stops flat shots, and a fourth bird hides in a hut
 * behind the bridge, which needs its own pig (docs/level-format.md rules 1, 3, 4).
 */
export const LEVEL_04: LevelDef = {
  name: 'stage-04',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['bomb', 'heavy', 'cluster', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [
    // Stone wall in front: top at y 480, so nothing is reachable with a flat shot.
    ...barrierWall(600, { courseW: 80, courseH: 90, courses: 3 }),
    // The bridge: four piers, one glass deck. The underside sits at y 620, close enough to
    // crush a bird underneath when a pier fails (rule 4).
    ...bridge(800, 1700, { height: 200, piers: 4, deck: 'glass' }),
    // A hut behind the bridge for the fourth bird.
    ...hut(1900, { width: 170, height: 240, columns: 'glass', screenHeight: 300 }),
    // A decorative tower on the far edge, for scale and as a backstop.
    ...tower(2120, { width: 100, legs: 2, legHeight: 220, storeys: [{ material: 'glass', columns: 2, height: 150 }] }),
  ],
  targets: [
    bird(950, 20, GROUND_TOP, 'worker', 'right'), // under the deck, between piers 1 and 2
    bird(1250, 20, GROUND_TOP, 'runner', 'left'), // under the deck, between piers 2 and 3
    bird(1500, 20, GROUND_TOP, 'broody', 'right'), // under the deck, between piers 3 and 4
    bird(1900, 20, GROUND_TOP, 'worker', 'left'), // inside the hut
  ],
  scenery: [
    { kind: 'plinth', x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 1760, y: 560, w: 110, h: 540 },
    { kind: 'tree', x: 320, y: 590, w: 100, h: 500 },
  ],
};
