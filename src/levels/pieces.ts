import type { LevelObject } from './index.ts';

/** Materials a built structure can use. Birds use `feather`; props use none. */
export type BlockMaterial = 'glass' | 'wood' | 'stone' | 'metal';

/**
 * Structure builders for level files. A level stays data: these functions only compute
 * coordinates, and `validateLevel` still checks the result (docs/level-format.md).
 *
 * Geometry conventions (docs/physics.md gotcha 5): bodies rest ON the ground, so a
 * standing block's centre is `GROUND_TOP - h / 2`, and a block resting on another starts
 * at that block's top. Everything is authored from the ground upward, which is what makes
 * a 30-piece stage writable by hand.
 */
export const GROUND_TOP = 840;

/** A block standing on `base` (default: the ground). */
export function standing(x: number, material: BlockMaterial, w: number, h: number, base = GROUND_TOP): LevelObject {
  return { type: 'block', material, x, y: base - h / 2, w, h };
}

/** Blocks stacked upward from `base`, each centred on `x`. Returns the blocks and the top surface. */
export function stackUp(
  x: number,
  pieces: { material: BlockMaterial; w: number; h: number }[],
  base = GROUND_TOP,
): { blocks: LevelObject[]; top: number } {
  const blocks: LevelObject[] = [];
  let surface = base;
  for (const p of pieces) {
    blocks.push({ type: 'block', material: p.material, x, y: surface - p.h / 2, w: p.w, h: p.h });
    surface -= p.h;
  }
  return { blocks, top: surface };
}

/**
 * A shelter: two side columns, a solid roof, and a screen wall facing the cannon. The bird
 * sits inside on the floor, so neither a flat shot nor a lobbed arc reaches it directly —
 * the roof has to be broken or a support knocked out first (level rule 1).
 *
 * `screenHeight` is the front wall; it must be tall enough to intercept the straight line
 * from the cannon to the bird, which the shield probe verifies.
 */
export function hut(
  x: number,
  options: { width: number; height: number; roof?: BlockMaterial; columns?: BlockMaterial; screen?: BlockMaterial; screenHeight?: number },
): LevelObject[] {
  const { width, height } = options;
  const columns = options.columns ?? 'wood';
  // Glass roofs break in roughly one solid hit, so a lobbed shot that lands on the shelter
  // top actually comes down on the bird; wood legs take more than one hit (docs/tuning.md).
  const roof = options.roof ?? 'glass';
  const screen = options.screen ?? 'wood';
  const screenH = options.screenHeight ?? height + 40;
  const legW = 30;
  const roofW = width + legW * 2 + 20;
  const roofH = 24;
  const base = GROUND_TOP;
  return [
    // Screen wall in front of the shelter, on the cannon side.
    standing(x - width / 2 - legW - 30, screen, legW + 12, screenH, base),
    // Side columns carrying the roof.
    standing(x - width / 2, columns, legW, height, base),
    standing(x + width / 2, columns, legW, height, base),
    // Roof: spans both columns, destructible so a lobbed shot can come down on the bird.
    { type: 'block', material: roof, x, y: base - height - roofH / 2, w: roofW, h: roofH },
  ];
}

/**
 * A crush platform: a beam held up by `supports` columns, with a bird underneath. The
 * failure mode is support removal — the beam drops onto the bird (level rule 4).
 */
export function platform(
  x: number,
  options: { span: number; height: number; supports: number; material?: BlockMaterial; beam?: BlockMaterial },
): LevelObject[] {
  const { span, height, supports } = options;
  const leg = options.material ?? 'wood';
  // A glass beam fails fast, which is what makes a crush platform a real failure mode.
  const beam = options.beam ?? 'glass';
  const legW = 30;
  const beamH = 24;
  const blocks: LevelObject[] = [];
  for (let i = 0; i < supports; i++) {
    const px = x - span / 2 + (span * i) / (supports - 1);
    blocks.push(standing(px, leg, legW, height, GROUND_TOP));
  }
  blocks.push({ type: 'block', material: beam, x, y: GROUND_TOP - height - beamH / 2, w: span + legW, h: beamH });
  return blocks;
}

/**
 * A multi-storey tower: legs, a floor, an upper storey of columns, and a roof. `storeys`
 * is written bottom-up, so a stage reads as a list of buildings.
 */
export function tower(
  x: number,
  options: { width: number; legs: number; legHeight: number; storeys: { material: BlockMaterial; columns: number; height: number }[]; roof?: BlockMaterial },
): LevelObject[] {
  const { width, legs, legHeight } = options;
  const roof = options.roof ?? 'glass';
  const legW = 30;
  const beamH = 24;
  const blocks: LevelObject[] = [];
  let surface = GROUND_TOP;
  const legXs = legPositions(x, width, legs);
  for (const lx of legXs) blocks.push(standing(lx, 'wood', legW, legHeight, surface));
  surface -= legHeight;
  blocks.push({ type: 'block', material: 'wood', x, y: surface - beamH / 2, w: width + legW * 2, h: beamH });
  surface -= beamH;
  for (const storey of options.storeys) {
    const xs = legPositions(x, width, storey.columns);
    for (const lx of xs) blocks.push(standing(lx, storey.material, legW, storey.height, surface));
    surface -= storey.height;
    blocks.push({ type: 'block', material: roof, x, y: surface - beamH / 2, w: width + legW * 2, h: beamH });
    surface -= beamH;
  }
  return blocks;
}

/** Evenly spaced column positions across `width` centred on `x`. */
export function legPositions(x: number, width: number, count: number): number[] {
  if (count <= 1) return [x];
  const xs: number[] = [];
  for (let i = 0; i < count; i++) xs.push(x - width / 2 + (width * i) / (count - 1));
  return xs;
}

/**
 * A wall of stacked courses, used as a barrier the player must lob over. `columns` blocks wide
 * per course, courses stacked straight up.
 *
 * Courses are deliberately NOT staggered by half a block: a narrow wall built that way cantilevers
 * and topples during the load warmup (measured in scratch/warmup-report.ts). Masonry joints are
 * theme art (`paintMaterialTexture`), not authored geometry.
 */
export function barrierWall(
  x: number,
  options: { courseW: number; courseH: number; courses: number; columns?: number; material?: BlockMaterial },
): LevelObject[] {
  const material = options.material ?? 'stone';
  const columns = options.columns ?? 1;
  const blocks: LevelObject[] = [];
  for (let i = 0; i < options.courses; i++) {
    const y = GROUND_TOP - options.courseH / 2 - i * options.courseH;
    for (let c = 0; c < columns; c++) {
      blocks.push({
        type: 'block',
        material,
        x: x - (columns * options.courseW) / 2 + options.courseW / 2 + c * options.courseW,
        y,
        w: options.courseW,
        h: options.courseH,
      });
    }
  }
  return blocks;
}

/**
 * A long bridge: a beam carried by columns at both ends and mid-span. Bridges are how a
 * stage gets scale without a wall of columns; the birds live under the span.
 */
export function bridge(
  x1: number,
  x2: number,
  options: { height: number; piers: number; material?: BlockMaterial; deck?: BlockMaterial },
): LevelObject[] {
  const leg = options.material ?? 'wood';
  const deck = options.deck ?? 'wood';
  const legW = 30;
  const deckH = 20;
  const piers = options.piers;
  const blocks: LevelObject[] = [];
  for (let i = 0; i < piers; i++) {
    const px = x1 + ((x2 - x1) * i) / (piers - 1);
    blocks.push(standing(px, leg, legW, options.height, GROUND_TOP));
  }
  blocks.push({ type: 'block', material: deck, x: (x1 + x2) / 2, y: GROUND_TOP - options.height - deckH / 2, w: x2 - x1 + legW, h: deckH });
  return blocks;
}

/** A bird resting on `surface` (the top of a structure or the ground). */
/** A bird standing on `surface`. `variant` picks the silhouette the theme draws
 * ("runner", "worker", "broody"); it is presentation only (docs/theme-contract.md).
 */
export function bird(x: number, r = 20, surface = GROUND_TOP, variant?: string): LevelObject {
  return { type: 'ball', material: 'feather', x, y: surface - r, r, target: true, ...(variant ? { variant } : {}) };
}
