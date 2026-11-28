/**
 * Deterministic track composition (game layer).
 *
 * The music is *authored by data*, not recorded: a stage's name and a seed pick a tempo, a
 * scale, a chord progression and a melody line. Tonal supplies the pitch grammar (degrees,
 * scales, chords), so melodies are real note names rather than random frequencies
 * (docs/adr.md D40). The simulation never imports this file, and neither does Tone.js:
 * playback lives in the presentation layer (`src/audio/playback.ts`).
 */

import { Chord, Midi, Note, Scale } from 'tonal';

/** FNV-1a over the level name: stable across runtimes, no floating point involved. */
export function hashLevel(levelId: string): number {
  let h = 0x811d5be5;
  for (let i = 0; i < levelId.length; i++) {
    h ^= levelId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). Seeded per stage, so a reload replays the same track. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scale tables, exported so a track author and the validator can check a scale id. */
export const SCALE_TYPES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** Chord degrees relative to the root, in a progression shape per stage. */
const PROGRESSIONS = [
  [1, 6, 3, 7], // i - VI - III - VII
  [1, 4, 5, 1], // i - iv - V - i
  [1, 3, 7, 6], // i - III - VII - VI
  [1, 5, 6, 4], // i - V - VI - iv
] as const;

export interface TrackSpec {
  /** The stage this track belongs to. */
  levelId: string;
  /** Short display name shown in the HUD. */
  name: string;
  seed: number;
  bpm: number;
  /** Root note letter, e.g. "A". */
  root: string;
  scaleType: string;
  /** Chord names for the progression, e.g. ["A minor", "F major"]. */
  chords: string[];
  /**
   * Scale degrees (1-based) for the melody, **one entry per eighth-note slot** of the loop.
   * `0` is a rest, so a rhythm pattern keeps its shape; degrees above the scale length wrap
   * into the octave above.
   */
  melody: number[];
  /** Scale degrees for the bass, one per bar. */
  bass: number[];
  /** Bars the loop lasts; playback cycles this forever. */
  bars: number;
  /** Voice gains, 0..1. Omitted means the playback default (0.5 lead, 0.35 bass). */
  leadGain?: number;
  bassGain?: number;
  /** Note length as a fraction of an eighth-note slot. Omitted means 1.6 lead, 6 bass. */
  leadNote?: number;
  bassNote?: number;
}

/** Stage name -> track spec. Pure and deterministic: the same inputs always compose the same track. */
export function composeTrack(levelId: string, seed = hashLevel(levelId)): TrackSpec {
  const rnd = prng(seed);
  const bpm = 92 + Math.floor(rnd() * 34);
  const scaleType = Object.keys(SCALE_TYPES)[Math.floor(rnd() * Object.keys(SCALE_TYPES).length)]!;
  const offsets = SCALE_TYPES[scaleType]!;
  const root = Note.name(Note.fromMidi(48 + Math.floor(rnd() * 12)))?.slice(0, 1) ?? 'C';
  const progression = PROGRESSIONS[Math.floor(rnd() * PROGRESSIONS.length)]!;

  // The scale's own letters, so chords are spelled in the key rather than borrowed from it.
  const letters = Scale.get(`${root} ${scaleType}`).notes;
  if (letters.length !== offsets.length) throw new Error(`tonal could not resolve the scale "${root} ${scaleType}"`);
  const quality = scaleType === 'major' ? 'major' : 'minor';
  const chords = progression.map((degree) => {
    const chord = Chord.getChord(quality, letters[(degree - 1) % letters.length]!, undefined);
    return chord.name || `${letters[(degree - 1) % letters.length]} ${quality}`;
  });

  // Melody: eighth notes over four bars, mostly chord tones of the bar's chord, with a
  // rhythm pattern that gives the track a pulse instead of a random wander.
  const bars = 4;
  const steps = bars * 8;
  const rhythm = [1, 0, 2, 0, 3, 0, 2, 1]; // rests and lengths per eighth note, per bar
  const chordDegreesOf = (bar: number): number[] => {
    const tones = Chord.notes(chords[bar % chords.length]!);
    return tones.map((tone) => {
      const index = letters.findIndex((letter) => letter === tone);
      return index >= 0 ? index + 1 : 1;
    });
  };

  const melody: number[] = [];
  for (let step = 0; step < steps; step++) {
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const length = rhythm[beat]!;
    if (length === 0) {
      melody.push(0); // a rest is a slot with no pitch, so the rhythm keeps its shape
      continue;
    }
    const tones = chordDegreesOf(bar);
    const degree = tones[Math.floor(rnd() * tones.length)]!;
    // Every third phrase lifts an octave, so the two voices read as a tune.
    melody.push(degree + (bar % 2 === 1 ? 7 : 0));
  }

  const bass: number[] = [];
  for (let bar = 0; bar < bars; bar++) bass.push(1 + ((progression[bar % progression.length]! - 1) % letters.length));

  const name = `${root} ${scaleType} ${bpm}`;
  return { levelId, name, seed, bpm, root, scaleType, chords, melody, bass, bars };
}

/** A scheduled note, in milliseconds from the start of the loop. */
export interface TrackNote {
  timeMs: number;
  /** Tonal pitch name, e.g. "A4". Playback converts it to a frequency. */
  name: string;
  durationMs: number;
  /** 0..1 relative loudness. */
  gain: number;
  voice: 'lead' | 'bass';
}

/** Expand a spec into the notes playback schedules. Deterministic, and cheap enough to rebuild per stage. */
export function notesFor(spec: TrackSpec): TrackNote[] {
  const eighth = (60_000 / spec.bpm) * 0.5;
  const offsets = SCALE_TYPES[spec.scaleType]!;
  const baseMidi = Midi.toMidi(`${spec.root}3`)!;
  const pitch = (degree: number, octaveShift: number): string =>
    Note.fromMidi(baseMidi + (offsets[(degree - 1) % offsets.length] ?? 0) + octaveShift * 12) ?? `${spec.root}4`;

  const notes: TrackNote[] = [];
  for (let step = 0; step < spec.melody.length; step++) {
    const degree = spec.melody[step]!;
    if (degree === 0) continue; // rest slot
    // The melody sits an octave above the bass root; odd bars lift another octave.
    notes.push({
      timeMs: step * eighth,
      name: pitch(degree, 1 + (Math.floor(step / 8) % 2)),
      durationMs: eighth * (spec.leadNote ?? 1.6),
      gain: spec.leadGain ?? 0.5,
      voice: 'lead',
    });
  }
  for (let bar = 0; bar < spec.bass.length; bar++) {
    notes.push({
      timeMs: bar * eighth * 8,
      name: pitch(spec.bass[bar]!, 0),
      durationMs: eighth * 8 * (spec.bassNote ?? 0.75),
      gain: spec.bassGain ?? 0.35,
      voice: 'bass',
    });
  }
  return notes;
}

/** Total loop length in milliseconds, so playback can schedule a whole cycle. */
export function loopLengthMs(spec: TrackSpec): number {
  return spec.bars * 8 * (60_000 / spec.bpm) * 0.5;
}
