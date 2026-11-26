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
  /** Shots actually fired (a click with no drag spends nothing). */
  launches: number;
  targetsTotal: number;
  /** Meaningful only when phase === 'won'. */
  stars: number;
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

/**
 * Stars are derived from how many shots the level took, from the Stage 01 sweep
 * (docs/checklist.md section 3): clearing 2 targets in one shot happened in 6 of 51
 * pull combinations, so one-shot clears are rare and earn three stars. The rule is
 * proportional to target count rather than hardcoded to Stage 01.
 */
export function starsFor(launches: number, targetsTotal: number): number {
  if (targetsTotal === 0) return 3;
  const oneShotBudget = Math.max(1, Math.ceil(targetsTotal / 2));
  if (launches <= oneShotBudget) return 3;
  if (launches <= targetsTotal) return 2;
  return 1;
}

export function createRules(initial: { targetIds: string[]; ammo: string[] }): GameRules {
  const budget = { targets: initial.targetIds.length, ammo: initial.ammo.length };
  /** The level's targets as authored; a restart restores these, not the survivors. */
  const authoredTargets = [...initial.targetIds];
  let targets = new Set<string>();
  let snap: RulesSnapshot = {
    phase: 'ready',
    ammoLeft: 0,
    targetsAlive: 0,
    targetsTotal: 0,
    score: 0,
    launches: 0,
    stars: 0,
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
        snap = { ...snap, phase: 'won', stars: starsFor(snap.launches, snap.targetsTotal) };
        return;
      }
      snap = snap.ammoLeft > 0 ? { ...snap, phase: 'aiming', stars: 0 } : { ...snap, phase: 'lost', stars: 0 };
    },
    targetDestroyed(id) {
      // Blocks and balls are destroyed too; only ids registered as targets count.
      if (!targets.has(id) || destroyed.has(id)) return;
      destroyed.add(id);
      snap = { ...snap, targetsAlive: Math.max(0, snap.targetsAlive - 1), score: snap.score + SCORE_PER_TARGET };
    },
    restart() {
      loadLevel([...authoredTargets], budget.ammo);
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
      stars: 0,
    };
  }
}
