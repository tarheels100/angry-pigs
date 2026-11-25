/** Fixed simulation step. Physics must be deterministic, so tests assert by step count. */
export const FIXED_DT = 1 / 60;

/** A frame may not run more than this many physics steps; beyond that the surplus
 * time is discarded rather than spiralling into an unbounded catch-up. */
export const MAX_STEPS_PER_FRAME = 5;

export interface LoopOptions {
  step(dt: number): void;
  render(dt: number): void;
  fixedDt?: number;
  maxStepsPerFrame?: number;
}

export interface Loop {
  /** Drive one frame from a real clock (rAF delta). */
  tick(frameSeconds: number): void;
  /** Drive N deterministic steps; used by headless tests and replays. */
  advance(seconds: number): void;
  start(): void;
  stop(): void;
  stepsTaken(): number;
}

/**
 * Fixed-timestep accumulator loop. Variable-rate stepping makes Matter behaviour
 * frame-rate dependent, so `step` is always called with the same dt (M5).
 */
export function createLoop(options: LoopOptions): Loop {
  const dt = options.fixedDt ?? FIXED_DT;
  const maxSteps = options.maxStepsPerFrame ?? MAX_STEPS_PER_FRAME;
  let accumulator = 0;
  let steps = 0;
  let rafId = 0;
  let lastTime = 0;
  let running = false;

  function runSteps(frameSeconds: number) {
    accumulator += frameSeconds;
    let executed = 0;
    while (accumulator >= dt && executed < maxSteps) {
      options.step(dt);
      accumulator -= dt;
      steps++;
      executed++;
    }
    // Drop surplus time (tab was backgrounded, long frame) so we never spiral.
    if (executed === maxSteps && accumulator > dt) accumulator = 0;
    options.render(frameSeconds);
  }

  function frame(now: number) {
    if (!running) return;
    if (lastTime === 0) lastTime = now;
    const frameSeconds = Math.min((now - lastTime) / 1000, 1);
    lastTime = now;
    runSteps(frameSeconds);
    rafId = requestAnimationFrame(frame);
  }

  return {
    tick: runSteps,
    advance(seconds) {
      const whole = Math.floor(seconds / dt);
      for (let i = 0; i < whole; i++) {
        options.step(dt);
        steps++;
      }
      accumulator += seconds - whole * dt;
      options.render(seconds);
    },
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
    stepsTaken: () => steps,
  };
}
