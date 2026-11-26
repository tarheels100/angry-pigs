import type { LevelDef } from './index.ts';

/** Stage 03 — escalation: a glass tower that falls easily and a stone tower whose
 * bird sits high enough to need an arced shot. Stone health scales with area, so the
 * stone tower takes several hits before it comes down. Ground top = 840.
 */
export const LEVEL_03: LevelDef = {
  name: 'stage-03',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 360, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'basic', 'basic', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Glass tower, easy to topple.
    { type: 'block', material: 'glass', x: 700, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 780, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 740, y: 708, w: 140, h: 24 },
    // Stone tower: 160-unit columns, so the bird is high and well protected.
    { type: 'block', material: 'stone', x: 1160, y: 760, w: 40, h: 160 },
    { type: 'block', material: 'stone', x: 1240, y: 760, w: 40, h: 160 },
    { type: 'block', material: 'stone', x: 1200, y: 668, w: 160, h: 24 },
    // A loose ball between the towers: rolls when struck, and can crush things it hits.
    { type: 'ball', material: 'stone', x: 960, y: 812, r: 28 },
  ],
  targets: [
    { type: 'ball', material: 'feather', x: 740, y: 676, r: 20, target: true },
    { type: 'ball', material: 'feather', x: 1200, y: 634, r: 22, target: true },
  ],
};
