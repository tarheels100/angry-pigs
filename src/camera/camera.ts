import type { Vec2 } from '../core/types.ts';
import type { Viewport } from '../render/theme.ts';

/** Camera: world units → canvas pixels. M6 implements a fixed fit-to-bounds
 * camera; projectile following arrives in M9. */
export interface Camera {
  /** World extents the camera must keep visible. */
  bounds: { width: number; height: number };
  viewport(cssWidth: number, cssHeight: number): Viewport;
  toWorld(canvasPoint: Vec2, viewport: Viewport): Vec2;
  follow(target: Vec2 | null): void;
}

/** Stub — implemented in M6 (fixed fit), M9 (follow). */
export function createCamera(bounds: { width: number; height: number }): Camera {
  throw new Error('not implemented: createCamera (M6)');
}
