import type { LevelDef } from './index.ts';
import { barrierWall, bird, hut, tower } from './pieces.ts';

/**
 * Stage 03 — the stone gate.
 *
 * A stone wall blocks every flat shot: pigs must arc over it (its top sits at y 440, above the
 * apex of any low shot) and land on the structures behind. Two glass towers carry three birds,
 * a wood hut carries the fourth, and nothing is sheltered by stone (docs/level-format.md rules
 * 1, 2). The far tower is scenery-grade backstop for scale, with no bird on it: x 1900 is past
 * the measured reach of the launcher once the wall is in front (scratch/reachTable.ts), so a
 * bird there would be unwinnable.
 */
export const LEVEL_03: LevelDef = {
  name: 'stage-03',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['bomb', 'heavy', 'basic', 'cluster'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [
    // Stone gate: five courses, top at y 440. A flat shot dies on it (rule 2).
    ...barrierWall(520, { courseW: 40, courseH: 80, courses: 5 }),
    // Glass tower behind the gate: one storey, roof low enough for a descending shot.
    ...tower(760, { width: 100, legs: 2, legHeight: 180, storeys: [{ material: 'glass', columns: 2, height: 130 }] }),
    // Taller glass tower: a blast on its legs drops the roof onto the bird (rule 4).
    ...tower(1000, { width: 110, legs: 2, legHeight: 150, storeys: [{ material: 'glass', columns: 2, height: 130 }] }),
    // Wood hut for the fourth bird: knock a column and the roof crushes it.
    ...hut(1400, { width: 170, height: 260, columns: 'wood', screenHeight: 300 }),
    // Decorative tower on the far edge, for scale; no bird, nothing to solve.
    ...tower(1900, { width: 100, legs: 2, legHeight: 220, storeys: [{ material: 'glass', columns: 2, height: 150 }] }),
  ],
  targets: [
    bird(760), // on the first glass tower
    bird(1000), // between the second tower's legs, under its roof
    bird(1360), // inside the wood hut
    bird(1440), // beside the hut, under the same roof span
  ],
  scenery: [
    { kind: 'plinth', x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 1700, y: 560, w: 110, h: 540 },
  ],
};
