import type { LevelDef } from './index.ts';
import { GROUND_TOP, bird, barrierWall, hut, platform, standing } from './pieces.ts';

/**
 * Stage 01 — the tutorial terrace: three shelters in a row, each hiding a bird.
 *
 * Level rule 1 (docs/level-format.md): a bird sits inside a shelter, so a roof or a beam is
 * above it and a screen wall is in front of it. Nothing here dies to a flat shot; the player
 * has to break a roof or knock out a support. Verified by `scratch/shield-probe.ts`.
 *
 * Bodies rest on the ground: ground top = 840 (docs/physics.md gotcha 5).
 */
export const LEVEL_01: LevelDef = {
  name: 'stage-01',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['basic', 'heavy', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [
    // Shelter 1: a hut with a screen wall. Bird inside, roof above it.
    ...hut(700, { width: 150, height: 200, screenHeight: 260 }),
    // A glass gate between shelters, so a flat shot is stopped before it reaches shelter 2.
    standing(900, 'glass', 30, 130),
    standing(960, 'glass', 30, 130),
    { type: 'block', material: 'wood', x: 930, y: 840 - 130 - 12, w: 120, h: 24 },
    // Shelter 2: a crush platform. Bird in the gap between legs, beam above it.
    ...platform(1150, { span: 180, height: 150, supports: 2 }),
    // A second glass gate between shelters 2 and 3.
    standing(1290, 'glass', 30, 120),
    standing(1320, 'glass', 30, 120),
    // Shelter 3: a taller hut with glass legs — glass fails faster, so it is the easy kill.
    ...hut(1600, { width: 170, height: 240, columns: 'glass', screenHeight: 300 }),
    // Masonry on the far edge: nothing behind it, it only stops an overshoot.
    ...barrierWall(2050, { courseW: 70, courseH: 80, courses: 5 }),
  ],
  targets: [
    bird(700, 20, GROUND_TOP, 'runner'), // inside shelter 1, on the ground under the roof
    bird(1150, 20, GROUND_TOP, 'worker'), // under the platform beam
    bird(1600, 20, GROUND_TOP, 'broody'), // inside shelter 3
  ],
  scenery: [
    { kind: 'plinth', x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 430, y: 560, w: 130, h: 560 },
    { kind: 'tree', x: 2140, y: 590, w: 110, h: 500 },
  ],
};
