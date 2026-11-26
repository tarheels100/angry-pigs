import type { LevelDef } from './index.ts';

/** Stage 02 — two supports with different failure modes, plus stone that is scenery
 * rather than a roof. The near structure is a pedestal: a beam balanced on one column,
 * so a hit on the column tips it and the bird falls. The far structure is a tower: two
 * columns under a beam, so its bird dies when the tower collapses rather than from the
 * pig itself. Stone is too tough for a pig to break at the current damage scale, so
 * nothing critical is sheltered under it (docs/level-format.md design rules).
 * Ground top = 840; a resting body's centre is groundTop - halfSize.
 */
export const LEVEL_02: LevelDef = {
  name: 'stage-02',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 420, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'basic', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Near pedestal: column top = 720, beam centre = 708 (beam top = 696).
    { type: 'block', material: 'glass', x: 880, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 880, y: 708, w: 140, h: 24 },
    // Far tower: column tops = 670, beam centre = 660 (beam top = 648).
    { type: 'block', material: 'glass', x: 1180, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'glass', x: 1260, y: 750, w: 30, h: 160 },
    { type: 'block', material: 'glass', x: 1220, y: 660, w: 160, h: 24 },
    // Stone scenery on the far edge; a flat shot that overshoots the towers hits it.
    { type: 'block', material: 'stone', x: 1440, y: 800, w: 60, h: 80 },
  ],
  targets: [
    // Balanced on the pedestal beam.
    { type: 'ball', material: 'feather', x: 880, y: 676, r: 20, target: true },
    // Riding the far beam (beam top = 648).
    { type: 'ball', material: 'feather', x: 1220, y: 628, r: 20, target: true },
  ],
};
