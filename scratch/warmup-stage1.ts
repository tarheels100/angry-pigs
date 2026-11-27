import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

/** Print the bodies still moving after warmup in stage 1, and how they evolve over more steps. */
const loaded = loadLevel(LEVELS[0]!);
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const game = createGame({ level: loaded, adapter, bus: createEventBus() });

function report(label: string): void {
  for (const b of adapter.snapshot()) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 1) {
      console.log(label + ': ' + b.id + ' ' + b.material + ' at ' + Math.round(b.x) + ',' + Math.round(b.y) + ' hw=' + b.halfWidth + ' hh=' + b.halfHeight + ' speed=' + speed.toFixed(2) + ' sleeping=' + b.sleeping);
    }
  }
}

report('after warmup');
for (let i = 0; i < 240; i++) adapter.step(1 / 60);
report('+240 steps');
console.log('all asleep after extra steps: ' + adapter.allSleeping());
