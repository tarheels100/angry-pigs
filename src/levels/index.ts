import type { EntityKind, MaterialId, ShapeId } from '../core/types.ts';
import type { BodyInit } from '../physics/adapter.ts';
import { LEVEL_01 } from './l01.ts';
import { LEVEL_02 } from './l02.ts';
import { LEVEL_03 } from './l03.ts';

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
}

export interface LevelDef {
  name: string;
  bounds: { width: number; height: number };
  cannon: { x: number; y: number; maxPull: number; powerScale: number; ammo: string[] };
  statics: LevelStatic[];
  objects: LevelObject[];
  /** Shorthand for objects with target: true; merged by the loader. */
  targets?: LevelObject[];
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
}

/** Validation errors name the offending field instead of crashing (loader rule). */
class LevelError extends Error {
  constructor(field: string, message: string) {
    super(`level "${field}": ${message}`);
  }
}

/** Simulation world is fixed (D13); a level's bounds are the framed region and may
 * be smaller than the world, never larger. */
export const WORLD = { width: 1600, height: 900 };

export const LEVELS: LevelDef[] = [LEVEL_01, LEVEL_02, LEVEL_03];

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

  return {
    def,
    bodies,
    targetIds,
    cannonOrigin: { x: requireNumber('cannon.x', def.cannon.x), y: requireNumber('cannon.y', def.cannon.y) },
    ammo: [...def.cannon.ammo],
    maxPull: def.cannon.maxPull,
    powerScale: def.cannon.powerScale,
  };
}
