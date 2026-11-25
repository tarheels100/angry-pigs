import type { EntityState, MaterialId } from '../core/types.ts';
import type { AimState } from '../game/cannon.ts';

/** Theme contract (see docs/theme-contract.md). A theme is data + draw recipes.
 * It reads entity state and never mutates it. */

export interface Palette {
  background: string;
  outline: string;
  /** Per-material accent colours. */
  materials: Record<MaterialId, string>;
  pig: string;
  bird: string;
  cannon: string;
  aimGuide: string;
  destroyedFlash: string;
}

export interface Viewport {
  /** World units → canvas pixels transform, computed by the camera. */
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface OverlayState {
  aim: AimState | null;
  trajectory: { x: number; y: number }[];
}

export interface Theme {
  id: string;
  palette: Palette;
  paintBackground(ctx: CanvasRenderingContext2D, viewport: Viewport): void;
  paintEntity(ctx: CanvasRenderingContext2D, entity: EntityState, viewport: Viewport): void;
  paintOverlay(ctx: CanvasRenderingContext2D, overlay: OverlayState, viewport: Viewport): void;
}

/** Stub — the real Tron theme is M10. */
export function createPlaceholderTheme(): Theme {
  throw new Error('not implemented: createPlaceholderTheme (M6)');
}
