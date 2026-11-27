import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import type { LoadedLevel } from '../src/levels/index.ts';

const DT = 1 / 60;

/** Where a pig ends up, and the path it flew. */
export interface ShotOutcome {
  /** Farthest x the pig reached. */
  peakX: number;
  /** Highest point (smallest y) the pig reached. */
  apexY: number;
  /** x at the first ground contact, or null if the pig left the world / never touched ground. */
  landX: number | null;
  /** Positions while airborne, in order. Consecutive samples give direction (y rising = falling). */
  path: { x: number; y: number }[];
}

/** Fire one gesture in an empty world (ground only) and record the trajectory. */
function fire(loaded: LoadedLevel, pull: number, deg: number): ShotOutcome {
  const game = createGame({
    level: loaded,
    adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }),
    bus: createEventBus(),
  });
  const origin = loaded.cannonOrigin;
  const rad = (deg * Math.PI) / 180;
  game.beginAim();
  game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
  game.releaseAim();
  let peakX = 0;
  let apexY = 9999;
  let landX: number | null = null;
  const path: { x: number; y: number }[] = [];
  for (let step = 0; step < 400; step++) {
    game.step(DT);
    const pigs = game.entities.byKind('pig');
    if (pigs.length === 0) break;
    for (const pig of pigs) {
      if (pig.x > peakX) peakX = pig.x;
      if (pig.y < apexY) apexY = pig.y;
      // A pig near the ground surface counts as a landing point.
      if (pig.y > 790 && landX === null) landX = pig.x;
      path.push({ x: pig.x, y: pig.y });
    }
  }
  return { peakX, apexY, landX, path };
}

/**
 * The reach table: every (pull, angle) the player can drag, and where the pig ends up. Used by
 * `greedy-probe.ts` to aim at shelter roofs, and recorded in docs/tuning.md as the measured
 * reach of the launcher at the current `powerScale`.
 */
export function reachTable(loaded: LoadedLevel): { pull: number; deg: number; outcome: ShotOutcome }[] {
  const rows: { pull: number; deg: number; outcome: ShotOutcome }[] = [];
  for (const pull of [45, 63, 90]) {
    for (const deg of [-40, -30, -20, -10, 0, 10, 20, 30]) {
      rows.push({ pull, deg, outcome: fire(loaded, pull, deg) });
    }
  }
  return rows;
}

/**
 * The best (pull, deg) whose *descending* path crosses near (x, y). A shot reaches a roof only
 * if the pig is falling through the roof plane at that x — flying over a roof at speed does not
 * crush it. Returns null when nothing in the table can reach the point.
 */
export function bestShot(rows: { pull: number; deg: number; outcome: ShotOutcome }[], x: number, y: number): { pull: number; deg: number } | null {
  let best: { pull: number; deg: number } | null = null;
  let bestScore = Infinity;
  for (const row of rows) {
    let score = Infinity;
    for (let i = 1; i < row.outcome.path.length; i++) {
      const prev = row.outcome.path[i - 1]!;
      const cur = row.outcome.path[i]!;
      // Falling, and crossing the aim plane between the two samples.
      if (cur.y <= prev.y) continue;
      if (prev.y > y || cur.y < y) continue;
      score = Math.min(score, Math.abs(cur.x - x));
    }
    // Fallback for a bird on open ground: a shot that lands near it.
    if (row.outcome.landX !== null) score = Math.min(score, Math.abs(row.outcome.landX - x) + 40);
    if (score < bestScore) {
      bestScore = score;
      best = { pull: row.pull, deg: row.deg };
    }
  }
  return best;
}
