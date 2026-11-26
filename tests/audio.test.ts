import assert from 'node:assert/strict';
import test from 'node:test';
import { createMusic, flavourFor, hashLevel, type AudioContextLike } from '../src/audio/music.ts';

/** Fake audio context: records what would have been played. */
function fakeCtx(): { ctx: AudioContextLike; played: Array<{ freq: number; gain: number; type: string }> } {
  const played: Array<{ freq: number; gain: number; type: string }> = [];
  const ctx: AudioContextLike = {
    currentTime: 0,
    createOscillator() {
      let freq = 0;
      let gain = 0;
      let type = 'sine';
      return {
        get type() {
          return type;
        },
        set type(v: string) {
          type = v;
        },
        frequency: { setValueAtTime: (v: number) => { freq = v; } },
        connect(dest: { gain: { value: number } }) {
          gain = dest.gain.value;
        },
        start() {
          played.push({ freq, gain, type });
        },
        stop() {},
      };
    },
    createGain() {
      return { gain: { value: 0, setValueAtTime: () => {} }, connect: () => {} };
    },
    destination: {},
  };
  return { ctx, played };
}

test('each level gets its own stable track flavour', async () => {
  const a = flavourFor('stage-01');
  const again = flavourFor('stage-01');
  assert.deepEqual(a, again, 'a stage always gets the same flavour');
  assert.ok(a.bpm >= 92 && a.bpm <= 125, `tempo in range (${a.bpm})`);
  assert.ok(a.scale.length > 0 && a.root > 0, 'flavour carries a scale and root');

  const b = flavourFor('stage-02');
  assert.ok(a.name !== b.name, 'different stages get different tracks');
  assert.ok(hashLevel('stage-01') !== hashLevel('stage-02'), 'level ids hash distinctly');
});

test('the note sequence is deterministic for a level and seed', async () => {
  const clock = () => 0;
  const run = () => {
    const music = createMusic({ clock, seed: 1234 });
    music.start('stage-01');
    // Simulated time advances one fixed step at a time; the scheduler emits on beat crossings.
    for (let step = 0; step < 60; step++) music.tick(step * (1000 / 60));
    return music.notes();
  };
  const first = run();
  const second = run();
  assert.deepEqual(first, second, 'same seed replays the same notes');
  assert.ok(first.length > 4, `a track actually plays (\`${first.length}\` notes)`);
  assert.ok(first.every((n) => n.semitone >= 0 && n.gain > 0 && n.durationMs > 0), 'notes are playable');
  assert.notEqual(first[0]!.gain, undefined, 'notes carry gain');

  const otherSeed = createMusic({ clock, seed: 99 });
  otherSeed.start('stage-01');
  for (let step = 0; step < 60; step++) otherSeed.tick(step * (1000 / 60));
  assert.notDeepEqual(otherSeed.notes(), first, 'a different seed generates a different track');

  // The track does not loop a fixed bar: successive notes keep changing.
  assert.ok(new Set(first.map((n) => n.semitone)).size > 3, 'the sequence varies');
});

test('music only emits one note per beat, and stops on demand', async () => {
  let now = 0;
  const music = createMusic({ clock: () => now, seed: 7 });
  music.start('stage-03');
  const bpm = music.flavour()!.bpm;
  const beatMs = 60_000 / bpm / 2;

  // One tick per eighth note emits exactly one note; a tick between beats emits none.
  music.tick(now);
  assert.equal(music.notes().length, 1);
  music.tick(now + beatMs / 2);
  assert.equal(music.notes().length, 1, 'no note between beats');
  music.tick(now + beatMs);
  assert.equal(music.notes().length, 2);

  // A stalled tab does not spam: many ticks at one time still emit one note.
  const before = music.notes().length;
  for (let i = 0; i < 20; i++) music.tick(now + beatMs);
  assert.equal(music.notes().length, before, 'catching up emits at most one note per tick');

  music.stop();
  music.tick(now + beatMs * 5);
  assert.equal(music.notes().length, before, 'a stopped track plays nothing');
  assert.equal(music.playing(), false);
});

test('playing notes uses the shared audio context, and mute silences output', async () => {
  const fake = fakeCtx();
  let created = 0;
  const music = createMusic({
    clock: () => 0,
    seed: 42,
    createContext: () => {
      created++;
      return fake.ctx;
    },
  });
  music.start('stage-01');
  assert.equal(created, 1, 'a track acquires one context');

  let now = 0;
  const bpm = music.flavour()!.bpm;
  const beatMs = 60_000 / bpm / 2;
  for (let i = 0; i < 6; i++) {
    music.tick(now);
    now += beatMs;
  }
  assert.ok(fake.played.length >= 5, `notes reached the oscillator (${fake.played.length})`);
  assert.ok(fake.played.every((p) => p.freq > 0 && p.gain > 0 && p.gain < 0.2), 'notes are quiet and in tune');
  assert.equal(fake.played[0]!.type, music.flavour()!.waveform, 'the flavour sets the waveform');

  music.setMuted(true);
  const count = fake.played.length;
  for (let i = 0; i < 6; i++) {
    music.tick(now);
    now += beatMs;
  }
  assert.equal(fake.played.length, count, 'mute silences the soundtrack without forgetting the track');
  assert.equal(music.playing(), true, 'mute is not stop');

  music.dispose();
  assert.equal(music.playing(), false);
});

test('a level without an audio context still tracks time and name', async () => {
  const music = createMusic({ clock: () => 0, createContext: () => null });
  music.start('stage-02');
  assert.ok(music.flavour(), 'the track is named even with no audio');
  for (let step = 0; step < 40; step++) music.tick(step * (1000 / 60));
  assert.ok(music.notes().length > 0, 'notes are recorded for the HUD and tests');
});
