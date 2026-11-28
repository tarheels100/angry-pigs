import assert from 'node:assert/strict';
import test from 'node:test';

import { composeTrack, hashLevel, loopLengthMs, notesFor, type TrackSpec } from '../src/audio/composition.ts';
import { createMusicPlayer } from '../src/audio/playback.ts';
import { authoredTracks, clearTracks, isAuthored, registerTrack, trackFor, unregisterTrack, validateTrack } from '../src/audio/tracks.ts';
import { AUTHORED_TRACKS, installAuthoredTracks } from '../src/audio/trackLibrary.ts';
import { createSfx, type AudioContextLike, type GainNodeLike, type OscillatorNodeLike } from '../src/audio/sfx.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { Midi } from 'tonal';

/** Minimal WebAudio stand-in, so the presentation wiring is testable in plain node. */
interface FakeOsc extends OscillatorNodeLike {
  startedAt: number | null;
  /** The last frequency the sfx blip set, recorded because ParamLike has no readable value. */
  setFrequency: number;
}

function fakeWebAudio(state: AudioContextLike['state'] = 'running'): {
  context: AudioContextLike;
  oscillators: FakeOsc[];
  /** Gain values, in creation order: one gain node per blip, so index i pairs with osc i. */
  gains: number[];
} {
  const oscillators: FakeOsc[] = [];
  const gains: number[] = [];
  const context: AudioContextLike = {
    state,
    currentTime: 0,
    destination: {},
    createGain(): GainNodeLike {
      const gain = {
        value: 1,
        setValueAtTime: (v: number) => {
          gains.push(v);
        },
        exponentialRampToValueAtTime: () => {},
      };
      return { gain, connect: () => {} };
    },
    createOscillator(): OscillatorNodeLike {
      const osc: FakeOsc = {
        type: 'sine',
        startedAt: null,
        setFrequency: 0,
        frequency: {
          setValueAtTime: (v: number) => {
            osc.setFrequency = v;
          },
        },
        connect: () => {},
        start: (at: number) => {
          osc.startedAt = at;
        },
        stop: () => {},
      };
      oscillators.push(osc);
      return osc;
    },
  };
  return { context, oscillators, gains };
}

test('a stage composes the same track every time it is asked for', () => {
  const spec = composeTrack('stage-01');
  assert.deepEqual(spec, composeTrack('stage-01'));
  assert.deepEqual(notesFor(spec), notesFor(spec));
  assert.ok(spec.bpm >= 92 && spec.bpm <= 126, 'tempo stays in the configured band');
  assert.ok(spec.chords.length === 4, 'the progression is four chords');
  assert.ok(spec.melody.length > 0, 'the melody has notes');
  assert.ok(spec.bass.length === spec.bars, 'one bass note per bar');
});

test('different stages compose different tracks', () => {
  const names = ['stage-01', 'stage-02', 'stage-03', 'stage-04', 'stage-05', 'stage-06'].map((id) => composeTrack(id).name);
  assert.equal(new Set(names).size, names.length, `six stages should sound different: ${names.join(' | ')}`);
  // The seed comes from the stage name, so it is stable and cheap.
  assert.equal(hashLevel('stage-01'), hashLevel('stage-01'));
  assert.notEqual(hashLevel('stage-01'), hashLevel('stage-02'));
});

test('composed notes are real pitches inside the loop', () => {
  const spec = composeTrack('stage-04');
  const notes = notesFor(spec);
  assert.ok(notes.length > 0);
  const loop = loopLengthMs(spec);
  for (const note of notes) {
    assert.ok(Midi.toMidi(note.name) !== null, `${note.name} is a pitch tone can play`);
    assert.ok(note.durationMs > 0);
    assert.ok(note.timeMs >= 0 && note.timeMs < loop, 'notes fall inside the looping bar');
  }
  // The bass sits below the lead, so the two voices read as a tune rather than one blur.
  const bass = notes.filter((n) => n.voice === 'bass');
  const lead = notes.filter((n) => n.voice === 'lead');
  assert.ok(bass.length > 0 && lead.length > 0);
  assert.ok(Math.max(...bass.map((n) => Midi.toMidi(n.name)!)) < Math.min(...lead.map((n) => Midi.toMidi(n.name)!)));
});

test('music stays silent until audio is unlocked and running (M22)', () => {
  // No context at all: a browser has not seen a gesture yet.
  const silent = createMusicPlayer({ getContext: () => null });
  silent.start('stage-01');
  assert.equal(silent.playing(), false);
  assert.equal(silent.trackName(), null);

  // A suspended context is still not allowed to make sound.
  const suspended = createMusicPlayer({ getContext: () => fakeWebAudio('suspended').context });
  suspended.start('stage-01');
  assert.equal(suspended.playing(), false);
});

test('sfx plays a blip for impact events', () => {
  const bus = createEventBus();
  const { context, oscillators, gains } = fakeWebAudio();
  const sfx = createSfx(() => context);
  sfx.attach(bus);
  sfx.unlock();

  bus.emit('impact', { aId: 'pig-1', bId: 'block-1', point: { x: 100, y: 100 }, energy: 1200 });
  assert.equal(oscillators.length, 1, 'impact schedules one oscillator');

  // Loudness follows energy, so a light touch is a quiet blip rather than a silence bug.
  bus.emit('impact', { aId: 'pig-1', bId: 'block-2', point: { x: 100, y: 100 }, energy: 10 });
  assert.equal(oscillators.length, 2, 'every impact sounds');
  assert.ok(gains[1]! < gains[0]!, 'a light impact is quieter');

  bus.emit('destroyed', { id: 'block-1', cause: 'impact' });
  assert.equal(oscillators.length, 3, 'destruction adds a crack');

  bus.emit('launch', { id: 'pig-1', velocity: { x: 10, y: -5 } });
  assert.equal(oscillators.length, 4, 'launch whooshes');
  assert.ok(oscillators[3]!.setFrequency > 100, 'launch tone is audible');

  // Sound effects are derived from events, so an event that never fired makes no sound.
  assert.ok(oscillators.every((osc) => osc.startedAt !== null));
});

test('sfx can be muted', () => {
  const bus = createEventBus();
  const { context, oscillators } = fakeWebAudio();
  const sfx = createSfx(() => context);
  sfx.attach(bus);
  sfx.unlock();
  sfx.setMuted(true);
  bus.emit('launch', { id: 'pig-1', velocity: { x: 10, y: -5 } });
  assert.equal(oscillators.length, 0);
  sfx.setMuted(false);
  bus.emit('launch', { id: 'pig-1', velocity: { x: 10, y: -5 } });
  assert.equal(oscillators.length, 1);
});

test('sfx without a context never throws', () => {
  const bus = createEventBus();
  const sfx = createSfx(() => null);
  sfx.attach(bus);
  bus.emit('impact', { aId: 'pig-1', bId: 'block-1', point: { x: 0, y: 0 }, energy: 1200 });
  bus.emit('destroyed', { id: 'block-1', cause: 'impact' });
});

/** A minimal authored spec, the shape a composer writes by hand (docs/music-interface.md). */
function authored(): TrackSpec {
  return {
    levelId: 'stage-03',
    name: 'E minor 100 (authored)',
    seed: 0,
    bpm: 100,
    root: 'E',
    scaleType: 'minor',
    chords: ['E minor', 'G major', 'A minor', 'E minor'],
    melody: [1, 0, 3, 0, 5, 0, 3, 2, 4, 0, 6, 0, 5, 0, 3, 0, 1, 0, 3, 0, 7, 0, 5, 3, 6, 0, 5, 0, 3, 0, 2, 0],
    bass: [1, 3, 5, 1],
    bars: 4,
    leadGain: 0.5,
    bassGain: 0.3,
  };
}

test('an authored track replaces the generated one for its stage', () => {
  clearTracks();
  registerTrack(authored());
  assert.ok(isAuthored('stage-03'));
  assert.deepEqual(authoredTracks(), ['stage-03']);
  assert.equal(trackFor('stage-03').name, 'E minor 100 (authored)');
  // A stage with no authored track still gets a generated one.
  assert.equal(trackFor('stage-04').name, composeTrack('stage-04').name);
  unregisterTrack('stage-03');
  assert.equal(isAuthored('stage-03'), false);
  clearTracks();
});

test('rests keep their slots, so the rhythm reads', () => {
  const spec = authored();
  const lead = notesFor(spec).filter((n) => n.voice === 'lead');
  // 32 slots, 8 of them rests: notes land on their own slot times, not packed together.
  assert.equal(spec.melody.length, 32);
  assert.equal(lead.length, spec.melody.filter((degree) => degree !== 0).length);
  assert.equal(lead[0]!.timeMs, 0);
  const eighth = 60_000 / spec.bpm / 2;
  assert.equal(lead[1]!.timeMs, 2 * eighth, 'the rest at slot 1 leaves a gap');
  assert.ok(notesFor(spec).every((n) => n.timeMs < loopLengthMs(spec)));
});

test('a bad authored track is rejected at the seam, naming the field', () => {
  clearTracks();
  assert.throws(() => registerTrack({ ...authored(), bpm: 300 }), /track "bpm"/);
  assert.throws(() => registerTrack({ ...authored(), scaleType: 'lydian' }), /track "scaleType"/);
  assert.throws(() => registerTrack({ ...authored(), melody: [1, 2, 3] }), /track "melody"/);
  assert.throws(() => registerTrack({ ...authored(), melody: Array(32).fill(30) }), /track "melody\[0\]"/);
  assert.throws(() => registerTrack({ ...authored(), bass: [1, 2] }), /track "bass"/);
  assert.throws(() => registerTrack({ ...authored(), chords: ['Eleven blues'] }), /track "chords"/);
  assert.throws(() => registerTrack({ ...authored(), leadGain: 2 }), /track "leadGain"/);
  assert.throws(() => registerTrack({ ...authored(), root: 'X' }), /track "root"/);
  assert.deepEqual(authoredTracks(), [], 'a rejected track is not registered');
  clearTracks();
});

test('the shipped library validates and wins over the generator', () => {
  clearTracks();
  installAuthoredTracks();
  assert.ok(AUTHORED_TRACKS.length > 0);
  for (const track of AUTHORED_TRACKS) {
    assert.doesNotThrow(() => validateTrack(track), `${track.name} must be playable`);
    assert.equal(trackFor(track.levelId).name, track.name, 'the authored track is what the stage plays');
    assert.equal(isAuthored(track.levelId), true);
  }
  // Headless has no Tone context, so the transport stays silent — the browser test is where
  // scheduling is proven. The seam itself is data, and the data is the authored track.
  const music = createMusicPlayer({ getContext: () => null });
  music.start(AUTHORED_TRACKS[0]!.levelId);
  assert.equal(music.playing(), false, 'no gesture means no sound');
  assert.equal(music.spec(), null, 'nothing is composed before a context exists');
  clearTracks();
});
