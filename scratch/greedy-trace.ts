import { loadLevel, levelAt } from '../src/levels/index.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';

function run(index: number) {
  const loaded = loadLevel(levelAt(index));
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const bus = createEventBus();
  const game = createGame({ level: loaded, adapter, bus });
  bus.on('destroyed', (e) => console.log(`  destroyed ${e.id} (${e.cause})`));
  bus.on('impact', (e) => console.log(`    impact ${e.aId}-${e.bId} energy ${e.energy.toFixed(1)}`));
  bus.on('launch', (e) => console.log(`    launch ${e.id} v=(${e.velocity.x.toFixed(1)},${e.velocity.y.toFixed(1)})`));
  const tried = new Set<string>();
  for (let shot = 1; shot <= loaded.ammo.length; shot++) {
    const birds = adapter.snapshot().filter((s) => s.kind === 'bird');
    if (birds.length === 0) break;
    const supports = adapter.snapshot().filter((s) => s.kind === 'block' && birds.some((b) => s.y > b.y - 20 && s.y - b.y < 160 && Math.abs(s.x - b.x) < 80));
    const candidates = [...birds, ...supports];
    const origin = loaded.cannonOrigin;
    let best: { pull: number; rad: number; deg: number; dist: number } | null = null;
    for (const pull of [loaded.maxPull, loaded.maxPull * 0.7, loaded.maxPull * 0.45]) {
      const speed = pull * loaded.powerScale;
      for (let deg = -45; deg <= 45; deg += 1) {
        if (tried.has(`${pull}|${deg}`)) continue;
        const rad = (deg * Math.PI) / 180;
        const traj = adapter.simulateTrajectory(origin, { x: speed * Math.cos(rad), y: speed * Math.sin(rad) }, 120, 24);
        for (const p of traj) for (const t of candidates) {
          const dist = Math.hypot(p.x - t.x, p.y - t.y);
          if (!best || dist < best.dist) best = { pull, rad, deg, dist };
        }
      }
    }
    if (!best) { console.log(`  shot ${shot}: no untried candidate`); break; }
    tried.add(`${best.pull}|${best.deg}`);
    console.log(`  shot ${shot}: pull=${best.pull.toFixed(0)} deg=${best.deg} dist=${best.dist.toFixed(1)} targets=${candidates.map((c) => `${c.id}@(${Math.round(c.x)},${Math.round(c.y)})`).join(' ')}`);
    game.beginAim();
    game.dragAim({ x: origin.x - best.pull * Math.cos(best.rad), y: origin.y - best.pull * Math.sin(best.rad) });
    game.releaseAim();
    for (let i = 0; i < 720; i++) { game.step(1 / 60); if (game.rules.snapshot().phase !== 'in_flight') break; }
  }
  const left = adapter.snapshot().filter((b) => b.kind === 'bird').map((b) => `${b.id}@(${Math.round(b.x)},${Math.round(b.y)})`);
  console.log(`${loaded.def.name}: birds left=${left.join(' ') || 'none'} phase=${game.rules.snapshot().phase}`);
}
run(Number(process.argv[2] ?? 1));
