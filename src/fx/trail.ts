import type { EntityState } from '../core/types.ts';

/**
 * Motion trail: the recent path of a flying pig, painted behind entities.
 *
 * Presentation only. Points come from the entity snapshot and age by step, so a
 * recorded run replays identically (docs/checklist.md §2). Nothing here reads the
 * physics engine or decides gameplay.
 */

export interface TrailPoint {
  x: number;
  y: number;
  /** Steps since the point was recorded; 0 is freshest. */
  age: number;
}

export interface TrailSystem {
  /** Age existing points and record the position of every entity moving fast. */
  update(entities: EntityState[]): void;
  points(): TrailPoint[];
  paint(ctx: CanvasRenderingContext2D, colour: string): void;
  reset(): void;
}

export interface TrailOptions {
  /** Steps before a point is dropped. */
  maxAge?: number;
  /** Cap on recorded points; the oldest is dropped first. */
  maxPoints?: number;
  /** Speed below which an entity is not tracked (resting pigs leave no trail). */
  minSpeed?: number;
  /** Radius of the newest dot, in world units. */
  dotRadius?: number;
}

export function createTrail(options: TrailOptions = {}): TrailSystem {
  const maxAge = options.maxAge ?? 24;
  const maxPoints = options.maxPoints ?? 40;
  const minSpeed = options.minSpeed ?? 2;
  const dotRadius = options.dotRadius ?? 6;

  let points: TrailPoint[] = [];

  return {
    update(entities) {
      for (const p of points) p.age++;
      points = points.filter((p) => p.age < maxAge);
      for (const entity of entities) {
        if (entity.kind !== 'pig' || entity.destroyed) continue;
        if (Math.hypot(entity.vx, entity.vy) < minSpeed) continue;
        points.push({ x: entity.x, y: entity.y, age: 0 });
      }
      if (points.length > maxPoints) points = points.slice(points.length - maxPoints);
    },
    points: () => points.map((p) => ({ ...p })),
    paint(ctx, colour) {
      ctx.save();
      ctx.fillStyle = colour;
      for (const p of points) {
        const life = 1 - p.age / maxAge;
        ctx.globalAlpha = life * 0.4;
        const r = dotRadius * life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    reset() {
      points = [];
    },
  };
}
