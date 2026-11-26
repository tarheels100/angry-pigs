import type { EntityState, MaterialId } from '../../core/types.ts';
import type { RenderFrame, Theme, ThemePalette } from '../theme.ts';
import type { Viewport } from '../../camera/camera.ts';

/** Tron: dark field, neon wireframes, additive glow (docs/theme-contract.md).
 * Everything here is appearance; the only state read is EntityState.
 */
export const tronPalette: ThemePalette = {
  background: '#04070c',
  outline: '#00e5ff',
  grid: '#0b2431',
  materials: {
    glass: '#7df9ff',
    wood: '#f0a35a',
    stone: '#5d7f92',
    metal: '#00e5ff',
    feather: '#ff2d6f',
    ground: '#136c7a',
    light: '#a8f7ff',
  } satisfies Record<MaterialId, string>,
  pig: '#00ffa3',
  bird: '#ff3c78',
  cannon: '#00e5ff',
  aimGuide: '#a8f7ff',
  flash: '#ffffff',
};

/** Glow radius in CSS pixels; kept small because shadowBlur is the costly part. */
const GLOW = 10;
/** Grid spacing in screen pixels. The background is painted before the camera
 * transform, so the grid is a field texture, not a world object.
 */
const GRID = 44;

/**
 * Material texture inside a block, drawn from the palette colour only, so two themes
 * can render the same material completely differently (docs/theme-contract.md).
 * Tron reads materials as construction: planks, speckle, double-walled metal, sheen.
 */
function paintMaterialTexture(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  if (state.shape !== 'box' || state.kind !== 'block') return;
  const hw = state.halfWidth ?? 20;
  const hh = state.halfHeight ?? 20;
  const colour = palette.materials[state.material];
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;

  switch (state.material) {
    case 'wood': {
      // Grain: horizontal planks along the longer axis.
      ctx.beginPath();
      const planks = Math.max(3, Math.round(hh / 10));
      for (let i = 1; i < planks; i++) {
        const y = -hh + (i / planks) * 2 * hh;
        ctx.moveTo(-hw, y);
        ctx.lineTo(hw, y);
      }
      ctx.stroke();
      break;
    }
    case 'stone': {
      // Speckle: aggregate in the mortar.
      const dots = Math.max(6, Math.round(hw * hh / 200));
      for (let i = 0; i < dots; i++) {
        const x = -hw + ((i * 7) % (2 * hw));
        const y = -hh + ((i * 11) % (2 * hh));
        ctx.fillRect(x, y, 2, 2);
      }
      break;
    }
    case 'metal': {
      // Double wall plus rivets: the inner outline says "load-bearing".
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(-hw + 4, -hh + 4, 2 * hw - 8, 2 * hh - 8);
      ctx.globalAlpha = 0.8;
      ctx.fillRect(-hw + 4, -hh + 4, 3, 3);
      ctx.fillRect(hw - 7, -hh + 4, 3, 3);
      ctx.fillRect(-hw + 4, hh - 7, 3, 3);
      ctx.fillRect(hw - 7, hh - 7, 3, 3);
      break;
    }
    case 'glass': {
      // Sheen: one diagonal highlight, nothing else.
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.7, -hh * 0.7);
      ctx.lineTo(hw * 0.4, hh * 0.1);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function createTronTheme(overrides: Partial<ThemePalette> = {}, id = 'tron'): Theme {
  const palette = { ...tronPalette, ...overrides };

  /** Outline colour by role. Roles, not materials, decide identity (theme-contract). */
  function accent(state: EntityState): string {
    if (state.kind === 'pig') return palette.pig;
    if (state.kind === 'bird') return palette.bird;
    if (state.kind === 'cannon') return palette.cannon;
    return palette.materials[state.material];
  }

  function glow(ctx: CanvasRenderingContext2D, colour: string, strength: number): void {
    ctx.shadowColor = colour;
    ctx.shadowBlur = GLOW * strength;
  }

  function clearGlow(ctx: CanvasRenderingContext2D): void {
    ctx.shadowBlur = 0;
  }

  /** Path for the entity body, in local coordinates. */
  function bodyPath(ctx: CanvasRenderingContext2D, state: EntityState): void {
    ctx.beginPath();
    if (state.shape === 'circle') {
      ctx.arc(0, 0, state.radius ?? 16, 0, Math.PI * 2);
    } else {
      ctx.rect(-(state.halfWidth ?? 20), -(state.halfHeight ?? 20), (state.halfWidth ?? 20) * 2, (state.halfHeight ?? 20) * 2);
    }
  }

  /** Damage as a 0..1 ratio from the state's own health fields; no damage maths. */
  function damageRatio(state: EntityState): number {
    if (state.healthMax === undefined || state.healthMax === Infinity) return 0;
    return Math.min(1, Math.max(0, 1 - state.health / state.healthMax));
  }

  return {
    id,
    name: id === 'tron' ? 'Tron (neon)' : `Tron variant: ${id}`,
    palette,

    paintBackground(ctx, viewport) {
      const sky = ctx.createLinearGradient(0, 0, 0, viewport.height);
      sky.addColorStop(0, palette.background);
      sky.addColorStop(1, '#08131c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < viewport.width; x += GRID) ctx.moveTo(x, 0), ctx.lineTo(x, viewport.height);
      for (let y = 0; y < viewport.height; y += GRID) ctx.moveTo(0, y), ctx.lineTo(viewport.width, y);
      ctx.stroke();
    },

    paintEntity(ctx, state, viewport) {
      void viewport;
      const colour = accent(state);
      const damaged = damageRatio(state);
      const fading = state.fade;

      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.angle);

      if (fading !== undefined) {
        // A destroyed body is gone from the snapshot (D17); this extra is the flash.
        ctx.globalAlpha = Math.max(0, fading);
        ctx.strokeStyle = palette.flash;
        glow(ctx, palette.flash, 1.4 * Math.max(0.2, fading));
        ctx.lineWidth = 2;
        bodyPath(ctx, state);
        ctx.stroke();
        clearGlow(ctx);
        ctx.restore();
        return;
      }

      // Dark inner fill keeps outlines readable; a damaged body fills less, so
      // partial damage reads as a hollowing wireframe.
      ctx.fillStyle = `rgba(6, 16, 22, ${0.6 - damaged * 0.45})`;
      bodyPath(ctx, state);
      ctx.fill();

      const strength = state.sleeping ? 0.35 : 1;
      ctx.strokeStyle = colour;
      ctx.lineWidth = state.kind === 'ground' || state.kind === 'wall' ? 1.5 : 2;
      ctx.globalAlpha = strength;
      glow(ctx, colour, strength);
      bodyPath(ctx, state);
      ctx.stroke();

      if (damaged > 0.15 && state.shape === 'box') {
        // Cracks scale with damage; count comes from the state, not a material rule.
        const cracks = Math.round(damaged * 3);
        const hw = state.halfWidth ?? 20;
        const hh = state.halfHeight ?? 20;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        for (let i = 0; i < cracks; i++) {
          const t = (i + 1) / (cracks + 1);
          ctx.moveTo(-hw + t * 2 * hw, -hh);
          ctx.lineTo(-hw + t * 2 * hw + hw * 0.25, hh);
        }
        ctx.stroke();
      }

      if (state.kind === 'pig' || state.kind === 'bird') {
        // Inner ring: the marker that separates projectiles from targets at a glance.
        ctx.lineWidth = 1;
        ctx.globalAlpha = strength * 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, (state.radius ?? 16) * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }

      paintMaterialTexture(ctx, state, palette);

      clearGlow(ctx);
      ctx.restore();
    },

    paintOverlay(ctx, frame, viewport) {
      void viewport;
      const aim = frame.aim;
      if (!aim) return;

      ctx.save();
      ctx.strokeStyle = palette.aimGuide;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      glow(ctx, palette.aimGuide, 0.8);

      // Pull line: the slingshot itself, from origin to the drag point.
      ctx.beginPath();
      ctx.moveTo(aim.origin.x, aim.origin.y);
      ctx.lineTo(aim.origin.x + aim.pull.x, aim.origin.y + aim.pull.y);
      ctx.stroke();

      // Predicted path as discrete nodes, so it reads as a data trail.
      ctx.fillStyle = palette.aimGuide;
      for (let i = 0; i < aim.trajectory.length; i += 6) {
        const sample = aim.trajectory[i]!;
        ctx.globalAlpha = 0.9 - (i / aim.trajectory.length) * 0.55;
        ctx.beginPath();
        ctx.arc(sample.x, sample.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      clearGlow(ctx);
      ctx.restore();
    },
  };
}
