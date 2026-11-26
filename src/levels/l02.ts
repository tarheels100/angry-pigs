import type { LevelDef } from './index.ts';

/** Stage 02 — two glass towers with a bird riding each beam, plus stone that is
 * scenery rather than a roof. Both birds die by topple/crush, which is the mechanic
 * the physics spike proved (docs/physics.md); stone is too tough for a pig to break
 * at the current damage scale, so nothing critical is sheltered under it.
 * Ground top = 840; a resting body's centre is groundTop - halfSize.
 */
export const LEVEL_02: LevelDef = {
  name: 'stage-02',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 420, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'basic', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Near glass tower: columns 30 x 120, tops at y = 720.
    { type: 'block', material: 'glass', x: 860, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 940, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 900, y: 708, w: 140, h: 24 },
    // Far glass tower, taller.
    { type: 'block', material: 'glass', x: 1180, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'glass', x: 1260, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'glass', x: 1220, y: 660, w: 160, h: 24 },
    // Stone scenery on the far edge; a flat shot that overshoots the towers hits it.
    { type: 'block', material: 'stone', x: 1440, y: 800, w: 60, h: 80 },
  ],
  targets: [
    // On the near beam (beam top = 696).
    { type: 'ball', material: 'feather', x: 900, y: 676, r: 20, target: true },
    // On the far beam (beam top = 648).
    { type: 'ball', material: 'feather', x: 1220, y: 628, r: 20, target: true },
  ],
};
