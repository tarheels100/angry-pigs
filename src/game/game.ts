import type { PhysicsAdapter } from '../physics/adapter.ts';
import type { EventBus } from '../core/eventBus.ts';
import type { EntityRegistry } from '../core/entities.ts';
import type { AimState } from './cannon.ts';
import type { Vec2 } from '../core/types.ts';

/** Composition root for gameplay: level + cannon + physics + rules. */

export interface Frame {
  entities: EntityRegistry;
  /** Present while the player is dragging the cannon. */
  aim: AimState | null;
  /** Ballistic preview for the current aim, computed from the physics layer. */
  trajectory: Vec2[];
}

export interface Game {
  adapter: PhysicsAdapter;
  bus: EventBus;
  entities: EntityRegistry;
  step(dt: number): void;
  frame(): Frame;
  /** Begin a drag from a pointer position in world coordinates. */
  beginAim(worldPoint: Vec2): void;
  dragAim(worldPoint: Vec2): void;
  cancelAim(): void;
  /** Release the drag: fire the next pig if ammo remains. */
  releaseAim(): boolean;
  restart(): void;
}

/** Stub — wired together in M7. */
export function createGame(): Game {
  throw new Error('not implemented: createGame (M7)');
}
