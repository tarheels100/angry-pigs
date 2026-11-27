import type { LevelDef } from './index.ts';
import { GROUND_TOP, barrierWall, bird, hut, platform, tower } from './pieces.ts';

/**
 * Stage 06 — the finale: metal shield, mixed materials, five birds.
 *
 * Metal is unbreakable by damage (docs/physics.md), so the shield at x 640 is a pure
 * obstacle: the first two pigs have to arc over it, and the bomb arrives third. Keeps alternate
 * glass and wood legs, and the structures are spaced past the 130-unit blast radius so the
 * bomb takes one shelter at a time (docs/level-format.md rules 1, 3, 9).
 */
export const LEVEL_06: LevelDef = {
  name: 'stage-06',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['bomb', 'heavy', 'cluster', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [
    // The metal shield: four courses, top at y 440. Damage cannot touch it.
    ...barrierWall(640, { courseW: 80, courseH: 100, courses: 4, material: 'metal' }),
    // Keep 1: glass legs, wood roof — the bomb's target.
    ...hut(1000, { width: 170, height: 240, columns: 'wood', screenHeight: 300 }),
    // Keep 2: wood legs, taller.
    ...hut(1300, { width: 180, height: 260, screenHeight: 320 }),
    // A tall decorative tower behind keep 2, for scale; it carries no bird.
    ...tower(1520, { width: 120, legs: 2, legHeight: 220, storeys: [{ material: 'glass', columns: 3, height: 140 }, { material: 'wood', columns: 3, height: 100 }] }),
    // A wide crush platform: three legs, birds in the gaps.
    ...platform(1760, { span: 220, height: 200, supports: 3 }),
    // Keep 3: tall hut with glass legs on the far edge.
    ...hut(2060, { width: 170, height: 300, columns: 'wood', screenHeight: 360 }),
  ],
  targets: [
    bird(1000, 20, GROUND_TOP, 'broody'), // inside keep 1
    bird(1300, 20, GROUND_TOP, 'runner'), // inside keep 2
    bird(1705, 20, GROUND_TOP, 'worker'), // gap between the first two legs of the platform, under the beam
    bird(1815, 20, GROUND_TOP, 'worker'), // gap on the far side of the same platform
    bird(2060, 20, GROUND_TOP, 'runner'), // inside keep 3
  ],
  scenery: [
    { kind: 'plinth', x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 880, y: 560, w: 120, h: 560 },
    { kind: 'tree', x: 1960, y: 580, w: 110, h: 520 },
  ],
};
