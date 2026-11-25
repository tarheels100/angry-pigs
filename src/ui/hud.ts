import type { RulesSnapshot } from '../game/rules.ts';

/** HUD overlay drawn in DOM, not canvas. */
export interface Hud {
  update(snapshot: RulesSnapshot | null): void;
  message(text: string | null): void;
}

/** Stub — implemented in M9 with the level select / result UI. */
export function createHud(el: HTMLElement): Hud {
  throw new Error('not implemented: createHud (M9)');
}
