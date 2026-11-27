import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const DT = 1 / 60;

/** Per-shot bird counts for the browser test plans (stage 2 and stage 3). */
for (const [idx, shots] of [[1, [[75, -35], [75, -25]]], [2, [[90, -40], [75, -40]]]] as Array<[number, Array<[number, number]>]>) {
  const loaded = loadLevel(LEVELS[idx]!);
  const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
  const origin = loaded.cannonOrigin;
  for (const [pull, deg] of shots) {
    game.beginAim();
    const rad = (deg * Math.PI) / 180;
    game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
    game.releaseAim();
    for (let i = 0; i < 900; i++) {
      game.step(DT);
      const p = game.rules.snapshot().phase;
      if (p !== 'in_flight' && p !== 'settling') break;
    }
    const snap = game.rules.snapshot();
    console.log(`stage-${idx + 1} shot ${pull}@${deg}: birds=${game.entities.byKind('bird').length} blocks=${game.entities.byKind('block').length} phase=${snap.phase} score=${snap.score}`);
  }
}
