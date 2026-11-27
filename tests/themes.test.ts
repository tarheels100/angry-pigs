import assert from 'node:assert/strict';
import test from 'node:test';

import { drawFrame } from '../src/render/renderer.ts';
import { createCamera } from '../src/camera/camera.ts';
import { registerTheme, getTheme, listThemes, type Theme, type RenderFrame } from '../src/render/theme.ts';
import { createTronTheme, tronPalette } from '../src/render/themes/tron.ts';
import { createPixelTheme, pixelPalette } from '../src/render/themes/pixel.ts';
import { createPlaceholderTheme } from '../src/render/themes/placeholder.ts';
import type { EntityState } from '../src/core/types.ts';

interface Op {
  op: string;
  colour: string | undefined;
  shadow: number | undefined;
  alpha: number | undefined;
  /** Numeric arguments, rounded: enough to compare geometry between two states.
   */
  args: number[];
}

/** Canvas stand-in for theme recipes: records paints plus the glow/alpha state. */
function recordingContext(): { ops: Op[]; ctx: CanvasRenderingContext2D } {
  const ops: Op[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  const target: Record<string, unknown> = { lineWidth: 1, globalAlpha: 1, shadowColor: '', shadowBlur: 0 };
  Object.defineProperty(target, 'fillStyle', { get: () => fillStyle, set: (v: string) => { fillStyle = v; } });
  Object.defineProperty(target, 'strokeStyle', { get: () => strokeStyle, set: (v: string) => { strokeStyle = v; } });
  const PAINT_OPS = new Set(['fillRect', 'strokeRect', 'fill', 'stroke']);
  for (const name of ['fillRect', 'strokeRect', 'beginPath', 'fill', 'stroke', 'arc', 'rect', 'moveTo', 'lineTo', 'save', 'restore', 'translate', 'scale', 'rotate', 'setTransform', 'ellipse', 'closePath', 'quadraticCurveTo']) {
    target[name] = (...values: unknown[]) => {
      const t = target as Record<string, unknown>;
      ops.push({
        op: name,
        colour: PAINT_OPS.has(name) ? (name === 'fillRect' || name === 'fill' ? fillStyle : strokeStyle) : undefined,
        shadow: PAINT_OPS.has(name) ? (t.shadowBlur as number) : undefined,
        alpha: PAINT_OPS.has(name) ? (t.globalAlpha as number) : undefined,
        args: values.filter((v) => typeof v === 'number').map((v) => Math.round(v * 100) / 100),
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

test('pixel theme paints chunky solids, no glow', () => {
  const theme = createPixelTheme();
  const ops = afterBackground(paint(theme, [entity({ kind: 'pig', shape: 'circle', material: 'metal', radius: 18 })]));
  assert.ok(ops.filter((o) => o.op === 'fillRect').length >= 3, 'body plus rim fills');
  assert.ok(!ops.some((o) => o.op === 'stroke'), 'pixel has no outlines');
  assert.ok(!ops.some((o) => (o.shadow ?? 0) > 0), 'pixel has no glow');
});

test('pixel fade extra paints the flash colour', () => {
  const theme = createPixelTheme();
  const ops = afterBackground(paint(theme, [entity({ destroyed: true, fade: 0.6 })]));
  assert.ok(ops.some((o) => o.op === 'fillRect' && o.colour === pixelPalette.flash));
});

test('pixel aim overlay paints square nodes', () => {
  const theme = createPixelTheme();
  const aim = {
    origin: { x: 120, y: 420 },
    pull: { x: -60, y: 20 },
    trajectory: Array.from({ length: 60 }, (_, i) => ({ x: 120 + i * 10, y: 420 - i * 2, hit: false })),
  };
  const ops = afterBackground(paint(theme, [], aim));
  assert.ok(ops.filter((o) => o.op === 'fillRect').length > 5, 'trajectory nodes');
  assert.ok(!ops.some((o) => o.op === 'stroke'), 'no vector lines in pixel');
});

test('themes depend only on the contract, not on the pipeline or the game', async () => {
  // M12 acceptance: a theme is a registry entry. It may import its manifest type,
  // entity state, and the viewport type — never physics, game, or level code.
  const fs = await import('node:fs/promises');
  const files = await fs.readdir(new URL('../src/render/themes/', import.meta.url));
  for (const file of files) {
    const source = await fs.readFile(new URL(`../src/render/themes/${file}`, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    for (const specifier of imports) {
      assert.ok(
        specifier.endsWith('/theme.ts') || specifier.endsWith('/types.ts') || specifier.endsWith('/camera.ts'),
        `${file} imports ${specifier}, which is outside the theme contract`,
      );
    }
  }
  assert.ok(files.includes('tron.ts') && files.includes('pixel.ts'), 'tron and pixel both ship');
});

test('every theme palette covers every material, including wood', () => {
  // A level may use any material, so a theme must have a colour for all of them
  // (docs/theme-contract.md).
  for (const theme of [createTronTheme(), createPixelTheme(), createPlaceholderTheme()]) {
    const colours = theme.palette.materials as Record<string, string>;
    for (const material of ['glass', 'wood', 'stone', 'metal', 'feather', 'ground', 'light']) {
      assert.ok(typeof colours[material] === 'string' && colours[material]!.length > 0, `${theme.id} has no colour for ${material}`);
    }
  }
});

test('materials read differently inside a block, in both themes', () => {
  // M14: glass, wood, stone and metal must be distinguishable at a glance. Texture is
  // derived from `material` plus the palette colour only (docs/theme-contract.md).
  const tron = createTronTheme();
  const opsFor = (material: string) =>
    afterBackground(paint(tron, [entity({ material: material as EntityState['material'], health: 1000, healthMax: 1000 })]));
  const glass = opsFor('glass');
  const wood = opsFor('wood');
  const stone = opsFor('stone');
  const metal = opsFor('metal');
  assert.ok(wood.length > glass.length, 'wood grain adds drawing');
  assert.ok(stone.length > glass.length, 'stone speckle adds drawing');
  assert.ok(metal.length > glass.length, 'metal adds an inner wall');
  assert.ok(wood.some((o) => o.op === 'stroke' && o.colour === tronPalette.materials.wood), 'wood texture uses the wood accent');
  assert.ok(stone.some((o) => o.op === 'fillRect' && o.colour === tronPalette.materials.stone), 'stone speckle uses the stone accent');

  const pixel = createPixelTheme();
  const pixelOps = (material: string) =>
    afterBackground(paint(pixel, [entity({ material: material as EntityState['material'], health: 1000, healthMax: 1000 })]));
  assert.ok(pixelOps('wood').length > pixelOps('metal').length, 'pixel plank joints add drawing');
  assert.ok(pixelOps('glass').some((o) => (o.alpha ?? 1) < 1), 'pixel glass is the translucent one');
});

/** A circular entity without box fields, so the theme reads it as a radius. */
function roundState(overrides: Partial<EntityState>): EntityState {
  return {
    id: 'pig-0', kind: 'pig', shape: 'circle', material: 'light',
    x: 100, y: 100, angle: 0, vx: 0, vy: 0, sleeping: false, destroyed: false,
    health: Infinity, impactEnergy: 0, radius: 24, ...overrides,
  };
}

function cannonState(pull: number, aimAngle: number, recoil: number): EntityState {
  return {
    id: 'cannon', kind: 'cannon', shape: 'box', material: 'metal',
    x: 140, y: 700, angle: 0, vx: 0, vy: 0, sleeping: true, destroyed: false,
    health: Infinity, impactEnergy: 0, halfWidth: 30, halfHeight: 14,
    variant: 'cannon', pull, aimAngle, recoil,
  };
}

test('a pig is painted as a character, and pig types read differently', () => {
  for (const theme of [createTronTheme(), createPixelTheme()]) {
    // A plain circle of the same size is the baseline; a pig must add face drawing.
    const ball = afterBackground(paint(theme, [roundState({ kind: 'block', material: 'feather' })]));
    const pig = afterBackground(paint(theme, [roundState({ variant: 'basic' })]));
    assert.ok(pig.length > ball.length, `${theme.id}: a pig draws more than a plain circle`);
    // Face parts are painted as filled shapes — rects in pixel art, filled paths in
    // neon. Either way, a pig is more than a disc.
    assert.ok(pig.filter((o) => o.op === 'fillRect' || o.op === 'fill').length >= 4, `${theme.id}: eyes, snout and ears are painted`);

    // Type marks: heavy, bomb, and cluster add a mark over the basic pig (M18 hints).
    for (const variant of ['heavy', 'bomb', 'cluster']) {
      const marked = afterBackground(paint(theme, [roundState({ variant })]));
      assert.ok(marked.length > pig.length, `${theme.id}: pig type "${variant}" adds a mark`);
    }
  }
});

test('a bird gets a wing and a beak, and a destroyed bird keeps only the body', () => {
  for (const theme of [createTronTheme(), createPixelTheme()]) {
    const ball = afterBackground(paint(theme, [roundState({ kind: 'block', material: 'feather' })]));
    const bird = afterBackground(paint(theme, [roundState({ kind: 'bird', material: 'feather', id: 'bird-1' })]));
    assert.ok(bird.length > ball.length, `${theme.id}: a bird draws more than a plain circle`);
    // Tron strokes the wing/beak/comb; Pixel stacks squares for the same parts.
    const parts = bird.filter((o) => o.op === 'stroke' || o.op === 'strokeRect' || o.op === 'fillRect').length;
    assert.ok(parts >= 4, `${theme.id}: wing, beak, and comb are painted (${parts} parts)`);

    // The death flash is a plain silhouette: face details must not survive it (D17).
    const flash = afterBackground(paint(theme, [roundState({ kind: 'bird', material: 'feather', id: 'bird-1', fade: 0.6 })]));
    assert.ok(flash.length < bird.length, `${theme.id}: the flash paints less than the live bird`);
  }
});

test('the launcher tilts with the aim and compresses its spring', () => {
  for (const theme of [createTronTheme(), createPixelTheme()]) {
    const rest = afterBackground(paint(theme, [cannonState(0, 0, 0)]));
    const aimed = afterBackground(paint(theme, [cannonState(60, -0.6, 0)]));

    // Tron rotates the barrel; Pixel steps squares along the aim direction instead,
    // so the tilt assertion is per theme (docs/theme-contract.md).
    if (theme.id === 'tron') {
      const rotations = aimed.filter((o) => o.op === 'rotate').map((o) => o.args[0] ?? 0);
      assert.ok(rotations.some((a) => Math.abs(a + 0.6) < 0.01), 'tron: the barrel follows aimAngle');
    } else {
      const muzzle = aimed.filter((o) => o.op === 'fillRect').map((o) => o.args.join(','));
      const restMuzzle = rest.filter((o) => o.op === 'fillRect').map((o) => o.args.join(','));
      assert.notDeepEqual(muzzle, restMuzzle, 'pixel: the barrel steps change with the aim');
    }

    // A pull changes the spring geometry, so the painted path differs.
    const geometry = (ops: Op[]) => ops.filter((o) => o.op === 'moveTo' || o.op === 'lineTo' || o.op === 'fillRect').map((o) => o.args.join(','));
    assert.notDeepEqual(geometry(aimed), geometry(rest), `${theme.id}: a pull changes the spring and barrel geometry`);

    // Recoil adds a flash right after a shot.
    const fired = afterBackground(paint(theme, [cannonState(60, -0.6, 1)]));
    assert.ok(fired.length > aimed.length, `${theme.id}: recoil adds a muzzle flash`);
  }
});

test('scenery props are painted as props, not as structures', () => {
  const tree: EntityState = {
    id: 'scenery-tree-560', kind: 'scenery', shape: 'box', material: 'ground',
    x: 560, y: 770, angle: 0, vx: 0, vy: 0, sleeping: true, destroyed: false,
    health: Infinity, impactEnergy: 0, halfWidth: 18, halfHeight: 70, variant: 'tree',
  };
  const ridge: EntityState = { ...tree, id: 'scenery-ridge-1300', variant: 'ridge', halfWidth: 130, halfHeight: 20 };

  for (const theme of [createTronTheme(), createPixelTheme()]) {
    const treeOps = afterBackground(paint(theme, [tree]));
    assert.ok(treeOps.filter((o) => o.op === 'fillRect' || o.op === 'fill').length >= 2, `${theme.id}: a tree has a trunk and a canopy`);
    const ridgeOps = afterBackground(paint(theme, [ridge]));
    assert.ok(ridgeOps.length > 0, `${theme.id}: a ridge is painted`);
    assert.notDeepEqual(ridgeOps, treeOps, `${theme.id}: a ridge looks different from a tree`);
  }
});

test('birds get a different silhouette per variant (D39)', () => {
  const bird = (variant?: string): EntityState => ({
    id: 'bird-1',
    kind: 'bird',
    shape: 'circle',
    material: 'feather',
    x: 0,
    y: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    sleeping: false,
    destroyed: false,
    health: 1,
    healthMax: 1,
    impactEnergy: 0,
    radius: 20,
    ...(variant ? { variant } : {}),
  });
  const viewport = { width: 400, height: 200, zoom: 1, offsetX: 0, offsetY: 0, dpr: 1 };

  const paintsFor = (theme: Theme, variant?: string): string[] => {
    const { ctx, ops } = recordingContext();
    theme.paintEntity(ctx, bird(variant), viewport);
    return ops.filter((o) => o.op === 'fillRect' || o.op === 'ellipse').map((o) => o.args.join(','));
  };

  for (const theme of [createTronTheme(), createPixelTheme()]) {
    assert.ok(paintsFor(theme, 'runner').length > 0, 'a runner bird paints');
    // Three named variants take different paths, so a mixed stage is not three copies.
    assert.notDeepEqual(paintsFor(theme, 'runner'), paintsFor(theme, 'broody'));
    assert.notDeepEqual(paintsFor(theme, 'worker'), paintsFor(theme, 'broody'));
    // An unknown variant falls back to the default shape rather than painting nothing.
    assert.ok(paintsFor(theme, 'something-else').length > 0, 'an unknown variant still paints');
  }
});
