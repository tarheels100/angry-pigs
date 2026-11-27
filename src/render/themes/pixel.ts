import type { EntityState, MaterialId } from '../../core/types.ts';
import type { RenderFrame, Theme, ThemePalette } from '../theme.ts';
import type { Viewport } from '../../camera/camera.ts';

/** Pixel: chunky, solid, no glow. Deliberately the opposite of Tron while using the
 * same contract (docs/theme-contract.md) — it exists to prove M12: a second theme is a
 * registry change only.
 */
export const pixelPalette: ThemePalette = {
  background: '#1b1410',
  outline: '#f2c46b',
  grid: '#2b2118',
  materials: {
    glass: '#6fb6c9',
    wood: '#a8724a',
    stone: '#7b6a5a',
    metal: '#c9a226',
    feather: '#e0603f',
    ground: '#3a2b1f',
    light: '#ffe08a',
  } satisfies Record<MaterialId, string>,
  pig: '#ef7f92',
  bird: '#ffd24a',
  cannon: '#c9a226',
  aimGuide: '#ffe08a',
  flash: '#fff6df',
};

/** Quantisation step: everything snaps to a visible pixel grid. */
const PIXEL = 4;
const BLOCK = 16;

/** Background field cell — much larger than an entity block (playtest item 8). */
const BG_CELL = BLOCK * 5;

function snap(v: number): number {
  return Math.round(v / PIXEL) * PIXEL;
}

/** Pixel material texture: plank joints, brick courses, a metal highlight band, and
 * translucent glass. Same contract as Tron's texture, entirely different look.
 */
function paintMaterialTexture(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette, w: number, h: number): void {
  if (state.shape !== 'box' || state.kind !== 'block') return;
  const dark = palette.background;
  switch (state.material) {
    case 'wood': {
      ctx.fillStyle = dark;
      const courses = Math.max(2, Math.round(h / (PIXEL * 4)));
      for (let i = 1; i < courses; i++) ctx.fillRect(-w / 2, -h / 2 + i * (h / courses), w, PIXEL);
      break;
    }
    case 'stone': {
      // Brick courses with staggered joints.
      ctx.fillStyle = dark;
      const courses = Math.max(2, Math.round(h / (PIXEL * 3)));
      for (let i = 1; i < courses; i++) {
        const y = -h / 2 + i * (h / courses);
        ctx.fillRect(-w / 2, y, w, PIXEL);
        const joint = i % 2 === 0 ? w * 0.35 : w * 0.65;
        ctx.fillRect(-w / 2 + joint, y - PIXEL * 2, PIXEL, PIXEL * 2);
      }
      break;
    }
    case 'metal': {
      ctx.fillStyle = palette.flash;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-w / 2 + PIXEL, -h / 2 + PIXEL, w - PIXEL * 2, PIXEL);
      ctx.globalAlpha = 1;
      break;
    }
    case 'glass': {
      // Glass is the only translucent fill in this theme.
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = palette.flash;
      ctx.fillRect(-w / 2 + PIXEL, -h / 2 + PIXEL, w - PIXEL * 2, h - PIXEL * 2);
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
}

/**
 * A pig as stacked squares. Playtest: the old art was a disc with hairline marks, so
 * the ears, snout, eyes, and legs are now blocks that clear the body outline. Type hue
 * varies by ammo type (M18): a heavy is a darker rust, a bomb is dark with a lit fuse.
 */
function paintPig(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number, variant: string): void {
  const hue =
    variant === 'heavy' ? '#b8434a' : variant === 'bomb' ? '#4a4258' : variant === 'cluster' ? '#ffa8c0' : palette.pig;
  const dark = '#2a1a14';
  const light = variant === 'bomb' ? '#8f86a0' : '#f4a9b8';

  // Ears: blocks that sit past the body, so they read at any zoom.
  ctx.fillStyle = hue;
  ctx.fillRect(snap(-half + PIXEL) - PIXEL, snap(-half) - PIXEL * 3, PIXEL * 2, PIXEL * 2);
  ctx.fillRect(snap(half - PIXEL * 2), snap(-half) - PIXEL * 3, PIXEL * 2, PIXEL * 2);

  // Legs.
  ctx.fillRect(snap(-half * 0.5) - PIXEL, snap(half), PIXEL * 2, PIXEL * 2);
  ctx.fillRect(snap(half * 0.5) - PIXEL, snap(half), PIXEL * 2, PIXEL * 2);

  // Snout: a lighter block protruding from the leading edge, nostrils punched out.
  ctx.fillStyle = light;
  ctx.fillRect(snap(half) - PIXEL, -PIXEL * 2, PIXEL * 3, PIXEL * 4);
  ctx.fillStyle = dark;
  ctx.fillRect(snap(half) + PIXEL, -PIXEL * 2, PIXEL, PIXEL);
  ctx.fillRect(snap(half) + PIXEL, PIXEL, PIXEL, PIXEL);

  // Eyes: a light block with a dark pupil.
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(snap(half * 0.3) - PIXEL, snap(-half * 0.55) - PIXEL, PIXEL * 2, PIXEL * 3);
  ctx.fillRect(snap(-half * 0.2) - PIXEL, snap(-half * 0.6) - PIXEL, PIXEL, PIXEL * 2);
  ctx.fillStyle = dark;
  ctx.fillRect(snap(half * 0.3), snap(-half * 0.55), PIXEL, PIXEL * 2);

  // Type marks, chunky rather than hairline.
  if (variant === 'heavy') {
    ctx.fillStyle = dark;
    ctx.fillRect(snap(-half * 0.7), snap(-half * 0.1), PIXEL * 4, PIXEL);
    ctx.fillRect(snap(-half * 0.7), snap(half * 0.3), PIXEL * 4, PIXEL);
  } else if (variant === 'bomb') {
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(-PIXEL, snap(-half) - PIXEL * 2, PIXEL, PIXEL * 2);
    ctx.fillRect(PIXEL, snap(-half) - PIXEL * 3, PIXEL * 2, PIXEL * 2);
  } else if (variant === 'cluster') {
    ctx.fillStyle = dark;
    ctx.fillRect(snap(-half * 0.6), -PIXEL, PIXEL * 2, PIXEL);
    ctx.fillRect(snap(-half * 0.6), PIXEL, PIXEL * 2, PIXEL);
  } else {
    ctx.fillStyle = dark;
    ctx.fillRect(snap(-half * 0.45), snap(half * 0.35) - PIXEL, PIXEL * 2, PIXEL * 2);
  }
}

/**
 * A bird as stacked squares. Playtest: it read as "a sun" — a disc with a ring — so the
 * body is now a wide chunky block with a wing, tail steps, an orange beak, and a comb.
 */
/** Chunky bird silhouettes by variant, mirroring the tron theme's shapes (D39). */
interface BirdShape {
  rx: number;
  ry: number;
  tail: number;
  comb: number;
  wing: number;
}

const BIRD_SHAPES: Record<string, BirdShape> = {
  runner: { rx: 1.3, ry: 0.7, tail: 3, comb: 1, wing: 5 },
  worker: { rx: 1.08, ry: 0.88, tail: 2, comb: 3, wing: 4 },
  broody: { rx: 1.02, ry: 1.05, tail: 1, comb: 4, wing: 3 },
};

function birdShape(variant?: string): BirdShape {
  const key = variant ? variant.replace('-flipped', '') : undefined;
  return (key ? BIRD_SHAPES[key] : undefined) ?? BIRD_SHAPES.worker!;
}

function paintBird(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number, variant?: string): void {
  const shape = birdShape(variant);
  // A `-flipped` variant mirrors the silhouette, so a nest does not face one way (D39).
  const flipped = variant !== undefined && variant.endsWith('-flipped');
  ctx.save();
  if (flipped) ctx.scale(-1, 1);
  const yellow = palette.bird;
  const dark = '#8a5a22';
  const orange = '#ff9a4a';
  const red = '#e04a3a';
  const rx = snap(half * shape.rx);
  const ry = snap(half * shape.ry);

  // Tail steps behind the body: a runner carries more of them.
  ctx.fillStyle = yellow;
  for (let i = 0; i < shape.tail; i++) {
    ctx.fillRect(-rx - PIXEL * 2, snap(-ry * 0.5) + i * PIXEL * 1.5 - PIXEL, PIXEL * 2, PIXEL);
  }

  // Legs.
  ctx.fillStyle = orange;
  ctx.fillRect(-PIXEL, ry - PIXEL, PIXEL, PIXEL * 2);
  ctx.fillRect(PIXEL, ry - PIXEL, PIXEL, PIXEL * 2);

  // Body: the variant decides how wide and how tall the block is.
  ctx.fillStyle = yellow;
  ctx.fillRect(-rx, -ry, rx * 2, ry * 2);

  // Wing: a darker band, longer on a runner.
  ctx.fillStyle = dark;
  ctx.fillRect(-rx + PIXEL, -PIXEL, PIXEL * shape.wing, PIXEL * 2);

  // Comb: one spike for a runner, four for a broody bird.
  ctx.fillStyle = red;
  for (let i = 0; i < shape.comb; i++) {
    const dx = snap(((i - (shape.comb - 1) / 2) * half * 0.35));
    ctx.fillRect(dx, -ry - PIXEL * 2, PIXEL, PIXEL * 2);
  }

  // Beak: an orange step past the body edge.
  ctx.fillStyle = orange;
  ctx.fillRect(rx, -PIXEL, PIXEL * 2, PIXEL);

  // Eye: dark pixel near the head.
  ctx.fillStyle = '#0d141a';
  ctx.fillRect(rx - PIXEL * 2, -ry + PIXEL, PIXEL, PIXEL);
  ctx.restore();
}

/** Pull length that fully compresses the launcher spring (appearance, not gameplay). */
const SPRING_FULL = 90;

/**
 * The launcher as stacked blocks (docs/adr.md D28). Playtest: the launcher looked like
 * junk and sat in mid-air, so the art is a carriage of blocks with wheels, a stepped
 * barrel that tilts with the aim, a muzzle block, a coil that shortens with the pull,
 * and a pull gauge. The carriage reaches 56 units below the pivot, where the levels put
 * the ground.
 */
function paintCannon(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  const pull = state.pull ?? 0;
  const aimAngle = state.aimAngle ?? 0;
  const recoil = state.recoil ?? 0;
  const compress = Math.min(1, pull / SPRING_FULL);
  const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };

  // Carriage: three rows of blocks down to the ground, widening as it goes.
  ctx.fillStyle = palette.cannon;
  ctx.fillRect(-PIXEL * 5, 10, PIXEL * 10, PIXEL * 2);
  ctx.fillRect(-PIXEL * 6, 10 + PIXEL * 2, PIXEL * 12, PIXEL * 2);
  ctx.fillRect(-PIXEL * 7, 10 + PIXEL * 4, PIXEL * 14, PIXEL * 2);
  ctx.fillStyle = palette.background;
  ctx.fillRect(-PIXEL * 4, 10 + PIXEL * 2, PIXEL * 2, PIXEL * 2);
  ctx.fillRect(PIXEL * 2, 10 + PIXEL * 2, PIXEL * 2, PIXEL * 2);

  // Wheels: a block with a bright hub.
  for (const dx of [-PIXEL * 4, PIXEL * 4]) {
    ctx.fillStyle = palette.cannon;
    ctx.fillRect(dx - PIXEL * 2, 34, PIXEL * 4, PIXEL * 4);
    ctx.fillStyle = palette.flash;
    ctx.fillRect(dx - PIXEL, 38, PIXEL * 2, PIXEL * 2);
  }

  // Barrel: blocks stepped along the aim direction, thicker at the breech.
  ctx.fillStyle = palette.cannon;
  for (let i = 0; i < 9; i++) {
    const t = -PIXEL * 3 + i * PIXEL * 4;
    const size = i < 3 ? PIXEL * 2 : PIXEL;
    ctx.fillRect(snap(dir.x * t) - size / 2, snap(dir.y * t) - size / 2, size, size);
  }
  // Muzzle block at the launch point ahead of the pivot.
  const muzzleX = snap(dir.x * PIXEL * 10);
  const muzzleY = snap(dir.y * PIXEL * 10);
  ctx.fillRect(muzzleX - PIXEL, muzzleY - PIXEL, PIXEL * 2, PIXEL * 2);
  if (recoil > 0) {
    ctx.fillStyle = palette.flash;
    ctx.fillRect(muzzleX - PIXEL * 2, muzzleY - PIXEL * 2, PIXEL * 4, PIXEL * 4);
    ctx.fillRect(snap(dir.x * PIXEL * 14) - PIXEL, muzzleY - PIXEL, PIXEL, PIXEL * 2);
  }

  // The spring, on the barrel axis inside the bore: pixels that pack closer together as
  // the pull grows. Playtest said the old coil hung behind the breech off-axis, so it now
  // follows the barrel direction.
  const perp = { x: -dir.y, y: dir.x };
  ctx.fillStyle = palette.pig;
  const spacing = PIXEL * (1.4 - compress * 0.8);
  for (let i = 0; i < 4; i++) {
    const t = -PIXEL * 2 + i * spacing;
    const side = i % 2 === 0 ? -PIXEL : PIXEL;
    ctx.fillRect(snap(dir.x * t + perp.x * side) - PIXEL / 2, snap(dir.y * t + perp.y * side) - PIXEL / 2, PIXEL, PIXEL);
  }

  // Pull gauge: blocks along an arc under the barrel, filled by the pull fraction.
  const blocks = Math.round(compress * 6);
  for (let i = 0; i < blocks; i++) {
    ctx.fillRect(-PIXEL * 6 + i * PIXEL * 2, 52, PIXEL * 2, PIXEL);
  }
}

/** Scenery props (M15): a tree stacked as squares, or a stepped ridge silhouette. */
function paintScenery(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  const hw = snap(state.halfWidth ?? state.radius ?? 16);
  const hh = snap(state.halfHeight ?? state.radius ?? 16);
  ctx.fillStyle = palette.grid;

  if (state.variant === 'ridge') {
    // A stepped ridge: three blocks of decreasing height.
    for (let i = 0; i < 3; i++) {
      const h = hh * (0.4 + (i % 2) * 0.35);
      ctx.fillRect(-hw + i * (hw / 3), hh - h, hw / 3, h);
    }
    return;
  }

  // Plinth: stacked blocks with a bright cap, the masonry the launcher stands on.
  if (state.variant === 'plinth') {
    const rows = Math.max(2, Math.round(hh / PIXEL / 2));
    for (let i = 0; i < rows; i++) {
      const y = hh - (i + 1) * (hh * 2 / rows);
      ctx.fillRect(-hw, y, hw * 2, hh * 2 / rows - PIXEL / 2);
      // Staggered joint, punched out in the background colour.
      const joint = i % 2 === 0 ? -hw + hw * 0.4 : hw * 0.3;
      ctx.fillStyle = palette.background;
      ctx.fillRect(joint, y, PIXEL, hh * 2 / rows - PIXEL / 2);
      ctx.fillStyle = palette.grid;
    }
    ctx.fillStyle = palette.outline;
    ctx.fillRect(-hw, -hh, hw * 2, PIXEL);
    return;
  }

  // Tree: trunk, then three canopy rows narrowing upward.
  ctx.fillRect(-PIXEL, 0, PIXEL * 2, hh);
  for (let i = 0; i < 3; i++) {
    const row = hw - i * PIXEL * 2;
    ctx.fillRect(-row / 2, -hh + i * PIXEL * 3, row, PIXEL * 3);
  }
}

export function createPixelTheme(overrides: Partial<ThemePalette> = {}, id = 'pixel'): Theme {
  const palette = { ...pixelPalette, ...overrides };

  function accent(state: EntityState): string {
    if (state.kind === 'pig') return palette.pig;
    if (state.kind === 'bird') return palette.bird;
    if (state.kind === 'cannon') return palette.cannon;
    return palette.materials[state.material];
  }

  /** A circle becomes a snapped square: the pixel look without sprite assets. */
  function square(ctx: CanvasRenderingContext2D, state: EntityState): void {
    const half = state.shape === 'circle' ? (state.radius ?? 16) : (state.halfWidth ?? 20);
    const hh = state.shape === 'circle' ? (state.radius ?? 16) : (state.halfHeight ?? 20);
    const w = snap(half) * 2;
    const h = snap(hh) * 2;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  function damageRatio(state: EntityState): number {
    if (state.healthMax === undefined || state.healthMax === Infinity) return 0;
    return Math.min(1, Math.max(0, 1 - state.health / state.healthMax));
  }

  return {
    id,
    name: id === 'pixel' ? 'Pixel (chunky)' : `Pixel variant: ${id}`,
    palette,

    paintBackground(ctx, viewport) {
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      // Checkerboard: cheap, and it reads as a pixel field rather than a vector grid.
      // Playtest item 8: the field was far too fine for the world size, so the cell is
      // several blocks wide instead of one.
      ctx.fillStyle = palette.grid;
      for (let x = 0; x < viewport.width; x += BG_CELL * 2) {
        for (let y = 0; y < viewport.height; y += BG_CELL * 2) {
          ctx.fillRect(x, y, BG_CELL, BG_CELL);
          ctx.fillRect(x + BG_CELL, y + BG_CELL, BG_CELL, BG_CELL);
        }
      }
    },

    paintEntity(ctx, state, viewport) {
      void viewport;
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.angle);

      if (state.fade !== undefined) {
        ctx.globalAlpha = Math.max(0, state.fade);
        ctx.fillStyle = palette.flash;
        square(ctx, state);
        ctx.restore();
        return;
      }

      if (state.kind === 'scenery') {
        // Art-only prop (M15): a chunky tree or ridge, painted behind entities.
        paintScenery(ctx, state, palette);
        ctx.restore();
        return;
      }

      ctx.fillStyle = accent(state);
      square(ctx, state);

      // Darker rim: a solid body with a hard edge, no soft glow.
      ctx.fillStyle = palette.outline;
      const half = (state.shape === 'circle' ? state.radius ?? 16 : state.halfWidth ?? 20);
      const hh = (state.shape === 'circle' ? state.radius ?? 16 : state.halfHeight ?? 20);
      const w = snap(half) * 2;
      const h = snap(hh) * 2;
      ctx.fillRect(-w / 2, -h / 2, w, PIXEL);
      ctx.fillRect(-w / 2, h / 2 - PIXEL, w, PIXEL);

      // Damage reads as missing chunks, not cracks.
      const damaged = damageRatio(state);
      if (damaged > 0.2) {
        ctx.fillStyle = palette.background;
        const chunks = Math.round(damaged * 3);
        for (let i = 0; i < chunks; i++) {
          ctx.fillRect(-w / 2 + PIXEL + i * PIXEL * 3, -h / 2 + PIXEL, PIXEL * 2, PIXEL * 2);
        }
      }

      paintMaterialTexture(ctx, state, palette, w, h);

      // Entity art, snapped to the pixel grid: ears and a snout for a pig, a wing
      // and beak for a bird, a stepped barrel and spring coils for the launcher.
      if (state.kind === 'pig') paintPig(ctx, palette, snap(state.radius ?? 16), state.variant ?? 'basic');
      else if (state.kind === 'bird') paintBird(ctx, palette, snap(state.radius ?? 16), state.variant);
      else if (state.kind === 'cannon') paintCannon(ctx, state, palette);

      ctx.restore();
    },

    paintOverlay(ctx, frame, viewport) {
      void viewport;
      const aim = frame.aim;
      if (!aim) return;

      ctx.fillStyle = palette.aimGuide;
      ctx.fillRect(aim.origin.x - PIXEL, aim.origin.y - PIXEL, PIXEL * 2, PIXEL * 2);
      ctx.fillRect(aim.origin.x + aim.pull.x - PIXEL, aim.origin.y + aim.pull.y - PIXEL, PIXEL * 2, PIXEL * 2);
      for (let i = 0; i < aim.trajectory.length; i += 8) {
        const sample = aim.trajectory[i]!;
        ctx.globalAlpha = 0.9 - (i / aim.trajectory.length) * 0.5;
        ctx.fillRect(snap(sample.x) - PIXEL / 2, snap(sample.y) - PIXEL / 2, PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    },
  };
}
