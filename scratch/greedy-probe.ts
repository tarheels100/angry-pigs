/** Scratch probe: does the greedy bot clear each stage within its ammo?
 * Run: npx esbuild scratch/greedy-probe.ts --bundle --platform=node --format=cjs --outfile=scratch/greedy-probe.cjs && node scratch/greedy-probe.cjs
 *
 * The bot aims at birds *and at the structure supporting a bird*, because that is what
 * a player does: hitting a pedestal column or a tower leg kills the bird above it
 * (docs/level-format.md design rules).
 */
import { LEVELS, loadLevel, levelAt } from '../src/levels/index.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';

function greedy(index: number) {
  const loaded = loadLevel(levelAt(index));
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  let shots = 0;
  const log: string[] = [];
  /** Shots already fired; repeating one that killed nothing wastes ammo. */
  const tried = new Set<string>();
  while (adapter.snapshot().some((s) => s.kind === 'bird') && shots < loaded.ammo.length) {
    const birds = adapter.snapshot().filter((s) => s.kind === 'bird');
    // Aim candidates: a bird, or any block sitting under/next to a living bird.
    const supports = adapter.snapshot().filter(
      (s) => s.kind === 'block' && birds.some((b) => s.y > b.y - 20 && s.y - b.y < 160 && Math.abs(s.x - b.x) < 80),
    );
    const candidates = [...birds, ...supports];
    const origin = loaded.cannonOrigin;
    let best: { pull: number; rad: number; dist: number } | null = null;
    for (const pull of [loaded.maxPull, loaded.maxPull * 0.7, loaded.maxPull * 0.45]) {
      const speed = pull * loaded.powerScale;
      for (let deg = -45; deg <= 45; deg += 1) {
        const rad = (deg * Math.PI) / 180;
        if (tried.has(`${pull}|${deg}`)) continue;
        const traj = adapter.simulateTrajectory(origin, { x: speed * Math.cos(rad), y: speed * Math.sin(rad) }, 120, 24);
        for (const p of traj) {
          for (const target of candidates) {
            const dist = Math.hypot(p.x - target.x, p.y - target.y);
            if (!best || dist < best.dist) best = { pull, rad, dist };
          }
        }
      }
    }
    if (!best) {
      log.push(`  no untried reachable bird with ${birds.map((b) => `${b.id}@(${Math.round(b.x)},${Math.round(b.y)})`).join(' ')}`);
      break;
    }
    tried.add(`${best.pull}|${Math.round((best.rad * 180) / Math.PI)}`);
    game.beginAim();
    game.dragAim({ x: origin.x - best.pull * Math.cos(best.rad), y: origin.y - best.pull * Math.sin(best.rad) });
    game.releaseAim();
    for (let i = 0; i < 720; i++) {
      game.step(1 / 60);
      if (game.rules.snapshot().phase !== 'in_flight') break;
    }
    shots++;
    log.push(`  shot ${shots}: pull=${best.pull.toFixed(0)} deg=${((best.rad * 180) / Math.PI).toFixed(0)} closest=${best.dist.toFixed(0)} birds left=${adapter.snapshot().filter((s) => s.kind === 'bird').length} blocks left=${adapter.snapshot().filter((s) => s.kind === 'block').length} phase=${game.rules.snapshot().phase}`);
  }
  const left = adapter.snapshot().filter((s) => s.kind === 'bird').map((b) => `${b.id}@(${Math.round(b.x)},${Math.round(b.y)})`);
  console.log(`${loaded.def.name}: ${shots}/${loaded.ammo.length} pigs, birds left=${left.join(' ') || 'none'}`);
  for (const line of log) console.log(line);
}

for (let i = 0; i < LEVELS.length; i++) greedy(i);
