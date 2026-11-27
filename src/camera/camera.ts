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
  /** Current level extent the camera is framed around. */
  world(): WorldExtent;
  panTo(x: number, y: number): void;
  setZoom(zoom: number): void;
  /** Wheel/keyboard zoom, relative to the current zoom. */
  zoomBy(factor: number): void;
  worldToScreen(p: Vec2): Vec2;
  screenToWorld(p: Vec2): Vec2;
  /** Zoom that fits the whole level in the viewport. */
  fitZoom(): number;
  /** Re-frame for a different level extent: resets zoom to fit and centre. */
  setWorld(world: WorldExtent): void;
  /**
   * Smoothly track a world point (the projectile in flight), or return to the level
   * centre when the target is null. Clamped to the level extent, so the camera never
   * leaves the level (docs/adr.md D20).
   */
  follow(target: Vec2 | null, dt: number): void;
  /** Decay shake and advance the jitter phase. Call once per simulation step. */
  update(dt: number): void;
  /** Add a screen-space shake impulse (0..1). Presentation only: it never moves the world. */
  shake(strength: number): void;
  /** Current shake offset in screen pixels, added by the renderer. */
  shakeOffset(): Vec2;
}

const MANUAL_MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
/** Exponential smoothing rate for follow(), in units per second of remaining gap. */
const FOLLOW_RATE = 6;
/** Peak shake displacement in CSS pixels, and its decay rate per second. */
const SHAKE_PIXELS = 9;
const SHAKE_DECAY = 7;

/**
 * Presentation-only camera: a pan/zoom transform over fixed world units
 * (docs/adr.md D13). Pure math so it is testable without a canvas.
 */
export function createCamera(view: Viewport, world: WorldExtent): CameraApi {
  let pos: Vec2 = { x: world.width / 2, y: world.height / 2 };
  let zoom = 1;
  let extent: WorldExtent = world;
  let shake = 0;
  let shakePhase = 0;

  function fitZoom(): number {
    return Math.min(view.width / extent.width, view.height / extent.height);
  }

  function clampPan() {
    // Keep the level roughly inside the viewport so the player never stares at
    // empty space; the centre may wander at most half a level beyond the edges.
    pos.x = Math.min(Math.max(pos.x, 0), extent.width);
    pos.y = Math.min(Math.max(pos.y, 0), extent.height);
  }

  function center(): Vec2 {
    return { x: view.width / 2, y: view.height / 2 };
  }

  function applyZoom(z: number): void {
    // Playtest item 7: the fit for a narrow/portrait window is below 0.5, and clamping it
    // cropped the level and pushed the launcher off screen. The floor is the fit itself,
    // so "see the whole level" always wins; manual zoom-out cannot go past it.
    const floor = Math.min(MANUAL_MIN_ZOOM, fitZoom());
    zoom = Math.min(Math.max(z, floor), MAX_ZOOM);
  }

  return {
    position: () => ({ ...pos }),
    zoom: () => zoom,
    world: () => ({ ...extent }),
    panTo(x, y) {
      pos = { x, y };
      clampPan();
    },
    setZoom: applyZoom,
    zoomBy(factor) {
      applyZoom(zoom * factor);
    },
    setWorld(next: WorldExtent) {
      extent = next;
      pos = { x: next.width / 2, y: next.height / 2 };
      applyZoom(fitZoom());
    },
    follow(target: Vec2 | null, dt: number) {
      const goal = target ?? { x: extent.width / 2, y: extent.height / 2 };
      // Exponential approach: frame-rate independent, and it settles back to the
      // level centre smoothly instead of snapping when a round ends.
      const k = 1 - Math.exp(-FOLLOW_RATE * dt);
      pos = { x: pos.x + (goal.x - pos.x) * k, y: pos.y + (goal.y - pos.y) * k };
      clampPan();
    },
    update(dt: number) {
      shake *= Math.exp(-SHAKE_DECAY * dt);
      if (shake < 0.001) shake = 0;
      shakePhase += dt * 42;
    },
    shake(strength: number) {
      shake = Math.min(1, shake + Math.max(0, strength));
    },
    shakeOffset(): Vec2 {
      if (shake === 0) return { x: 0, y: 0 };
      // Deterministic jitter from the phase counter, so tests and replays match.
      return { x: shake * SHAKE_PIXELS * Math.sin(shakePhase), y: shake * SHAKE_PIXELS * 0.6 * Math.cos(shakePhase * 1.7) };
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
