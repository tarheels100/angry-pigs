# Music interface — writing a track for Angry Pigs

**This document is complete.** You do not need to read any other file in the repo to write music
that plays in the game. Everything you need — the file to edit, the exact data shape, the pitch
model, the loudness model, the rules the game enforces, and the commands that check your work — is
here.

## The short version

A track is a plain TypeScript object of type `TrackSpec`. You add it to the `AUTHORED_TRACKS`
array in `src/audio/trackLibrary.ts`. Nothing else changes: the game already installs that library
at startup, and the player already prefers an authored track over the placeholder it generates.

There are no audio files, no recordings, no new dependencies. Pitch grammar and synthesis are
already installed; a track is a score, not a sound.

```ts
// src/audio/trackLibrary.ts — the only file a track author touches
import type { TrackSpec } from './composition.ts';
import { registerTrack } from './tracks.ts';

export const AUTHORED_TRACKS: TrackSpec[] = [
  /* your tracks go here */
];

/** Register every authored track. Called once from src/main.ts, before any track starts. */
export function installAuthoredTracks(): void {
  for (const spec of AUTHORED_TRACKS) registerTrack(spec);
}
```

If the file already has entries, keep them and add yours. Do not change `installAuthoredTracks`,
the imports, or any other file.

## The data shape, in full

```ts
export interface TrackSpec {
  levelId: string;      // stage name, e.g. "stage-03" — this is the key a track is looked up by
  name: string;         // display name shown in the HUD
  seed: number;         // unused by authored tracks; write 0
  bpm: number;          // 60..180
  root: string;         // note letter, optionally with an accidental: "A", "Bb", "F#"
  scaleType: string;    // one of: "minor", "major", "dorian", "mixolydian"
  chords: string[];     // descriptive progression; not sounded by playback (see below)
  melody: number[];     // one entry per eighth-note slot; 0 is a rest, 1..21 are scale degrees
  bass: number[];       // one degree per bar; 1..21
  bars: number;         // loop length in bars; melody.length must equal bars * 8
  leadGain?: number;    // 0..1, default 0.5
  bassGain?: number;    // 0..1, default 0.35
  leadNote?: number;    // lead note length in eighth-notes, 0..8, default 1.6
  bassNote?: number;    // bass note length as a fraction of a bar, 0..8, default 0.75
}
```

Keys you can write a track for are the six shipped stage names, exactly as strings:

`stage-01`, `stage-02`, `stage-03`, `stage-04`, `stage-05`, `stage-06`

A key that no stage uses is never heard — that is allowed, not an error. The in-app level editor
can produce stages with other names; a track keyed to such a name plays when the player loads that
level, so it is worth naming your `name` field descriptively if you write one.

## Pitch model

Degrees are **scale degrees**, not semitones and not MIDI numbers. Degree 1 is the root, degree 2
the second note of the scale, and so on. A degree beyond 7 wraps an octave higher, and the wrap
continues, so degree 8 is the root one octave up and degree 15 is the root two octaves up.
`MAX_DEGREE` is 21 (three octaves); higher numbers are rejected.

The scale tables, in semitones above the root:

| scaleType | semitone offsets |
| --- | --- |
| `minor` | 0, 2, 3, 5, 7, 8, 10 |
| `major` | 0, 2, 4, 5, 7, 9, 11 |
| `dorian` | 0, 2, 3, 5, 7, 9, 10 |
| `mixolydian` | 0, 2, 4, 5, 7, 9, 10 |

The exact pitch is:

```
base   = MIDI of "<root>3"           // e.g. A3 = 57
semitone = offsets[(degree - 1) % 7]
pitch  = base + semitone + octaveShift * 12
```

with the voicing fixed per voice:

- **bass**: `octaveShift = 0` → the scale sitting around the root octave (root is `<root>3`).
- **lead**: `octaveShift = 1` on bars 1 and 3, `2` on bars 2 and 4. The lead always sits an octave
  above the bass, and odd-numbered bars lift it another octave. This is a fixed rule, not a knob:
  write the tune in degrees and let the layer place it.

Degree tables you can write from, computed with the rule above:

| key | bass degrees 1..7 | lead degrees 1..7 (bars 1,3) | lead degrees 1..7 (bars 2,4) |
| --- | --- | --- | --- |
| `A` `minor` | A3 B3 C4 D4 E4 F4 G4 | A4 B4 C5 D5 E5 F5 G5 | A5 B5 C6 D6 E6 F6 G6 |
| `A` `dorian` | A3 B3 C4 D4 E4 Gb4 G4 | A4 B4 C5 D5 E5 Gb5 G5 | A5 B5 C6 D6 E6 Gb6 G6 |
| `E` `minor` | E3 Gb3 G3 A3 B3 C4 D4 | E4 Gb4 G4 A4 B4 C5 D5 | E5 Gb5 G5 A5 B5 C6 D6 |
| `E` `dorian` | E3 Gb3 G3 A3 B3 Db4 D4 | E4 Gb4 G4 A4 B4 Db5 D5 | E5 Gb5 G5 A5 B5 Db6 D6 |
| `C` `minor` | C3 D3 Eb3 F3 G3 Ab3 Bb3 | C4 D4 Eb4 F4 G4 Ab4 Bb4 | C5 D5 Eb5 F5 G5 Ab5 Bb5 |
| `C` `major` | C3 D3 E3 F3 G3 A3 B3 | C4 D4 E4 F4 G4 A4 B4 | C5 D5 E5 F5 G5 A5 B5 |
| `Bb` `mixolydian` | Bb3 C4 D4 Eb4 F4 G4 Ab4 | Bb4 C5 D5 Eb5 F5 G5 Ab5 | Bb5 C6 D6 Eb6 F6 G6 Ab6 |

Degrees 8..14 repeat the same seven pitches one octave up, 15..21 one octave higher again. Some
pitches are spelled with a flat by the pitch speller (`Gb` for F#, `Db` for C#); they are the same
key on the synthesizer.

## Rhythm model

The melody is an **eighth-note grid**, one entry per slot, so it is a rhythm rather than a packed
note list:

```
slot i time       = i * eighth        where eighth = 30000 / bpm ms
slot count        = bars * 8          (4 beats per bar)
bar b start       = b * 8 * eighth
loop length       = bars * 8 * eighth ms   (the loop is exact; it cycles seamlessly)
```

Examples at `bpm: 104`: one eighth-note is 288.5 ms, a bar is 2307.7 ms, a 4-bar loop is 9230.8 ms.

- `melody[i] === 0` is a **rest that keeps its slot**. The note after a rest still lands on its own
  eighth-note time; rests do not pull the following notes earlier. A 32-slot melody with 8 rests is
  a tune with gaps, not a shorter tune.
- A melody slot sounds for `leadNote` eighth-notes (default 1.6, i.e. slightly longer than the gap
  between slots, which reads as a held line; around 1.0 reads as plucked).
- `bass[b]` sounds at the start of bar `b` for `bassNote` of a bar (default 0.75 → a note that
  breathes before the next bar).
- Two voices only: lead and bass. No drums, no pads.

`chords` is documentation for whoever reads the track next and for the progression your melody
implies; playback sounds `melody` and `bass`, not the chord names. Still write them honestly — a
name that does not spell a chord in Tonal is rejected by the validator.

## Loudness

Per-note `gain` is passed to the synthesizer as velocity (0..1). The voice levels are fixed:

| voice | oscillator | envelope | volume | your knob |
| --- | --- | --- | --- | --- |
| lead | triangle | attack 0.02, decay 0.12, sustain 0.25, release 0.35 | −16 dB | `leadGain` (default 0.5) |
| bass | sine | attack 0.05, decay 0.2, sustain 0.3, release 0.4 | −22 dB | `bassGain` (default 0.35) |

The soundtrack is mixed deliberately low so it sits under the impact blips the game makes. To make
a track brighter or darker, change the two gain fields rather than adding notes: `leadGain` 0.6 /
`bassGain` 0.25 is a lead-forward tune, `leadGain` 0.4 / `bassGain` 0.4 is a bass-forward one.

## What the game does with your object

For understanding, not for editing: at stage load the player looks up `levelId`, gets your spec if
one is registered and a generated placeholder otherwise, converts it to note events
(`{ timeMs, name, durationMs, gain, voice }`) using the pitch and rhythm rules above, and schedules
them on a looping transport. Music stays off until the player turns it on, and silent until a
pointer gesture unlocks the audio context. The HUD line shows your `name`.

## Rules the game enforces

Your object is checked when it is registered — at startup, before any track plays. An invalid
track throws with the field named, and the game fails to boot, so **run the gates below before you
ship**. The rules:

| field | rule | why |
| --- | --- | --- |
| `levelId` | non-empty string | it is the lookup key |
| `name` | non-empty string | shown in the HUD |
| `bpm` | 60..180 | outside that the loop reads as a drone or a race |
| `bars` | whole number ≥ 1 | the loop must be a whole number of bars |
| `root` | note letter, optionally `b`/`#` | must resolve to a pitch |
| `scaleType` | one of the four table keys above | unknown scales have no offsets |
| `chords` | ≥ 1 entry, each an entry that spells a chord | an unspellable name would be silent |
| `melody` | exactly `bars * 8` entries, each `0` or an integer 1..21 | one slot per eighth-note |
| `bass` | exactly `bars` entries, each an integer 1..21 | one degree per bar |
| `leadGain`, `bassGain` | 0..1 when present | velocity range |
| `leadNote`, `bassNote` | > 0 and ≤ 8 when present | a note length inside the loop |

`seed` is not validated and not used by an authored track. Write `0`.

A complete, valid track:

```ts
{
  levelId: 'stage-03',
  name: 'E minor 100 (authored)',
  seed: 0,
  bpm: 100,
  root: 'E',
  scaleType: 'minor',
  chords: ['E minor', 'G major', 'A minor', 'E minor'],
  melody: [
    1, 0, 3, 0, 5, 0, 3, 2,
    4, 0, 6, 0, 5, 0, 3, 0,
    1, 0, 3, 0, 7, 0, 5, 3,
    6, 0, 5, 0, 3, 0, 2, 0,
  ],
  bass: [1, 3, 5, 1],
  bars: 4,
  leadGain: 0.5,
  bassGain: 0.3,
  leadNote: 1.2,
  bassNote: 0.6,
}
```

That melody sounds, with a note on each non-zero slot, as:

- bar 1 (lead octave 1): `E4 · G4 · B4 · G4 · Gb4`
- bar 2 (lead octave 2): `A5 · C6 · B5 · G5`
- bar 3 (lead octave 1): `E4 · G4 · D5 · B4 · G4`
- bar 4 (lead octave 2): `C6 · B5 · G5 · Gb5`
- bass, one note per bar: `E3 · Gb3 · B3 · E3`

(`Gb` is F#; the speller prefers the flat spelling.)

## Things you must not do

- **No audio files.** The game ships as one self-contained HTML file; a sample, a recording, or any
  network request breaks that.
- **No new dependencies.** Tonal and Tone.js are already installed. Do not add a library, a synth
  preset, or a MIDI pipeline.
- **No randomness.** `Math.random()` in a track means the stage sounds different every visit. Write
  fixed data; a track for a stage is the same every time.
- **Do not touch playback, game, level, or UI code.** `src/audio/composition.ts`, `tracks.ts`,
  `playback.ts`, `src/main.ts`, and `src/levels/*` are not yours to edit; if you think a voice is
  missing (drums, pads, a third line), say so in your report instead of adding it — that needs a
  new synthesizer plus a browser test that proves it sounds.
- **Do not fight the browser's audio policy.** Music is off by default and silent until a gesture; a
  track cannot force sound, and nothing should try.

## Checking your work

Run these from the repo root:

```bash
node --test tests/audio.test.ts   # fast: your specs validate and round-trip
npm run check                     # typecheck + all headless tests + build
npm run build                     # produces dist/index.html, the one-file artifact
npm run test:browser              # chromium loads dist/index.html; asserts music starts, per-stage track, mute stops it
```

To hear it (this needs a human ear; the automated tests cannot judge sound design):

1. `npm run build`, then open `dist/index.html` in a browser.
2. Press `Escape` to dismiss the title screen, then `m` to turn music on.
3. The HUD shows the track name; `N` advances stages, and each stage plays its own track.
4. In the browser console, `window.__music.spec()` returns the spec actually scheduled (yours, if
   registered for that stage) and `window.__music.trackName()` returns its display name — that is
   how you confirm your track is the one playing rather than the generated placeholder.

## Pre-flight checklist for a new track

- [ ] key is a real stage name (`stage-01`..`stage-06`) or a name a player can actually load
- [ ] `melody.length === bars * 8`, `bass.length === bars`
- [ ] every melody entry is 0 or an integer 1..21; every bass entry an integer 1..21
- [ ] `bpm` inside 60..180, `scaleType` one of the four, `root` a note letter
- [ ] `chords` entries spell real chords
- [ ] `seed: 0`
- [ ] rests written as `0` slots, not by deleting entries
- [ ] `node --test tests/audio.test.ts` passes, then `npm run check` passes
- [ ] listened once in the browser, and `window.__music.spec()` shows your track

## Appendix: which file does what

You only ever edit the first one. The rest is listed so an error message tells you where to look.

| file | responsibility | you touch it? |
| --- | --- | --- |
| `src/audio/trackLibrary.ts` | your authored tracks, as `TrackSpec` data | yes |
| `src/audio/tracks.ts` | registry + validation; `trackFor(levelId)` returns your spec or the placeholder | no |
| `src/audio/composition.ts` | the `TrackSpec` type, the scale tables, spec → note events, loop length | no |
| `src/audio/playback.ts` | Tone.js synths and the looping transport | no |
| `src/main.ts` | calls `installAuthoredTracks()` at startup, starts a track per stage, HUD label, `m` toggle | no |
| `tests/audio.test.ts` | installs the library and validates every entry; asserts rests keep their slots and bad specs name the field | no |
