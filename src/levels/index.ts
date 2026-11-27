import type { EntityKind, MaterialId, ShapeId } from '../core/types.ts';
import type { BodyInit } from '../physics/adapter.ts';
import { LEVEL_01 } from './l01.ts';
import { LEVEL_02 } from './l02.ts';
import { LEVEL_03 } from './l03.ts';
import { LEVEL_04 } from './l04.ts';
import { LEVEL_05 } from './l05.ts';
import { LEVEL_06 } from './l06.ts';

/** Level format v0 (docs/level-format.md). Levels are authored as data and
 * compiled into the bundle at build time — the shipped build fetches nothing (D6). */

export interface LevelStatic {
  type: 'ground' | 'wall';
  x: number;
  y: number;
  /** Full size; x/y is the centre, matching Matter body positions. */
  w: number;
  h: number;
}

/**
 * Background props. Scenery is never a physics body: it paints behind entities and
 * collides with nothing (docs/theme-contract.md). `kind` is a presentation hint the
 * theme draws ("tree", "ridge").
 */
/**
 * Prop kinds a theme knows how to paint. Art only, never bodies (docs/adr.md D29).
 * `plinth` is the masonry the launcher stands on, so the cannon reads as built rather
 * than floating (playtest item 4).
 */
export const SCENERY_KINDS = ['tree', 'ridge', 'plinth'] as const;

export interface SceneryItem {
  kind: string;
  x: number;
  y: number;
  /** Full size for a box prop; a circle prop uses `r`. */
  w?: number;
  h?: number;
  r?: number;
}

export interface LevelObject {
  type: 'block' | 'ball';
  material: MaterialId;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  angle?: number;
  /** Targets are birds; counted for win/lose. */
  target?: boolean;
  /** Presentation hint, never gameplay: for a bird it picks the silhouette the theme
   * draws ("runner", "worker", "broody"). Unknown values fall back to the theme default.
   */
  variant?: string;
}

export interface LevelDef {
  name: string;
  bounds: { width: number; height: number };
  cannon: { x: number; y: number; maxPull: number; powerScale: number; ammo: string[] };
  statics: LevelStatic[];
  objects: LevelObject[];
  /** Shorthand for objects with target: true; merged by the loader. */
  targets?: LevelObject[];
  /** Art-only props painted behind entities (M15). */
  scenery?: SceneryItem[];
}

export interface LoadedLevel {
  def: LevelDef;
  /** Bodies to add to physics, in level order, with stable ids. */
  bodies: BodyInit[];
  /** Ids counted for win/lose. */
  targetIds: string[];
  cannonOrigin: { x: number; y: number };
  ammo: string[];
  maxPull: number;
  powerScale: number;
  /** Art-only props, validated but never added to physics. */
  scenery: SceneryItem[];
  /** World y of the ground surface, from the level's ground static (M16 debris). */
  groundTop: number;
}

/** Validation errors name the offending field instead of crashing (loader rule). */
class LevelError extends Error {
  constructor(field: string, message: string) {
    super(`level "${field}": ${message}`);
  }
}

/** Simulation world is fixed (D13); a level's bounds are the framed region and may
 * be smaller than the world, never larger. */
/**
 * The simulation world is fixed (D13). The width grew from 1600 to 2200 in M21 so a
 * stage can hold several large structures instead of one pedestal; the height stays 900
 * because vertical framing and `groundTop = 840` are tuned to it.
 */
export const WORLD = { width: 2200, height: 900 };

export const LEVELS: LevelDef[] = [LEVEL_01, LEVEL_02, LEVEL_03, LEVEL_04, LEVEL_05, LEVEL_06];

export function levelAt(index: number): LevelDef {
  // Wrap in both directions: the roster is a cycle, and the UI can step backwards.
  const i = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
  const def = LEVELS[i];
  if (!def) throw new LevelError('index', `no level at ${index}`);
  return def;
}

function requireNumber(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LevelError(field, `expected a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function objectBody(obj: LevelObject, id: string, kind: EntityKind): BodyInit {
  const field = kind === 'bird' ? `targets[${id}]` : `objects[${id}]`;
  const shape: ShapeId = obj.type === 'ball' ? 'circle' : 'box';
  const base: BodyInit = {
    id,
    kind,
    shape,
    material: obj.material,
    x: requireNumber(`${field}.x`, obj.x),
    y: requireNumber(`${field}.y`, obj.y),
    angle: obj.angle ?? 0,
    ...(obj.variant ? { variant: obj.variant } : {}),
  };
  if (obj.type === 'ball') {
    base.radius = requireNumber(`${field}.r`, obj.r);
  } else {
    base.halfWidth = requireNumber(`${field}.w`, obj.w) / 2;
    base.halfHeight = requireNumber(`${field}.h`, obj.h) / 2;
  }
  return base;
}

/** Structural validation, separate from building bodies: a level file is data, and
 * a bad one must fail with a field name rather than a physics oddity. */
export function validateLevel(def: LevelDef): void {
  if (!def.name) throw new LevelError('name', 'required');
  const width = requireNumber('bounds.width', def.bounds?.width);
  const height = requireNumber('bounds.height', def.bounds?.height);
  if (width > WORLD.width || height > WORLD.height) {
    throw new LevelError('bounds', `${width}x${height} exceeds the world ${WORLD.width}x${WORLD.height}`);
  }
  if (def.cannon.ammo.length === 0) throw new LevelError('cannon.ammo', 'must not be empty');
  requireNumber('cannon.maxPull', def.cannon.maxPull);
  requireNumber('cannon.powerScale', def.cannon.powerScale);
  if ((def.targets ?? []).length === 0) throw new LevelError('targets', 'a level must have at least one target');
  def.scenery?.forEach((item, i) => {
    if (!item.kind) throw new LevelError(`scenery[${i}].kind`, `required (${SCENERY_KINDS.join(', ')})`);
    if (!(SCENERY_KINDS as readonly string[]).includes(item.kind)) {
      throw new LevelError(`scenery[${i}].kind`, `"${item.kind}" is not a known prop (${SCENERY_KINDS.join(', ')})`);
    }
    requireNumber(`scenery[${i}].x`, item.x);
    requireNumber(`scenery[${i}].y`, item.y);
    if (item.r === undefined && (item.w === undefined || item.h === undefined)) {
      throw new LevelError(`scenery[${i}]`, 'needs either r or w and h');
    }
    if (item.r !== undefined) requireNumber(`scenery[${i}].r`, item.r);
    if (item.w !== undefined) requireNumber(`scenery[${i}].w`, item.w);
    if (item.h !== undefined) requireNumber(`scenery[${i}].h`, item.h);
  });
}

export function loadLevel(def: LevelDef): LoadedLevel {
  validateLevel(def);
  const width = def.bounds.width;
  const height = def.bounds.height;

  const bodies: BodyInit[] = [];
  def.statics.forEach((s, i) => {
    bodies.push({
      id: `static-${i}`,
      kind: s.type === 'wall' ? 'wall' : 'ground',
      shape: 'box',
      material: 'ground',
      x: requireNumber(`statics[${i}].x`, s.x),
      y: requireNumber(`statics[${i}].y`, s.y),
      halfWidth: requireNumber(`statics[${i}].w`, s.w) / 2,
      halfHeight: requireNumber(`statics[${i}].h`, s.h) / 2,
      isStatic: true,
    });
  });

  // objects and targets merge; ids are stable and sequential per kind.
  const merged = [...def.objects, ...(def.targets ?? [])];
  let blockIndex = 0;
  let birdIndex = 0;
  const targetIds: string[] = [];
  // Targetness is explicit (`target: true`); material never decides gameplay role.
  for (const obj of merged) {
    const isTarget = obj.target === true;
    if (isTarget) {
      const id = `bird-${++birdIndex}`;
      targetIds.push(id);
      bodies.push(objectBody(obj, id, 'bird'));
    } else if (obj.type === 'ball') {
      bodies.push(objectBody(obj, `ball-${++blockIndex}`, 'block'));
    } else {
      bodies.push(objectBody(obj, `block-${++blockIndex}`, 'block'));
    }
  }
  if (targetIds.length === 0) throw new LevelError('targets', 'a level must have at least one target');

  for (const b of bodies) {
    if (b.x < 0 || b.x > width || b.y < 0 || b.y > height) {
      throw new LevelError(`${b.id}`, `position (${b.x}, ${b.y}) is outside bounds`);
    }
  }

  // Scenery is art: it is placed inside bounds but never becomes a body.
  for (const item of def.scenery ?? []) {
    if (item.x < 0 || item.x > width || item.y < 0 || item.y > height) {
      throw new LevelError(`scenery[${item.kind}]`, `position (${item.x}, ${item.y}) is outside bounds`);
    }
  }

  // Ground surface for presentation effects (debris heaps, M16). Levels author one
  // ground static; if a level has none, the bottom edge of bounds is the surface.
  const grounds = def.statics.filter((s) => s.type === 'ground');
  const groundTop = grounds.length === 0 ? height : Math.min(...grounds.map((s) => s.y - s.h / 2));

  return {
    def,
    bodies,
    targetIds,
    cannonOrigin: { x: requireNumber('cannon.x', def.cannon.x), y: requireNumber('cannon.y', def.cannon.y) },
    ammo: [...def.cannon.ammo],
    maxPull: def.cannon.maxPull,
    powerScale: def.cannon.powerScale,
    scenery: [...(def.scenery ?? [])],
    groundTop,
  };
}
