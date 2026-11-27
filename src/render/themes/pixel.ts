import type { EntityState, MaterialId } from '../../core/types.ts';
import type { RenderFrame, Theme, ThemePalette } from '../theme.ts';
import type { Viewport } from '../../camera/camera.ts';

/** Pixel: chunky, solid, no glow. Deliberately the opposite of Tron while using the
 * same contract (docs/theme-contract.md) — it exists to prove M12: a second theme is a
 * registry change only.
 */
export const pixelPalette: ThemePalette = {
  background: '#1b1410',
  outline: '#f2c46b',
  grid: '#2b2118',
  materials: {
    glass: '#6fb6c9',
    wood: '#a8724a',
    stone: '#7b6a5a',
    metal: '#c9a226',
    feather: '#e0603f',
    ground: '#3a2b1f',
    light: '#ffe08a',
  } satisfies Record<MaterialId, string>,
  pig: '#ef7f92',
  bird: '#ffd24a',
  cannon: '#c9a226',
  aimGuide: '#ffe08a',
  flash: '#fff6df',
};

/** Quantisation step: everything snaps to a visible pixel grid. */
const PIXEL = 4;
const BLOCK = 16;

function snap(v: number): number {
  return Math.round(v / PIXEL) * PIXEL;
}

/** Pixel material texture: plank joints, brick courses, a metal highlight band, and
 * translucent glass. Same contract as Tron's texture, entirely different look.
 */
function paintMaterialTexture(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette, w: number, h: number): void {
  if (state.shape !== 'box' || state.kind !== 'block') return;
  const dark = palette.background;
  switch (state.material) {
    case 'wood': {
      ctx.fillStyle = dark;
      const courses = Math.max(2, Math.round(h / (PIXEL * 4)));
      for (let i = 1; i < courses; i++) ctx.fillRect(-w / 2, -h / 2 + i * (h / courses), w, PIXEL);
      break;
    }
    case 'stone': {
      // Brick courses with staggered joints.
      ctx.fillStyle = dark;
      const courses = Math.max(2, Math.round(h / (PIXEL * 3)));
      for (let i = 1; i < courses; i++) {
        const y = -h / 2 + i * (h / courses);
        ctx.fillRect(-w / 2, y, w, PIXEL);
        const joint = i % 2 === 0 ? w * 0.35 : w * 0.65;
        ctx.fillRect(-w / 2 + joint, y - PIXEL * 2, PIXEL, PIXEL * 2);
      }
      break;
    }
    case 'metal': {
      ctx.fillStyle = palette.flash;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-w / 2 + PIXEL, -h / 2 + PIXEL, w - PIXEL * 2, PIXEL);
      ctx.globalAlpha = 1;
      break;
    }
    case 'glass': {
      // Glass is the only translucent fill in this theme.
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = palette.flash;
      ctx.fillRect(-w / 2 + PIXEL, -h / 2 + PIXEL, w - PIXEL * 2, h - PIXEL * 2);
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
}

/**
 * A pig as stacked squares. Playtest: the old art was a disc with hairline marks, so
 * the ears, snout, eyes, and legs are now blocks that clear the body outline. Type hue
 * varies by ammo type (M18): a heavy is a darker rust, a bomb is dark with a lit fuse.
 */
function paintPig(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number, variant: string): void {
  const hue =
    variant === 'heavy' ? '#b8434a' : variant === 'bomb' ? '#4a4258' : variant === 'cluster' ? '#ffa8c0' : palette.pig;
  const dark = '#2a1a14';
  const light = variant === 'bomb' ? '#8f86a0' : '#f4a9b8';

  // Ears: blocks that sit past the body, so they read at any zoom.
  ctx.fillStyle = hue;
  ctx.fillRect(snap(-half + PIXEL) - PIXEL, snap(-half) - PIXEL * 3, PIXEL * 2, PIXEL * 2);
  ctx.fillRect(snap(half - PIXEL * 2), snap(-half) - PIXEL * 3, PIXEL * 2, PIXEL * 2);

  // Legs.
  ctx.fillRect(snap(-half * 0.5) - PIXEL, snap(half), PIXEL * 2, PIXEL * 2);
  ctx.fillRect(snap(half * 0.5) - PIXEL, snap(half), PIXEL * 2, PIXEL * 2);

  // Snout: a lighter block protruding from the leading edge, nostrils punched out.
  ctx.fillStyle = light;
  ctx.fillRect(snap(half) - PIXEL, -PIXEL * 2, PIXEL * 3, PIXEL * 4);
  ctx.fillStyle = dark;
  ctx.fillRect(snap(half) + PIXEL, -PIXEL * 2, PIXEL, PIXEL);
  ctx.fillRect(snap(half) + PIXEL, PIXEL, PIXEL, PIXEL);

  // Eyes: a light block with a dark pupil.
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(snap(half * 0.3) - PIXEL, snap(-half * 0.55) - PIXEL, PIXEL * 2, PIXEL * 3);
  ctx.fillRect(snap(-half * 0.2) - PIXEL, snap(-half * 0.6) - PIXEL, PIXEL, PIXEL * 2);
  ctx.fillStyle = dark;
  ctx.fillRect(snap(half * 0.3), snap(-half * 0.55), PIXEL, PIXEL * 2);

  // Type marks, chunky rather than hairline.
  if (variant === 'heavy') {
    ctx.fillStyle = dark;
    ctx.fillRect(snap(-half * 0.7), snap(-half * 0.1), PIXEL * 4, PIXEL);
    ctx.fillRect(snap(-half * 0.7), snap(half * 0.3), PIXEL * 4, PIXEL);
  } else if (variant === 'bomb') {
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(-PIXEL, snap(-half) - PIXEL * 2, PIXEL, PIXEL * 2);
    ctx.fillRect(PIXEL, snap(-half) - PIXEL * 3, PIXEL * 2, PIXEL * 2);
  } else if (variant === 'cluster') {
    ctx.fillStyle = dark;
    ctx.fillRect(snap(-half * 0.6), -PIXEL, PIXEL * 2, PIXEL);
    ctx.fillRect(snap(-half * 0.6), PIXEL, PIXEL * 2, PIXEL);
  } else {
    ctx.fillStyle = dark;
    ctx.fillRect(snap(-half * 0.45), snap(half * 0.35) - PIXEL, PIXEL * 2, PIXEL * 2);
  }
}

/**
 * A bird as stacked squares. Playtest: it read as "a sun" — a disc with a ring — so the
 * body is now a wide chunky block with a wing, tail steps, an orange beak, and a comb.
 */
function paintBird(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number): void {
  const yellow = palette.bird;
  const dark = '#8a5a22';
  const orange = '#ff9a4a';
  const red = '#e04a3a';

  // Tail steps behind the body.
  ctx.fillStyle = yellow;
  ctx.fillRect(snap(-half) - PIXEL * 2, snap(-half * 0.45) - PIXEL, PIXEL * 2, PIXEL);
  ctx.fillRect(snap(-half) - PIXEL * 2, snap(-half * 0.1), PIXEL * 2, PIXEL);
  ctx.fillRect(snap(-half) - PIXEL * 2, snap(half * 0.35) - PIXEL, PIXEL * 2, PIXEL);

  // Legs.
  ctx.fillStyle = orange;
  ctx.fillRect(-PIXEL, snap(half), PIXEL, PIXEL * 2);
  ctx.fillRect(PIXEL, snap(half), PIXEL, PIXEL * 2);

  // Body: wider than tall, so it is an egg rather than a disc.
  ctx.fillStyle = yellow;
  ctx.fillRect(snap(-half), snap(-half * 0.7), snap(half * 2), snap(half * 1.4));

  // Wing: a darker band across the body.
  ctx.fillStyle = dark;
  ctx.fillRect(snap(-half * 0.6), -PIXEL, PIXEL * 4, PIXEL * 2);
  ctx.fillRect(snap(-half * 0.3), PIXEL * 2, PIXEL * 3, PIXEL);

  // Comb: three red blocks on top.
  ctx.fillStyle = red;
  ctx.fillRect(snap(-half * 0.35), snap(-half) - PIXEL * 2, PIXEL, PIXEL * 2);
  ctx.fillRect(snap(-half * 0.05), snap(-half) - PIXEL * 3, PIXEL, PIXEL * 3);
  ctx.fillRect(snap(half * 0.25), snap(-half) - PIXEL * 2, PIXEL, PIXEL * 2);

  // Beak: a stepped orange wedge past the body edge.
  ctx.fillStyle = orange;
  ctx.fillRect(snap(half), -PIXEL, PIXEL * 2, PIXEL * 2);
  ctx.fillRect(snap(half) + PIXEL * 2, -PIXEL, PIXEL, PIXEL);

  // Eye: light block with a dark pupil.
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(snap(half * 0.45) - PIXEL, snap(-half * 0.5) - PIXEL, PIXEL * 2, PIXEL * 2);
  ctx.fillStyle = dark;
  ctx.fillRect(snap(half * 0.45), snap(-half * 0.5), PIXEL, PIXEL);
}

/** Pull length that fully compresses the launcher spring (appearance, not gameplay). */
const SPRING_FULL = 90;

/**
 * The launcher as stacked blocks (docs/adr.md D28). Playtest: the launcher looked like
 * junk and sat in mid-air, so the art is a carriage of blocks with wheels, a stepped
 * barrel that tilts with the aim, a muzzle block, a coil that shortens with the pull,
 * and a pull gauge. The carriage reaches 56 units below the pivot, where the levels put
 * the ground.
 */
function paintCannon(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  const pull = state.pull ?? 0;
  const aimAngle = state.aimAngle ?? 0;
  const recoil = state.recoil ?? 0;
  const compress = Math.min(1, pull / SPRING_FULL);
  const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };

  // Carriage: three rows of blocks down to the ground, widening as it goes.
  ctx.fillStyle = palette.cannon;
  ctx.fillRect(-PIXEL * 5, 10, PIXEL * 10, PIXEL * 2);
  ctx.fillRect(-PIXEL * 6, 10 + PIXEL * 2, PIXEL * 12, PIXEL * 2);
  ctx.fillRect(-PIXEL * 7, 10 + PIXEL * 4, PIXEL * 14, PIXEL * 2);
  ctx.fillStyle = palette.background;
  ctx.fillRect(-PIXEL * 4, 10 + PIXEL * 2, PIXEL * 2, PIXEL * 2);
  ctx.fillRect(PIXEL * 2, 10 + PIXEL * 2, PIXEL * 2, PIXEL * 2);

  // Wheels: a block with a bright hub.
  for (const dx of [-PIXEL * 4, PIXEL * 4]) {
    ctx.fillStyle = palette.cannon;
    ctx.fillRect(dx - PIXEL * 2, 34, PIXEL * 4, PIXEL * 4);
    ctx.fillStyle = palette.flash;
    ctx.fillRect(dx - PIXEL, 38, PIXEL * 2, PIXEL * 2);
  }

  // Barrel: blocks stepped along the aim direction, thicker at the breech.
  ctx.fillStyle = palette.cannon;
  for (let i = 0; i < 9; i++) {
    const t = -PIXEL * 3 + i * PIXEL * 4;
    const size = i < 3 ? PIXEL * 2 : PIXEL;
    ctx.fillRect(snap(dir.x * t) - size / 2, snap(dir.y * t) - size / 2, size, size);
  }
  // Muzzle block at the launch point ahead of the pivot.
  const muzzleX = snap(dir.x * PIXEL * 10);
  const muzzleY = snap(dir.y * PIXEL * 10);
  ctx.fillRect(muzzleX - PIXEL, muzzleY - PIXEL, PIXEL * 2, PIXEL * 2);
  if (recoil > 0) {
    ctx.fillStyle = palette.flash;
    ctx.fillRect(muzzleX - PIXEL * 2, muzzleY - PIXEL * 2, PIXEL * 4, PIXEL * 4);
    ctx.fillRect(snap(dir.x * PIXEL * 14) - PIXEL, muzzleY - PIXEL, PIXEL, PIXEL * 2);
  }

  // Coil: pixels behind the breech, spacing shrinking as the pull grows.
  ctx.fillStyle = palette.pig;
  const spacing = PIXEL * (1.7 - compress * 0.9);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(snap(-PIXEL * 4 - i * spacing), snap(dir.y * -PIXEL * 4) + (i % 2 === 0 ? -PIXEL : PIXEL), PIXEL, PIXEL);
  }

  // Pull gauge: blocks along an arc under the barrel, filled by the pull fraction.
  const blocks = Math.round(compress * 6);
  for (let i = 0; i < blocks; i++) {
    ctx.fillRect(-PIXEL * 6 + i * PIXEL * 2, 52, PIXEL * 2, PIXEL);
  }
}

/** Scenery props (M15): a tree stacked as squares, or a stepped ridge silhouette. */
function paintScenery(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  const hw = snap(state.halfWidth ?? state.radius ?? 16);
  const hh = snap(state.halfHeight ?? state.radius ?? 16);
  ctx.fillStyle = palette.grid;

  if (state.variant === 'ridge') {
    // A stepped ridge: three blocks of decreasing height.
    for (let i = 0; i < 3; i++) {
      const h = hh * (0.4 + (i % 2) * 0.35);
      ctx.fillRect(-hw + i * (hw / 3), hh - h, hw / 3, h);
    }
    return;
  }

  // Plinth: stacked blocks with a bright cap, the masonry the launcher stands on.
  if (state.variant === 'plinth') {
    const rows = Math.max(2, Math.round(hh / PIXEL / 2));
    for (let i = 0; i < rows; i++) {
      const y = hh - (i + 1) * (hh * 2 / rows);
      ctx.fillRect(-hw, y, hw * 2, hh * 2 / rows - PIXEL / 2);
      // Staggered joint, punched out in the background colour.
      const joint = i % 2 === 0 ? -hw + hw * 0.4 : hw * 0.3;
      ctx.fillStyle = palette.background;
      ctx.fillRect(joint, y, PIXEL, hh * 2 / rows - PIXEL / 2);
      ctx.fillStyle = palette.grid;
    }
    ctx.fillStyle = palette.outline;
    ctx.fillRect(-hw, -hh, hw * 2, PIXEL);
    return;
  }

  // Tree: trunk, then three canopy rows narrowing upward.
  ctx.fillRect(-PIXEL, 0, PIXEL * 2, hh);
  for (let i = 0; i < 3; i++) {
    const row = hw - i * PIXEL * 2;
    ctx.fillRect(-row / 2, -hh + i * PIXEL * 3, row, PIXEL * 3);
  }
}

export function createPixelTheme(overrides: Partial<ThemePalette> = {}, id = 'pixel'): Theme {
  const palette = { ...pixelPalette, ...overrides };

  function accent(state: EntityState): string {
    if (state.kind === 'pig') return palette.pig;
    if (state.kind === 'bird') return palette.bird;
    if (state.kind === 'cannon') return palette.cannon;
    return palette.materials[state.material];
  }

  /** A circle becomes a snapped square: the pixel look without sprite assets. */
  function square(ctx: CanvasRenderingContext2D, state: EntityState): void {
    const half = state.shape === 'circle' ? (state.radius ?? 16) : (state.halfWidth ?? 20);
    const hh = state.shape === 'circle' ? (state.radius ?? 16) : (state.halfHeight ?? 20);
    const w = snap(half) * 2;
    const h = snap(hh) * 2;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  function damageRatio(state: EntityState): number {
    if (state.healthMax === undefined || state.healthMax === Infinity) return 0;
    return Math.min(1, Math.max(0, 1 - state.health / state.healthMax));
  }

  return {
    id,
    name: id === 'pixel' ? 'Pixel (chunky)' : `Pixel variant: ${id}`,
    palette,

    paintBackground(ctx, viewport) {
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      // Checkerboard: cheap, and it reads as a pixel field rather than a vector grid.
      ctx.fillStyle = palette.grid;
      for (let x = 0; x < viewport.width; x += BLOCK * 2) {
        for (let y = 0; y < viewport.height; y += BLOCK * 2) {
          ctx.fillRect(x, y, BLOCK, BLOCK);
          ctx.fillRect(x + BLOCK, y + BLOCK, BLOCK, BLOCK);
        }
      }
    },

    paintEntity(ctx, state, viewport) {
      void viewport;
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.angle);

      if (state.fade !== undefined) {
        ctx.globalAlpha = Math.max(0, state.fade);
        ctx.fillStyle = palette.flash;
        square(ctx, state);
        ctx.restore();
        return;
      }

      if (state.kind === 'scenery') {
        // Art-only prop (M15): a chunky tree or ridge, painted behind entities.
        paintScenery(ctx, state, palette);
        ctx.restore();
        return;
      }

      ctx.fillStyle = accent(state);
      square(ctx, state);

      // Darker rim: a solid body with a hard edge, no soft glow.
      ctx.fillStyle = palette.outline;
      const half = (state.shape === 'circle' ? state.radius ?? 16 : state.halfWidth ?? 20);
      const hh = (state.shape === 'circle' ? state.radius ?? 16 : state.halfHeight ?? 20);
      const w = snap(half) * 2;
      const h = snap(hh) * 2;
      ctx.fillRect(-w / 2, -h / 2, w, PIXEL);
      ctx.fillRect(-w / 2, h / 2 - PIXEL, w, PIXEL);

      // Damage reads as missing chunks, not cracks.
      const damaged = damageRatio(state);
      if (damaged > 0.2) {
        ctx.fillStyle = palette.background;
        const chunks = Math.round(damaged * 3);
        for (let i = 0; i < chunks; i++) {
          ctx.fillRect(-w / 2 + PIXEL + i * PIXEL * 3, -h / 2 + PIXEL, PIXEL * 2, PIXEL * 2);
        }
      }

      paintMaterialTexture(ctx, state, palette, w, h);

      // Entity art, snapped to the pixel grid: ears and a snout for a pig, a wing
      // and beak for a bird, a stepped barrel and spring coils for the launcher.
      if (state.kind === 'pig') paintPig(ctx, palette, snap(state.radius ?? 16), state.variant ?? 'basic');
      else if (state.kind === 'bird') paintBird(ctx, palette, snap(state.radius ?? 16));
      else if (state.kind === 'cannon') paintCannon(ctx, state, palette);

      ctx.restore();
    },

    paintOverlay(ctx, frame, viewport) {
      void viewport;
      const aim = frame.aim;
      if (!aim) return;

      ctx.fillStyle = palette.aimGuide;
      ctx.fillRect(aim.origin.x - PIXEL, aim.origin.y - PIXEL, PIXEL * 2, PIXEL * 2);
      ctx.fillRect(aim.origin.x + aim.pull.x - PIXEL, aim.origin.y + aim.pull.y - PIXEL, PIXEL * 2, PIXEL * 2);
      for (let i = 0; i < aim.trajectory.length; i += 8) {
        const sample = aim.trajectory[i]!;
        ctx.globalAlpha = 0.9 - (i / aim.trajectory.length) * 0.5;
        ctx.fillRect(snap(sample.x) - PIXEL / 2, snap(sample.y) - PIXEL / 2, PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    },
  };
}
