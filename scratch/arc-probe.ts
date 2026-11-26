import { loadLevel, levelAt } from '../src/levels/index.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
const loaded = loadLevel(levelAt(Number(process.argv[2] ?? 1)));
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const game = createGame({ level: loaded, adapter, bus: createEventBus() });
const shots: Array<[number, number]> = [[90, -12], [63, -18], [90, -8], [63, -8]];
for (const shot of shots) {
  const pull = shot[0]!;
  const deg = shot[1]!;
  const rad = (deg * Math.PI) / 180;
  const traj = adapter.simulateTrajectory(loaded.cannonOrigin, { x: pull * loaded.powerScale * Math.cos(rad), y: pull * loaded.powerScale * Math.sin(rad) }, 120, 24);
  const near = traj.filter((p) => Math.abs(p.x - 1220) < 60);
  console.log(`pull ${pull} deg ${deg}: points near x=1220 -> ${near.map((p) => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' ') || 'none'}; last=(${traj[traj.length - 1]!.x.toFixed(0)},${traj[traj.length - 1]!.y.toFixed(0)})`);
}
