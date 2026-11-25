import assert from 'node:assert/strict';
import test from 'node:test';

import { createEventBus } from '../src/core/eventBus.ts';
import { FIXED_DT, createLoop } from '../src/core/loop.ts';

test('event bus delivers payloads to subscribers', () => {
  const bus = createEventBus();
  const seen: Array<{ id: string; cause: string }> = [];
  bus.on('destroyed', (payload) => seen.push(payload));
  bus.emit('destroyed', { id: 'bird-1', cause: 'impact' });
  assert.deepEqual(seen, [{ id: 'bird-1', cause: 'impact' }]);
  assert.equal(bus.handlerCount('destroyed'), 1);
});

test('unsubscribe stops delivery', () => {
  const bus = createEventBus();
  let count = 0;
  const off = bus.on('impact', () => count++);
  bus.emit('impact', { aId: 'pig', bId: 'block', point: { x: 0, y: 0 }, energy: 12 });
  off();
  bus.emit('impact', { aId: 'pig', bId: 'block', point: { x: 0, y: 0 }, energy: 12 });
  assert.equal(count, 1);
  assert.equal(bus.handlerCount('impact'), 0);
});

test('a throwing handler does not break later handlers or the emitter', () => {
  const bus = createEventBus();
  let secondRan = false;
  bus.on('launch', () => { throw new Error('ui blew up'); });
  bus.on('launch', () => { secondRan = true; });
  bus.emit('launch', { id: 'pig-1', velocity: { x: 12, y: -12 } });
  assert.equal(secondRan, true);
});

test('handlers registered during emission are not called in the same emit', () => {
  const bus = createEventBus();
  let late = 0;
  bus.on('phaseChanged', () => { bus.on('phaseChanged', () => late++); });
  bus.emit('phaseChanged', { phase: 'aiming' });
  assert.equal(late, 0);
});

test('loop steps at FIXED_DT regardless of frame duration', () => {
  const steps: number[] = [];
  const loop = createLoop({ step: (dt) => steps.push(dt), render: () => {} });
  loop.tick(0.05); // 50ms -> 3 steps of 1/60, remainder carried
  assert.equal(steps.length, 3);
  assert.ok(steps.every((s) => s === FIXED_DT));
  loop.tick(0.02); // carried remainder + 20ms -> one more step, remainder carried
  assert.equal(steps.length, 4);
  assert.equal(loop.stepsTaken(), 4);
});

test('loop discards surplus time instead of catching up forever', () => {
  let steps = 0;
  const loop = createLoop({ step: () => steps++, render: () => {} });
  loop.tick(10); // backgrounded tab: 10 seconds of delta
  assert.equal(steps, 5);
  loop.tick(1 / 60);
  assert.equal(steps, 6, 'surplus was dropped, so the next frame is normal');
});

test('advance runs exact step counts for deterministic tests', () => {
  let steps = 0;
  const loop = createLoop({ step: () => steps++, render: () => {} });
  loop.advance(1);
  assert.equal(steps, 60);
  loop.advance(0.5);
  assert.equal(steps, 90);
});
