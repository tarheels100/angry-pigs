import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS, type LoadedLevel } from '../src/levels/index.ts';

const DT = 1 / 60;

/**
 * Greedy bot with replay search (docs/tuning.md). This is the solvability gate for the
 * sheltered M21 stages: a bird cannot be hit directly (level rule 1), so the bot has to find
 * shots that break structure.
 *
 * Strategy: at each shot, replay the shots already taken in a fresh game (the simulation is
 * deterministic, so a replay reproduces the current world), try every (pull, angle) the player
 * can drag, and commit the candidate that kills the most birds. Cost is a few hundred thousand
 * steps per stage, which is fine for a probe but too slow for the shipped game.
 */
interface Plan {
  pull: number;
  deg: number;
}

/** Fire one gesture and settle, returning birds and blocks destroyed by that shot. */
function play(loaded: LoadedLevel, shots: Plan[]): { birdsLeft: number; blocksLeft: number } {
  const game = createGame({
    level: loaded,
    adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }),
    bus: createEventBus(),
  });
  const origin = loaded.cannonOrigin;
  for (const shot of shots) {
    if (game.rules.snapshot().phase !== 'aiming' && game.rules.snapshot().phase !== 'settling') break;
    const rad = (shot.deg * Math.PI) / 180;
    game.beginAim();
    game.dragAim({ x: origin.x - shot.pull * Math.cos(rad), y: origin.y - shot.pull * Math.sin(rad) });
    game.releaseAim();
    for (let step = 0; step < 300 && game.rules.snapshot().phase === 'in_flight'; step++) game.step(DT);
    for (let step = 0; step < 150 && game.rules.snapshot().phase === 'settling'; step++) game.step(DT);
  }
  return { birdsLeft: game.entities.byKind('bird').length, blocksLeft: game.entities.byKind('block').length };
}

const PULLS = [90, 75, 63, 45, 32];
const DEGS = [-45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5];

function solve(levelIndex: number): { shots: Plan[]; cleared: boolean; birdsLeft: number } {
  const loaded = loadLevel(LEVELS[levelIndex]!);
  const budget = loaded.def.cannon.ammo.length;
  const plan: Plan[] = [];
  for (let i = 0; i < budget; i++) {
    let best: Plan | null = null;
    let bestScore = { birdsLeft: Infinity, blocksLeft: Infinity };
    for (const pull of PULLS) {
      for (const deg of DEGS) {
        const candidate = [...plan, { pull, deg }];
        const result = play(loaded, candidate);
        if (result.birdsLeft < bestScore.birdsLeft || (result.birdsLeft === bestScore.birdsLeft && result.blocksLeft < bestScore.blocksLeft)) {
          bestScore = result;
          best = { pull, deg };
        }
      }
    }
    if (!best) break;
    plan.push(best);
    if (bestScore.birdsLeft === 0) return { shots: plan, cleared: true, birdsLeft: 0 };
  }
  return { shots: plan, cleared: false, birdsLeft: bestRemaining(loaded, plan) };
}

function bestRemaining(loaded: LoadedLevel, plan: Plan[]): number {
  return play(loaded, plan).birdsLeft;
}

for (let i = 0; i < LEVELS.length; i++) {
  const result = solve(i);
  const ammo = LEVELS[i]!.cannon.ammo.length;
  console.log(
    `stage-${String(i + 1).padStart(2, '0')}: ${result.shots.length}/${ammo} pigs, cleared=${result.cleared}${result.cleared ? '' : `, birds left=${result.birdsLeft}`}`,
  );
  console.log(`  plan: ${result.shots.map((s) => `${s.pull}@${s.deg}`).join(' ')}`);
}
