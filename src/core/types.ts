/**
 * Shared semantic state. Appearance is NOT described here — themes map these
 * fields to visuals (see docs/theme-contract.md).
 */

export type EntityKind = 'cannon' | 'pig' | 'bird' | 'block' | 'ground' | 'wall';
export type MaterialId = 'glass' | 'stone' | 'metal' | 'feather' | 'ground' | 'light';
export type ShapeId = 'box' | 'circle';

export interface Vec2 { x: number; y: number; }

/** Read-only snapshot of a simulated entity, consumed by the renderer. */
export interface EntityState {
  id: string;
  kind: EntityKind;
  shape: ShapeId;
  material: MaterialId;
  x: number;
  y: number;
  angle: number;
  radius?: number;
  halfWidth?: number;
  halfHeight?: number;
  vx: number;
  vy: number;
  sleeping: boolean;
  destroyed: boolean;
  /** Remaining hit points (absolute, D10). Infinity for immovable materials. */
  health: number;
  /** Hit points the entity was created with; lets a theme show partial damage
   * (tilt, cracks) without knowing damage maths. Infinity for immovables. */
  healthMax?: number;
  /** Presentation-only lifetime for a destroyed entity's flash, 1 -> fresh, 0 -> gone.
   * Set on display extras only; live physics bodies never carry it (D17). */
  fade?: number;
  /** Highest impact energy seen by this entity since it was created. */
  impactEnergy: number;
}

/** One collision contact measured by the physics layer. */
export interface Impact {
  aId: string;
  bId: string;
  point: Vec2;
  /** Relative speed along the contact normal, weighted by the lighter body. */
  energy: number;
}

/** A ballistic preview point from physics.simulateTrajectory. */
export interface TrajectorySample {
  x: number;
  y: number;
  hit: boolean;
}

/**
 * Phase machine identifier. Owned by the game layer (M8) but typed in core because
 * the event bus payload is a core contract.
 */
export type GamePhase = 'ready' | 'aiming' | 'in_flight' | 'settling' | 'won' | 'lost' | 'no_ammo';

/** Everything the game layer broadcasts. The event bus is the only upward channel;
 * presentation never mutates game state. */
export interface GameEvents {
  impact: Impact;
  damaged: { id: string; amount: number; health: number };
  destroyed: { id: string; cause: 'impact' | 'crush' | 'fall' };
  launch: { id: string; velocity: Vec2 };
  pigConsumed: { id: string; reason: 'settled' | 'outOfBounds' | 'timeout' };
  levelLoaded: { levelId: string; name: string; ammo: number };
  phaseChanged: { phase: GamePhase };
  levelWon: { levelId: string; score: number; stars: number };
  levelLost: { levelId: string };
}
