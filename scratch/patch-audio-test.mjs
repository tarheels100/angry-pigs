import { readFileSync, writeFileSync } from 'node:fs';
let s = readFileSync('tests/audio.test.ts', 'utf8');
const start = s.indexOf("test('sfx plays a blip for impact events', () => {");
if (start === -1) throw new Error('sfx tests not found');
s = s.slice(0, start) + `test('sfx plays a blip for impact events', () => {
  const bus = createEventBus();
  const { context, oscillators } = fakeWebAudio();
  const sfx = createSfx(() => context);
  sfx.attach(bus);

  bus.emit('impact', { aId: 'pig-1', bId: 'block-1', point: { x: 100, y: 100 }, energy: 1200 });
  assert.equal(oscillators.length, 1, 'impact schedules one oscillator');

  bus.emit('impact', { aId: 'pig-1', bId: 'block-1', point: { x: 100, y: 100 }, energy: 10 });
  assert.equal(oscillators.length, 1, 'a trivial tap makes no sound');

  bus.emit('destroyed', { id: 'block-1', cause: 'impact' });
  assert.equal(oscillators.length, 2, 'destruction adds a crack');

  bus.emit('launch', { id: 'pig-1', velocity: { x: 10, y: -5 } });
  assert.equal(oscillators.length, 3, 'launch whooshes');
  assert.ok(oscillators[2]!.setFrequency > 100, 'launch tone is audible');

  // Sound effects are derived from events, so an event that never fired makes no sound.
  assert.ok(oscillators.every((osc) => osc.startedAt !== null));
});

test('sfx can be muted', () => {
  const bus = createEventBus();
  const { context, oscillators } = fakeWebAudio();
  const sfx = createSfx(() => context);
  sfx.attach(bus);
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
`;
writeFileSync('tests/audio.test.ts', s);

// The fake oscillator records the frequency it was set to, since ParamLike has no value.
s = readFileSync('tests/audio.test.ts', 'utf8');
s = s.replace(`interface FakeOsc extends OscillatorNodeLike {
  startedAt: number | null;
  frequency: number;
  type: string;
}`, `interface FakeOsc extends OscillatorNodeLike {
  startedAt: number | null;
  /** The last frequency the sfx blip set, recorded because ParamLike has no readable value. */
  setFrequency: number;
}`);
s = s.replace(`      const osc: FakeOsc = {
        type: 'sine',
        frequency: 0,
        startedAt: null,`, `      const osc: FakeOsc = {
        type: 'sine',
        startedAt: null,
        setFrequency: 0,
        frequency: {
          setValueAtTime: (v: number) => {
            osc.setFrequency = v;
          },
        },`);
s = s.replace(`      return {
        gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
        connect: () => {},
      };`, `      return {
        gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
      };`);
writeFileSync('tests/audio.test.ts', s);
