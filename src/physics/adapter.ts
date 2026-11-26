import type { EntityKind, EntityState, Impact, MaterialId, ShapeId, TrajectorySample, Vec2 } from '../core/types.ts';
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
  /** Mass multiplier on the material density; a heavy pig knocks structures down (M18). */
  massScale?: number;
}

// Impact and TrajectorySample are core types so the game layer can consume them
// without importing the physics module's shape definitions.
export type { Impact, TrajectorySample };

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
  /** Remove all bodies from the world; used when rebuilding a level. */
  clear(): void;
  /** Advance one fixed step; returns impacts that occurred during it. */
  step(dt: number): Impact[];
  snapshot(): EntityState[];
  state(id: string): EntityState | undefined;
  /** Give a projectile launch velocity (drag-based power). */
  launch(id: string, velocity: Vec2): void;
  /** Apply impact damage to an entity's health; emits destroy on the adapter. */
  applyDamage(id: string, amount: number): void;
  /** Push and damage every dynamic body within `radius` of the centre (bomb pigs, M18).
   * Falloff is linear with distance, so the centre takes the full values. */
  explode(center: Vec2, options: ExplosionOptions): void;
  /** Non-mutating ballistic preview against the current statics only. */
  simulateTrajectory(origin: Vec2, velocity: Vec2, maxSteps: number, radius?: number): TrajectorySample[];
  allSleeping(): boolean;
  wakeAll(): void;
  /** Force every dynamic body to rest (zero velocity + sleeping). Used when a
   * round's settle window expires rather than waiting for bodies to sleep (D16). */
  freezeAll(): void;
  /** Ids destroyed by damage during the most recent step. */
  destroyedLastStep(): string[];
}

export interface ExplosionOptions {
  /** World units of effect radius. */
  radius: number;
  /** Velocity added to bodies inside the radius, scaled by falloff. */
  impulse: number;
  /** Health removed at the centre, scaled by falloff. */
  damage: number;
}

// Note: the adapter applies pig rolling resistance (×0.98/step while in ground
// contact, docs/tuning.md) because Matter models no rolling resistance. Bounds-based
// and low-speed pig removal is a game-layer rule (docs/adr.md D15), not physics.
// Destroyed bodies are removed from the world and from snapshot(); the game layer
// flashes them from destroyedLastStep() (docs/adr.md D17).

/**
 * Factory indirection so game code depends on the interface rather than on
 * matter-js directly (docs/adr.md D1). Swapping engines means changing this
 * function only.
 */
export function createPhysicsAdapter(init: WorldInit): PhysicsAdapter {
  return createMatterAdapter(init);
}
