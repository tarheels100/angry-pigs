import type { EntityState, MaterialId } from '../../core/types.ts';
import type { RenderFrame, Theme, ThemePalette } from '../theme.ts';
import type { Viewport } from '../../camera/camera.ts';

export const basePalette: ThemePalette = {
  background: '#101418',
  outline: '#6f7d86',
  grid: '#1b2228',
  materials: {
    glass: '#3f6f8f',
    stone: '#5c5f66',
    metal: '#7a8894',
    feather: '#8f6f5c',
    ground: '#232b32',
    light: '#6fa3b8',
  } satisfies Record<MaterialId, string>,
  pig: '#4f8f6f',
  bird: '#b8563f',
  cannon: '#7d8b95',
  aimGuide: '#6ef3ff',
  flash: '#ffffff',
};

/**
 * Flat-colour theme used in M6 to prove the state -> render pipeline before art.
 * Each instance captures its own palette, so a variant really does change colours
 * without touching the pipeline (docs/theme-contract.md).
 */
export function createPlaceholderTheme(overrides: Partial<ThemePalette> = {}, id = 'placeholder'): Theme {
  const palette = { ...basePalette, ...overrides };
  function fill(ctx: CanvasRenderingContext2D, colour: string) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.fill();
  }

  return {
    id,
    name: id === 'placeholder' ? 'Placeholder (flat)' : `Placeholder variant: ${id}`,
    palette,
    paintBackground(ctx, viewport) {
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
    },
    paintEntity(ctx, state, viewport) {
      void viewport;
      const colour = state.destroyed ? palette.flash : state.kind === 'pig' ? palette.pig : state.kind === 'bird' ? palette.bird : state.kind === 'cannon' ? palette.cannon : palette.materials[state.material];
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.angle);
      ctx.fillStyle = colour;
      ctx.beginPath();
      if (state.shape === 'circle') {
        ctx.arc(0, 0, state.radius ?? 16, 0, Math.PI * 2);
      } else {
        ctx.rect(-(state.halfWidth ?? 20), -(state.halfHeight ?? 20), (state.halfWidth ?? 20) * 2, (state.halfHeight ?? 20) * 2);
      }
      ctx.fill();
      ctx.restore();
    },
    paintOverlay(ctx, frame, viewport) {
      void viewport;
      ctx.strokeStyle = palette.aimGuide;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const sample of frame.aim?.trajectory ?? []) {
        ctx.lineTo(sample.x, sample.y);
      }
      ctx.stroke();
    },
  };
}
