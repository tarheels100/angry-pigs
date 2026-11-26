import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';

/**
 * Determinism probe used by `scripts/determinism.js`: the same bundle runs in Node and
 * in Chromium, stepping the game directly (no requestAnimationFrame), and the outcome
 * strings must match. Cross-runtime floating-point drift is what this looks for.
 *
 * Deliberately excludes anything timing-related — no ms, no fps.
 */
export interface Outcome {
  levelId: string;
  pull: number;
  deg: number;
  phase: string;
  birdsKilled: number;
  blocksGone: number;
  launches: number;
  score: number;
  stars: number;
  steps: number;
  frozeAtTimeout: boolean;
}

const DT = 1 / 60;

export function runCombo(levelIndex: number, pull: number, deg: number): Outcome {
  const loaded = loadLevel(levelAt(levelIndex));
  const adapter = createPhysicsAdapter({
    width: loaded.def.bounds.width,
    height: loaded.def.bounds.height,
    gravityY: 1,
    frictionAir: 0.001,
  });
  const bus = createEventBus();
  const game = createGame({ level: loaded, adapter, bus });

  let kills = 0;
  let blocksGone = 0;
  bus.on('destroyed', (e) => {
    if (e.id.startsWith('bird')) kills++;
    if (e.id.startsWith('block')) blocksGone++;
  });

  const rad = (deg * Math.PI) / 180;
  game.beginAim();
  game.dragAim({
    x: loaded.cannonOrigin.x - pull * Math.cos(rad),
    y: loaded.cannonOrigin.y - pull * Math.sin(rad),
  });
  game.releaseAim();

  let steps = 0;
  let frozeAtTimeout = false;
  while (steps < 400) {
    const phase = game.rules.snapshot().phase;
    if (phase === 'aiming' || phase === 'won' || phase === 'lost') break;
    game.step(DT);
    steps++;
    // The settle window expiring is a timeout, not a rest (docs/adr.md D16).
    if (steps >= 240) frozeAtTimeout = true;
  }

  const snap = game.rules.snapshot();
  return {
    levelId: loaded.def.name,
    pull,
    deg,
    phase: snap.phase,
    birdsKilled: kills,
    blocksGone,
    launches: snap.launches,
    score: snap.score,
    stars: snap.stars,
    steps,
    frozeAtTimeout,
  };
}

export const PULLS = [30, 45, 90];
export const ANGLES = [-70, -45, -20, 0, 15, 20, 30, 40];

export function runSweep(levelIndex: number): Outcome[] {
  const outcomes: Outcome[] = [];
  for (const pull of PULLS) {
    for (const deg of ANGLES) outcomes.push(runCombo(levelIndex, pull, deg));
  }
  return outcomes;
}

export function sweepAll(): Outcome[] {
  const outcomes: Outcome[] = [];
  for (let level = 0; level < 3; level++) outcomes.push(...runSweep(level));
  return outcomes;
}
