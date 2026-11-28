# Music interface — how a composition plugs in (M23)

This document is written for whoever writes the music. You do not need to touch playback code,
the game, or the levels: a track is **data**, and the seam that takes it is
[`src/audio/tracks.ts`](../src/audio/tracks.ts).

There are two kinds of track, and they meet at one function:

| kind | where it comes from | who writes it |
| --- | --- | --- |
| **generated** | `composeTrack(levelId)` invents a track from the stage name (docs/adr.md D40) | nobody — it is the placeholder sound design |
| **authored** | a `TrackSpec` you write and register | you, in [`src/audio/trackLibrary.ts`](../src/audio/trackLibrary.ts) |

`trackFor(levelId)` returns the authored spec when one is registered for that stage and the
generated one otherwise. Playback asks `trackFor` once per stage, so registering a track is the
whole job.

## The shape you write

```ts
export interface TrackSpec {
  levelId: string;      // stage name, e.g. "stage-03" — this is the key
  name: string;         // shown in the HUD, e.g. "E minor 100 (authored)"
  seed: number;         // unused by authored tracks; set it to 0
  bpm: number;          // 60..180
  root: string;         // note letter, optionally with b/#: "E", "Bb", "F#"
  scaleType: string;    // one of: minor, major, dorian, mixolydian
  chords: string[];     // descriptive progression, e.g. ["E minor", "G major"]
  melody: number[];     // one entry per eighth-note slot; 0 is a rest, 1..21 are scale degrees
  bass: number[];       // one degree per bar, 1..21
  bars: number;         // loop length in bars; melody.length must be bars * 8
  leadGain?: number;    // 0..1, default 0.5
  bassGain?: number;    // 0..1, default 0.35
  leadNote?: number;    // note length in eighth-notes, default 1.6
  bassNote?: number;    // note length in eighth-notes, default 0.75
}
```

Degrees are **scale degrees**, not semitones: 1 is the root, 2 the second note of the scale, and
so on. Degree 10 is the root an octave up (the scale is 7 degrees wide, so degree *n* wraps at
`offsets[(n - 1) % 7]` plus the wrap's octaves). `MAX_DEGREE` is 21 — past that the wrap starts
making mush, and the validator refuses it.

The melody sits an octave above the bass root, and odd bars lift one more octave. That is a
fixed voicing rule, not a knob: write the tune in degrees and let the layer place it.

## Registering a track

Add an entry to `AUTHORED_TRACKS` in `src/audio/trackLibrary.ts`:

```ts
export const AUTHORED_TRACKS: TrackSpec[] = [
  {
    levelId: 'stage-03',
    name: 'E minor 100 (authored)',
    seed: 0,
    bpm: 100,
    root: 'E',
    scaleType: 'minor',
    chords: ['E minor', 'G major', 'A minor', 'E minor'],
    melody: [1, 0, 3, 0, 5, 0, 3, 2, 4, 0, 6, 0, 5, 0, 3, 0,
             1, 0, 3, 0, 7, 0, 5, 3, 6, 0, 5, 0, 3, 0, 2, 0],
    bass: [1, 3, 5, 1],
    bars: 4,
    leadGain: 0.5,
    bassGain: 0.3,
  },
];
```

`installAuthoredTracks()` is called once from `src/main.ts`, before any track starts. Nothing
else needs wiring. A track keyed to a stage name no level uses is simply never heard.

`levelId` is the **level name**, not an index: `src/main.ts` passes `loaded.def.name` to
`music.start()`, which is the same string the generator hashes.

## What the validator refuses

`registerTrack(spec)` calls `validateTrack(spec)` and throws before the track is stored, so a bad
track never reaches playback. Errors name the field, the way the level loader does
(docs/level-format.md):

| field | rule |
| --- | --- |
| `levelId`, `name` | non-empty string |
| `bpm` | 60..180 — outside that the loop reads as a drone or a race |
| `bars` | whole number ≥ 1 |
| `root` | a note letter, optionally `b`/`#` |
| `scaleType` | a key of `SCALE_TYPES` (`composition.ts` exports the table) |
| `chords` | at least one name, and each must spell a chord in Tonal — an unspellable name would be silent |
| `melody` | exactly `bars * 8` entries, each `0` (rest) or an integer 1..21 |
| `bass` | exactly `bars` entries, each an integer 1..21 |
| `leadGain`, `bassGain` | 0..1 when present |
| `leadNote`, `bassNote` | 0..8 eighth-notes when present |

Run `npm test` after editing the library; `tests/audio.test.ts` installs the shipped library and
validates every entry.

## Rests are slots

`melody` is a rhythm grid, not a packed list. A `0` keeps its slot, so the note after a rest still
lands on its own eighth-note time. `notesFor` skips rest slots but never shifts the ones after
them; a 32-slot melody with 8 rests is a tune with gaps, not a shorter tune.

## Constraints the artifact imposes

- **No audio files.** The release is one self-contained HTML file (docs/adr.md D6): no sample,
  no recording, no request. Pitch grammar comes from Tonal, sound from Tone.js synths that
  already live in `playback.ts`.
- **One audio context.** The pointer gesture unlocks a `AudioContext`; music and SFX share it
  (docs/adr.md D32). Before that gesture everything stays silent, which is why `music.start()`
  returns without composing when there is no running context.
- **Music is off by default.** The option (`options.music`) and the `M` key turn it on. A track
  you author is not heard until the player asks for it.
- **The loop is owned by Tone's transport.** `loopLengthMs(spec)` sets the loop end, so a track
  cycles seamlessly and a paused menu cannot queue a backlog (docs/adr.md D40).
- **Determinism is about the simulation, not the soundtrack.** `check:determinism` compares
  physics outcomes; music never enters a recorded run. But keep `composition.ts` and
  `tracks.ts` free of `Math.random()` — a track for a stage is the same every visit.

## How to hear what you wrote

1. Build: `npm run build`.
2. Open `dist/index.html`, press `Escape` to dismiss the title screen, press `m` to turn music on.
3. The HUD line shows the track name; `N` advances stages, and each stage picks its own track.
4. For a headless check of the data only: `npx tsx scratch/greedy-probe.ts` is unrelated; use
   `node --test tests/audio.test.ts`, which asserts the seam (authored wins, rests keep their
   slots, bad specs are rejected by field name).

## What playback does with your spec

`src/audio/playback.ts` does three things and no more:

1. `trackFor(levelId)` — your spec or the generated one.
2. `notesFor(spec)` — flat `{ timeMs, name, durationMs, gain, voice }` events, `voice` being
   `'lead'` or `'bass'`.
3. A `Tone.Part` on a looping transport, with a `PolySynth` for the lead and a `Synth` for the
   bass, both behind `MUSIC_GAIN` (0.22 master) so the soundtrack sits under the impact blips.

If you need a voice the player does not have — drums, pads, a third line — that is a change to
`playback.ts` and needs a browser test proving it sounds on the artifact. Everything else is
data.

## The HUD seam

`window.__music.spec()` returns the spec currently scheduled (authored or generated), and
`window.__music.trackName()` its display name. Browser tests use those to prove an authored
track really plays (`tests/browser/game.browser.mjs`, "a hand-authored track plays on its
stage").
