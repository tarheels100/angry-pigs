import type { Vec2 } from '../core/types.ts';

/**
 * Particles are a presentation effect (M11): the simulation emits events, this module
 * turns them into short-lived visual debris. Nothing in the game layer reads it, and
 * it never affects physics — a burst cannot change a body.
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  colour: string;
  size: number;
}

export interface ParticleSystem {
  spawnBurst(at: Vec2, colour: string, count: number, speed?: number): void;
  update(dt: number): void;
  paint(ctx: CanvasRenderingContext2D): void;
  count(): number;
  clear(): void;
}

/** Gravity for debris, in world units per second. Cosmetic, not the physics constant. */
const PARTICLE_GRAVITY = 220;

export function createParticleSystem(): ParticleSystem {
  let particles: Particle[] = [];

  /** Deterministic spread: bursts must look identical across runs and in tests. */
  function direction(index: number, count: number): Vec2 {
    const angle = (index / count) * Math.PI * 2 + (count % 2 ? 0.3 : 0);
    return { x: Math.cos(angle), y: Math.sin(angle) - 0.4 };
  }

  return {
    spawnBurst(at, colour, count, speed = 260) {
      for (let i = 0; i < count; i++) {
        const d = direction(i, count);
        const life = 0.35 + (i % 3) * 0.12;
        particles.push({
          x: at.x,
          y: at.y,
          vx: d.x * speed * (0.6 + (i % 4) * 0.12),
          vy: d.y * speed * (0.6 + (i % 4) * 0.12),
          life,
          maxLife: life,
          colour,
          size: 3 + (i % 3),
        });
      }
    },
    update(dt) {
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += PARTICLE_GRAVITY * dt;
        p.vx *= 0.96;
        p.life -= dt;
      }
      particles = particles.filter((p) => p.life > 0);
    },
    paint(ctx) {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.colour;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    },
    count: () => particles.length,
    clear: () => {
      particles = [];
    },
  };
}
