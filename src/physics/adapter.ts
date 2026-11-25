import type { EntityKind, EntityState, MaterialId, ShapeId, Vec2 } from '../core/types.ts';
import { createMatterAdapter } from './matterAdapter.ts';

/** Physics-layer contract. Implemented by MatterAdapter (M4); other engines can
 * implement the same interface (D1). */

export interface BodyInit {
  id: string;
  kind: EntityKind;
  shape: ShapeId;
  material: MaterialId;
  x: number;
  y: number;
  angle?: number;
  halfWidth?: number;
  halfHeight?: number;
  radius?: number;
  isStatic?: boolean;
}

export interface Impact {
  aId: string;
  bId: string;
  point: Vec2;
  /** Relative speed along the contact normal, scaled by masses. */
  energy: number;
}

export interface TrajectorySample {
  x: number;
  y: number;
  /** True once the preview path contacted something. */
  hit: boolean;
}

export interface WorldInit {
  width: number;
  height: number;
  gravityY: number;
  /** Matter body option name: frictionAir (damping). */
  frictionAir: number;
}

export interface PhysicsAdapter {
  addBody(init: BodyInit): void;
  removeBody(id: string): void;
  /** Advance one fixed step; returns impacts that occurred during it. */
  step(dt: number): Impact[];
  snapshot(): EntityState[];
  state(id: string): EntityState | undefined;
  /** Give a projectile launch velocity (drag-based power). */
  launch(id: string, velocity: Vec2): void;
  /** Apply impact damage to an entity's health; emits destroy on the adapter. */
  applyDamage(id: string, amount: number): void;
  /** Non-mutating ballistic preview against the current statics only. */
  simulateTrajectory(origin: Vec2, velocity: Vec2, maxSteps: number, radius?: number): TrajectorySample[];
  allSleeping(): boolean;
  wakeAll(): void;
  /** Ids destroyed by damage during the most recent step. */
  destroyedLastStep(): string[];
}

// Note: the adapter applies pig rolling resistance (×0.94/step while in ground
// contact, docs/tuning.md) because Matter models no rolling resistance. Bounds-based
// and low-speed pig removal is a game-layer rule (docs/adr.md D15), not physics.

/**
 * Factory indirection so game code depends on the interface rather than on
 * matter-js directly (docs/adr.md D1). Swapping engines means changing this
 * function only.
 */
export function createPhysicsAdapter(init: WorldInit): PhysicsAdapter {
  return createMatterAdapter(init);
}
