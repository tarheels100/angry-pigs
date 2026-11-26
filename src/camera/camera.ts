import type { Vec2 } from '../core/types.ts';

/** Device pixels of the drawing surface. */
export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

/** World-space extent of a level; used to fit and clamp the camera. */
export interface WorldExtent {
  width: number;
  height: number;
}

export interface CameraApi {
  /** World-space point at the centre of the viewport. */
  position(): Vec2;
  zoom(): number;
  panTo(x: number, y: number): void;
  setZoom(zoom: number): void;
  worldToScreen(p: Vec2): Vec2;
  screenToWorld(p: Vec2): Vec2;
  /** Zoom that fits the whole level in the viewport. */
  fitZoom(): number;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

/**
 * Presentation-only camera: a pan/zoom transform over fixed world units
 * (docs/adr.md D13). Pure math so it is testable without a canvas.
 */
export function createCamera(view: Viewport, world: WorldExtent): CameraApi {
  let pos: Vec2 = { x: world.width / 2, y: world.height / 2 };
  let zoom = 1;

  function fitZoom(): number {
    return Math.min(view.width / world.width, view.height / world.height);
  }

  function clampPan() {
    // Keep the level roughly inside the viewport so the player never stares at
    // empty space; the centre may wander at most half a level beyond the edges.
    pos.x = Math.min(Math.max(pos.x, 0), world.width);
    pos.y = Math.min(Math.max(pos.y, 0), world.height);
  }

  function center(): Vec2 {
    return { x: view.width / 2, y: view.height / 2 };
  }

  return {
    position: () => ({ ...pos }),
    zoom: () => zoom,
    panTo(x, y) {
      pos = { x, y };
      clampPan();
    },
    setZoom(z) {
      zoom = Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
    },
    worldToScreen(p) {
      const c = center();
      return { x: c.x + (p.x - pos.x) * zoom, y: c.y + (p.y - pos.y) * zoom };
    },
    screenToWorld(p) {
      const c = center();
      return { x: pos.x + (p.x - c.x) / zoom, y: pos.y + (p.y - c.y) / zoom };
    },
    fitZoom,
  };
}
