import type { LevelDef } from './index.ts';
import { GROUND_TOP, bird, hut, platform, standing, tower } from './pieces.ts';

/**
 * Stage 02 — two keeps and a crush yard.
 *
 * Every bird is inside a shelter (docs/level-format.md rule 1, checked by
 * `scratch/shield-probe.ts`): a screen wall blocks the straight shot, and a roof or beam
 * above the bird is what a lobbed arc has to break. Structures are separated by more than
 * the blast radius (rule 9), so a bomb cannot clear the stage in one shot.
 */
export const LEVEL_02: LevelDef = {
  name: 'stage-02',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['bomb', 'basic', 'heavy', 'basic'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [
    // Keep 1: hut with glass legs — glass fails fast, so the roof comes down early.
    ...hut(820, { width: 160, height: 220, columns: 'glass', screenHeight: 280 }),
    // Two glass columns between keep 1 and the yard, so a low arc is stopped early.
    standing(1000, 'glass', 30, 120),
    standing(1030, 'glass', 30, 120),
    // Crush yard 1: three legs carry a beam. The bird sits in a gap between legs, never
    // under one — a leg under the bird would be interpenetrating geometry at author time.
    ...platform(1180, { span: 200, height: 170, supports: 3 }),
    // Keep 2: taller hut, wood legs — needs a heavy pig or a bomb.
    ...hut(1560, { width: 180, height: 260, screenHeight: 320 }),
    // Crush yard 2: two legs, short beam.
    ...platform(1900, { span: 160, height: 140, supports: 2 }),
    // A decorative tower on the far edge for scale. It carries no bird: its roof sits high,
    // and a bird under a beam that far up is not crushable (docs/level-format.md rule 4).
    ...tower(2120, { width: 100, legs: 2, legHeight: 200, storeys: [{ material: 'glass', columns: 2, height: 140 }] }),
  ],
  targets: [
    bird(820, 20, GROUND_TOP, 'worker'), // inside keep 1
    bird(1230, 20, GROUND_TOP, 'runner'), // in the gap between legs of crush yard 1, under the beam
    bird(1560, 20, GROUND_TOP, 'broody'), // inside keep 2
    bird(1900, 20, GROUND_TOP, 'worker'), // under the beam of crush yard 2
  ],
  scenery: [
    { kind: 'plinth', x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 300, y: 570, w: 120, h: 540 },
    { kind: 'tree', x: 2060, y: 600, w: 100, h: 480 },
  ],
};
