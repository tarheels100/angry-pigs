import type { LevelDef } from './index.ts';

/** Stage 02 — a glass tower plus a bird sheltered behind stone. The open bird is
 * reachable with a flat shot; the sheltered one needs the tower to come down or a
 * shot that clears the stone. Placement rule: ground top = 840, centre = 840 - halfSize.
 */
export const LEVEL_02: LevelDef = {
  name: 'stage-02',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 420, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'basic', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Glass tower: columns 30 x 120, tops at y = 720.
    { type: 'block', material: 'glass', x: 860, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 940, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 900, y: 708, w: 140, h: 24 },
    // Stone shield in front of the second bird: tough, so it takes several hits.
    { type: 'block', material: 'stone', x: 1240, y: 770, w: 50, h: 140 },
    { type: 'block', material: 'stone', x: 1360, y: 770, w: 50, h: 140 },
    { type: 'block', material: 'stone', x: 1300, y: 688, w: 180, h: 24 },
  ],
  targets: [
    { type: 'ball', material: 'feather', x: 900, y: 676, r: 20, target: true },
    // Under the stone beam, between the two stone shields.
    { type: 'ball', material: 'feather', x: 1300, y: 818, r: 22, target: true },
  ],
};
