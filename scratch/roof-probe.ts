import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';
import { reachTable, bestShot } from './reachTable.ts';

const DT = 1 / 60;

/**
 * What happens when a pig lands on a shelter roof? Prints impact energies, health deltas, and
 * destruction for one shot, so roof/beam tuning is measured rather than guessed (docs/tuning.md).
 */
const loaded = loadLevel(LEVELS[0]!);
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const game = createGame({ level: loaded, adapter, bus: createEventBus() });
const origin = loaded.cannonOrigin;
const rows = reachTable(loaded);

const before = new Map<string, number>();
for (const s of adapter.snapshot()) before.set(s.id, s.health);

game.bus.on('impact', (imp) => console.log(`impact ${imp.aId}-${imp.bId} energy ${imp.energy.toFixed(1)}`));
game.bus.on('destroyed', (d) => console.log(`destroyed ${d.id}`));

const roof = adapter.snapshot().filter((s) => s.kind === 'block' && s.material === 'glass').sort((a, b) => a.x - b.x)[0]!;
const roofTop = roof.y - (roof.halfHeight ?? 0);
const shot = bestShot(rows, roof.x, roofTop);
console.log(`aim at roof ${roof.id} top (${Math.round(roof.x)},${Math.round(roofTop)}) with ${JSON.stringify(shot)}`);

game.beginAim();
const rad = (shot!.deg * Math.PI) / 180;
game.dragAim({ x: origin.x - shot!.pull * Math.cos(rad), y: origin.y - shot!.pull * Math.sin(rad) });
game.releaseAim();
for (let step = 0; step < 300 && game.rules.snapshot().phase === 'in_flight'; step++) game.step(DT);
for (let step = 0; step < 120 && game.rules.snapshot().phase === 'settling'; step++) game.step(DT);

console.log('health after:');
for (const s of adapter.snapshot()) {
  const delta = before.get(s.id)! - s.health;
  if (delta > 0 || s.destroyed) console.log(`  ${s.id} ${s.material} hp=${s.health.toFixed(1)}/${s.healthMax} destroyed=${s.destroyed}`);
}
console.log(`birds left: ${game.entities.byKind('bird').map((b) => `${b.id}@(${Math.round(b.x)},${Math.round(b.y)})`).join(' ')}`);
