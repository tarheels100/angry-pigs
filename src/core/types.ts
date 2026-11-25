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
  /** 0..1 remaining resilience for this material. */
  health: number;
  /** Highest impact energy seen by this entity since it was created. */
  impactEnergy: number;
}
