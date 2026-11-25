import type { Vec2 } from '../core/types.ts';

/** Pointer input (mouse + touch via Pointer Events). Canvas is CSS-sized and
 * the page sets `touch-action: none` so dragging does not scroll. */
export interface PointerSource {
  /** Raw canvas-space position, before camera mapping. */
  onDown(handler: (canvasPoint: Vec2) => void): () => void;
  onMove(handler: (canvasPoint: Vec2) => void): () => void;
  onUp(handler: (canvasPoint: Vec2) => void): () => void;
}

/** Stub — implemented in M7. */
export function createPointerSource(canvas: HTMLCanvasElement): PointerSource {
  throw new Error('not implemented: createPointerSource (M7)');
}
