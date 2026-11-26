import assert from 'node:assert/strict';
import test from 'node:test';

import { drawFrame } from '../src/render/renderer.ts';
import { createCamera } from '../src/camera/camera.ts';
import { registerTheme, getTheme, listThemes, type Theme, type RenderFrame } from '../src/render/theme.ts';
import { createTronTheme, tronPalette } from '../src/render/themes/tron.ts';
import { createPlaceholderTheme } from '../src/render/themes/placeholder.ts';
import type { EntityState } from '../src/core/types.ts';

interface Op { op: string; colour: string | undefined; shadow: number | undefined; alpha: number | undefined }

/** Canvas stand-in for theme recipes: records paints plus the glow/alpha state. */
function recordingContext(): { ops: Op[]; ctx: CanvasRenderingContext2D } {
  const ops: Op[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  const target: Record<string, unknown> = { lineWidth: 1, globalAlpha: 1, shadowColor: '', shadowBlur: 0 };
  Object.defineProperty(target, 'fillStyle', { get: () => fillStyle, set: (v: string) => { fillStyle = v; } });
  Object.defineProperty(target, 'strokeStyle', { get: () => strokeStyle, set: (v: string) => { strokeStyle = v; } });
  const PAINT_OPS = new Set(['fillRect', 'fill', 'stroke']);
  for (const name of ['fillRect', 'beginPath', 'fill', 'stroke', 'arc', 'rect', 'moveTo', 'lineTo', 'save', 'restore', 'translate', 'scale', 'rotate', 'setTransform']) {
    target[name] = () => {
      const t = target as Record<string, unknown>;
      ops.push({
        op: name,
        colour: PAINT_OPS.has(name) ? (name === 'fillRect' || name === 'fill' ? fillStyle : strokeStyle) : undefined,
        shadow: PAINT_OPS.has(name) ? (t.shadowBlur as number) : undefined,
        alpha: PAINT_OPS.has(name) ? (t.globalAlpha as number) : undefined,
      });
    };
  }
  target.createLinearGradient = () => ({ addColorStop: () => {} });
  return { ops, ctx: target as unknown as CanvasRenderingContext2D };
}

/** Everything painted after the background. The background recipe is a fill plus one
 * grid stroke, so cutting at the first stroke leaves entities and overlay. */
function afterBackground(ops: Op[]): Op[] {
  const index = ops.findIndex((o) => o.op === 'stroke');
  return index < 0 ? ops : ops.slice(index + 1);
}

const viewport = { width: 1600, height: 900, dpr: 1 };
const camera = createCamera(viewport, { width: 1600, height: 900 });
const entity = (overrides: Partial<EntityState> = {}): EntityState => ({
  id: 'block-1', kind: 'block', shape: 'box', material: 'glass',
  x: 300, y: 400, angle: 0, vx: 0, vy: 0, sleeping: false, destroyed: false,
  health: 4, impactEnergy: 0, halfWidth: 20, halfHeight: 20, ...overrides,
});

function paint(theme: Theme, entities: EntityState[], aim: RenderFrame['aim'] = null): Op[] {
  const { ops, ctx } = recordingContext();
  drawFrame(ctx, theme, { camera, phase: 'aiming', aim }, entities, viewport);
  return ops;
}

test('tron is registered and selectable through the registry', () => {
  registerTheme(createTronTheme());
  registerTheme(createPlaceholderTheme({}, 'placeholder'));
  assert.ok(listThemes().includes('tron'));
  assert.equal(getTheme('tron').id, 'tron');
  assert.equal(getTheme('tron').palette.background, tronPalette.background);
});

test('tron strokes entities in the role accent and glows', () => {
  const theme = createTronTheme();
  const strokes = afterBackground(paint(theme, [entity({ kind: 'pig', shape: 'circle', material: 'metal', radius: 18 })])).filter((o) => o.op === 'stroke');
  assert.ok(strokes.length > 0, 'entities are outlined, not filled solid');
  assert.equal(strokes[0]!.colour, tronPalette.pig, 'pig outline uses the pig accent');
  assert.ok((strokes[0]!.shadow ?? 0) > 0, 'the outline carries glow');

  const bird = afterBackground(paint(theme, [entity({ id: 'bird-1', kind: 'bird', shape: 'circle', material: 'feather', radius: 20 })])).filter((o) => o.op === 'stroke');
  assert.equal(bird[0]!.colour, tronPalette.bird);
});

test('a damaged block shows partial damage (healthMax drives the look)', () => {
  const theme = createTronTheme();
  const intact = afterBackground(paint(theme, [entity({ health: 1200, healthMax: 1200 })])).filter((o) => o.op === 'stroke');
  const cracked = afterBackground(paint(theme, [entity({ health: 300, healthMax: 1200 })])).filter((o) => o.op === 'stroke');
  assert.ok(cracked.length > intact.length, 'damage adds crack strokes');
});

test('a fading extra paints the flash and dims out', () => {
  const theme = createTronTheme();
  const strokes = afterBackground(paint(theme, [entity({ destroyed: true, fade: 0.5 })])).filter((o) => o.op === 'stroke');
  assert.equal(strokes[0]!.colour, tronPalette.flash, 'destroyed flash colour');
  assert.ok((strokes[0]!.alpha ?? 1) < 1, 'the flash fades with the fade field');
});

test('background paints a field plus grid lines', () => {
  const theme = createTronTheme();
  const ops = paint(theme, []);
  assert.ok(ops.some((o) => o.op === 'fillRect'), 'background fills the viewport');
  const gridLines = ops.filter((o) => o.op === 'moveTo' || o.op === 'lineTo').length;
  assert.ok(gridLines > 10, `grid lines are drawn (${gridLines})`);
});

test('aim overlay draws the pull line and trajectory nodes', () => {
  const theme = createTronTheme();
  const aim = {
    origin: { x: 120, y: 420 },
    pull: { x: -60, y: 20 },
    trajectory: Array.from({ length: 60 }, (_, i) => ({ x: 120 + i * 10, y: 420 - i * 2, hit: false })),
  };
  const ops = afterBackground(paint(theme, [], aim));
  assert.ok(ops.some((o) => o.op === 'stroke' && o.colour === tronPalette.aimGuide), 'pull line is stroked in the aim colour');
  assert.ok(ops.filter((o) => o.op === 'fill').length > 5, 'trajectory is drawn as nodes');
});

test('no aim means no overlay paint', () => {
  const theme = createTronTheme();
  const ops = afterBackground(paint(theme, []));
  assert.ok(!ops.some((o) => o.op === 'stroke' && o.colour === tronPalette.aimGuide));
});
