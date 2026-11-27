import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const DT = 1 / 60;

/** Per-stage single-shot kill report: does any drag kill a bird on its own? (docs/tuning.md) */
for (let index = 0; index < LEVELS.length; index++) {
  const def = LEVELS[index]!;
  const loaded = loadLevel(def);
  const origin = loaded.cannonOrigin;
  let best = 0;
  let bestShot = '';
  for (let pull = 30; pull <= def.cannon.maxPull; pull += 3) {
    for (let deg = -42; deg <= 42; deg += 1.5) {
      const game = createGame({
        level: loaded,
        adapter: createPhysicsAdapter({ width: def.bounds.width, height: def.bounds.height, gravityY: 1, frictionAir: 0.001 }),
        bus: createEventBus(),
      });
      game.beginAim();
      const rad = (deg * Math.PI) / 180;
      game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
      game.releaseAim();
      for (let i = 0; i < 420; i++) {
        game.step(DT);
        const p = game.rules.snapshot().phase;
        if (p !== 'in_flight' && p !== 'settling') break;
      }
      const kills = loaded.targetIds.length - game.entities.byKind('bird').length;
      if (kills > best) {
        best = kills;
        bestShot = `${pull}@${deg}`;
      }
    }
  }
  console.log(`${def.name}: best single-shot kills ${best}${best ? ` at ${bestShot}` : ''}`);
}
