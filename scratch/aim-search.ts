// Scratch probe: which aims work now that the launcher sits on a plinth at y=700?
import { loadLevel, LEVELS } from '../src/levels/index.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';

const DT = 1 / 60;

function run(levelIndex: number, pull: number, deg: number) {
  const loaded = loadLevel(LEVELS[levelIndex]!);
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  const origin = loaded.cannonOrigin;
  const rad = (deg * Math.PI) / 180;
  game.beginAim();
  game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
  game.releaseAim();
  const killed: string[] = [];
  const destroyed: string[] = [];
  let steps = 0;
  while (steps < 400) {
    const phase = game.rules.snapshot().phase;
    if (phase === 'won' || phase === 'lost' || phase === 'aiming') break;
    game.step(DT);
    steps++;
  }
  for (const e of adapter.snapshot()) if (e.destroyed) destroyed.push(e.id);
  const survivors = game.entities.byKind('bird').filter((b) => !b.destroyed).map((b) => b.id);
  return { pull, deg, phase: game.rules.snapshot().phase, steps, survivors, blocksLeft: adapter.snapshot().filter((b) => b.kind === 'block').length };
}

for (const deg of [-60, -50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10]) {
  const r = run(0, 90, deg);
  console.log(`stage-01 deg=${deg} pull=90 -> ${r.phase} in ${r.steps} steps, birds left=${r.survivors.join(',') || 'none'}, blocks left=${r.blocksLeft}`);
}
for (const pull of [90, 70]) {
  for (const deg of [-31, -24]) {
    const r = run(1, pull, deg);
    console.log(`stage-02 deg=${deg} pull=${pull} -> ${r.phase}, birds left=${r.survivors.join(',') || 'none'}`);
  }
}
for (const deg of [-18, -38, -25]) {
  const r = run(5, 90, deg);
  console.log(`stage-06 deg=${deg} pull=90 -> ${r.phase}, birds left=${r.survivors.join(',') || 'none'}`);
}
