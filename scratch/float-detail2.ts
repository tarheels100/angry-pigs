// Scratch probe: after two shots, print bodies that the detector flags and their neighbours.
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
  const origin = game.cannon.config().origin;
  for (const deg of [14, 22]) {
    game.beginAim();
    game.dragAim({ x: origin.x - 90 * Math.cos((deg * Math.PI) / 180), y: origin.y - 90 * Math.sin((deg * Math.PI) / 180) });
    game.releaseAim();
    for (let i = 0; i < 420; i++) game.step(1 / 60);
  }
  const bodies = game.adapter.snapshot();
  console.log(`=== ${loaded.def.name} phase=${game.rules.snapshot().phase} groundTop=${game.groundTop()}`);
  for (const b of bodies) {
    const bottom = b.y + halfH(b);
    if (bottom >= game.groundTop() - 14) continue;
    const near = bodies
      .filter((o) => o.id !== b.id && Math.abs(o.x - b.x) <= halfW(b) + halfW(o))
      .map((o) => `${o.id}(${o.kind},${o.material}) top=${Math.round(o.y - halfH(o))} sleep=${o.sleeping}`);
    console.log(`${b.id} ${b.kind} x=${Math.round(b.x)} bottom=${Math.round(bottom)} sleep=${b.sleeping} | ${near.join(' ') || 'nothing'}`);
  }
}
