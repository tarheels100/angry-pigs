import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';

/**
 * Reach probe: how far right a launched pig actually travels, per pull/angle. Used to
 * decide whether a wider world needs a stronger `powerScale` (docs/tuning.md).
 */
const DT = 1 / 60;

function reach(levelIndex: number, pull: number, deg: number): { maxX: number; landedAt: number } {
  const loaded = loadLevel(levelAt(levelIndex));
  const adapter = createPhysicsAdapter({
    width: loaded.def.bounds.width,
    height: loaded.def.bounds.height,
    gravityY: 1,
    frictionAir: 0.001,
  });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  const rad = (deg * Math.PI) / 180;
  game.beginAim();
  game.dragAim({ x: loaded.cannonOrigin.x - pull * Math.cos(rad), y: loaded.cannonOrigin.y - pull * Math.sin(rad) });
  game.releaseAim();

  let maxX = 0;
  let lastSeen = 0;
  for (let step = 0; step < 400; step++) {
    game.step(DT);
    // Pig ids are `pig-1`, `pig-2`, … (a cluster spawns several, M18).
    const pigs = game.entities.byKind('pig');
    if (pigs.length === 0) break;
    for (const pig of pigs) {
      if (pig.x > maxX) maxX = pig.x;
      lastSeen = pig.x;
    }
  }
  return { maxX, landedAt: lastSeen };
}

const pulls = [45, 90];
const angles = [-30, -10, 0, 15, 25, 35, 45];
for (const pull of pulls) {
  for (const deg of angles) {
    const r = reach(0, pull, deg);
    console.log(`pull ${pull} deg ${deg}: peak x ${Math.round(r.maxX)}, last seen x ${Math.round(r.landedAt)}`);
  }
}
