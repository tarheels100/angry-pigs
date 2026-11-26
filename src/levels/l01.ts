import type { LevelDef } from './index.ts';

/** Stage 01 — the M7 vertical slice stage: one bird in the open, one on a glass
 * tower. Reachability was checked with scratch/slice-probe.ts (docs/tuning.md).
 *
 * Placement rule from the physics spike (docs/physics.md gotcha 5): bodies must sit
 * ON the ground, not overlap it. Ground top = 840, so a body's centre is
 * groundTop - halfSize.
 */
export const LEVEL_01: LevelDef = {
  name: 'stage-01',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 480, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'basic', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Glass columns: 30 x 120, tops at y = 720.
    { type: 'block', material: 'glass', x: 1040, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 1120, y: 780, w: 30, h: 120 },
    // Beam resting on both columns: 140 x 24, bottom at 720.
    { type: 'block', material: 'glass', x: 1080, y: 708, w: 140, h: 24 },
    // Stone block on the far side, so a long shot still has something to hit.
    { type: 'block', material: 'stone', x: 1340, y: 800, w: 60, h: 80 },
  ],
  targets: [
    // Bird in the open, reachable with a downward shot.
    { type: 'ball', material: 'feather', x: 760, y: 820, r: 20, target: true },
    // Bird on the beam: beam top = 696, centre = 676. Dies when the tower comes down.
    { type: 'ball', material: 'feather', x: 1080, y: 676, r: 20, target: true },
  ],

  scenery: [{"kind":"tree","x":560,"y":770,"w":36,"h":140},{"kind":"tree","x":1080,"y":770,"w":36,"h":140},{"kind":"ridge","x":1300,"y":820,"w":260,"h":40}],
};
