import type { LevelDef } from './index.ts';

/** Stage 03 — escalation: a stone wall that blocks flat shots, so both birds must be
 * reached with an arc. The birds sit on glass beams, which topple; stone stays
 * decorative because the damage scale cannot break it (docs/tuning.md).
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
    // Near glass tower behind the wall.
    { type: 'block', material: 'glass', x: 900, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 980, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 940, y: 708, w: 140, h: 24 },
    // Far glass tower, taller, so the second bird needs a higher arc.
    { type: 'block', material: 'glass', x: 1220, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'glass', x: 1300, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'glass', x: 1260, y: 648, w: 160, h: 24 },
  ],
  targets: [
    { type: 'ball', material: 'feather', x: 940, y: 676, r: 20, target: true },
    { type: 'ball', material: 'feather', x: 1260, y: 614, r: 22, target: true },
  ],
};
