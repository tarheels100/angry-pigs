import type { LevelDef } from './index.ts';

/** Stage 06 — mixed materials, mixed pigs, and a chain that only reaches the near
 * structure. A metal wall cannot be broken by any pig at the current scale (health 24
 * scaled to 72), so flat shots die there and arcs must carry the pig over it. Landing a
 * bomb on the glass perch detonates it and the debris takes the adjacent glass tower —
 * one pig, two birds. The wood tower is far enough that the blast and the debris stop
 * short of it, so it needs a heavy pig; the two pedestals are far apart, which is what a
 * cluster's fan is for (docs/adr.md D34, docs/level-format.md rules 3, 4, 8).
 * Ground top = 840; a resting body's centre is groundTop - halfSize.
 */
export const LEVEL_06: LevelDef = {
  name: 'stage-06',
  bounds: { width: 1600, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.22, ammo: ['bomb', 'heavy', 'cluster', 'basic', 'basic'] },
  statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
  objects: [
    // Metal shield: unbreakable at the current scale, so it is an obstacle, not a target.
    { type: 'block', material: 'metal', x: 620, y: 760, w: 60, h: 160 },
    // Glass perch: the bomb's landing point. Its blast and fall take the tower beside it.
    { type: 'block', material: 'glass', x: 860, y: 770, w: 26, h: 140 },
    // Glass tower: columns (tops = 720) under a beam (top 704).
    { type: 'block', material: 'glass', x: 940, y: 780, w: 26, h: 120 },
    { type: 'block', material: 'glass', x: 1020, y: 780, w: 26, h: 120 },
    { type: 'block', material: 'glass', x: 980, y: 712, w: 140, h: 16 },
    // Wood tower, deliberately out of reach of the blast: friction holds it, so it needs
    // a heavy pig to fell it.
    { type: 'block', material: 'wood', x: 1260, y: 780, w: 34, h: 120 },
    { type: 'block', material: 'wood', x: 1340, y: 780, w: 34, h: 120 },
    { type: 'block', material: 'wood', x: 1300, y: 712, w: 150, h: 16 },
    // Two glass pedestals, far apart: a cluster's spread is the right tool.
    { type: 'block', material: 'glass', x: 1440, y: 770, w: 26, h: 140 },
    { type: 'block', material: 'glass', x: 1540, y: 770, w: 26, h: 140 },
  ],
  targets: [
    // Balanced on the perch (column top = 700).
    { type: 'ball', material: 'feather', x: 860, y: 680, r: 20, target: true },
    // Riding the glass beam (top = 704); dies when the chain drops it.
    { type: 'ball', material: 'feather', x: 980, y: 684, r: 20, target: true },
    // Riding the wood beam (top = 704).
    { type: 'ball', material: 'feather', x: 1300, y: 684, r: 20, target: true },
    // Balanced on the pedestals (tops = 700).
    { type: 'ball', material: 'feather', x: 1440, y: 680, r: 20, target: true },
    { type: 'ball', material: 'feather', x: 1540, y: 680, r: 20, target: true },
  ],
  scenery: [
    { kind: "plinth", x: 120, y: 798, w: 150, h: 84 },
    { kind: 'tree', x: 440, y: 776, w: 32, h: 128 },
    { kind: 'tree', x: 1160, y: 770, w: 36, h: 140 },
    { kind: 'ridge', x: 1460, y: 824, w: 260, h: 32 },
  ],
};
