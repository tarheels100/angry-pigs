import assert from 'node:assert/strict';
import test from 'node:test';

import { createPointerSource } from '../src/input/pointer.ts';

/** Minimal canvas stand-in: records listeners, pointer capture, and dispatched events. */
function fakeCanvas() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const captured: number[] = [];
  const released: number[] = [];
  const canvas = {
    addEventListener(type: string, handler: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type: string, handler: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((h) => h !== handler));
    },
    getBoundingClientRect() {
      return { left: 20, top: 30 };
    },
    setPointerCapture(id: number) {
      captured.push(id);
    },
    releasePointerCapture(id: number) {
      released.push(id);
    },
    dispatch(type: string, pointerId = 1, clientX = 0, clientY = 0) {
      for (const handler of listeners.get(type) ?? []) handler({ type, pointerId, clientX, clientY });
    },
    listenerCount(type: string) {
      return (listeners.get(type) ?? []).length;
    },
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, captured, released, canvasApi: canvas };
}

test('hovering does not report moves', () => {
  const { canvasApi, canvas } = fakeCanvas();
  const source = createPointerSource(canvas);
  const moves: Array<{ x: number; y: number }> = [];
  source.onMove((p) => moves.push(p));

  canvasApi.dispatch('pointermove', 1, 120, 80);
  assert.equal(moves.length, 0, 'a move without a press is hover');
  assert.equal(source.pressed(), false);
});

test('a drag reports moves and is captured to the canvas', () => {
  const { canvasApi, canvas, captured, released } = fakeCanvas();
  const source = createPointerSource(canvas);
  const down: Array<{ x: number; y: number }> = [];
  const moves: Array<{ x: number; y: number }> = [];
  const up: Array<{ x: number; y: number }> = [];
  source.onDown((p) => down.push(p));
  source.onMove((p) => moves.push(p));
  source.onUp((p) => up.push(p));

  canvasApi.dispatch('pointerdown', 1, 140, 130);
  assert.equal(down.length, 1);
  assert.deepEqual(down[0], { x: 120, y: 100 }, 'positions are canvas-space CSS pixels');
  assert.equal(source.pressed(), true);
  assert.deepEqual(captured, [1], 'the pointer is captured so drags outside the canvas still report');

  canvasApi.dispatch('pointermove', 1, 100, 150);
  canvasApi.dispatch('pointermove', 1, 60, 170);
  assert.equal(moves.length, 2);
  assert.deepEqual(moves[1], { x: 40, y: 140 });

  canvasApi.dispatch('pointerup', 1, 60, 170);
  assert.equal(up.length, 1);
  assert.equal(source.pressed(), false);
  assert.deepEqual(released, [1]);

  canvasApi.dispatch('pointermove', 1, 10, 10);
  assert.equal(moves.length, 2, 'moves after release are hover');
});

test('an interrupted gesture cancels and stops reporting', () => {
  const { canvasApi, canvas } = fakeCanvas();
  const source = createPointerSource(canvas);
  const cancelled: Array<{ x: number; y: number }> = [];
  const up: Array<{ x: number; y: number }> = [];
  source.onCancel((p) => cancelled.push(p));
  source.onUp((p) => up.push(p));

  canvasApi.dispatch('pointerdown', 1, 140, 130);
  canvasApi.dispatch('pointercancel', 1, 140, 130);
  assert.equal(cancelled.length, 1);
  assert.equal(up.length, 0, 'a cancelled gesture is not a release');
  assert.equal(source.pressed(), false);
});

test('events from a second pointer are ignored while the first is held', () => {
  const { canvasApi, canvas } = fakeCanvas();
  const source = createPointerSource(canvas);
  const moves: number[] = [];
  source.onMove(() => moves.push(1));
  source.onUp(() => moves.push(0));

  canvasApi.dispatch('pointerdown', 1, 100, 100);
  canvasApi.dispatch('pointermove', 2, 100, 100);
  canvasApi.dispatch('pointerup', 2, 100, 100);
  assert.equal(moves.length, 0, 'only the captured pointer drives the aim');
  assert.equal(source.pressed(), true);
});

test('unsubscribe stops the handler but keeps gesture tracking', () => {
  const { canvasApi, canvas, captured } = fakeCanvas();
  const source = createPointerSource(canvas);
  const moves: number[] = [];
  let downs = 0;
  const off = source.onDown(() => {
    downs++;
  });
  source.onMove(() => moves.push(1));

  canvasApi.dispatch('pointerdown', 1, 10, 10);
  assert.equal(downs, 1);
  off();

  canvasApi.dispatch('pointermove', 1, 20, 20);
  canvasApi.dispatch('pointerup', 1, 20, 20);
  assert.equal(downs, 1, 'an unsubscribed handler is not called');
  assert.equal(moves.length, 1, 'drag tracking still works');
  assert.deepEqual(captured, [1], 'capture is tracked by the source, not by handlers');
  assert.equal(source.pressed(), false);
});

test('dispose detaches canvas listeners and releases capture', () => {
  const { canvasApi, canvas, released } = fakeCanvas();
  const source = createPointerSource(canvas);
  const moves: number[] = [];
  source.onMove(() => moves.push(1));

  canvasApi.dispatch('pointerdown', 1, 100, 100);
  canvasApi.dispatch('pointermove', 1, 120, 120);
  assert.equal(moves.length, 1);

  source.dispose();
  assert.equal(canvasApi.listenerCount('pointermove'), 0, 'no listener survives dispose');
  assert.equal(canvasApi.listenerCount('pointerdown'), 0);
  assert.deepEqual(released, [1], 'an open gesture is released on dispose');
  assert.equal(source.pressed(), false);

  canvasApi.dispatch('pointermove', 1, 140, 140);
  assert.equal(moves.length, 1, 'a disposed source reports nothing');
});
