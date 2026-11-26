// Scratch probe (M20): the greedy bot over all six stages, recording blast counts and
// stars so docs/tuning.md can quote per-stage difficulty and the browser tests can quote
// a winning aim. Throwaway; not part of the game.
import { createGame } from '../src/game/game.ts';
import { LEVELS, levelAt, loadLevel } from '../src/levels/index.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import type { Game } from '../src/game/game.ts';

interface BotShot {
  pull: number;
  deg: number;
  birdsLeft: number;
  blocksLeft: number;
  explosions: number;
}

function playStage(index: number): { name: string; shots: BotShot[]; stars: number; phase: string } {
  const level = loadLevel(levelAt(index));
  const game: Game = createGame({
    level,
    adapter: createPhysicsAdapter({ width: level.def.bounds.width, height: level.def.bounds.height, gravityY: 1, frictionAir: 0.001 }),
    bus: createEventBus(),
  });
  const rules = game.rules;
  const origin = game.cannon.config().origin;
  let explosions = 0;
  game.bus.on('explosion', () => explosions++);
  const shots: BotShot[] = [];

  for (;;) {
    const phase = rules.snapshot().phase;
    if (phase !== 'aiming' && phase !== 'settling') break;
    const targets = game.adapter.snapshot().filter((b) => b.kind === 'bird');
    if (targets.length === 0) break;

    const supports = game.adapter
      .snapshot()
      .filter((b) => b.kind === 'block' && targets.some((t) => b.y > t.y - 20 && b.y - t.y < 160 && Math.abs(b.x - t.x) < 80));
    const candidates = [...targets, ...supports];
    const cfg = game.cannon.config();
    let best: { pull: number; deg: number; score: number } | null = null;
    for (const pull of [cfg.maxPull, cfg.maxPull * 0.7, cfg.maxPull * 0.45]) {
      const speed = pull * cfg.powerScale;
      for (let deg = -45; deg <= 45; deg += 5) {
        const rad = (deg * Math.PI) / 180;
        const path = game.adapter.simulateTrajectory(origin, { x: speed * Math.cos(rad), y: speed * Math.sin(rad) }, 120, 20);
        let nearest = Infinity;
        for (const p of path) for (const c of candidates) nearest = Math.min(nearest, Math.hypot(p.x - c.x, p.y - c.y));
        if (!best || -nearest > best.score) best = { pull, deg, score: -nearest };
      }
    }
    if (!best) break;

    game.beginAim();
    game.dragAim({
      x: origin.x - best.pull * Math.cos((best.deg * Math.PI) / 180),
      y: origin.y - best.pull * Math.sin((best.deg * Math.PI) / 180),
    });
    game.releaseAim();
    let steps = 0;
    while (rules.snapshot().phase === 'in_flight' && steps < 400) {
      game.step(1 / 60);
      steps++;
    }
    for (let i = 0; i < 200 && rules.snapshot().phase !== 'won' && rules.snapshot().phase !== 'lost'; i++) game.step(1 / 60);

    shots.push({
      pull: best.pull,
      deg: best.deg,
      birdsLeft: game.entities.byKind('bird').length,
      blocksLeft: game.entities.byKind('block').length,
      explosions,
    });
    if (rules.snapshot().phase === 'lost') break;
  }
  // A win is decided once the pigs settle (docs/adr.md D15); give the round that chance.
  for (let i = 0; i < 240 && rules.snapshot().phase === 'settling'; i++) game.step(1 / 60);

  return { name: levelAt(index).name, shots, stars: rules.snapshot().stars, phase: rules.snapshot().phase };
}

for (let i = 0; i < LEVELS.length; i++) {
  const r = playStage(i);
  console.log(`${r.name}: ${r.shots.length}/${LEVELS[i]!.cannon.ammo.length} pigs, stars=${r.stars}, phase=${r.phase}`);
  for (const s of r.shots) {
    console.log(`  shot pull=${s.pull} deg=${s.deg} birds=${s.birdsLeft} blocks=${s.blocksLeft} blasts=${s.explosions}`);
  }
}
