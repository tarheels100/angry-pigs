// Scratch probe: print every body with its bottom, and the candidate supports near it.
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';
import type { EntityState } from '../src/core/types.ts';

const halfH = (e: EntityState) => e.halfHeight ?? e.radius ?? 0;
const halfW = (e: EntityState) => e.halfWidth ?? e.radius ?? 0;

for (const index of [2, 5]) {
  const loaded = loadLevel(LEVELS[index]!);
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  const bodies = game.adapter.snapshot();
  console.log(`=== ${loaded.def.name} groundTop=${game.groundTop()}`);
  for (const b of bodies) {
    const bottom = b.y + halfH(b);
    if (bottom >= game.groundTop() - 14) continue;
    const near = bodies
      .filter((o) => o.id !== b.id && Math.abs(o.x - b.x) <= halfW(b) + halfW(o))
      .map((o) => `${o.id}(${o.kind}) top=${Math.round(o.y - halfH(o))}`);
    console.log(`${b.id} ${b.kind} ${b.material} x=${Math.round(b.x)} bottom=${Math.round(bottom)} sleep=${b.sleeping} | nearby tops: ${near.join(' ') || 'none'}`);
  }
}
