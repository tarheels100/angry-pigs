import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';

/** Impact energy census for one Stage 01 shot, to set damage thresholds (docs/tuning.md). */
const loaded = loadLevel(levelAt(0));
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const game = createGame({ level: loaded, adapter, bus: createEventBus() });

const peaks = new Map<string, number>();
game.bus.on('impact', (imp) => {
  const pair = `${imp.aId} / ${imp.bId}`;
  peaks.set(pair, Math.max(peaks.get(pair) ?? 0, imp.energy));
});

game.beginAim();
game.dragAim({ x: loaded.cannonOrigin.x - loaded.maxPull, y: loaded.cannonOrigin.y });
game.releaseAim();

for (let i = 0; i < 300 && game.rules.snapshot().phase === 'in_flight'; i++) game.step(1 / 60);

console.log('peak energy per pair (flat shot, full pull):');
for (const [pair, e] of [...peaks.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${pair}  ${e.toFixed(1)}`);
console.log('live block health after flight:');
for (const s of adapter.snapshot()) if (s.kind === 'block') console.log(`  ${s.id} ${s.material} hp=${s.health.toFixed(1)}/${s.healthMax}`);
