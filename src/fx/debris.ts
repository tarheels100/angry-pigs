import type { EntityState, MaterialId } from '../core/types.ts';

/**
 * Debris heaps (M16). A destroyed block crumbles into fragments that fall, land on the
 * ground, pile up, and fade out. Fragments are presentation: they are not physics
 * bodies, collide with nothing, and never change a level's outcome (docs/adr.md D31).
 *
 * Positions come from the destroyed entity's state and fragment index, so a recorded run
 * replays identically (docs/checklist.md §2).
 */

export interface DebrisFragment {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  /** Full edge length of the fragment square, in world units. */
  size: number;
  /** Steps since the fragment came to rest; drives the fade. */
  restSteps: number;
  material: MaterialId;
}

export interface DebrisOptions {
  /** World y of the ground surface fragments land on. */
  groundTop: number;
  /** Steps of gravity applied per fixed step (world units per step^2). */
  gravity?: number;
  /** Steps a resting fragment keeps painting before it is dropped. */
  fadeSteps?: number;
  /** Cap on live fragments; the oldest are dropped first. */
  maxFragments?: number;
  /** Ground friction applied to fragments that are rolling. */
  rollDamping?: number;
}

export interface DebrisSystem {
  /** Crumble a destroyed entity into fragments. `spread` widens the scatter. */
  spawnFrom(state: EntityState, count: number, spread: number): void;
  /** Advance one fixed step: fall, land, pile, fade. */
  update(): void;
  fragments(): DebrisFragment[];
  paint(ctx: CanvasRenderingContext2D, colours: Record<MaterialId, string>): void;
  clear(): void;
}

/** Ground friction for a fragment that has landed; debris stops fast, it does not roll far. */
const PILE_DAMPING = 0.45;
/** Horizontal speed below which a landed fragment is considered at rest. */
const REST_SPEED = 1;

export function createDebris(options: DebrisOptions): DebrisSystem {
  const gravity = options.gravity ?? 0.35;
  const fadeSteps = options.fadeSteps ?? 90;
  const maxFragments = options.maxFragments ?? 120;
  const rollDamping = options.rollDamping ?? 0.92;
  const groundTop = options.groundTop;

  let fragments: DebrisFragment[] = [];
  /** Heap surface per ground bucket: fragments rest on top of what is already there. */
  const pile = new Map<number, number>();
  const bucketSize = 24;

  function bucketOf(x: number): number {
    return Math.floor(x / bucketSize);
  }

  /** Surface height of the heap in a bucket, never below the ground. */
  function surfaceOf(x: number): number {
    const top = pile.get(bucketOf(x));
    return top === undefined ? groundTop : Math.min(top, groundTop);
  }

  return {
    spawnFrom(state, count, spread) {
      const half = state.radius ?? Math.min(state.halfWidth ?? 12, state.halfHeight ?? 12);
      const size = Math.max(6, half / 2);
      for (let i = 0; i < count; i++) {
        // Deterministic scatter: index decides the offset, not a random generator.
        const offset = (i - (count - 1) / 2) * (spread / Math.max(1, count));
        fragments.push({
          x: state.x + offset,
          y: state.y + ((i % 2) - 0.5) * size,
          vx: offset * 0.35,
          vy: -2 - (i % 3) * 0.6,
          angle: state.angle + i * 0.4,
          size,
          restSteps: 0,
          material: state.material,
        });
      }
      if (fragments.length > maxFragments) fragments = fragments.slice(fragments.length - maxFragments);
    },

    update() {
      for (const f of fragments) {
        if (f.restSteps > 0) {
          f.restSteps++;
          continue;
        }
        f.vy += gravity;
        f.x += f.vx;
        f.y += f.vy;
        f.angle += f.vx * 0.02;

        const surface = surfaceOf(f.x) - f.size / 2;
        if (f.y >= surface) {
          // Landed: settle onto the heap and raise the heap surface for the next one.
          f.y = surface;
          f.vx *= PILE_DAMPING;
          f.vy = 0;
          const bucket = bucketOf(f.x);
          const current = pile.get(bucket) ?? groundTop;
          pile.set(bucket, Math.min(current - f.size, surface));
          // A fragment that stops moving starts fading; a rolling one keeps rolling.
          if (Math.abs(f.vx) < REST_SPEED) f.restSteps = 1;
          else f.vx *= rollDamping;
        }
      }
      fragments = fragments.filter((f) => f.restSteps < fadeSteps);
    },

    fragments: () => fragments.map((f) => ({ ...f })),

    paint(ctx, colours) {
      for (const f of fragments) {
        const life = f.restSteps > 0 ? Math.max(0, 1 - f.restSteps / fadeSteps) : 1;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
        ctx.globalAlpha = life;
        ctx.fillStyle = colours[f.material] ?? colours.ground;
        ctx.fillRect(-f.size / 2, -f.size / 2, f.size, f.size);
        ctx.restore();
      }
    },

    clear() {
      fragments = [];
      pile.clear();
    },
  };
}
