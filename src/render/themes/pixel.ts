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
  pig: '#7ad46b',
  bird: '#e0603f',
  cannon: '#c9a226',
  aimGuide: '#ffe08a',
  flash: '#fff6df',
};

/** Quantisation step: everything snaps to a visible pixel grid. */
const PIXEL = 4;
const BLOCK = 16;

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

/** Pull length that fully compresses the launcher spring (appearance, not gameplay). */
const SPRING_FULL = 90;

/** A pig as stacked squares: ears, snout, nostrils, eyes. */
function paintPig(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number, variant: string): void {
  ctx.fillStyle = palette.pig;
  // Ears.
  ctx.fillRect(-half + PIXEL, -half - PIXEL, PIXEL, PIXEL);
  ctx.fillRect(half - PIXEL * 2, -half - PIXEL, PIXEL, PIXEL);
  // Snout on the leading edge, with two nostril pixels in the theme's background colour.
  ctx.fillRect(half, -PIXEL, PIXEL * 2, PIXEL * 2);
  ctx.fillStyle = palette.background;
  ctx.fillRect(half + PIXEL, -PIXEL, PIXEL, PIXEL);
  ctx.fillStyle = palette.pig;
  // Eyes.
  ctx.fillRect(-PIXEL, -half + PIXEL, PIXEL, PIXEL);
  ctx.fillRect(-PIXEL, -half + PIXEL * 3, PIXEL, PIXEL);

  // Type marks (M18): heavy gets a belt, bomb a fuse pixel, cluster a seam.
  if (variant === 'heavy') ctx.fillRect(-half + PIXEL, half - PIXEL * 3, PIXEL * 3, PIXEL);
  else if (variant === 'bomb') ctx.fillRect(0, -half - PIXEL * 2, PIXEL, PIXEL);
  else if (variant === 'cluster') ctx.fillRect(-half + PIXEL, 0, PIXEL * 3, PIXEL);
}

/** A bird as stacked squares: wing steps, beak, comb, eye. */
function paintBird(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number): void {
  ctx.fillStyle = palette.bird;
  // Wing: three stepped pixels.
  ctx.fillRect(-half + PIXEL, -PIXEL, PIXEL, PIXEL);
  ctx.fillRect(-PIXEL, PIXEL, PIXEL, PIXEL);
  ctx.fillRect(PIXEL, -PIXEL, PIXEL, PIXEL);
  // Beak.
  ctx.fillRect(half, -PIXEL, PIXEL * 2, PIXEL);
  ctx.fillRect(half, 0, PIXEL, PIXEL);
  // Comb.
  ctx.fillRect(-PIXEL, -half - PIXEL, PIXEL, PIXEL);
  // Eye in the background colour, so it reads as a hole in the body.
  ctx.fillStyle = palette.background;
  ctx.fillRect(PIXEL, -half + PIXEL, PIXEL, PIXEL);
}

/** The launcher: a stepped barrel that tilts with the aim and spring coils that
 * shorten as the pull grows (D28). Aim state comes from the display extra. */
function paintCannon(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  const hw = state.halfWidth ?? 30;
  const hh = state.halfHeight ?? 14;
  const pull = state.pull ?? 0;
  const aimAngle = state.aimAngle ?? 0;
  const recoil = state.recoil ?? 0;
  const compress = Math.min(1, pull / SPRING_FULL);

  // Barrel: pixels stepped along the aim direction, snapped to the grid.
  const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
  ctx.fillStyle = palette.cannon;
  for (let i = 0; i < 6; i++) {
    const t = -hw * 0.4 + i * PIXEL * 2.5;
    ctx.fillRect(snap(dir.x * t) - PIXEL / 2, snap(dir.y * t) - hh - PIXEL, PIXEL, PIXEL);
  }
  // Muzzle: a wider block at the barrel's end, brightened by recoil.
  const muzzle = snap(dir.x * hw * 1.15);
  const muzzleY = snap(dir.y * hw * 1.15) - hh;
  ctx.fillRect(muzzle - PIXEL, muzzleY - PIXEL, PIXEL * 2, PIXEL * 2);
  if (recoil > 0) {
    ctx.fillStyle = palette.flash;
    ctx.fillRect(muzzle - PIXEL * 2, muzzleY - PIXEL * 2, PIXEL * 4, PIXEL * 4);
  }

  // Spring coils: alternating pixels behind the barrel, spacing shrinking with the pull.
  ctx.fillStyle = palette.pig;
  const spacing = PIXEL * (1.6 - compress * 0.9);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(snap(-hw * 0.5 - i * spacing), -hh + (i % 2 === 0 ? -PIXEL : PIXEL), PIXEL, PIXEL);
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
      ctx.fillStyle = palette.grid;
      for (let x = 0; x < viewport.width; x += BLOCK * 2) {
        for (let y = 0; y < viewport.height; y += BLOCK * 2) {
          ctx.fillRect(x, y, BLOCK, BLOCK);
          ctx.fillRect(x + BLOCK, y + BLOCK, BLOCK, BLOCK);
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
      else if (state.kind === 'bird') paintBird(ctx, palette, snap(state.radius ?? 16));
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
