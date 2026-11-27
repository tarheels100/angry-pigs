import { createGame } from '../src/game/game.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';
const DT = 1/60;
const loaded = loadLevel(LEVELS[2]);
const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: 2200, height: 900, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
const origin = loaded.cannonOrigin;
for (const [pull, deg] of [[90,-45],[63,-35],[75,-45],[63,-25],[90,-45]]) {
  const rad = deg * Math.PI / 180;
  game.beginAim();
  game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
  game.releaseAim();
  for (let s = 0; s < 300 && game.rules.snapshot().phase === 'in_flight'; s++) game.step(DT);
  for (let s = 0; s < 200 && game.rules.snapshot().phase === 'settling'; s++) game.step(DT);
}
console.log('birds:', game.entities.byKind('bird').map(b => `${b.id}@${Math.round(b.x)},${Math.round(b.y)}`).join(' '));
console.log('blocks:', game.entities.byKind('block').length);
