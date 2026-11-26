import assert from 'node:assert/strict';
import test from 'node:test';

import { createCamera } from '../src/camera/camera.ts';
import { createRenderer } from '../src/render/renderer.ts';
import { createPlaceholderTheme } from '../src/render/themes/placeholder.ts';
import { registerTheme } from '../src/render/theme.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';
import type { Vec2 } from '../src/core/types.ts';

/** Headless stand-in: records draw primitives and the colour in effect. */
interface Call {
  op: string;
  color: string | null;
}

function fakeCtx(): CanvasRenderingContext2D {
  const calls: Call[] = [];
  const ctx = {
    calls,
    canvas: { width: 1280, height: 720 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    setTransform: () => calls.push({ op: 'setTransform', color: null }),
    save: () => calls.push({ op: 'save', color: null }),
    restore: () => calls.push({ op: 'restore', color: null }),
    translate: () => calls.push({ op: 'translate', color: null }),
    rotate: () => calls.push({ op: 'rotate', color: null }),
    scale: () => calls.push({ op: 'scale', color: null }),
    fillRect: () => calls.push({ op: 'fillRect', color: ctx.fillStyle as string }),
    strokeRect: () => calls.push({ op: 'strokeRect', color: ctx.strokeStyle as string }),
    beginPath: () => calls.push({ op: 'beginPath', color: null }),
    moveTo: () => calls.push({ op: 'moveTo', color: null }),
    lineTo: () => calls.push({ op: 'lineTo', color: null }),
    arc: () => calls.push({ op: 'arc', color: ctx.fillStyle as string }),
    rect: () => calls.push({ op: 'rect', color: ctx.fillStyle as string }),
    stroke: () => calls.push({ op: 'stroke', color: ctx.strokeStyle as string }),
    fill: () => calls.push({ op: 'fill', color: ctx.fillStyle as string }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function callsOf(ctx: CanvasRenderingContext2D): Call[] {
  return (ctx as unknown as { calls: Call[] }).calls;
}

/** Canvas stub that hands out the fake context, like a real 2d canvas does. */
function fakeCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    clientWidth: 1280,
    clientHeight: 720,
    style: {},
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

const theme = createPlaceholderTheme();
registerTheme(theme);
const loaded = loadLevel(levelAt(0));

function makeSlice() {
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  const ctx = fakeCtx();
  const renderer = createRenderer(fakeCanvas(ctx), theme);
  const camera = createCamera(renderer.viewport(), loaded.def.bounds);
  camera.setZoom(camera.fitZoom());
  return { game, renderer, camera, ctx };
}

/** RenderFrame.aim bundles pull + preview, which Game.frame reports separately. */
function aimFrame(game: ReturnType<typeof createGame>) {
  const f = game.frame();
  return f.aim ? { origin: f.aim.origin, pull: f.aim.pull, trajectory: f.trajectory } : null;
}

const birdArcs = (ctx: CanvasRenderingContext2D) =>
  callsOf(ctx).filter((c) => c.op === 'arc' && c.color === theme.palette.bird).length;

test('aiming frame paints background, level, cannon, and the aim guide', () => {
  const { game, renderer, camera, ctx } = makeSlice();
  const pull: Vec2 = { x: loaded.cannonOrigin.x - 80, y: loaded.cannonOrigin.y - 20 };
  game.beginAim();
  game.dragAim(pull);
  renderer.draw({ camera, phase: 'aiming', aim: aimFrame(game) }, game.entities.all());

  const calls = callsOf(ctx);
  assert.equal(calls[0]!.op, 'setTransform', 'the renderer resets the transform before drawing');
  assert.equal(calls[1]!.op, 'fillRect', 'background is painted first');
  assert.equal(calls[1]!.color, theme.palette.background);
  assert.ok(calls.some((c) => c.color === theme.palette.materials.glass), 'glass blocks are painted');
  assert.equal(birdArcs(ctx), 2, 'both birds are painted while alive');
  assert.ok(calls.some((c) => c.color === theme.palette.cannon), 'cannon is painted');
  assert.ok(calls.some((c) => c.color === theme.palette.pig), 'the pig waiting on the cannon is painted');
  assert.ok(calls.some((c) => c.op === 'stroke' && c.color === theme.palette.aimGuide), 'aim guide / trajectory is stroked');
  assert.ok(calls.some((c) => c.op === 'lineTo'), 'trajectory samples are emitted');
  // The camera transform is scoped: every save is matched by a restore.
  assert.equal(calls.filter((c) => c.op === 'save').length, calls.filter((c) => c.op === 'restore').length);
});

test('flight frame paints the live pig; destroyed entities stop being painted', () => {
  const { game, renderer, camera, ctx } = makeSlice();
  game.beginAim();
  game.dragAim({ x: loaded.cannonOrigin.x - loaded.maxPull, y: loaded.cannonOrigin.y });
  game.releaseAim();
  game.step(1 / 60);

  renderer.draw({ camera, phase: 'in_flight', aim: null }, game.entities.all());
  assert.ok(callsOf(ctx).some((c) => c.color === theme.palette.pig), 'the launched pig is painted');
  assert.equal(birdArcs(ctx), 2);

  // Let the tower collapse kill the beam bird.
  for (let i = 0; i < 120; i++) game.step(1 / 60);
  const dead = game.entities.get('bird-2');
  assert.ok(dead && dead.destroyed, 'beam bird died in the collapse');

  callsOf(ctx).length = 0;
  renderer.draw({ camera, phase: game.rules.snapshot().phase, aim: null }, game.entities.all());
  assert.equal(birdArcs(ctx), 1, 'a destroyed bird is no longer painted');
});
