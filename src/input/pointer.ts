import type { Vec2 } from '../core/types.ts';

/** Pointer input (mouse + touch via Pointer Events). Canvas is CSS-sized and
 * the page sets `touch-action: none` so dragging does not scroll (index.html). */
export interface PointerSource {
  /** Canvas-space position in CSS pixels, before camera mapping. */
  onDown(handler: (canvasPoint: Vec2) => void): () => void;
  onMove(handler: (canvasPoint: Vec2) => void): () => void;
  onUp(handler: (canvasPoint: Vec2) => void): () => void;
}

export function createPointerSource(canvas: HTMLCanvasElement): PointerSource {
  const listeners: Array<{ type: string; handler: (e: Event) => void }> = [];

  function point(e: PointerEvent): Vec2 {
    const rect = canvas.getBoundingClientRect();
    // CSS pixels, not the dpr-scaled backing store.
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function add(type: string, handler: (canvasPoint: Vec2) => void): () => void {
    const wrapped = (e: Event) => handler(point(e as PointerEvent));
    canvas.addEventListener(type, wrapped);
    listeners.push({ type, handler: wrapped });
    return () => canvas.removeEventListener(type, wrapped);
  }

  return {
    onDown: (h) => add('pointerdown', h),
    onMove: (h) => add('pointermove', h),
    onUp: (h) => add('pointerup', h),
  };
}
