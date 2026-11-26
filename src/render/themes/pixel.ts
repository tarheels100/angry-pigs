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
