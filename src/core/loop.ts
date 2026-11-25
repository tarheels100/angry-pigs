/**
 * Fixed-timestep loop. Physics is stepped at a fixed dt so simulation outcomes
 * are deterministic; rendering happens once per frame regardless of step count.
 */

export const FIXED_DT = 1 / 60;

export interface LoopHooks {
  step(dt: number): void;
  render(): void;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** Advance exactly `n` fixed steps with no rendering. Used by headless tests. */
  advance(n: number): void;
  steps: number;
  paused: boolean;
}

/** Stub — implemented in M5. */
export function createLoop(hooks: LoopHooks, dt: number = FIXED_DT): Loop {
  throw new Error('not implemented: createLoop (M5)');
}
