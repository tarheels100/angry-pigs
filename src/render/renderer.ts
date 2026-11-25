import type { Frame } from '../game/game.ts';
import type { Theme, Viewport } from './theme.ts';

/** Canvas 2D renderer. Reads a frame snapshot and delegates all appearance to a
 * theme. It never touches simulation state. */
export interface Renderer {
  draw(frame: Frame, theme: Theme, viewport: Viewport): void;
  resize(cssWidth: number, cssHeight: number): void;
}

/** Stub — implemented in M6. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  throw new Error('not implemented: createRenderer (M6)');
}
