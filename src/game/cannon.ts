import type { Vec2 } from '../core/types.ts';

/** Launcher contract. The cannon is an aim state, not a physics body (a struck
 * cannon is out of scope for v0). */

export interface CannonConfig {
  origin: Vec2;
  /** Maximum drag distance in world units; caps launch power. */
  maxPull: number;
  /** Launch speed per unit of pull (docs/tuning.md: 0.14 lands a full pull near
   * the far end of a 1600-unit stage). */
  powerScale: number;
  /** Ammo queue of pig variants, consumed one per launch. */
  ammo: string[];
}

export interface AimState {
  aiming: boolean;
  /** Pull vector from cannon origin to the pointer, clamped to maxPull. */
  pull: Vec2;
  /** Clamped launch direction (unit) and speed. */
  direction: Vec2;
  speed: number;
}

/** Launch direction is clamped to ±75° from horizontal-right (docs/adr.md D12):
 * firing backwards or straight up produces meaningless physics. */
export const MAX_LAUNCH_ANGLE = (75 * Math.PI) / 180;

export interface Cannon {
  config(): CannonConfig;
  aim(): AimState | null;
  /** Clamp a raw pointer offset to maxPull and derive the launch vector. */
  setAim(pointer: Vec2): AimState | null;
  clearAim(): void;
  /** Launch velocity for the current aim, or null if not aiming / no ammo. */
  launchVelocity(): Vec2 | null;
  nextAmmo(): string | null;
  consumeAmmo(): string | null;
  ammoLeft(): number;
}

export function createCannon(config: CannonConfig): Cannon {
  const queue = [...config.ammo];
  let aim: AimState | null = null;

  function setAim(pointer: Vec2): AimState | null {
    if (queue.length === 0) return null;
    const raw = { x: pointer.x - config.origin.x, y: pointer.y - config.origin.y };
    const length = Math.hypot(raw.x, raw.y);
    if (length < 1) return null;

    const clampedLength = Math.min(length, config.maxPull);
    const pull = { x: (raw.x / length) * clampedLength, y: (raw.y / length) * clampedLength };

    // Launch direction is opposite the pull (slingshot), clamped into the allowed
    // cone around horizontal-right.
    let angle = Math.atan2(-pull.y, -pull.x);
    if (angle > Math.PI) angle -= 2 * Math.PI;
    if (angle < -Math.PI) angle += 2 * Math.PI;
    angle = Math.min(Math.max(angle, -MAX_LAUNCH_ANGLE), MAX_LAUNCH_ANGLE);

    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    return {
      aiming: true,
      pull,
      direction,
      speed: clampedLength * config.powerScale,
    };
  }

  return {
    config: () => ({ ...config, ammo: [...queue] }),
    aim: () => (aim ? { ...aim } : null),
    setAim(pointer) {
      aim = setAim(pointer);
      return aim ? { ...aim } : null;
    },
    clearAim() {
      aim = null;
    },
    launchVelocity() {
      if (!aim || queue.length === 0) return null;
      return { x: aim.direction.x * aim.speed, y: aim.direction.y * aim.speed };
    },
    nextAmmo: () => queue[0] ?? null,
    consumeAmmo() {
      const next = queue.shift() ?? null;
      aim = null;
      return next;
    },
    ammoLeft: () => queue.length,
  };
}
