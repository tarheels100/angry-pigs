import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';

/**
 * Stage analysis probe. For each stage it runs the sweep grid and reports how birds
 * die, how often birds survive while their supports are gone, and the win rate — the
 * data the level/damage retune needs (docs/checklist.md §3).
 */
const DT = 1 / 60;
const PULLS = [30, 45, 90];
const ANGLES = [-80, -60, -40, -20, 0, 15, 20, 30, 40];

for (let levelIndex = 0; levelIndex < 3; levelIndex++) {
  const loaded = loadLevel(levelAt(levelIndex));
  let wins = 0;
  let combos = 0;
  let birdsAliveOnDestroyedSupport = 0;
  const causes: Record<string, number> = {};
  const birdKillCounts: Record<string, number> = {};

  for (const pull of PULLS) {
    for (const deg of ANGLES) {
      combos++;
      const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
      const bus = createEventBus();
      const game = createGame({ level: loaded, adapter, bus });
      let kills = 0;
      bus.on('destroyed', (e) => {
        if (e.id.startsWith('bird')) kills++;
        causes[e.cause] = (causes[e.cause] ?? 0) + 1;
      });

      const rad = (deg * Math.PI) / 180;
      game.beginAim();
      game.dragAim({ x: loaded.cannonOrigin.x - pull * Math.cos(rad), y: loaded.cannonOrigin.y - pull * Math.sin(rad) });
      game.releaseAim();
      let steps = 0;
      while (steps < 400 && !['aiming', 'won', 'lost'].includes(game.rules.snapshot().phase)) {
        game.step(DT);
        steps++;
      }
      // Second shot at the same aim, to approximate a player retrying.
      if (game.rules.snapshot().phase === 'aiming') {
        game.beginAim();
        game.dragAim({ x: loaded.cannonOrigin.x - pull * Math.cos(rad), y: loaded.cannonOrigin.y - pull * Math.sin(rad) });
        game.releaseAim();
        while (steps < 700 && !['aiming', 'won', 'lost'].includes(game.rules.snapshot().phase)) {
          game.step(DT);
          steps++;
        }
      }

      const snap = game.rules.snapshot();
      if (snap.phase === 'won') wins++;
      birdKillCounts[String(kills)] = (birdKillCounts[String(kills)] ?? 0) + 1;
      if (snap.targetsAlive > 0 && adapter.snapshot().filter((e) => e.kind === 'block').length < loaded.bodies.filter((b) => b.kind === 'block').length) {
        birdsAliveOnDestroyedSupport++;
      }
    }
  }

  console.log(`${loaded.def.name}: wins ${wins}/${combos}, bird-kills-per-combo ${JSON.stringify(birdKillCounts)}, causes ${JSON.stringify(causes)}, birds alive with blocks broken ${birdsAliveOnDestroyedSupport}`);
}
