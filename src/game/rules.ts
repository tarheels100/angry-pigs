import type { GamePhase } from '../core/types.ts';

/** Gameplay rules: the phase machine plus ammo/score bookkeeping. Damage maths
 * (thresholds, crush detection, stars) is tuned in M8; the transitions below are
 * the M7 slice mechanics. The phase vocabulary is core GamePhase (M5): exhaustion
 * is reported as `lost`, there is no separate `no_ammo` phase. */

/** The phase machine vocabulary lives in core so event payloads stay typed (M5). */
export type Phase = GamePhase;

export interface RulesSnapshot {
  phase: Phase;
  ammoLeft: number;
  targetsAlive: number;
  score: number;
  launches: number;
  targetsTotal: number;
}

export interface GameRules {
  snapshot(): RulesSnapshot;
  /** Reset for a level: which ids count as targets, and how many pigs are available. */
  loadLevel(targetIds: string[], ammo: number): void;
  /** aiming -> in_flight (one ammo consumed). */
  launch(): void;
  /** in_flight -> settling (all pigs consumed). */
  pigsSettled(): void;
  /** settling -> won | aiming | lost. */
  worldSettled(won: boolean): void;
  targetDestroyed(id: string): void;
  restart(): void;
}

/** Score per destroyed target; tuned in M8 (docs/tuning.md). */
const SCORE_PER_TARGET = 1000;

export function createRules(initial: { targetIds: string[]; ammo: string[] }): GameRules {
  const budget = { targets: initial.targetIds.length, ammo: initial.ammo.length };
  let targets = new Set<string>();
  let snap: RulesSnapshot = {
    phase: 'ready',
    ammoLeft: 0,
    targetsAlive: 0,
    targetsTotal: 0,
    score: 0,
    launches: 0,
  };
  const destroyed = new Set<string>();

  return {
    snapshot: () => ({ ...snap }),
    loadLevel(targetIds, ammo) {
      loadLevel(targetIds, ammo);
    },
    launch() {
      if (snap.phase !== 'aiming' || snap.ammoLeft <= 0) return;
      snap = { ...snap, phase: 'in_flight', ammoLeft: snap.ammoLeft - 1, launches: snap.launches + 1 };
    },
    pigsSettled() {
      if (snap.phase !== 'in_flight') return;
      snap = { ...snap, phase: 'settling' };
    },
    worldSettled(won) {
      if (snap.phase !== 'settling') return;
      if (won) {
        snap = { ...snap, phase: 'won' };
        return;
      }
      snap = snap.ammoLeft > 0 ? { ...snap, phase: 'aiming' } : { ...snap, phase: 'lost' };
    },
    targetDestroyed(id) {
      // Blocks and balls are destroyed too; only ids registered as targets count.
      if (!targets.has(id) || destroyed.has(id)) return;
      destroyed.add(id);
      snap = { ...snap, targetsAlive: Math.max(0, snap.targetsAlive - 1), score: snap.score + SCORE_PER_TARGET };
    },
    restart() {
      loadLevel([...targets], budget.ammo);
    },
  };

  function loadLevel(targetIds: string[], ammo: number): void {
    destroyed.clear();
    targets = new Set(targetIds);
    snap = {
      phase: 'aiming',
      ammoLeft: ammo,
      targetsAlive: targetIds.length,
      targetsTotal: targetIds.length,
      score: 0,
      launches: 0,
    };
  }
}
