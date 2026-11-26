import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { LEVELS, loadLevel, levelAt } from '../src/levels/index.ts';

/**
 * Outcome sweep (docs/checklist.md section 3). Re-run before and after each
 * damage/scoring change so tuning is measured, not guessed.
 *
 *   npx esbuild scratch/sweep-probe.ts --bundle --platform=node --format=cjs --outfile=scratch/sweep-probe.cjs
 *   node scratch/sweep-probe.cjs [levelIndex]
 */
const levelIndex = Number(process.argv[2] ?? 0);
const loaded = loadLevel(levelAt(levelIndex));
const DT = 1 / 60;

function oneShot(deg: number, pullLen: number) {
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  const a = (deg * Math.PI) / 180;
  game.beginAim();
  game.dragAim({ x: loaded.cannonOrigin.x - pullLen * Math.cos(a), y: loaded.cannonOrigin.y - pullLen * Math.sin(a) });
  if (!game.releaseAim()) return { fired: false as const };

  let steps = 0;
  while (steps < 400) {
    const phase = game.rules.snapshot().phase;
    if (phase === 'aiming' || phase === 'won' || phase === 'lost') break;
    game.step(DT);
    steps++;
  }
  return {
    fired: true as const,
    phase: game.rules.snapshot().phase,
    killed: game.rules.snapshot().targetsTotal - game.rules.snapshot().targetsAlive,
    // Destroyed bodies leave snapshot() (docs/adr.md D17), so destruction is counted
    // as "blocks that are no longer in the world".
    blocks: loaded.bodies.filter((b) => b.kind === 'block').length - adapter.snapshot().filter((e) => e.kind === 'block').length,
    partial: adapter.snapshot().filter((e) => e.kind === 'block' && e.healthMax !== undefined && e.health < e.healthMax).length,
    steps,
    // 239 steps means the settle timeout cut the round, not genuine rest.
    byTimeout: steps >= 239,
  };
}

let wins = 0, fires = 0, oneShotClears = 0, timeouts = 0, total = 0, kills = 0;
let minBlocks = Infinity, maxBlocks = 0, roundsNoBlock = 0, damagedRounds = 0;
for (let pull = 20; pull <= loaded.maxPull; pull += 5) {
  for (let deg = -40; deg <= 40; deg += 2.5) {
    const r = oneShot(deg, pull);
    total++;
    if (!r.fired) continue;
    fires++;
    kills += r.killed;
    if (r.killed === loaded.targetIds.length) oneShotClears++;
    if (r.phase === 'won') wins++;
    if (r.byTimeout) timeouts++;
    minBlocks = Math.min(minBlocks, r.blocks);
    maxBlocks = Math.max(maxBlocks, r.blocks);
    if (r.blocks === 0) roundsNoBlock++;
    if (r.partial > 0) damagedRounds++;
    if (process.argv[3] === '-v') {
      console.log(`pull ${pull} @ ${deg}deg -> killed ${r.killed}, blocks gone ${r.blocks}, damaged ${r.partial}, phase ${r.phase}, steps ${r.steps}${r.byTimeout ? ' (settle timeout)' : ''}`);
    }
  }
}
console.log(
  `${loaded.def.name}: ${total} combos (pull 20..${loaded.maxPull} step 5, angle -40..40 step 2.5); ` +
    `won ${wins}, one-shot clears ${oneShotClears}, kills ${kills}/${loaded.targetIds.length * total}, ` +
    `blocks gone min=${minBlocks} max=${maxBlocks} none=${roundsNoBlock}, rounds with partial damage ${damagedRounds}, timeouts ${timeouts}`,
);

// Preview cost, for the per-pointermove trajectory recomputation.
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
for (const b of loaded.bodies) adapter.addBody(b);
const t0 = performance.now();
for (let i = 0; i < 100; i++) adapter.simulateTrajectory(loaded.cannonOrigin, { x: 19.8, y: -2 }, 120, 18);
const t1 = performance.now();
console.log(`simulateTrajectory: ${((t1 - t0) / 100).toFixed(2)} ms per call (120 steps, ${loaded.bodies.length} bodies)`);
console.log(`levels bundled: ${LEVELS.length}`);
