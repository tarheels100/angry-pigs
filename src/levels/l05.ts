import type { LevelDef } from './index.ts';
import { GROUND_TOP, bird, hut, platform, standing } from './pieces.ts';

/**
 * Stage 05 — the terrace climb: five shelters stepping up in height, left to right.
 *
 * The height ladder is the difficulty ladder. The first shelter is a low platform a flat shot
 * can reach; the last is a tall hut whose roof sits at y 540 and needs a high arc. Birds sit in
 * the gaps between legs, never under a leg (docs/level-format.md rule 4), and shelters are
 * spaced past the blast radius so one bomb cannot take two down (rule 9).
 */
export const LEVEL_05: LevelDef = {
  name: 'stage-05',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['bomb', 'heavy', 'basic', 'cluster', 'basic'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [
    // Shelter 1: low crush platform, two legs. Bird in the gap.
    ...platform(760, { span: 160, height: 140, supports: 2 }),
    standing(880, 'glass', 30, 110),
    // Shelter 2: hut, wood legs and a glass roof.
    ...hut(1080, { width: 160, height: 220, screenHeight: 280 }),
    standing(1200, 'glass', 30, 110),
    // Shelter 3: higher platform, three legs.
    ...platform(1420, { span: 200, height: 200, supports: 3 }),
    standing(1560, 'glass', 30, 110),
    // Shelter 4: tall hut with glass legs — glass gives way, the roof drops.
    ...hut(1760, { width: 180, height: 280, columns: 'glass', screenHeight: 340 }),
    // Shelter 5: the highest platform on the far edge.
    ...platform(2060, { span: 140, height: 160, supports: 2 }),
  ],
  targets: [
    bird(760, 20, GROUND_TOP, 'runner', 'right'), // gap between the two legs of shelter 1
    bird(1080, 20, GROUND_TOP, 'worker', 'left'), // inside shelter 2
    bird(1470, 20, GROUND_TOP, 'broody', 'right'), // gap between legs of shelter 3
    bird(1760, 20, GROUND_TOP, 'runner', 'left'), // inside shelter 4
    bird(2060, 20, GROUND_TOP, 'worker', 'right'), // gap between legs of shelter 5
  ],
  scenery: [
    { kind: 'plinth', x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 420, y: 570, w: 120, h: 540 },
    { kind: 'tree', x: 1640, y: 560, w: 110, h: 520 },
  ],
};
