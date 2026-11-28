import type { TrackSpec } from './composition.ts';
import { registerTrack } from './tracks.ts';

/**
 * Hand-authored tracks (M23, docs/music-interface.md).
 *
 * This is the file a composer edits. Each entry is a plain `TrackSpec`: no audio assets, no
 * recordings, no new dependencies — pitch grammar comes from Tonal and the synthesizer already
 * lives in `src/audio/playback.ts`. `registerTrack` checks the spec, so an entry that cannot be
 * played is rejected here rather than silently going quiet later.
 *
 * Keys are level **names** (`stage-01`, …), because that is what the game passes to
 * `music.start()` and what `composeTrack` hashes. A track keyed to a name that no stage uses is
 * simply never heard.
 */
export const AUTHORED_TRACKS: TrackSpec[] = [
  {
    levelId: 'stage-01',
    name: 'A dorian 104 (authored)',
    // `seed` is only used by the generator; an authored track carries a fixed 0.
    seed: 0,
    bpm: 104,
    root: 'A',
    scaleType: 'dorian',
    // Descriptive: the progression the melody implies. Playback sounds `melody` and `bass`;
    // chord names are for the HUD and for whoever reads the track next.
    chords: ['A minor', 'D minor', 'F major', 'A minor'],
    // One entry per eighth-note slot, 4 bars x 8 slots. 0 is a rest.
    melody: [
      1, 0, 3, 0, 5, 0, 3, 2,
      4, 0, 6, 0, 5, 0, 3, 0,
      1, 0, 3, 0, 7, 0, 5, 3,
      6, 0, 5, 0, 3, 0, 2, 0,
    ],
    // One degree per bar, sitting under the lead.
    bass: [1, 4, 6, 1],
    bars: 4,
    leadGain: 0.55,
    bassGain: 0.3,
    // Shorter lead notes than the generator's, so the tune reads as plucked rather than held.
    leadNote: 1.2,
    bassNote: 0.6,
  },
];

/** Register every authored track. Called once from `src/main.ts`, before any track starts. */
export function installAuthoredTracks(): void {
  for (const spec of AUTHORED_TRACKS) registerTrack(spec);
}
