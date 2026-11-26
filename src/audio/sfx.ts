import type { EventBus } from '../core/eventBus.ts';

/**
 * Minimal WebAudio surface so headless tests can inject a fake (docs/adr.md D18 keeps
 * audio out of the determinism path). Shared by sfx and the soundtrack (M17), so there is
 * one contract rather than two copies. Ramp methods are optional: a fake may omit them.
 */
export interface ParamLike {
  setValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime?(v: number, t: number): void;
}

export interface GainNodeLike {
  gain: ParamLike & { value: number };
  connect(destination: unknown): void;
}

export interface OscillatorNodeLike {
  type: string;
  frequency: ParamLike;
  connect(node: GainNodeLike): void;
  start(t: number): void;
  stop(t: number): void;
}

export interface AudioContextLike {
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  destination: unknown;
  currentTime: number;
}

export type AudioContextFactory = () => AudioContextLike | null;

export interface Sfx {
  /** Subscribe to game events. Sounds are derived from events, never from polling. */
  attach(bus: EventBus): void;
  setMuted(muted: boolean): void;
  muted(): boolean;
  /** Create/resume the audio context on a user gesture; null when audio is unavailable. */
  unlock(): AudioContextLike | null;
  dispose(): void;
}

/** Tone recipe: frequency sweep plus a gain envelope. */
interface Blip {
  type: OscillatorType;
  from: number;
  to: number;
  seconds: number;
  gain: number;
}

const BLIPS: Record<string, Blip> = {
  launch: { type: 'sawtooth', from: 240, to: 520, seconds: 0.12, gain: 0.22 },
  impact: { type: 'square', from: 160, to: 70, seconds: 0.08, gain: 0.12 },
  destroyed: { type: 'triangle', from: 520, to: 120, seconds: 0.2, gain: 0.24 },
  won: { type: 'triangle', from: 440, to: 880, seconds: 0.35, gain: 0.26 },
  lost: { type: 'sawtooth', from: 220, to: 90, seconds: 0.4, gain: 0.22 },
  // Bomb detonation (M18): a low thud with a fast drop.
  explosion: { type: 'square', from: 90, to: 40, seconds: 0.3, gain: 0.3 },
};

/** The browser's AudioContext, or null in a headless environment. */
function browserAudio(): AudioContextLike | null {
  const w = window as unknown as { AudioContext?: new () => AudioContextLike };
  if (!w.AudioContext) return null;
  try {
    return new w.AudioContext();
  } catch {
    return null;
  }
}

/**
 * Procedural sound (M11): oscillator blips, no audio assets, so the shipped artifact
 * stays a single file. The context is created lazily on the first gesture because
 * browsers reject audio before one.
 */
export function createSfx(factory: AudioContextFactory = browserAudio): Sfx {
  let ctx: AudioContextLike | null = null;
  let muted = false;
  const unsubscribes: Array<() => void> = [];

  function play(blip: Blip, gainScale = 1): void {
    if (muted || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = blip.type;
    osc.frequency.setValueAtTime(blip.from, now);
    if (osc.frequency.exponentialRampToValueAtTime) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, blip.to), now + blip.seconds);
    } else {
      osc.frequency.setValueAtTime(Math.max(1, blip.to), now + blip.seconds);
    }
    gain.gain.value = blip.gain * gainScale;
    if (gain.gain.exponentialRampToValueAtTime) {
      gain.gain.setValueAtTime(blip.gain * gainScale, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + blip.seconds);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + blip.seconds);
  }

  return {
    attach(bus) {
      unsubscribes.push(
        bus.on('launch', () => play(BLIPS.launch!)),
        bus.on('impact', (e) => {
          // Loudness follows impact energy, capped so a crush is not a wall of noise.
          play(BLIPS.impact!, Math.min(1, 0.25 + e.energy / 400));
        }),
        bus.on('destroyed', () => play(BLIPS.destroyed!)),
        bus.on('explosion', () => play(BLIPS.explosion!)),
        bus.on('levelWon', () => play(BLIPS.won!)),
        bus.on('levelLost', () => play(BLIPS.lost!)),
      );
    },
    setMuted(next) {
      muted = next;
    },
    muted: () => muted,
    unlock() {
      if (!ctx) ctx = factory();
      if (ctx) resume(ctx);
      return ctx;
    },
    dispose() {
      for (const off of unsubscribes) off();
      unsubscribes.length = 0;
      ctx = null;
    },
  };
}

function resume(ctx: AudioContextLike): void {
  const c = ctx as unknown as { resume?: () => void | Promise<unknown> };
  try {
    c.resume?.();
  } catch {
    /* a rejected resume is not a reason to crash the game loop */
  }
}
