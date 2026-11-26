import type { LevelDef } from './index.ts';

/** Stage 03 — a stone wall blocks flat shots, so the glass structures must be cleared
 * with arcs. The near structure is a tower with wood legs and a glass beam: wood takes
 * several hits, so the bird on the beam dies either by a direct hit or by breaking the
 * beam it rides. The far structure is a pedestal whose bird dies when the column is hit
 * and the bird falls. Nothing sits under stone, because stone cannot be broken by a pig
 * at the current damage scale (docs/level-format.md design rules).
 * Ground top = 840; a resting body's centre is groundTop - halfSize.
 */
export const LEVEL_03: LevelDef = {
  name: 'stage-03',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 420, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'basic', 'basic', 'basic', 'basic'] },
  statics: [
    { type: 'ground', x: 800, y: 860, w: 1600, h: 40 },
    // Low stone wall: flat shots die here, arcs pass over it.
    { type: 'wall', x: 640, y: 800, w: 50, h: 80 },
  ],
  objects: [
    // Near tower: wood legs (top = 720) under a glass beam (centre = 712, top = 704).
    { type: 'block', material: 'wood', x: 900, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'wood', x: 980, y: 780, w: 30, h: 120 },
    { type: 'block', material: 'glass', x: 940, y: 712, w: 140, h: 16 },
    // Far pedestal: column top = 640, narrow beam on top (beam top = 624).
    { type: 'block', material: 'glass', x: 1280, y: 760, w: 30, h: 160 },
    { type: 'block', material: 'glass', x: 1280, y: 632, w: 110, h: 16 },
  ],
  targets: [
    // Riding the glass beam (beam top = 704).
    { type: 'ball', material: 'feather', x: 940, y: 684, r: 20, target: true },
    // Balanced on the pedestal beam (beam top = 624).
    { type: 'ball', material: 'feather', x: 1280, y: 604, r: 20, target: true },
  ],

  scenery: [{"kind":"tree","x":420,"y":776,"w":32,"h":128},{"kind":"tree","x":1240,"y":770,"w":36,"h":140},{"kind":"ridge","x":1300,"y":824,"w":220,"h":32}],
};
