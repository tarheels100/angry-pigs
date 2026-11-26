/**
 * Procedural soundtrack (M17).
 *
 * A Tron-ish track is *generated*, not shipped: the level id and a seed pick a tempo,
 * waveform, and scale, and a seeded PRNG writes the note sequence. There is no audio file,
 * so the single-file artifact stays self-contained (docs/deployment.md), and each stage
 * gets its own flavour.
 *
 * Note generation is separate from playback. `tick()` advances by an injected clock, so
 * headless tests can assert the sequence is deterministic (docs/checklist.md §2) without
 * an AudioContext.
 */

// The soundtrack shares sfx's minimal audio interface (docs/architecture.md layering):
// one context, one shape, no second copy of the WebAudio contract.
export type { AudioContextLike, AudioContextFactory } from '../audio/sfx.ts';
import type { AudioContextLike } from '../audio/sfx.ts';

export interface MusicNote {
  /** Step index within the track (eighth notes). */
  step: number;
  /** Semitones from the flavour's root. */
  semitone: number;
  gain: number;
  durationMs: number;
  waveform: string;
}

export interface MusicFlavour {
  name: string;
  bpm: number;
  waveform: string;
  /** Semitone offsets of the scale used by this flavour. */
  scale: number[];
  /** Base frequency in Hz. */
  root: number;
}

export interface MusicPlayer {
  /** Begin a track for a level. Same level + seed gives the same sequence. */
  start(levelId: string, seed?: number): void;
  stop(): void;
  /** Advance the scheduler; call once per fixed step with elapsed time. */
  tick(nowMs: number): void;
  playing(): boolean;
  flavour(): MusicFlavour | null;
  /** Notes emitted so far, newest last (bounded, for tests and the HUD). */
  notes(): MusicNote[];
  /** Silence output without forgetting the track (options screen, M19). */
  setMuted(muted: boolean): void;
  dispose(): void;
}

const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
/** Minor-ish scales that read as electronic, from docs/post-m13-notes.md §2. */
const SCALES: number[][] = [
  [0, 3, 5, 7, 10, 12],
  [0, 2, 3, 7, 8, 12],
  [0, 4, 7, 9, 11, 14],
];

/** Stable hash of a level id, so a stage always gets the same flavour. */
export function hashLevel(levelId: string): number {
  let h = 2166136261;
  for (const c of levelId) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32). Deterministic, so a recorded run replays identically. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function flavourFor(levelId: string): MusicFlavour {
  const h = hashLevel(levelId);
  // Unsigned shifts: hashLevel returns a uint32, and signed >> would go negative.
  const waveform = WAVES[h % WAVES.length]!;
  const scale = SCALES[(h >>> 3) % SCALES.length]!;
  return {
    name: `${waveform}-${(h % 4096).toString(36).padStart(3, '0')}`,
    bpm: 92 + (h >>> 5) % 34,
    waveform,
    scale,
    root: 55 + (h >>> 7) % 14,
  };
}

/** Next note of the track. Bass on the downbeats, arpeggio in between, no fixed loop. */
function nextNote(rand: () => number, step: number, flavour: MusicFlavour): MusicNote {
  const stepMs = (60_000 / flavour.bpm) / 2; // eighth notes
  const isDownbeat = step % 4 === 0;
  const degree = isDownbeat
    ? Math.floor(rand() * 2) // bass sits low
    : Math.floor(rand() * flavour.scale.length);
  const octave = isDownbeat ? 0 : rand() < 0.35 ? 12 : 0;
  return {
    step,
    semitone: flavour.scale[degree]! + octave,
    gain: isDownbeat ? 0.08 : 0.045 + rand() * 0.03,
    durationMs: stepMs * (isDownbeat ? 1.6 : 0.9),
    waveform: flavour.waveform,
  };
}

const NOTE_HISTORY = 128;

export function createMusic(options: {
  /** Audio context factory, or null/undefined in headless environments. */
  createContext?: () => AudioContextLike | null;
  clock?: () => number;
  seed?: number;
}): MusicPlayer {
  // The scheduler works in the same simulated milliseconds tick() is called with, so a
  // track starts at time 0 rather than at wall-clock time. options.clock exists for tests.
  const baseClock = options.clock ?? (() => 0);
  const defaultSeed = options.seed ?? 0x5f3759df;

  let ctx: AudioContextLike | null = null;
  let flavour: MusicFlavour | null = null;
  let rand: (() => number) | null = null;
  let step = 0;
  let nextTime = 0;
  let playing = false;
  let muted = false;
  let notes: MusicNote[] = [];

  function play(note: MusicNote): void {
    if (!ctx || muted || !flavour) return;
    // The context clock is in seconds and starts at 0; schedule from its own time so a
    // note never lands in the past when the page clock is wall-clock time.
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = note.waveform;
    osc.frequency.setValueAtTime(flavour.root * Math.pow(2, note.semitone / 12), now);
    const gain = ctx.createGain();
    gain.gain.value = note.gain;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + note.durationMs / 1000);
  }

  return {
    start(levelId, seed = defaultSeed) {
      flavour = flavourFor(levelId);
      rand = prng(hashLevel(levelId) ^ seed);
      step = 0;
      nextTime = baseClock();
      // baseClock defaults to 0; tick() is driven by simulated time (main.ts).
      notes = [];
      playing = true;
      // Reuse the audio context the first gesture unlocked; browsers reject audio before it.
      ctx = options.createContext?.() ?? null;
    },
    stop() {
      playing = false;
    },
    tick(nowMs) {
      if (!playing || !flavour || !rand) return;
      if (!ctx) ctx = options.createContext?.() ?? null;
      const stepMs = (60_000 / flavour.bpm) / 2;
      // Catch up at most one note per tick so a stalled tab cannot spam the audio queue.
      if (nowMs >= nextTime) {
        const note = nextNote(rand, step, flavour);
        notes.push(note);
        if (notes.length > NOTE_HISTORY) notes.shift();
        play(note);
        step++;
        nextTime += stepMs;
      }
    },
    playing: () => playing,
    flavour: () => flavour,
    notes: () => notes.map((n) => ({ ...n })),
    setMuted(value) {
      muted = value;
    },
    dispose() {
      playing = false;
      ctx = null;
    },
  };
}
