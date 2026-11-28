import { SCALE_TYPES, composeTrack, type TrackSpec } from './composition.ts';
import { Chord } from 'tonal';

/**
 * The seam between authored music and generated music (M23, docs/adr.md D42).
 *
 * `composeTrack` invents a track from a stage name (docs/adr.md D40). This module is the
 * other half: a real composition written by a person, keyed by stage id. Playback asks
 * `trackFor(levelId)`, which returns an authored spec when one is registered and falls back
 * to the generator otherwise — so a track can be dropped in without touching playback, the
 * game, or the level.
 *
 * An authored spec is validated on registration, not at playback time: a bad track is
 * rejected at the seam with a named field, the same way a bad level is rejected by the
 * loader (docs/level-format.md).
 */

/** Tempo band playback assumes; outside it the loop reads as a drone or a race. */
export const BPM_MIN = 60;
export const BPM_MAX = 180;
/** Gain range for a voice. Tone's master is already at MUSIC_GAIN (0.22) in the presentation. */
export const GAIN_MIN = 0;
export const GAIN_MAX = 1;
/** Largest scale degree an authored melody may name. Beyond this the wrap makes mush. */
export const MAX_DEGREE = 21;

/** Throws with a field-qualified message, matching the level loader's error convention. */
export function validateTrack(spec: TrackSpec): void {
  if (typeof spec.levelId !== 'string' || spec.levelId.length === 0) throw new Error('track "levelId": required');
  if (typeof spec.name !== 'string' || spec.name.length === 0) throw new Error('track "name": required');
  if (!Number.isFinite(spec.bpm) || spec.bpm < BPM_MIN || spec.bpm > BPM_MAX) {
    throw new Error(`track "bpm": must be between ${BPM_MIN} and ${BPM_MAX}, got ${spec.bpm}`);
  }
  if (!Number.isInteger(spec.bars) || spec.bars < 1) throw new Error(`track "bars": must be a whole number of bars, got ${spec.bars}`);
  if (!/^[A-G](b|#)?$/i.test(spec.root)) throw new Error(`track "root": must be a note letter, got "${spec.root}"`);
  if (!SCALE_TYPES[spec.scaleType]) throw new Error(`track "scaleType": unknown scale "${spec.scaleType}" (try ${Object.keys(SCALE_TYPES).join(', ')})`);
  if (!Array.isArray(spec.chords) || spec.chords.length === 0) throw new Error('track "chords": at least one chord is required');
  for (const chord of spec.chords) {
    if (typeof chord !== 'string' || chord.trim().length === 0) throw new Error(`track "chords": each entry must be a chord name, got "${chord}"`);
    // Spellable in Tonal means playback can actually sound it; an unspellable name is silent.
    if (Chord.get(chord).notes.length < 2) throw new Error(`track "chords": "${chord}" does not spell a chord`);
  }
  if (!Array.isArray(spec.melody) || spec.melody.length !== spec.bars * 8) {
    throw new Error(`track "melody": must be one entry per eighth-note slot (${spec.bars * 8} for ${spec.bars} bars), got ${spec.melody?.length}`);
  }
  for (let i = 0; i < spec.melody.length; i++) {
    const degree = spec.melody[i]!;
    if (!Number.isInteger(degree) || degree < 0 || degree > MAX_DEGREE) {
      throw new Error(`track "melody[${i}]": must be 0 (rest) or a scale degree 1..${MAX_DEGREE}, got ${degree}`);
    }
  }
  if (!Array.isArray(spec.bass) || spec.bass.length !== spec.bars) {
    throw new Error(`track "bass": must be one degree per bar (${spec.bars}), got ${spec.bass?.length}`);
  }
  for (let i = 0; i < spec.bass.length; i++) {
    const degree = spec.bass[i]!;
    if (!Number.isInteger(degree) || degree < 1 || degree > MAX_DEGREE) throw new Error(`track "bass[${i}]": must be a scale degree 1..${MAX_DEGREE}, got ${degree}`);
  }
  for (const key of ['leadGain', 'bassGain'] as const) {
    const value = spec[key];
    if (value !== undefined && (value < GAIN_MIN || value > GAIN_MAX)) throw new Error(`track "${key}": must be between ${GAIN_MIN} and ${GAIN_MAX}, got ${value}`);
  }
  for (const key of ['leadNote', 'bassNote'] as const) {
    const value = spec[key];
    if (value !== undefined && !(value > 0 && value <= 8)) throw new Error(`track "${key}": must be a note length between 0 and 8 eighth-notes, got ${value}`);
  }
}

const authored = new Map<string, TrackSpec>();

/** Register a hand-authored track for a stage. Validates first, so a bad spec never reaches playback. */
export function registerTrack(spec: TrackSpec): void {
  validateTrack(spec);
  authored.set(spec.levelId, spec);
}

export function unregisterTrack(levelId: string): void {
  authored.delete(levelId);
}

/** Empty the registry. Tests use this so registration order cannot leak between cases. */
export function clearTracks(): void {
  authored.clear();
}

/** Stage ids that have an authored track. */
export function authoredTracks(): string[] {
  return [...authored.keys()];
}

export function isAuthored(levelId: string): boolean {
  return authored.has(levelId);
}

/** The track a stage plays: the authored one if there is one, otherwise the generated one. */
export function trackFor(levelId: string): TrackSpec {
  return authored.get(levelId) ?? composeTrack(levelId);
}
