import type { MaterialId } from '../core/types.ts';

/**
 * Material registry: physical properties plus resilience. Tuning values live in
 * docs/tuning.md; change them there and here together.
 */
export interface MaterialSpec {
  /** Mass per unit area. */
  density: number;
  /** Surface friction for contact rubbing. */
  friction: number;
  /** Bounciness, 0 = inelastic. */
  restitution: number;
  /** Hit points at reference size; scaled by area when a body is created. */
  health: number;
  /** Impact energy needed to remove one health point. */
  damageThreshold: number;
}

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  glass: { density: 0.0012, friction: 0.05, restitution: 0.05, health: 4, damageThreshold: 3 },
  stone: { density: 0.0035, friction: 0.6, restitution: 0.02, health: 16, damageThreshold: 9 },
  metal: { density: 0.005, friction: 0.35, restitution: 0.15, health: 24, damageThreshold: 14 },
  feather: { density: 0.0008, friction: 0.2, restitution: 0.3, health: 2, damageThreshold: 2 },
  ground: { density: 0.01, friction: 0.9, restitution: 0.0, health: Infinity, damageThreshold: Infinity },
  light: { density: 0.001, friction: 0.1, restitution: 0.35, health: 6, damageThreshold: 4 },
};

export function materialSpec(id: MaterialId): MaterialSpec {
  return MATERIALS[id];
}

/** Health scaled by body area so large blocks are tougher than small ones. */
export function healthFor(id: MaterialId, area: number): number {
  const spec = MATERIALS[id];
  if (!Number.isFinite(spec.health)) return Infinity;
  return spec.health * Math.max(0.35, Math.min(3, area / 4000));
}
