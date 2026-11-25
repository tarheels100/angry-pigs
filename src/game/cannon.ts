import type { Vec2 } from '../core/types.ts';

/** Launcher contract. The cannon is an aim state, not a physics body (a struck
 * cannon is out of scope for v0). */

export interface CannonConfig {
  origin: Vec2;
  /** Maximum drag distance in world units; caps launch power. */
  maxPull: number;
  /** Launch speed per unit of pull. */
  powerScale: number;
  /** Ammo queue of pig variants, consumed one per launch. */
  ammo: string[];
}

export interface AimState {
  aiming: boolean;
  /** Pull vector from cannon origin to pointer (pointing backwards to slingshot). */
  pull: Vec2;
  /** Clamped launch direction (unit) and speed. */
  direction: Vec2;
  speed: number;
}

export interface Cannon {
  config(): CannonConfig;
  aim(): AimState | null;
  /** Clamp a raw pointer offset to maxPull and derive launch vector. */
  setAim(pointer: Vec2): AimState;
  clearAim(): void;
  nextAmmo(): string | null;
  consumeAmmo(): string | null;
}

/** Stub — implemented in M7. */
export function createCannon(config: CannonConfig): Cannon {
  throw new Error('not implemented: createCannon (M7)');
}
