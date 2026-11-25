import type { Vec2 } from './types.ts';

/** Events emitted by the simulation; the renderer and rules react to these only. */
export interface GameEventMap {
  launch: { projectileId: string; origin: Vec2; velocity: Vec2 };
  impact: { aId: string; bId: string; point: Vec2; energy: number };
  destroyed: { id: string; byId: string; energy: number };
  settled: { steps: number; timedOut: boolean };
  win: { score: number; ammoLeft: number };
  lose: { targetsAlive: number; ammoLeft: number };
}

export type GameEventName = keyof GameEventMap;

export interface EventBus {
  on<N extends GameEventName>(name: N, handler: (payload: GameEventMap[N]) => void): () => void;
  emit<N extends GameEventName>(name: N, payload: GameEventMap[N]): void;
}

/** Stub — implemented in M5. */
export function createEventBus(): EventBus {
  throw new Error('not implemented: createEventBus (M5)');
}
