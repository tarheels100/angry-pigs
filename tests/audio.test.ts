import assert from 'node:assert/strict';
import test from 'node:test';

import { composeTrack, hashLevel, loopLengthMs, notesFor } from '../src/audio/composition.ts';
import { createMusicPlayer } from '../src/audio/playback.ts';
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
