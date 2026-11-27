import type { EntityState, MaterialId } from '../../core/types.ts';
import type { RenderFrame, Theme, ThemePalette } from '../theme.ts';
import type { Viewport } from '../../camera/camera.ts';

/** Tron: dark field, neon wireframes, additive glow (docs/theme-contract.md).
 * Everything here is appearance; the only state read is EntityState.
 */
export const tronPalette: ThemePalette = {
  background: '#04070c',
  outline: '#00e5ff',
  grid: '#0b2431',
  materials: {
    glass: '#7df9ff',
    wood: '#f0a35a',
    stone: '#5d7f92',
    metal: '#00e5ff',
    feather: '#ff2d6f',
    ground: '#136c7a',
    light: '#a8f7ff',
  } satisfies Record<MaterialId, string>,
  pig: '#ff7a9c',
  bird: '#ffd24a',
  cannon: '#00e5ff',
  aimGuide: '#a8f7ff',
  flash: '#ffffff',
};

/** Glow radius in CSS pixels; kept small because shadowBlur is the costly part. */
const GLOW = 10;
/** Grid spacing in screen pixels. The background is painted before the camera
 * transform, so the grid is a field texture, not a world object. Playtest: the field
 * read as fine noise next to a 1600x900 world, so the cell is 5x the old spacing.
 */
const GRID = 220;

/**
 * Material texture inside a block, drawn from the palette colour only, so two themes
 * can render the same material completely differently (docs/theme-contract.md).
 * Tron reads materials as construction: planks, speckle, double-walled metal, sheen.
 */
function paintMaterialTexture(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  if (state.shape !== 'box' || state.kind !== 'block') return;
  const hw = state.halfWidth ?? 20;
  const hh = state.halfHeight ?? 20;
  const colour = palette.materials[state.material];
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;

  switch (state.material) {
    case 'wood': {
      // Grain: horizontal planks along the longer axis.
      ctx.beginPath();
      const planks = Math.max(3, Math.round(hh / 10));
      for (let i = 1; i < planks; i++) {
        const y = -hh + (i / planks) * 2 * hh;
        ctx.moveTo(-hw, y);
        ctx.lineTo(hw, y);
      }
      ctx.stroke();
      break;
    }
    case 'stone': {
      // Speckle: aggregate in the mortar.
      const dots = Math.max(6, Math.round(hw * hh / 200));
      for (let i = 0; i < dots; i++) {
        const x = -hw + ((i * 7) % (2 * hw));
        const y = -hh + ((i * 11) % (2 * hh));
        ctx.fillRect(x, y, 2, 2);
      }
      break;
    }
    case 'metal': {
      // Double wall plus rivets: the inner outline says "load-bearing".
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(-hw + 4, -hh + 4, 2 * hw - 8, 2 * hh - 8);
      ctx.globalAlpha = 0.8;
      ctx.fillRect(-hw + 4, -hh + 4, 3, 3);
      ctx.fillRect(hw - 7, -hh + 4, 3, 3);
      ctx.fillRect(-hw + 4, hh - 7, 3, 3);
      ctx.fillRect(hw - 7, hh - 7, 3, 3);
      break;
    }
    case 'glass': {
      // Sheen: one diagonal highlight, nothing else.
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.7, -hh * 0.7);
      ctx.lineTo(hw * 0.4, hh * 0.1);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function createTronTheme(overrides: Partial<ThemePalette> = {}, id = 'tron'): Theme {
  const palette = { ...tronPalette, ...overrides };

  /** Outline colour by role. Roles, not materials, decide identity (theme-contract). */
  function accent(state: EntityState): string {
    if (state.kind === 'pig') return palette.pig;
    if (state.kind === 'bird') return palette.bird;
    if (state.kind === 'cannon') return palette.cannon;
    return palette.materials[state.material];
  }

  function glow(ctx: CanvasRenderingContext2D, colour: string, strength: number): void {
    ctx.shadowColor = colour;
    ctx.shadowBlur = GLOW * strength;
  }

  function clearGlow(ctx: CanvasRenderingContext2D): void {
    ctx.shadowBlur = 0;
  }

  /** Path for the entity body, in local coordinates. */
  function bodyPath(ctx: CanvasRenderingContext2D, state: EntityState): void {
    ctx.beginPath();
    if (state.shape === 'circle') {
      ctx.arc(0, 0, state.radius ?? 16, 0, Math.PI * 2);
    } else {
      ctx.rect(-(state.halfWidth ?? 20), -(state.halfHeight ?? 20), (state.halfWidth ?? 20) * 2, (state.halfHeight ?? 20) * 2);
    }
  }

  /** Damage as a 0..1 ratio from the state's own health fields; no damage maths. */
  function damageRatio(state: EntityState): number {
    if (state.healthMax === undefined || state.healthMax === Infinity) return 0;
    return Math.min(1, Math.max(0, 1 - state.health / state.healthMax));
  }

  return {
    id,
    name: id === 'tron' ? 'Tron (neon)' : `Tron variant: ${id}`,
    palette,

    paintBackground(ctx, viewport) {
      const sky = ctx.createLinearGradient(0, 0, 0, viewport.height);
      sky.addColorStop(0, palette.background);
      sky.addColorStop(1, '#08131c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < viewport.width; x += GRID) ctx.moveTo(x, 0), ctx.lineTo(x, viewport.height);
      for (let y = 0; y < viewport.height; y += GRID) ctx.moveTo(0, y), ctx.lineTo(viewport.width, y);
      ctx.stroke();
    },

    paintEntity(ctx, state, viewport) {
      void viewport;
      const colour = accent(state);
      const damaged = damageRatio(state);
      const fading = state.fade;

      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.angle);

      if (fading !== undefined) {
        // A destroyed body is gone from the snapshot (D17); this extra is the flash.
        ctx.globalAlpha = Math.max(0, fading);
        ctx.strokeStyle = palette.flash;
        glow(ctx, palette.flash, 1.4 * Math.max(0.2, fading));
        ctx.lineWidth = 2;
        bodyPath(ctx, state);
        ctx.stroke();
        clearGlow(ctx);
        ctx.restore();
        return;
      }

      if (state.kind === 'scenery') {
        // Art-only prop (M15): painted in the `behind` layer, never a body.
        paintScenery(ctx, state, palette);
        clearGlow(ctx);
        ctx.restore();
        return;
      }

      // Dark inner fill keeps outlines readable; a damaged body fills less, so
      // partial damage reads as a hollowing wireframe.
      ctx.fillStyle = `rgba(6, 16, 22, ${0.6 - damaged * 0.45})`;
      bodyPath(ctx, state);
      ctx.fill();

      const strength = state.sleeping ? 0.35 : 1;
      ctx.strokeStyle = colour;
      ctx.lineWidth = state.kind === 'ground' || state.kind === 'wall' ? 1.5 : 2;
      ctx.globalAlpha = strength;
      glow(ctx, colour, strength);
      bodyPath(ctx, state);
      ctx.stroke();

      if (damaged > 0.15 && state.shape === 'box') {
        // Cracks scale with damage; count comes from the state, not a material rule.
        const cracks = Math.round(damaged * 3);
        const hw = state.halfWidth ?? 20;
        const hh = state.halfHeight ?? 20;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        for (let i = 0; i < cracks; i++) {
          const t = (i + 1) / (cracks + 1);
          ctx.moveTo(-hw + t * 2 * hw, -hh);
          ctx.lineTo(-hw + t * 2 * hw + hw * 0.25, hh);
        }
        ctx.stroke();
      }

      // Entity art: a pig has a face, a bird has a wing and beak, the launcher has a
      // tilting barrel and a compressing spring. Drawn in local space, so a rolling
      // pig rolls its face with it (docs/theme-contract.md).
      if (state.kind === 'pig') paintPig(ctx, state.radius ?? 16, state.variant ?? 'basic');
      else if (state.kind === 'bird') paintBird(ctx, state.radius ?? 16, state.variant);
      else if (state.kind === 'cannon') paintCannon(ctx, state, palette);

      paintMaterialTexture(ctx, state, palette);

      clearGlow(ctx);
      ctx.restore();
    },

    paintOverlay(ctx, frame, viewport) {
      void viewport;
      const aim = frame.aim;
      if (!aim) return;

      ctx.save();
      ctx.strokeStyle = palette.aimGuide;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      glow(ctx, palette.aimGuide, 0.8);

      // Pull line: the slingshot itself, from origin to the drag point.
      ctx.beginPath();
      ctx.moveTo(aim.origin.x, aim.origin.y);
      ctx.lineTo(aim.origin.x + aim.pull.x, aim.origin.y + aim.pull.y);
      ctx.stroke();

      // Predicted path as discrete nodes, so it reads as a data trail.
      ctx.fillStyle = palette.aimGuide;
      for (let i = 0; i < aim.trajectory.length; i += 6) {
        const sample = aim.trajectory[i]!;
        ctx.globalAlpha = 0.9 - (i / aim.trajectory.length) * 0.55;
        ctx.beginPath();
        ctx.arc(sample.x, sample.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      clearGlow(ctx);
      ctx.restore();
    },
  };
}

/** Hex palette colour as an rgba string, so art can fill at a chosen opacity. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Darker shade of a palette colour, for shading inside a silhouette. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * factor);
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

/**
 * Pig art. Playtest: a round blob with a ring read as "a block that happens to be
 * round", so the silhouette now carries ears that clear the body outline, a snout that
 * protrudes, eyes with pupils, and stub legs. Features are filled shapes, not hairline
 * strokes, so they survive the camera zoom. `variant` is the ammo type id (M18).
 */
function paintPig(ctx: CanvasRenderingContext2D, r: number, variant: string): void {
  // Type hue: a heavy is a darker rust, a bomb is dark metal with a lit fuse.
  const hue =
    variant === 'heavy' ? '#b8434a' : variant === 'bomb' ? '#4a4258' : variant === 'cluster' ? '#ffa8c0' : '#ff7a9c';
  const dark = shade(hue, 0.45);
  const light = shade(hue, 1.35);
  const outline = tint(hue, 0.95);

  // Ears: triangles that sit outside the body circle.
  ctx.fillStyle = dark;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.4, -r * 0.55);
    ctx.lineTo(side * r * 0.95, -r * 1.12);
    ctx.lineTo(side * r * 0.12, -r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Stub legs: reads as an animal sitting rather than a disc.
  ctx.fillStyle = dark;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.rect(side * r * 0.45 - r * 0.16, r * 0.6, r * 0.32, r * 0.45);
    ctx.fill();
    ctx.stroke();
  }

  // Body: filled in the species hue with a thick outline.
  ctx.fillStyle = tint(hue, 0.6);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Snout: an ellipse past the body edge, with nostrils.
  ctx.fillStyle = tint(light, 0.7);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(r * 0.82, r * 0.1, r * 0.5, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = dark;
  for (const dy of [-r * 0.12, r * 0.12]) {
    ctx.beginPath();
    ctx.arc(r * 0.95, r * 0.1 + dy, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes with pupils plus a brow: the feature that sells "pig".
  ctx.fillStyle = 'rgba(238, 250, 255, 0.92)';
  ctx.beginPath();
  ctx.ellipse(r * 0.3, -r * 0.42, r * 0.24, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-r * 0.16, -r * 0.5, r * 0.16, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(10, 18, 24, 0.95)';
  ctx.beginPath();
  ctx.arc(r * 0.36, -r * 0.42, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.1, -r * 0.5, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r * 0.04, -r * 0.74);
  ctx.lineTo(r * 0.56, -r * 0.62);
  ctx.stroke();

  // Type marks, so the chamber type is readable without the HUD label.
  ctx.lineWidth = 1.5;
  if (variant === 'heavy') {
    ctx.strokeStyle = outline;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.08);
    ctx.lineTo(r * 0.15, -r * 0.08);
    ctx.moveTo(-r * 0.5, r * 0.26);
    ctx.lineTo(r * 0.15, r * 0.26);
    ctx.stroke();
  } else if (variant === 'bomb') {
    ctx.strokeStyle = tint(light, 0.85);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.85);
    ctx.quadraticCurveTo(-r * 0.05, -r * 1.25, r * 0.25, -r * 1.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 220, 120, 0.95)';
    ctx.beginPath();
    ctx.arc(r * 0.3, -r * 1.22, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (variant === 'cluster') {
    ctx.strokeStyle = outline;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.15);
    ctx.lineTo(-r * 0.12, -r * 0.15);
    ctx.moveTo(-r * 0.4, r * 0.1);
    ctx.lineTo(-r * 0.12, r * 0.1);
    ctx.stroke();
  } else {
    ctx.fillStyle = tint(dark, 0.55);
    ctx.beginPath();
    ctx.arc(-r * 0.3, r * 0.25, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Bird art. Playtest: "yellow, almost like a sun" — a disc with a ring. The bird is now
 * egg-shaped with a folded wing, tail feathers, an orange beak in a different hue, a
 * comb, and legs.
 */
/**
 * Bird silhouettes by variant (docs/theme-contract.md). The level names the bird kind;
 * the theme decides what each one looks like. `worker` is the fallback for an unknown
 * variant, so a theme never has to know the whole list.
 */
interface BirdShape {
  rx: number;
  ry: number;
  tail: number;
  comb: number;
  spikes: number;
  wing: number;
}

const BIRD_SHAPES: Record<string, BirdShape> = {
  runner: { rx: 1.3, ry: 0.7, tail: 1.75, comb: 0.9, spikes: 1, wing: 0.75 },
  worker: { rx: 1.08, ry: 0.88, tail: 1.45, comb: 1.2, spikes: 3, wing: 0.62 },
  broody: { rx: 1.02, ry: 1.05, tail: 1.15, comb: 1.55, spikes: 4, wing: 0.5 },
};

function birdShape(variant?: string): BirdShape {
  const key = variant ? variant.replace('-flipped', '') : undefined;
  return (key ? BIRD_SHAPES[key] : undefined) ?? BIRD_SHAPES.worker!;
}

function paintBird(ctx: CanvasRenderingContext2D, r: number, variant?: string): void {
  const shape = birdShape(variant);
  // A `-flipped` variant mirrors the silhouette, so a nest does not face one way (D39).
  const flipped = variant !== undefined && variant.endsWith('-flipped');
  ctx.save();
  if (flipped) ctx.scale(-1, 1);
  const outline = 'rgba(255, 214, 90, 0.95)';

  // Tail feathers behind the body: a runner's are longer and flatter.
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const dy of [-0.35, 0, 0.35]) {
    ctx.moveTo(-shape.rx * r * 0.75, dy * shape.ry * r);
    ctx.lineTo(-shape.tail * r, dy * shape.ry * r - r * 0.22);
  }
  ctx.stroke();

  // Legs.
  ctx.strokeStyle = 'rgba(255, 150, 60, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const dx of [-0.2, 0.25]) {
    ctx.moveTo(dx * r, shape.ry * r * 0.8);
    ctx.lineTo(dx * r + r * 0.12, shape.ry * r * 1.25);
  }
  ctx.stroke();

  // Body: an egg whose proportions come from the variant, so three birds in one
  // stage are not three copies of the same outline.
  ctx.fillStyle = 'rgba(255, 210, 74, 0.55)';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, shape.rx * r, shape.ry * r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing: darker oval across the body, swept back further on a runner.
  ctx.fillStyle = 'rgba(214, 150, 46, 0.5)';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(-shape.rx * r * 0.25, -shape.ry * r * 0.15, shape.wing * r, shape.wing * r * 0.66, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Comb: spike count and height are the variant's signature.
  ctx.fillStyle = 'rgba(255, 80, 60, 0.9)';
  ctx.beginPath();
  const spread = shape.spikes === 1 ? 0 : 0.25;
  for (let i = 0; i < shape.spikes; i++) {
    const dx = (i - (shape.spikes - 1) / 2) * spread * r;
    ctx.moveTo(dx, -shape.ry * r * 0.9);
    ctx.lineTo(dx + r * 0.14, -shape.comb * r);
    ctx.lineTo(dx + r * 0.28, -shape.ry * r * 0.9);
  }
  ctx.fill();

  // Beak: a triangle past the body edge, orange against yellow.
  ctx.fillStyle = 'rgba(255, 160, 60, 0.9)';
  ctx.strokeStyle = 'rgba(190, 110, 30, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(shape.rx * r * 0.8, -shape.ry * r * 0.25);
  ctx.lineTo(shape.rx * r * 1.5, r * 0.05);
  ctx.lineTo(shape.rx * r * 0.8, shape.ry * r * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye near the head.
  ctx.fillStyle = 'rgba(240, 250, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(shape.rx * r * 0.4, -shape.ry * r * 0.4, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(12, 20, 26, 0.95)';
  ctx.beginPath();
  ctx.arc(shape.rx * r * 0.45, -shape.ry * r * 0.4, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Pull length that fully compresses the launcher spring (appearance, not gameplay). */
const SPRING_FULL = 90;

/**
 * The launcher, drawn around the launch pivot (docs/adr.md D28). Playtest: the old art
 * was a thin line and a coil, and the launcher sat in mid-air, so the art is now a
 * carriage standing on the ground with wheels, a thick tapered barrel that tilts with
 * the aim, a muzzle ring, a compressing coil, a pull gauge, and a recoil flash.
 * The carriage reaches 58 units below the pivot, which is where the levels put the
 * ground (docs/level-format.md).
 */
function paintCannon(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  const pull = state.pull ?? 0;
  const aimAngle = state.aimAngle ?? 0;
  const recoil = state.recoil ?? 0;
  const compress = Math.min(1, pull / SPRING_FULL);
  const c = palette.cannon;

  // Carriage: a trapezoid with feet, standing on the ground below the pivot.
  ctx.save();
  ctx.fillStyle = tint(c, 0.2);
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-26, 10);
  ctx.lineTo(26, 10);
  ctx.lineTo(36, 46);
  ctx.lineTo(-36, 46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-40, 56);
  ctx.lineTo(40, 56);
  ctx.stroke();

  // Wheels with spokes: the part that reads as a machine rather than a box.
  for (const dx of [-22, 22]) {
    ctx.beginPath();
    ctx.arc(dx, 44, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, 44, 3, 0, Math.PI * 2);
    ctx.fillStyle = tint(c, 0.5);
    ctx.fill();
    ctx.beginPath();
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      ctx.moveTo(dx, 44);
      ctx.lineTo(dx + Math.cos(a) * 11, 44 + Math.sin(a) * 11);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Barrel: thick, tapered, tilting with the aim, muzzle ring at the launch point ahead.
  ctx.save();
  ctx.translate(0, -2);
  ctx.rotate(aimAngle);
  ctx.fillStyle = tint(c, 0.25);
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-16, -10);
  ctx.lineTo(38, -7);
  ctx.lineTo(38, 7);
  ctx.lineTo(-16, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Bands on the barrel, so it is not a flat slab.
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2, -9);
  ctx.lineTo(2, 9);
  ctx.moveTo(20, -8);
  ctx.lineTo(20, 8);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(44, 0, 9, 0, Math.PI * 2);
  ctx.stroke();
  if (recoil > 0) {
    ctx.globalAlpha = recoil;
    ctx.strokeStyle = palette.flash;
    ctx.beginPath();
    ctx.arc(44, 0, 9 + recoil * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(48, -recoil * 9);
    ctx.lineTo(60 + recoil * 14, 0);
    ctx.lineTo(48, recoil * 9);
    ctx.stroke();
  }
  ctx.restore();

  // The spring, drawn *in the bore* on the barrel axis: a zigzag between the breech and
  // the muzzle that shortens as the pull grows. Playtest said the old coil sat under the
  // barrel and read as an unrelated squiggle, so it now shares the barrel's own axis.
  ctx.save();
  ctx.translate(0, -2);
  ctx.rotate(aimAngle);
  ctx.strokeStyle = palette.pig;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const coils = 4;
  const length = 18 * (1 - compress * 0.6);
  for (let i = 0; i <= coils; i++) {
    const x = -12 + (length * i) / coils;
    const y = i % 2 === 0 ? -4 : 4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Pull gauge: an arc over the carriage that fills as the drag grows.
  ctx.save();
  ctx.strokeStyle = palette.pig;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(0, 30, 46, Math.PI * 1.15, Math.PI * 1.15 + compress * Math.PI * 0.7);
  ctx.stroke();
  ctx.restore();
}

/** Scenery props (M15): a tree, or a low ridge silhouette. Art only, never a body. */
function paintScenery(ctx: CanvasRenderingContext2D, state: EntityState, palette: ThemePalette): void {
  const hw = state.halfWidth ?? state.radius ?? 16;
  const hh = state.halfHeight ?? state.radius ?? 16;
  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.fillStyle = palette.grid;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.75;

  if (state.variant === 'ridge') {
    ctx.beginPath();
    ctx.moveTo(-hw, hh);
    // Three notches along the ridge line: a silhouette, not a structure.
    for (let i = 0; i < 3; i++) {
      const x = -hw + ((i + 1) * hw) / 3;
      ctx.lineTo(x - hw / 6, -hh * (0.4 + (i % 2) * 0.35));
      ctx.lineTo(x, hh * 0.1);
    }
    ctx.lineTo(hw, hh);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Plinth: masonry the launcher stands on, so the cannon reads as built rather than
  // floating in the air (playtest item 4).
  if (state.variant === 'plinth') {
    ctx.fillStyle = tint(palette.materials.stone, 0.25);
    ctx.strokeStyle = palette.materials.stone;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-hw, -hh, hw * 2, hh * 2);
    ctx.fill();
    ctx.stroke();
    // Courses with staggered joints.
    const courses = Math.max(2, Math.round(hh / 14));
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let i = 1; i < courses; i++) {
      const y = -hh + (i / courses) * hh * 2;
      ctx.moveTo(-hw, y);
      ctx.lineTo(hw, y);
      const joint = i % 2 === 0 ? -hw + hw * 0.5 : hw * 0.2;
      ctx.moveTo(joint, y - hh / courses);
      ctx.lineTo(joint, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Cap: the surface the carriage sits on, brighter than the masonry.
    ctx.strokeStyle = palette.materials.light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh);
    ctx.lineTo(hw, -hh);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Tree: trunk in the lower part of the bounds, canopy in the upper part.
  ctx.fillRect(-hw * 0.3, hh * 0.1, hw * 0.6, hh * 0.9);
  ctx.strokeRect(-hw * 0.3, hh * 0.1, hw * 0.6, hh * 0.9);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const cy = -hh * 0.45 + i * hh * 0.28;
    const cw = hw * (1 - i * 0.22);
    ctx.moveTo(-cw, cy + hh * 0.22);
    ctx.lineTo(0, cy - hh * 0.28);
    ctx.lineTo(cw, cy + hh * 0.22);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

