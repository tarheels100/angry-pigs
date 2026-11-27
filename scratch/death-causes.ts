import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const DT = 1 / 60;

/** Death causes for stage 01's measured two-shot plan (docs/tuning.md). */
const loaded = loadLevel(LEVELS[0]!);
const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
const origin = loaded.cannonOrigin;
const deaths: Array<{ id: string; cause: string }> = [];
game.bus.on('destroyed', (e) => deaths.push({ id: e.id, cause: e.cause }));

for (const deg of [-20, -20]) {
  game.beginAim();
  const rad = (deg * Math.PI) / 180;
  game.dragAim({ x: origin.x - 90 * Math.cos(rad), y: origin.y - 90 * Math.sin(rad) });
  game.releaseAim();
  for (let i = 0; i < 400; i++) {
    game.step(DT);
    const p = game.rules.snapshot().phase;
    if (p !== 'in_flight' && p !== 'settling') break;
  }
}
console.log('deaths: ' + deaths.map((d) => d.id + '/' + d.cause).join(' '));
console.log('phase ' + game.rules.snapshot().phase + ' score ' + game.rules.snapshot().score + ' stars ' + game.rules.snapshot().stars);
