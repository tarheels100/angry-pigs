import type { LevelDef, LevelObject, LevelStatic, SceneryItem } from './index.ts';
import { validateLevel, WORLD } from './index.ts';
import { GROUND_TOP, barrierWall, bird, bridge, hut, platform, stackUp, tower, type BlockMaterial } from './pieces.ts';
import { isPigTypeId } from '../game/pigs.ts';

/**
 * Level drafting model (M23). The editor in `src/ui/editor.ts` is DOM chrome; this module is
 * the data it manipulates, and it is the half that can be tested headlessly.
 *
 * A draft is a list of **pieces**, each one a call into `src/levels/pieces.ts` (level rule 11:
 * structures are built from the builders, not hand-placed coordinates). `draftToLevelDef` expands
 * a draft into a `LevelDef`, which the existing loader validates and compiles, so an edited stage
 * is the same kind of data a shipped stage is (docs/level-format.md).
 */

/** Materials a structural piece may use. Birds are always `feather`; props have none. */
export const MATERIAL_CHOICES: BlockMaterial[] = ['glass', 'wood', 'stone', 'metal'];
/** Bird silhouettes a theme knows how to paint (docs/theme-contract.md, D39). */
export const BIRD_VARIANTS = ['runner', 'worker', 'broody'] as const;

export type PieceKind =
  | 'block'
  | 'ball'
  | 'bird'
  | 'hut'
  | 'tower'
  | 'platform'
  | 'bridge'
  | 'wall'
  | 'stack'
  | 'prop'
  | 'static';

/** Palette order, left to right in the editor: structure first, then birds, then art. */
export const PIECE_KINDS: PieceKind[] = ['block', 'stack', 'hut', 'tower', 'platform', 'bridge', 'wall', 'ball', 'bird', 'prop', 'static'];

export const PIECE_LABELS: Record<PieceKind, string> = {
  block: 'column',
  stack: 'stack',
  hut: 'shelter',
  tower: 'tower',
  platform: 'beam + legs',
  bridge: 'bridge',
  wall: 'barrier wall',
  ball: 'ball',
  bird: 'bird',
  prop: 'scenery',
  static: 'platform (static)',
};

export interface PieceBase {
  /** Stable id within a draft; the editor selects and deletes by it. */
  id: string;
  kind: PieceKind;
  /** World x of the piece's centre. Structural pieces rest on `GROUND_TOP`. */
  x: number;
}

export interface BlockPiece extends PieceBase { kind: 'block'; material: BlockMaterial; w: number; h: number; y?: number; }
export interface BallPiece extends PieceBase { kind: 'ball'; material: BlockMaterial; r: number; y?: number; }
export interface BirdPiece extends PieceBase { kind: 'bird'; r: number; variant: string; facing: 'right' | 'left'; }
export interface HutPiece extends PieceBase { kind: 'hut'; width: number; height: number; columns: BlockMaterial; roof: BlockMaterial; screen: BlockMaterial; screenHeight: number; }
export interface TowerPiece extends PieceBase { kind: 'tower'; width: number; legs: number; legHeight: number; storeyColumns: number; storeyHeight: number; storeys: number; roof: BlockMaterial; }
export interface PlatformPiece extends PieceBase { kind: 'platform'; span: number; height: number; supports: number; material: BlockMaterial; beam: BlockMaterial; }
export interface BridgePiece extends PieceBase { kind: 'bridge'; span: number; height: number; piers: number; material: BlockMaterial; deck: BlockMaterial; }
export interface WallPiece extends PieceBase { kind: 'wall'; courseW: number; courseH: number; courses: number; columns: number; material: BlockMaterial; }
export interface StackPiece extends PieceBase { kind: 'stack'; material: BlockMaterial; w: number; h: number; count: number; }
export interface PropPiece extends PieceBase { kind: 'prop'; prop: string; w: number; h: number; y: number; }
export interface StaticPiece extends PieceBase { kind: 'static'; w: number; h: number; y: number; type: 'ground' | 'wall'; }

export type Piece =
  | BlockPiece | BallPiece | BirdPiece | HutPiece | TowerPiece | PlatformPiece
  | BridgePiece | WallPiece | StackPiece | PropPiece | StaticPiece;

export interface Draft {
  name: string;
  bounds: { width: number; height: number };
  cannon: { x: number; y: number; maxPull: number; powerScale: number; ammo: string[] };
  pieces: Piece[];
}

export interface DraftReport {
  /** Things that make the stage unloadable or unplayable. */
  errors: string[];
  /** Things that are allowed but usually a mistake (docs/level-format.md rules). */
  warnings: string[];
}

/** A footprint in world units, used for overlap checks and for hit-testing a click. */
export interface Footprint { left: number; right: number; top: number; bottom: number; }

/** Numeric/enum parameters the editor exposes per kind. `materials` fields cycle `MATERIAL_CHOICES`. */
export interface FieldSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** A field whose values are a fixed vocabulary rather than a range. */
  choices?: string[];
}

export const PIECE_FIELDS: Record<PieceKind, FieldSpec[]> = {
  block: [
    { key: 'w', label: 'width', min: 10, max: 160, step: 10 },
    { key: 'h', label: 'height', min: 20, max: 400, step: 20 },
    { key: 'y', label: 'centre height', min: 20, max: 820, step: 10 },
    { key: 'material', label: 'material', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
  ],
  stack: [
    { key: 'count', label: 'blocks', min: 1, max: 8, step: 1 },
    { key: 'w', label: 'width', min: 10, max: 160, step: 10 },
    { key: 'h', label: 'block height', min: 20, max: 200, step: 20 },
    { key: 'material', label: 'material', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
  ],
  hut: [
    { key: 'width', label: 'inside width', min: 60, max: 400, step: 20 },
    { key: 'height', label: 'leg height', min: 60, max: 400, step: 20 },
    { key: 'columns', label: 'legs', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
    { key: 'roof', label: 'roof', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
    { key: 'screen', label: 'screen wall', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
    { key: 'screenHeight', label: 'screen height', min: 40, max: 500, step: 20 },
  ],
  tower: [
    { key: 'width', label: 'width', min: 60, max: 400, step: 20 },
    { key: 'legs', label: 'legs', min: 1, max: 5, step: 1 },
    { key: 'legHeight', label: 'leg height', min: 60, max: 400, step: 20 },
    { key: 'storeys', label: 'storeys', min: 1, max: 4, step: 1 },
    { key: 'storeyColumns', label: 'storey columns', min: 1, max: 5, step: 1 },
    { key: 'storeyHeight', label: 'storey height', min: 40, max: 300, step: 20 },
    { key: 'roof', label: 'roof', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
  ],
  platform: [
    { key: 'span', label: 'span', min: 60, max: 600, step: 20 },
    { key: 'height', label: 'leg height', min: 40, max: 400, step: 20 },
    { key: 'supports', label: 'supports', min: 1, max: 5, step: 1 },
    { key: 'material', label: 'legs', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
    { key: 'beam', label: 'beam', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
  ],
  bridge: [
    { key: 'span', label: 'span', min: 120, max: 900, step: 40 },
    { key: 'height', label: 'pier height', min: 60, max: 400, step: 20 },
    { key: 'piers', label: 'piers', min: 2, max: 6, step: 1 },
    { key: 'material', label: 'piers', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
    { key: 'deck', label: 'deck', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
  ],
  wall: [
    { key: 'courseW', label: 'course width', min: 20, max: 160, step: 10 },
    { key: 'courseH', label: 'course height', min: 20, max: 160, step: 10 },
    { key: 'courses', label: 'courses', min: 1, max: 8, step: 1 },
    { key: 'columns', label: 'columns', min: 1, max: 5, step: 1 },
    { key: 'material', label: 'material', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
  ],
  ball: [
    { key: 'r', label: 'radius', min: 8, max: 60, step: 4 },
    { key: 'y', label: 'centre height', min: 20, max: 820, step: 10 },
    { key: 'material', label: 'material', min: 0, max: 0, step: 1, choices: MATERIAL_CHOICES },
  ],
  bird: [
    { key: 'r', label: 'radius', min: 10, max: 40, step: 2 },
    { key: 'variant', label: 'silhouette', min: 0, max: 0, step: 1, choices: [...BIRD_VARIANTS] },
    { key: 'facing', label: 'facing', min: 0, max: 0, step: 1, choices: ['right', 'left'] },
  ],
  prop: [
    { key: 'prop', label: 'kind', min: 0, max: 0, step: 1, choices: ['tree', 'ridge', 'plinth'] },
    { key: 'w', label: 'width', min: 20, max: 400, step: 20 },
    { key: 'h', label: 'height', min: 20, max: 800, step: 20 },
  ],
  static: [
    { key: 'w', label: 'width', min: 40, max: 800, step: 40 },
    { key: 'h', label: 'height', min: 10, max: 200, step: 10 },
    { key: 'type', label: 'type', min: 0, max: 0, step: 1, choices: ['ground', 'wall'] },
  ],
};

/** Sensible starting parameters per kind, tuned to the shipped stages. */
export function defaultPiece(kind: PieceKind, x: number, id: string): Piece {
  switch (kind) {
    case 'block': return { id, kind, x, y: GROUND_TOP - 65, material: 'glass', w: 30, h: 130 };
    case 'stack': return { id, kind, x, material: 'wood', w: 40, h: 90, count: 3 };
    case 'hut': return { id, kind, x, width: 150, height: 200, columns: 'wood', roof: 'glass', screen: 'wood', screenHeight: 240 };
    case 'tower': return { id, kind, x, width: 120, legs: 2, legHeight: 200, storeys: 1, storeyColumns: 2, storeyHeight: 150, roof: 'glass' };
    case 'platform': return { id, kind, x, span: 180, height: 150, supports: 2, material: 'wood', beam: 'glass' };
    case 'bridge': return { id, kind, x, span: 400, height: 200, piers: 3, material: 'wood', deck: 'glass' };
    case 'wall': return { id, kind, x, courseW: 80, courseH: 90, courses: 3, columns: 1, material: 'stone' };
    case 'ball': return { id, kind, x, y: GROUND_TOP - 20, material: 'wood', r: 20 };
    case 'bird': return { id, kind, x, r: 20, variant: 'worker', facing: 'right' };
    case 'prop': return { id, kind, x, prop: 'tree', w: 110, h: 520, y: GROUND_TOP - 260 };
    case 'static': return { id, kind, x, w: 300, h: 30, y: GROUND_TOP - 15, type: 'ground' };
  }
}

export function emptyDraft(name = 'custom-stage'): Draft {
  return {
    name,
    bounds: { width: WORLD.width, height: WORLD.height },
    // The launcher sits on a plinth at y 700 in every shipped stage (level rule 10).
    cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['basic', 'basic', 'basic'] },
    pieces: [
      { id: 'ground', kind: 'static', x: WORLD.width / 2, w: WORLD.width, h: 40, y: 860, type: 'ground' },
      { id: 'plinth', kind: 'prop', x: 120, prop: 'plinth', w: 150, h: 84, y: 798 },
    ],
  };
}

/** Read one numeric or vocabulary parameter of a piece. The editor drives fields generically. */
export function pieceParam(piece: Piece, key: string): number | string {
  const value = (piece as unknown as Record<string, unknown>)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  throw new Error(`piece "${piece.kind}" has no parameter "${key}"`);
}

/** Write one parameter. Returns a new piece; drafts are replaced rather than mutated in place. */
export function withParam(piece: Piece, key: string, value: number | string): Piece {
  const next = { ...(piece as unknown as Record<string, unknown>), [key]: value } as unknown as Piece;
  // Scenery and statics are drawn from their own height, so re-seat them when it changes.
  if (next.kind === 'prop') next.y = GROUND_TOP - next.h / 2;
  if (next.kind === 'static') next.y = (piece as StaticPiece).y;
  return next;
}

/** Expand one piece into the level data the loader consumes. */
export function expandPiece(piece: Piece): { objects: LevelObject[]; targets: LevelObject[]; scenery: SceneryItem[]; statics: LevelStatic[] } {
  switch (piece.kind) {
    case 'block':
      return {
        objects: [{ type: 'block', material: piece.material, x: piece.x, y: piece.y ?? GROUND_TOP - piece.h / 2, w: piece.w, h: piece.h }],
        targets: [], scenery: [], statics: [],
      };
    case 'stack':
      return {
        objects: stackUp(piece.x, Array.from({ length: piece.count }, () => ({ material: piece.material, w: piece.w, h: piece.h }))).blocks,
        targets: [], scenery: [], statics: [],
      };
    case 'hut':
      return {
        objects: hut(piece.x, {
          width: piece.width, height: piece.height, columns: piece.columns, roof: piece.roof, screen: piece.screen, screenHeight: piece.screenHeight,
        }),
        targets: [], scenery: [], statics: [],
      };
    case 'tower':
      return {
        objects: tower(piece.x, {
          width: piece.width,
          legs: piece.legs,
          legHeight: piece.legHeight,
          roof: piece.roof,
          storeys: Array.from({ length: piece.storeys }, () => ({ material: 'glass' as BlockMaterial, columns: piece.storeyColumns, height: piece.storeyHeight })),
        }),
        targets: [], scenery: [], statics: [],
      };
    case 'platform':
      return { objects: platform(piece.x, { span: piece.span, height: piece.height, supports: piece.supports, material: piece.material, beam: piece.beam }), targets: [], scenery: [], statics: [] };
    case 'bridge':
      return { objects: bridge(piece.x - piece.span / 2, piece.x + piece.span / 2, { height: piece.height, piers: piece.piers, material: piece.material, deck: piece.deck }), targets: [], scenery: [], statics: [] };
    case 'wall':
      return { objects: barrierWall(piece.x, { courseW: piece.courseW, courseH: piece.courseH, courses: piece.courses, columns: piece.columns, material: piece.material }), targets: [], scenery: [], statics: [] };
    case 'ball':
      return { objects: [{ type: 'ball', material: piece.material, x: piece.x, y: piece.y ?? GROUND_TOP - piece.r, r: piece.r }], targets: [], scenery: [], statics: [] };
    case 'bird':
      return { objects: [], targets: [bird(piece.x, piece.r, GROUND_TOP, piece.variant, piece.facing)], scenery: [], statics: [] };
    case 'prop':
      return { objects: [], targets: [], scenery: [{ kind: piece.prop, x: piece.x, y: piece.y, w: piece.w, h: piece.h }], statics: [] };
    case 'static':
      return { objects: [], targets: [], scenery: [], statics: [{ type: piece.type, x: piece.x, y: piece.y, w: piece.w, h: piece.h }] };
  }
}

export function draftToLevelDef(draft: Draft): LevelDef {
  const objects: LevelObject[] = [];
  const targets: LevelObject[] = [];
  const scenery: SceneryItem[] = [];
  const statics: LevelStatic[] = [];
  for (const piece of draft.pieces) {
    const expanded = expandPiece(piece);
    objects.push(...expanded.objects);
    targets.push(...expanded.targets);
    scenery.push(...expanded.scenery);
    statics.push(...expanded.statics);
  }
  return {
    name: draft.name,
    bounds: { ...draft.bounds },
    cannon: { x: draft.cannon.x, y: draft.cannon.y, maxPull: draft.cannon.maxPull, powerScale: draft.cannon.powerScale, ammo: [...draft.cannon.ammo] },
    statics,
    objects,
    targets,
    scenery,
  };
}

/** Axis-aligned bounds of a piece's expanded objects, or of the prop/static itself. */
export function pieceFootprint(piece: Piece): Footprint {
  if (piece.kind === 'prop' || piece.kind === 'static') {
    return { left: piece.x - piece.w / 2, right: piece.x + piece.w / 2, top: piece.y - piece.h / 2, bottom: piece.y + piece.h / 2 };
  }
  if (piece.kind === 'bird') {
    return { left: piece.x - piece.r, right: piece.x + piece.r, top: GROUND_TOP - piece.r * 2, bottom: GROUND_TOP };
  }
  const objects = expandPiece(piece).objects;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const o of objects) {
    const hw = o.w ?? (o.r ?? 0) * 2;
    const hh = o.h ?? (o.r ?? 0) * 2;
    left = Math.min(left, o.x - hw / 2);
    right = Math.max(right, o.x + hw / 2);
    top = Math.min(top, o.y - hh / 2);
    bottom = Math.max(bottom, o.y + hh / 2);
  }
  if (!Number.isFinite(left)) return { left: piece.x, right: piece.x, top: GROUND_TOP, bottom: GROUND_TOP };
  return { left, right, top, bottom };
}

/** A short one-line description for the piece list. */
export function pieceSummary(piece: Piece): string {
  switch (piece.kind) {
    case 'block': return `${piece.material} column ${piece.w}x${piece.h} at ${Math.round(piece.x)}`;
    case 'stack': return `${piece.count}x ${piece.material} ${piece.w}x${piece.h} at ${Math.round(piece.x)}`;
    case 'hut': return `shelter ${piece.width}x${piece.height}, ${piece.columns} legs, ${piece.roof} roof at ${Math.round(piece.x)}`;
    case 'tower': return `tower ${piece.width} wide, ${piece.storeys} storey(s) at ${Math.round(piece.x)}`;
    case 'platform': return `beam on ${piece.supports} legs, span ${piece.span} at ${Math.round(piece.x)}`;
    case 'bridge': return `bridge span ${piece.span}, ${piece.piers} piers at ${Math.round(piece.x)}`;
    case 'wall': return `${piece.material} wall ${piece.columns}x${piece.courses} courses at ${Math.round(piece.x)}`;
    case 'ball': return `${piece.material} ball r${piece.r} at ${Math.round(piece.x)}`;
    case 'bird': return `${piece.variant} bird (${piece.facing}) at ${Math.round(piece.x)}`;
    case 'prop': return `${piece.prop} prop ${piece.w}x${piece.h} at ${Math.round(piece.x)}`;
    case 'static': return `${piece.type} ${piece.w}x${piece.h} at ${Math.round(piece.x)}`;
  }
}

/**
 * Validate a draft. The loader's own rules run first (name, bounds, ammo, targets), then the
 * authoring rules the editor can see without simulating: overlapping structures, scenery over the
 * playfield, and a launcher with no plinth. Solvability is *not* checked here — that is the
 * probes' job (docs/level-format.md rule 12, docs/adr.md D38).
 */
export function validateDraft(draft: Draft): DraftReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (draft.pieces.filter((p) => p.kind === 'bird').length === 0) errors.push('add at least one bird — a stage with no target cannot be won');
  for (const id of draft.cannon.ammo) {
    if (!isPigTypeId(id)) errors.push(`ammo "${id}" is not a pig type (basic, heavy, bomb, cluster)`);
  }
  if (draft.cannon.ammo.length === 0) errors.push('the launcher needs at least one pig');

  let def: LevelDef;
  try {
    def = draftToLevelDef(draft);
    validateLevel(def);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors, warnings };
  }

  // Two structures occupying the same space arrive already interpenetrating, which is how
  // stage 02 once ended up with pigs inside a wall (docs/adr.md D37).
  const structural = draft.pieces.filter((p) => p.kind !== 'bird' && p.kind !== 'prop' && p.kind !== 'static');
  for (let i = 0; i < structural.length; i++) {
    for (let j = i + 1; j < structural.length; j++) {
      const a = pieceFootprint(structural[i]!);
      const b = pieceFootprint(structural[j]!);
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 2 && overlapY > 2) {
        warnings.push(`${structural[i]!.kind} at ${Math.round(structural[i]!.x)} overlaps ${structural[j]!.kind} at ${Math.round(structural[j]!.x)}`);
      }
    }
  }

  // Rule 7: scenery must not sit over the band a projectile travels through.
  for (const prop of draft.pieces.filter((p) => p.kind === 'prop')) {
    if (prop.prop === 'plinth') continue; // the plinth is allowed under the launcher
    const fp = pieceFootprint(prop);
    for (const other of structural) {
      const ofp = pieceFootprint(other);
      if (Math.min(fp.right, ofp.right) - Math.max(fp.left, ofp.left) > 2 && Math.min(fp.bottom, ofp.bottom) - Math.max(fp.top, ofp.top) > 2) {
        warnings.push(`${prop.prop} prop at ${Math.round(prop.x)} overlaps ${other.kind} at ${Math.round(other.x)} — scenery never carries the level`);
      }
    }
  }

  if (!draft.pieces.some((p) => p.kind === 'prop' && p.prop === 'plinth')) {
    warnings.push('no plinth prop under the launcher — the carriage will read as floating');
  }
  if (!draft.pieces.some((p) => p.kind === 'static' && p.type === 'ground')) {
    warnings.push('no ground static — bodies will fall out of the world');
  }
  return { errors, warnings };
}

/** The draft as level JSON, ready to paste into `src/levels/lXX.ts`. */
export function draftToJson(draft: Draft): string {
  return JSON.stringify(draftToLevelDef(draft), null, 2);
}

/**
 * Read a `LevelDef` back into a draft. Builder pieces cannot be recovered from expanded
 * objects, so an imported stage becomes its literal objects, balls and props — editable, and
 * still expandable to the same level data (docs/level-format.md).
 */
export function draftFromDef(def: LevelDef): Draft {
  const pieces: Piece[] = [];
  let n = 0;
  for (const s of def.statics ?? []) {
    pieces.push({ id: `import-static-${n++}`, kind: 'static', x: s.x, w: s.w, h: s.h, y: s.y, type: s.type });
  }
  for (const o of def.objects ?? []) {
    if (o.target) {
      const variant = (o.variant ?? 'worker').replace('-flipped', '');
      pieces.push({
        id: `import-bird-${n++}`, kind: 'bird', x: o.x, r: o.r ?? 20,
        variant: (BIRD_VARIANTS as readonly string[]).includes(variant) ? variant : 'worker',
        facing: (o.variant ?? '').endsWith('-flipped') ? 'left' : 'right',
      });
    } else if (o.type === 'ball') {
      pieces.push({ id: `import-ball-${n++}`, kind: 'ball', x: o.x, material: o.material as BlockMaterial, r: o.r ?? 20, y: o.y });
    } else {
      // A block keeps its own height: an elevated roof imports as a block at its own y, so
      // re-exporting a shipped stage reproduces it instead of freezing it into a static slab.
      pieces.push({ id: `import-block-${n++}`, kind: 'block', x: o.x, y: o.y, material: o.material as BlockMaterial, w: o.w ?? 40, h: o.h ?? 40 });
    }
  }
  for (const s of def.targets ?? []) {
    const variant = (s.variant ?? 'worker').replace('-flipped', '');
    pieces.push({
      id: `import-target-${n++}`, kind: 'bird', x: s.x, r: s.r ?? 20,
      variant: (BIRD_VARIANTS as readonly string[]).includes(variant) ? variant : 'worker',
      facing: (s.variant ?? '').endsWith('-flipped') ? 'left' : 'right',
    });
  }
  for (const s of def.scenery ?? []) {
    pieces.push({ id: `import-prop-${n++}`, kind: 'prop', x: s.x, prop: s.kind, w: s.w ?? (s.r ?? 16) * 2, h: s.h ?? (s.r ?? 16) * 2, y: s.y });
  }
  return {
    name: def.name,
    bounds: { ...def.bounds },
    cannon: { ...def.cannon, ammo: [...def.cannon.ammo] },
    pieces,
  };
}

export function draftFromJson(json: string): Draft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('level JSON: could not be parsed');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('level JSON: expected an object');
  const def = parsed as LevelDef;
  if (!def.name) throw new Error('level "name": required');
  if (!def.cannon) throw new Error('level "cannon": required');
  return draftFromDef(def);
}

/** Hit-test a world point against the draft's pieces, topmost (last placed) first. */
export function pieceAt(draft: Draft, point: { x: number; y: number }): Piece | null {
  for (const piece of [...draft.pieces].reverse()) {
    const fp = pieceFootprint(piece);
    if (point.x >= fp.left && point.x <= fp.right && point.y >= fp.top && point.y <= fp.bottom) return piece;
  }
  return null;
}
