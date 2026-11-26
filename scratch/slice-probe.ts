import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel } from '../src/levels/index.ts';
import { LEVEL_01 } from '../src/levels/l01.ts';

function shot(deg: number) {
  const level = loadLevel(LEVEL_01);
  const adapter = createPhysicsAdapter({ width: level.def.bounds.width, height: level.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level, adapter, bus: createEventBus() });
  const origin = level.cannonOrigin;
  const a = deg * Math.PI / 180;
  game.beginAim({ x: origin.x - level.maxPull * Math.cos(a), y: origin.y - level.maxPull * Math.sin(a) });
  game.releaseAim();
  for (let i = 0; i < 300; i++) game.step(1 / 60);
  const killed = adapter.snapshot().filter((e) => e.kind === 'bird' && e.destroyed).map((e) => e.id);
  const blocks = adapter.snapshot().filter((e) => e.kind === 'block' && e.destroyed).map((e) => e.id);
  return { killed, blocks, phase: game.rules.snapshot().phase };
}

for (const deg of [-30, -22, -16, -10, -4, 0, 4, 10, 16]) console.log(deg, JSON.stringify(shot(deg)));
