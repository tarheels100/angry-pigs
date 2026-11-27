import type { LevelDef } from './index.ts';

/** Stage 02 — two supports, both killing their bird by a fall rather than by a direct
 * hit. The near structure is a tower: two columns under a beam, bird riding the beam, so
 * breaking a leg drops the bird ~120 units onto the ground. The far structure is a
 * pedestal: a bird balanced on one column, so a hit on the column tips it and the bird
 * falls. A feather takes a fall of that height; a graze does not kill it
 * (docs/physics.md gotcha 5). Stone is scenery, never a roof over a bird
 * (docs/level-format.md design rules).
 * Ground top = 840; a resting body's centre is groundTop - halfSize.
 */
export const LEVEL_02: LevelDef = {
  name: 'stage-02',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.22, ammo: ['bomb', 'basic', 'heavy', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Near tower: column tops = 720, beam centre = 712 (beam top = 704).
    { type: 'block', material: 'glass', x: 860, y: 780, w: 28, h: 120 },
    { type: 'block', material: 'glass', x: 940, y: 780, w: 28, h: 120 },
    { type: 'block', material: 'glass', x: 900, y: 712, w: 140, h: 16 },
    // Far pedestal: column top = 670, bird balanced on top.
    { type: 'block', material: 'glass', x: 1220, y: 750, w: 30, h: 160 },
    // Stone scenery on the far edge; a flat shot that overshoots the towers hits it.
    { type: 'block', material: 'stone', x: 1440, y: 800, w: 60, h: 80 },
  ],
  targets: [
    // Riding the near beam (beam top = 704).
    { type: 'ball', material: 'feather', x: 900, y: 684, r: 20, target: true },
    // Balanced on the pedestal column (column top = 670).
    { type: 'ball', material: 'feather', x: 1220, y: 650, r: 20, target: true },
  ],

  scenery: [{"kind":"plinth","x":120,"y":798,"w":150,"h":84},{"kind":"tree","x":520,"y":770,"w":36,"h":140},{"kind":"tree","x":1180,"y":780,"w":30,"h":120},{"kind":"ridge","x":1360,"y":822,"w":200,"h":36}],
};
