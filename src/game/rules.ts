import type { Vec2 } from '../core/types.ts';

/** Gameplay rules contract — implemented in M8. M7 deliberately has no rules. */

export type Phase = 'aiming' | 'in_flight' | 'settling' | 'won' | 'lost' | 'no_ammo';

export interface RulesSnapshot {
  phase: Phase;
  ammoLeft: number;
  targetsAlive: number;
  score: number;
  launches: number;
}

export interface GameRules {
  snapshot(): RulesSnapshot;
  /** Fired on `impact`: decide damage and whether a target dies. */
  onImpact(aId: string, bId: string, energy: number, point: Vec2): void;
  /** Fired when the world settles after a launch. */
  onSettled(timedOut: boolean): void;
  restart(): void;
}

/** Stub — implemented in M8. */
export function createGameRules(): GameRules {
  throw new Error('not implemented: createGameRules (M8)');
}
