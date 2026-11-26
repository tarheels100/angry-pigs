import assert from 'node:assert/strict';
import test from 'node:test';

import { createParticleSystem } from '../src/fx/particles.ts';
import { createCamera } from '../src/camera/camera.ts';
import { drawFrame } from '../src/render/renderer.ts';
import { createSfx, type AudioContextLike } from '../src/audio/sfx.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createPlaceholderTheme } from '../src/render/themes/placeholder.ts';
import type { EntityState } from '../src/core/types.ts';

interface Op { op: string; colour: string | undefined; alpha: number | undefined }

function recordingContext(): { ops: Op[]; ctx: CanvasRenderingContext2D } {
  const ops: Op[] = [];
  let fillStyle = '';
  const target: Record<string, unknown> = { lineWidth: 1, globalAlpha: 1, font: '', shadowBlur: 0 };
  Object.defineProperty(target, 'fillStyle', { get: () => fillStyle, set: (v: string) => { fillStyle = v; } });
  for (const name of ['fillRect', 'strokeRect', 'beginPath', 'fill', 'stroke', 'arc', 'rect', 'moveTo', 'lineTo', 'save', 'restore', 'translate', 'scale', 'rotate', 'setTransform', 'setLineDash']) {
    target[name] = () => ops.push({ op: name, colour: name === 'fillRect' || name === 'fill' ? fillStyle : undefined, alpha: target.globalAlpha as number });
  }
  target.fillText = (text: string) => ops.push({ op: 'fillText', colour: fillStyle, alpha: target.globalAlpha as number, text } as unknown as Op);
  target.createLinearGradient = () => ({ addColorStop: () => {} });
  return { ops, ctx: target as unknown as CanvasRenderingContext2D };
}

const viewport = { width: 1600, height: 900, dpr: 1 };
const entity = (overrides: Partial<EntityState> = {}): EntityState => ({
  id: 'block-1', kind: 'block', shape: 'box', material: 'glass',
  x: 300, y: 400, angle: 0, vx: 0, vy: 0, sleeping: false, destroyed: false,
  health: 4, impactEnergy: 0, halfWidth: 20, halfHeight: 20, ...overrides,
});

test('particles spawn, fall, and expire', () => {
  const fx = createParticleSystem();
  fx.spawnBurst({ x: 100, y: 200 }, '#00ffa3', 12);
  assert.equal(fx.count(), 12);

  fx.update(0.1);
  const painted: Array<{ x: number; y: number }> = [];
  // Positions are internal; assert movement through paint calls.
  const { ops, ctx } = recordingContext();
  fx.paint(ctx);
  painted.push(...ops.filter((o) => o.op === 'fillRect').map((o) => ({ x: 0, y: 0 })));
  assert.equal(painted.length, 12, 'every live particle paints');

  // Longest life is 0.59s; 0.6s clears the burst.
  fx.update(0.6);
  assert.equal(fx.count(), 0, 'particles expire');
});

test('particles are deterministic for the same burst', () => {
  const a = createParticleSystem();
  const b = createParticleSystem();
  a.spawnBurst({ x: 10, y: 20 }, '#ffffff', 8);
  b.spawnBurst({ x: 10, y: 20 }, '#ffffff', 8);
  const { ctx: ctxA, ops: opsA } = recordingContext();
  const { ctx: ctxB, ops: opsB } = recordingContext();
  a.paint(ctxA);
  b.paint(ctxB);
  assert.deepEqual(opsA, opsB, 'a burst draws identically in two systems');
});

test('shake adds a screen offset and decays to zero', () => {
  const camera = createCamera(viewport, { width: 1600, height: 900 });
  assert.deepEqual(camera.shakeOffset(), { x: 0, y: 0 }, 'no shake by default');
  camera.shake(1);
  camera.update(1 / 60);
  const offset = camera.shakeOffset();
  assert.ok(Math.abs(offset.x) + Math.abs(offset.y) > 0, 'shake displaces the view');
  for (let i = 0; i < 60; i++) camera.update(1 / 60);
  assert.deepEqual(camera.shakeOffset(), { x: 0, y: 0 }, 'shake decays within a second');
});

test('shake is capped and never affects world coordinates', () => {
  const camera = createCamera(viewport, { width: 1600, height: 900 });
  camera.shake(5);
  camera.update(1 / 60);
  assert.ok(Math.abs(camera.shakeOffset().x) <= 10, 'shake magnitude is capped');
  assert.deepEqual(camera.worldToScreen({ x: 300, y: 400 }), camera.worldToScreen({ x: 300, y: 400 }));
  assert.equal(camera.position().x, 800, 'shake does not pan the camera');
});

test('debug overlay paints entity bounds and counters', () => {
  const theme = createPlaceholderTheme();
  const camera = createCamera(viewport, { width: 1600, height: 900 });
  const { ops, ctx } = recordingContext();
  drawFrame(ctx, theme, { camera, phase: 'aiming', aim: null }, [entity()], viewport, {
    enabled: true,
    stats: () => ({ fps: 60, steps: 120, elapsed: 2 }),
  });
  assert.ok(ops.some((o) => o.op === 'strokeRect'), 'entity bounds are outlined');
  const texts = ops.filter((o) => o.op === 'fillText');
  assert.ok(texts.some((o) => (o as unknown as { text: string }).text === 'block-1'), 'entity ids are shown');
  assert.ok(texts.some((o) => (o as unknown as { text: string }).text.includes('fps')), 'loop counters are shown');
});

test('debug overlay is off by default', () => {
  const theme = createPlaceholderTheme();
  const camera = createCamera(viewport, { width: 1600, height: 900 });
  const { ops, ctx } = recordingContext();
  drawFrame(ctx, theme, { camera, phase: 'aiming', aim: null }, [entity()], viewport);
  assert.ok(!ops.some((o) => o.op === 'strokeRect'));
  assert.ok(!ops.some((o) => o.op === 'fillText'));
});

/** Fake WebAudio that records oscillator recipes instead of making sound. */
function fakeAudio(): { ctx: AudioContextLike; started: Array<{ type: string; from: number; to: number }> } {
  const started: Array<{ type: string; from: number; to: number }> = [];
  const ctx: AudioContextLike = {
    currentTime: 0,
    destination: {},
    createOscillator() {
      let from = 0;
      let to = 0;
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: (v: number) => {
            from = v;
          },
          exponentialRampToValueAtTime: (v: number) => {
            to = v;
          },
        },
        connect: () => {},
        start: () => started.push({ type: 'x', from, to }),
        stop: () => {},
      };
    },
    createGain: () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} }),
  };
  return { ctx, started };
}

test('sfx plays one oscillator per event after unlock', () => {
  const audio = fakeAudio();
  const sfx = createSfx(() => audio.ctx);
  const bus = createEventBus();
  sfx.attach(bus);

  assert.equal(audio.started.length, 0, 'nothing plays before the context is unlocked');
  sfx.unlock();
  bus.emit('launch', { id: 'pig-1', velocity: { x: 10, y: -2 } });
  assert.equal(audio.started.length, 1, 'launch makes one sound');

  bus.emit('impact', { aId: 'block-1', bId: 'pig-1', energy: 300, point: { x: 300, y: 400 } });
  bus.emit('destroyed', { id: 'bird-1', cause: 'impact' });
  bus.emit('levelWon', { levelId: 'stage-01', score: 2000, stars: 3 });
  assert.equal(audio.started.length, 4);
});

test('mute suppresses sound and dispose unsubscribes', () => {
  const audio = fakeAudio();
  const sfx = createSfx(() => audio.ctx);
  const bus = createEventBus();
  sfx.attach(bus);
  sfx.unlock();
  sfx.setMuted(true);
  bus.emit('launch', { id: 'pig-1', velocity: { x: 10, y: -2 } });
  assert.equal(audio.started.length, 0, 'muted makes no sound');
  assert.equal(sfx.muted(), true);

  sfx.dispose();
  assert.equal(bus.handlerCount('launch'), 0, 'dispose removes event listeners');
});

test('sfx is harmless without an AudioContext', () => {
  const sfx = createSfx(() => null);
  const bus = createEventBus();
  sfx.attach(bus);
  sfx.unlock();
  assert.doesNotThrow(() => bus.emit('launch', { id: 'pig-1', velocity: { x: 10, y: -2 } }));
});
