import { createGame } from '../src/game/game.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';
const DT = 1/60;
const loaded = loadLevel(LEVELS[2]);
const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: 2200, height: 900, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
const origin = loaded.cannonOrigin;
for (const [pull, deg] of [[90,-45],[75,-35],[63,-15]]) {
  const phase = game.rules.snapshot().phase;
  console.log('shot at phase', phase);
  const rad = deg * Math.PI / 180;
  game.beginAim();
  game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
  game.releaseAim();
  for (let s = 0; s < 300 && game.rules.snapshot().phase === 'in_flight'; s++) game.step(DT);
  for (let s = 0; s < 150 && game.rules.snapshot().phase === 'settling'; s++) game.step(DT);
  console.log('  after shot: phase', game.rules.snapshot().phase, 'birds', game.entities.byKind('bird').length, 'score', game.rules.snapshot().score);
}
for (let s = 0; s < 600; s++) {
  const p = game.rules.snapshot().phase;
  if (p !== 'in_flight' && p !== 'settling') break;
  game.step(DT);
}
console.log('final phase', game.rules.snapshot().phase, 'birds', game.entities.byKind('bird').length);
