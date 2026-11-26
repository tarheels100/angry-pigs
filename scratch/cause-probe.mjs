import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';

for (const deg of [0, 20]) {
  const loaded = loadLevel(levelAt(0));
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const bus = createEventBus();
  const game = createGame({ level: loaded, adapter, bus });
  const deaths = [];
  bus.on('destroyed', (e) => deaths.push(`${e.id}:${e.cause}`));
  game.beginAim();
  game.dragAim({ x: loaded.cannonOrigin.x - 90 * Math.cos(deg * Math.PI / 180), y: loaded.cannonOrigin.y - 90 * Math.sin(deg * Math.PI / 180) });
  game.releaseAim();
  let steps = 0;
  while (steps < 320 && !['aiming', 'won', 'lost'].includes(game.rules.snapshot().phase)) { game.step(1/60); steps++; }
  console.log(`deg ${deg}: phase=${game.rules.snapshot().phase} deaths=${deaths.join(' ')} blocks=${adapter.snapshot().filter(e=>e.kind==='block').length}`);
}
