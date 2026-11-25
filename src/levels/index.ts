import type { EntityKind, MaterialId, ShapeId } from '../core/types.ts';

/** Level format v0 (see docs/level-format.md). Levels are authored as JSON and
 * compiled into the bundle at build time — the shipped build fetches nothing. */

export interface LevelStatic {
  type: 'ground' | 'wall';
  x: number;
  y: number;
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
  targets: LevelObject[];
}

export interface LoadedLevel {
  def: LevelDef;
  entities: { id: string; kind: EntityKind; shape: ShapeId }[];
}

/** Stub — schema validation implemented in M9. */
export function loadLevel(def: LevelDef): LoadedLevel {
  throw new Error('not implemented: loadLevel (M9)');
}
