import type { LevelDef } from './index.ts';

/** Stage 03 — escalation: a stone wall blocks flat shots, so every bird must be
 * reached with an arc. The near bird dies by tower collapse (two columns under a
 * beam); the far bird sits on a tall pedestal, so an arc that clips the pedestal tips
 * it and the bird falls. Stone stays decorative because the damage scale cannot break
 * it (docs/tuning.md, docs/level-format.md design rules).
 * Ground top = 840.
 */
export const LEVEL_03: LevelDef = {
  name: 'stage-03',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 360, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'basic', 'basic', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Stone wall: flat shots stop here, arcs pass over it.
    { type: 'block', material: 'stone', x: 620, y: 740, w: 60, h: 200 },
    // Near tower: column tops = 720, beam centre = 708 (beam top = 696).
    { type: 'block', material: 'glass', x: 900, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 980, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 940, y: 708, w: 140, h: 24 },
    // Far pedestal: a tall narrow column under a short beam. High enough that only an
    // arc reaches it, narrow enough that a solid hit tips it.
    // Column top = 640, beam centre = 624 (beam top = 612).
    { type: 'block', material: 'glass', x: 1280, y: 740, w: 28, h: 200 },
    { type: 'block', material: 'glass', x: 1280, y: 624, w: 110, h: 24 },
  ],
  targets: [
    // Riding the near beam (beam top = 696).
    { type: 'ball', material: 'feather', x: 940, y: 676, r: 20, target: true },
    // Balanced on the far pedestal beam (beam top = 612).
    { type: 'ball', material: 'feather', x: 1280, y: 590, r: 22, target: true },
  ],
};
