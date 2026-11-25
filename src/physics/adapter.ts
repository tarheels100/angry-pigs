import type { EntityKind, EntityState, MaterialId, ShapeId, Vec2 } from '../core/types.ts';

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
  airFriction: number;
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
  simulateTrajectory(origin: Vec2, velocity: Vec2, maxSteps: number): TrajectorySample[];
  allSleeping(): boolean;
  wakeAll(): void;
  /** Ids destroyed by damage during the most recent step. */
  destroyedLastStep(): string[];
}

/** Stub — implemented in M4. */
export function createPhysicsAdapter(init: WorldInit): PhysicsAdapter {
  throw new Error('not implemented: createPhysicsAdapter (M4)');
}
