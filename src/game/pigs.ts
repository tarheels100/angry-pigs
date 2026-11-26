/**
 * Pig type registry (M18). A level's ammo list is a list of these ids; the launcher
 * consumes them in order, and the game layer reads the spec when it spawns a pig.
 *
 * Physical differences (radius, mass) reach the physics adapter through `BodyInit`
 * (`radius`, `massScale`); gameplay effects (extra damage, explosions, spread) are the
 * game layer's business (docs/adr.md D33).
 */

export type PigTypeId = 'basic' | 'heavy' | 'bomb' | 'cluster';

export interface PigTypeSpec {
  id: PigTypeId;
  /** Short label for the HUD ammo readout. */
  label: string;
  /** Body radius in world units; bigger pigs carry more momentum. */
  radius: number;
  /** Mass multiplier on the pig material; heavy pigs knock structures down. */
  massScale: number;
  /** Multiplier on the damage a pig delivers to what it hits. */
  damageMultiplier: number;
  /** Pigs spawned per shot (cluster fires a spread, D33). */
  count: number;
  /** Angular spread in radians between cluster pigs, by spawn index. */
  spread?: number;
  /** Bomb: detonates on a solid hit, pushing and damaging everything nearby. */
  explosion?: {
    /** World units of effect radius. */
    radius: number;
    /** Velocity added to bodies inside the radius, scaled by distance falloff. */
    impulse: number;
    /** Health removed at the centre, scaled by distance falloff. */
    damage: number;
    /** Impact energy that triggers the detonation; a graze does not detonate. */
    threshold: number;
  };
}

export const PIG_TYPES: Record<PigTypeId, PigTypeSpec> = {
  basic: { id: 'basic', label: 'basic', radius: 18, massScale: 1, damageMultiplier: 1, count: 1 },
  // Heavy: slower to move, but its momentum topples columns and it survives a graze.
  heavy: { id: 'heavy', label: 'heavy', radius: 26, massScale: 2.2, damageMultiplier: 1.6, count: 1 },
  // Bomb: detonates on a solid hit, so it clears glass and shatters wood in one shot.
  // The authored damage is converted by DAMAGE_SCALE in the game layer (docs/adr.md D33).
  bomb: {
    id: 'bomb',
    label: 'bomb',
    radius: 20,
    massScale: 1.2,
    damageMultiplier: 1,
    count: 1,
    explosion: { radius: 130, impulse: 9, damage: 14, threshold: 40 },
  },
  // Cluster: three smaller pigs fanned out, so a single shot covers a wide structure.
  cluster: {
    id: 'cluster',
    label: 'cluster',
    radius: 12,
    massScale: 0.8,
    damageMultiplier: 0.8,
    count: 3,
    spread: 0.06,
  },
};

/** Levels may write `pig` for the default type; unknown ids are a level error. */
export function isPigTypeId(id: string): id is PigTypeId {
  return id === 'basic' || id === 'heavy' || id === 'bomb' || id === 'cluster' || id === 'pig';
}

export function pigType(id: string): PigTypeSpec {
  if (id === 'pig') return PIG_TYPES.basic;
  const spec = PIG_TYPES[id as PigTypeId];
  if (!spec) throw new Error(`unknown pig type: ${id}`);
  return spec;
}

/**
 * Launch velocities for one shot. A cluster fans its pigs out by index, deterministically
 * (no random generator, so a recorded run replays identically — docs/checklist.md §2).
 */
export function shotVelocities(spec: PigTypeSpec, base: { x: number; y: number }): Array<{ x: number; y: number }> {
  const shots: Array<{ x: number; y: number }> = [];
  const speed = Math.hypot(base.x, base.y);
  if (speed === 0) return [{ x: 0, y: 0 }];
  const angle = Math.atan2(base.y, base.x);
  for (let i = 0; i < spec.count; i++) {
    const offset = (i - (spec.count - 1) / 2) * (spec.spread ?? 0);
    const a = angle + offset;
    shots.push({ x: Math.cos(a) * speed, y: Math.sin(a) * speed });
  }
  return shots;
}
