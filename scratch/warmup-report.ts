import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

/** Report bodies that are not resting or not at full health after the load warmup. */
for (let index = 0; index < LEVELS.length; index++) {
  const loaded = loadLevel(LEVELS[index]!);
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  const bad = adapter.snapshot().filter((e) => (e.healthMax !== undefined && e.health < e.healthMax) || Math.hypot(e.vx, e.vy) >= 1.5);
  console.log(
    `${loaded.def.name}: ${bad.length} bodies not resting/full`,
    bad.map((b) => `${b.id} hp=${b.health.toFixed(1)}/${b.healthMax} speed=${Math.hypot(b.vx, b.vy).toFixed(2)}`).join(' '),
  );
}
