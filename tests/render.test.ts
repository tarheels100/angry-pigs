import assert from 'node:assert/strict';
import test from 'node:test';

import { createCamera } from '../src/camera/camera.ts';
import { drawFrame, createRenderer } from '../src/render/renderer.ts';
import { registerTheme, getTheme, listThemes } from '../src/render/theme.ts';
import { createPlaceholderTheme } from '../src/render/themes/placeholder.ts';
import { basePalette } from '../src/render/themes/placeholder.ts';
import type { EntityState } from '../src/core/types.ts';

interface Op { op: string; colour?: string | undefined }

/** Minimal CanvasRenderingContext2D stand-in that records draw calls. */
function recordingContext(): { ops: Op[]; ctx: CanvasRenderingContext2D } {
  const ops: Op[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  const target: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
  };
  Object.defineProperty(target, 'fillStyle', { get: () => fillStyle, set: (v: string) => { fillStyle = v; } });
  Object.defineProperty(target, 'strokeStyle', { get: () => strokeStyle, set: (v: string) => { strokeStyle = v; } });
  const PAINT_OPS = new Set(['fillRect', 'fill', 'stroke']);
  for (const name of ['fillRect', 'beginPath', 'fill', 'stroke', 'arc', 'rect', 'moveTo', 'lineTo', 'save', 'restore', 'translate', 'scale', 'rotate', 'setTransform']) {
    target[name] = () => ops.push({ op: name, colour: PAINT_OPS.has(name) ? fillStyle || strokeStyle : undefined });
  }
  return { ops, ctx: target as unknown as CanvasRenderingContext2D };
}

function entity(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: 'block-1', kind: 'block', shape: 'box', material: 'glass',
    x: 300, y: 400, angle: 0, vx: 0, vy: 0, sleeping: false, destroyed: false,
    health: 4, impactEnergy: 0, halfWidth: 20, halfHeight: 20, ...overrides,
  };
}

const viewport = { width: 1600, height: 900, dpr: 1 };
const frame = (camera: ReturnType<typeof createCamera>): ReturnType<typeof makeFrame> => makeFrame(camera);
function makeFrame(camera: ReturnType<typeof createCamera>) {
  return { camera, phase: 'aiming' as const, aim: null };
}

test('camera fits the world and round-trips coordinates', () => {
  const camera = createCamera(viewport, { width: 1600, height: 900 });
  assert.equal(camera.fitZoom(), 1);
  const p = { x: 300, y: 400 };
  assert.deepEqual(camera.screenToWorld(camera.worldToScreen(p)), p);
  // Centre of the world maps to the centre of the viewport.
  assert.deepEqual(camera.worldToScreen({ x: 800, y: 450 }), { x: 800, y: 450 });
});

test('camera pans and zooms, clamping pan to the level', () => {
  const camera = createCamera(viewport, { width: 1600, height: 900 });
  camera.panTo(2000, 450);
  assert.equal(camera.position().x, 1600, 'pan is clamped to the level');
  camera.setZoom(10);
  assert.ok(camera.zoom() <= 3, 'zoom is clamped');
  camera.panTo(200, 450);
  camera.setZoom(2);
  assert.deepEqual(camera.worldToScreen({ x: 200, y: 450 }), { x: 800, y: 450 });
});

test('draw order is background, entities, overlay', () => {
  const theme = createPlaceholderTheme();
  const { ops, ctx } = recordingContext();
  drawFrame(ctx, theme, frame(createCamera(viewport, { width: 1600, height: 900 })), [entity(), entity({ id: 'bird-1', kind: 'bird' })], viewport);
  assert.equal(ops[0]!.op, 'fillRect');
  assert.equal(ops[0]!.colour, theme.palette.background);
  const fills = ops.filter((o) => o.op === 'fill');
  assert.equal(fills.length, 2, 'one fill per entity');
  assert.equal(ops.at(-1)!.op, 'restore', 'camera transform is undone after the overlay');
  const overlayIndex = ops.findIndex((o) => o.op === 'stroke');
  assert.ok(overlayIndex > ops.lastIndexOf(fills.at(-1)!), 'overlay drawn after entities');
});

test('entities use the palette for their kind and material', () => {
  const theme = createPlaceholderTheme();
  const { ops, ctx } = recordingContext();
  drawFrame(ctx, theme, frame(createCamera(viewport, { width: 1600, height: 900 })), [
    entity({ material: 'stone' }),
    entity({ id: 'pig-1', kind: 'pig', material: 'light', shape: 'circle', radius: 18 }),
    entity({ id: 'bird-1', kind: 'bird', material: 'feather' }),
  ], viewport);
  const colours = ops.filter((o) => o.op === 'fillRect' || o.op === 'fill').map((o) => o.colour);
  assert.deepEqual(colours, [theme.palette.background, theme.palette.materials.stone, theme.palette.pig, theme.palette.bird]);
});

test('destroyed entities render in the flash colour in any theme', () => {
  const theme = createPlaceholderTheme();
  const { ops, ctx } = recordingContext();
  drawFrame(ctx, theme, frame(createCamera(viewport, { width: 1600, height: 900 })), [entity({ kind: 'bird', material: 'feather', destroyed: true })], viewport);
  assert.equal(ops.filter((o) => o.op === 'fill')[0]!.colour, theme.palette.flash);
});

test('swapping the theme changes only colours', () => {
  const placeholder = createPlaceholderTheme();
  const other = createPlaceholderTheme(
    { background: '#f6e7d4', materials: { ...basePalette.materials, stone: '#c98f5a' }, bird: '#e0552d' },
    'cartoonish',
  );
  const camera = createCamera(viewport, { width: 1600, height: 900 });
  const entities = [entity({ material: 'stone' }), entity({ id: 'bird-1', kind: 'bird' })];

  const a = recordingContext();
  drawFrame(a.ctx, placeholder, frame(camera), entities, viewport);
  const b = recordingContext();
  drawFrame(b.ctx, other, frame(camera), entities, viewport);

  assert.deepEqual(a.ops.map((o) => o.op), b.ops.map((o) => o.op), 'same draw sequence, different theme');
  const paint = (list: Op[]) => list.filter((o) => o.colour !== undefined).map((o) => o.colour);
  assert.equal(paint(a.ops).length, paint(b.ops).length, 'same number of paint calls');
  assert.notEqual(paint(a.ops)[0], paint(b.ops)[0], 'background colour changed');
  assert.notEqual(paint(a.ops)[1], paint(b.ops)[1], 'stone colour changed');
});

test('theme registry selects by id and reports unknown ids', () => {
  registerTheme(createPlaceholderTheme());
  assert.ok(listThemes().includes('placeholder'));
  assert.equal(getTheme('placeholder').id, 'placeholder');
  assert.throws(() => getTheme('pixel-art'), /unknown theme/);
});

test('renderer draws through the canvas context and swaps themes', () => {
  const { ops, ctx } = recordingContext();
  const canvas = { getContext: () => ctx, clientWidth: 1600, clientHeight: 900, width: 1600, height: 900, style: {} } as unknown as HTMLCanvasElement;
  const renderer = createRenderer(canvas, createPlaceholderTheme());
  const camera = createCamera(renderer.viewport(), { width: 1600, height: 900 });
  renderer.draw(frame(camera), [entity()]);
  assert.ok(ops.length > 0);
  renderer.setTheme(createPlaceholderTheme({ background: '#000000' }, 'dark-variant'));
  const before = ops.length;
  renderer.draw(frame(camera), [entity()]);
  assert.ok(ops.length > before);
  assert.equal(ops.slice(before).find((o) => o.op === 'fillRect')!.colour, '#000000');
});
