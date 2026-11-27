import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const DT = 1 / 60;
const loaded = loadLevel(LEVELS[0]!);
const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
const origin = game.cannon.config().origin;
game.beginAim();
const rad = (-20 * Math.PI) / 180;
game.dragAim({ x: origin.x - 90 * Math.cos(rad), y: origin.y - 90 * Math.sin(rad) });
game.releaseAim();

for (let i = 1; i <= 400; i++) {
  game.step(DT);
  if (i % 40 === 0) {
    const awake = game.adapter.snapshot().filter((b) => !b.sleeping).map((b) => `${b.id}(${(Math.hypot(b.vx ?? 0, b.vy ?? 0)).toFixed(2)})`);
    console.log(`step ${i}: phase=${game.rules.snapshot().phase} awake=${awake.join(' ')}`);
  }
}
