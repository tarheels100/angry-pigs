import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import type { EntityState } from '../src/core/types.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const DT = 1 / 60;
const loaded = loadLevel(LEVELS[1]!);
const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
const origin = game.cannon.config().origin;
game.beginAim();
const rad = (18 * Math.PI) / 180;
game.dragAim({ x: origin.x - 63 * Math.cos(rad), y: origin.y - 63 * Math.sin(rad) });
game.releaseAim();
for (let i = 0; i < 800; i++) game.step(DT);

const bodies = game.adapter.snapshot();
const extent = (e: EntityState) => {
  const hw = e.halfWidth ?? e.radius ?? 12;
  const hh = e.halfHeight ?? e.radius ?? 12;
  return {
    w: Math.abs(Math.cos(e.angle)) * hw + Math.abs(Math.sin(e.angle)) * hh,
    h: Math.abs(Math.sin(e.angle)) * hw + Math.abs(Math.cos(e.angle)) * hh,
  };
};
const groundTop = game.groundTop();
for (const b of bodies) {
  if (b.kind === 'ground' || b.kind === 'wall') continue;
  const bottom = b.y + extent(b).h;
  if (bottom >= groundTop - 14) continue;
  const supported = bodies.some((o) => {
    if (o.id === b.id) return false;
    const top = o.y - extent(o).h;
    return extent(b).w + extent(o).w - Math.abs(o.x - b.x) >= 4 && top >= bottom - 14 && top <= bottom + 14;
  });
  if (!supported) {
    console.log(`floating ${b.id} ${b.kind} ${b.material} pos=(${b.x.toFixed(0)},${b.y.toFixed(0)}) angle=${b.angle.toFixed(2)} extent=${extent(b).w.toFixed(0)}x${extent(b).h.toFixed(0)} bottom=${bottom.toFixed(0)} speed=${Math.hypot(b.vx ?? 0, b.vy ?? 0).toFixed(2)} sleeping=${b.sleeping}`);
    for (const o of bodies) {
      const dx = Math.abs(o.x - b.x);
      if (dx < 120) console.log(`   near ${o.id} ${o.kind} ${o.material} pos=(${o.x.toFixed(0)},${o.y.toFixed(0)}) top=${(o.y - extent(o).h).toFixed(0)} angle=${o.angle.toFixed(2)}`);
    }
  }
}
console.log('phase ' + game.rules.snapshot().phase + ' bodies ' + bodies.length);
