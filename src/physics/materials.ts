import type { MaterialId } from '../core/types.ts';

/**
 * Material registry: physical properties plus resilience. Tuning values live in
 * docs/tuning.md; change them there and here together.
 */
export interface MaterialSpec {
  /** Mass per unit area. */
  density: number;
  /** Kinetic friction for sliding/rolling contacts. */
  friction: number;
  /** Static friction needed to break a contact — controls whether a stack holds. */
  frictionStatic: number;
  /** Bounciness, 0 = inelastic. */
  restitution: number;
  /** Hit points at reference size; scaled by area when a body is created. */
  health: number;
  /** Impact energy needed to remove one health point. */
  damageThreshold: number;
}

// Values below come from the M3 spike (scratch/physics-spike/spike.ts). Pig friction
// is deliberately low: Matter takes max(frictionA, frictionB), so a grabby pig
// against the ground stops rolling within ~400 units instead of crossing the stage.
export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  // Glass is the material that is meant to give way (M23): the threshold came back down
  // from 4 and health from 4 to 3, so a graze cracks a pane and a solid hit shatters it.
  // The post-M13 playtest raised it because glass erased on almost any contact
  // (docs/post-m13-notes.md); M23 lands between the two. See docs/tuning.md.
  glass: { density: 0.0012, friction: 0.05, frictionStatic: 0.05, restitution: 0.05, health: 3, damageThreshold: 2.5 },
  // Wood: tougher than glass, weaker than stone. Friction high enough that a plank
  // holds a stack instead of sliding, and a roof that breaks rather than vanishing.
  wood: { density: 0.0011, friction: 0.35, frictionStatic: 0.35, restitution: 0.04, health: 6, damageThreshold: 5 },
  stone: { density: 0.0035, friction: 0.4, frictionStatic: 0.4, restitution: 0.02, health: 16, damageThreshold: 9 },
  metal: { density: 0.005, friction: 0.35, frictionStatic: 0.4, restitution: 0.15, health: 24, damageThreshold: 14 },
  feather: { density: 0.0008, friction: 0.2, frictionStatic: 0.15, restitution: 0.2, health: 2, damageThreshold: 1.0 },
  // Kinetic friction is lower than static so a pig rolls rather than stopping dead
  // (Matter takes max(frictionA, frictionB), so this value governs pig rolling too).
  // Static friction stays high so stacks hold.
  ground: { density: 0.01, friction: 0.3, frictionStatic: 0.5, restitution: 0.0, health: Infinity, damageThreshold: Infinity },
  light: { density: 0.004, friction: 0.02, frictionStatic: 0.02, restitution: 0.3, health: 6, damageThreshold: 4 },
};

export function materialSpec(id: MaterialId): MaterialSpec {
  return MATERIALS[id];
}

/** Health scaled by body area so large blocks are tougher than small ones. The divisor
 * is a tuning constant: blocks are deliberately tougher than v0 (area / 3200 instead of
 * 4000) so a tower takes several hits and topples rather than evaporating
 * (docs/post-m13-notes.md, docs/tuning.md). */
export function healthFor(id: MaterialId, area: number): number {
  const spec = MATERIALS[id];
  if (!Number.isFinite(spec.health)) return Infinity;
  return spec.health * Math.max(0.35, Math.min(3, area / 3200));
}
