import type { Vec2 } from '../core/types.ts';

/**
 * Pointer input (mouse + touch via Pointer Events). The canvas is CSS-sized and
 * the page sets `touch-action: none` so dragging does not scroll (index.html).
 *
 * Drag semantics: a gesture is press → move(s) → release. Gesture state (which
 * pointer is held, capture) is tracked by this module regardless of which handlers
 * the caller registers, so a press cannot leak. Moves are reported only while a
 * button is held, and the pointer is captured to the canvas so a drag that leaves
 * the canvas or passes over the HUD keeps producing events.
 */
export interface PointerSource {
  /** Canvas-space position in CSS pixels, before camera mapping. */
  onDown(handler: (canvasPoint: Vec2) => void): () => void;
  /** Only fires while a button is held, i.e. during a drag. */
  onMove(handler: (canvasPoint: Vec2) => void): () => void;
  onUp(handler: (canvasPoint: Vec2) => void): () => void;
  /** Interrupted gesture (pointercancel); the caller should discard the aim. */
  onCancel(handler: (canvasPoint: Vec2) => void): () => void;
  pressed(): boolean;
}

type Gesture = 'down' | 'move' | 'up' | 'cancel';

export function createPointerSource(canvas: HTMLCanvasElement): PointerSource {
  const handlers: Record<Gesture, Array<(p: Vec2) => void>> = { down: [], move: [], up: [], cancel: [] };
  let activePointer: number | null = null;

  function point(e: PointerEvent): Vec2 {
    const rect = canvas.getBoundingClientRect();
    // CSS pixels, not the dpr-scaled backing store.
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function fire(gesture: Gesture, p: Vec2) {
    // Handler failures must not leave the gesture half-open.
    for (const handler of handlers[gesture]) {
      try {
        handler(p);
      } catch (error) {
        console.error(`pointer ${gesture} handler failed:`, error);
      }
    }
  }

  function capture(e: PointerEvent) {
    activePointer = e.pointerId;
    if (typeof canvas.setPointerCapture === 'function') {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Best-effort: some browsers throw if the pointer is already gone.
      }
    }
  }

  function release() {
    if (activePointer !== null && typeof canvas.releasePointerCapture === 'function') {
      try {
        canvas.releasePointerCapture(activePointer);
      } catch {
        // Ignore: the pointer is already released.
      }
    }
    activePointer = null;
  }

  const own = (e: PointerEvent) => activePointer !== null && e.pointerId === activePointer;

  const internal: Array<{ type: string; handler: (e: Event) => void }> = [
    {
      type: 'pointerdown',
      handler: (e) => {
        capture(e as PointerEvent);
        fire('down', point(e as PointerEvent));
      },
    },
    {
      type: 'pointermove',
      handler: (e) => {
        // Hovering must not aim; only the held pointer counts as a drag.
        if (!own(e as PointerEvent)) return;
        fire('move', point(e as PointerEvent));
      },
    },
    {
      type: 'pointerup',
      handler: (e) => {
        if (!own(e as PointerEvent)) return;
        release();
        fire('up', point(e as PointerEvent));
      },
    },
    {
      type: 'pointercancel',
      handler: (e) => {
        if (!own(e as PointerEvent)) return;
        release();
        fire('cancel', point(e as PointerEvent));
      },
    },
  ];

  for (const { type, handler } of internal) canvas.addEventListener(type, handler);

  function subscribe(gesture: Gesture, handler: (p: Vec2) => void): () => void {
    handlers[gesture].push(handler);
    return () => {
      handlers[gesture] = handlers[gesture].filter((h) => h !== handler);
    };
  }

  return {
    onDown: (h) => subscribe('down', h),
    onMove: (h) => subscribe('move', h),
    onUp: (h) => subscribe('up', h),
    onCancel: (h) => subscribe('cancel', h),
    pressed: () => activePointer !== null,
  };
}
