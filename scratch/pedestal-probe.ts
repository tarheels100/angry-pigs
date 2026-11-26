import { loadLevel, levelAt } from '../src/levels/index.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';

const loaded = loadLevel(levelAt(Number(process.argv[2] ?? 1)));
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const bus = createEventBus();
const game = createGame({ level: loaded, adapter, bus });
bus.on('destroyed', (e) => console.log(`  destroyed ${e.id} (${e.cause})`));
bus.on('impact', (e) => console.log(`  impact ${e.aId}-${e.bId} energy ${e.energy.toFixed(1)}`));

const pull = Number(process.argv[3] ?? 63);
const deg = Number(process.argv[4] ?? -15);
const rad = (deg * Math.PI) / 180;
game.beginAim();
game.dragAim({ x: loaded.cannonOrigin.x - pull * Math.cos(rad), y: loaded.cannonOrigin.y - pull * Math.sin(rad) });
game.releaseAim();
for (let i = 0; i < 300; i++) {
  game.step(1 / 60);
  if (game.rules.snapshot().phase !== 'in_flight') break;
}
for (const b of adapter.snapshot().filter((s) => s.kind === 'bird' || s.kind === 'block')) {
  console.log(`  ${b.id} (${b.material}) at (${b.x.toFixed(0)},${b.y.toFixed(0)}) health ${b.health.toFixed(2)}/${b.healthMax?.toFixed(2)} sleeping ${b.sleeping}`);
}
console.log(`  phase ${game.rules.snapshot().phase}`);
