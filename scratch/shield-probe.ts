import { LEVELS, type LevelDef, type LevelObject } from '../src/levels/index.ts';

/**
 * Shield probe (level rule 1, docs/level-format.md): every bird must be *unreachable
 * directly*, and scenery must not sit over the playable band. Checked against authored
 * geometry, before any physics runs.
 *
 * 1. the straight line from the launch origin to the bird crosses at least one block, and
 * 2. something destructible sits above the bird — a roof or a platform beam — wide enough to
 *    stop a lobbed arc landing on it.
 *
 * A bird failing either test can be killed without touching the structure, which is exactly
 * what the playtest report complained about. A prop overlapping a bird or a block dims the
 * thing the player is aiming at (playtest item 2).
 */

/** Segment-vs-AABB intersection (Liang–Barsky). Sampling a polyline misses thin walls. */
function overlapsSegment(a: { x: number; y: number }, b: { x: number; y: number }, block: LevelObject): boolean {
  if (block.type !== 'block') return false;
  const { hw, hh } = half(block);
  const left = block.x - hw;
  const right = block.x + hw;
  const top = block.y - hh;
  const bottom = block.y + hh;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let tMin = 0;
  let tMax = 1;
  for (const [p, q] of [[-dx, a.x - left], [dx, right - a.x], [-dy, a.y - top], [dy, bottom - a.y]] as const) {
    if (p === 0) {
      if (q < 0) return false; // parallel and outside this slab
      continue;
    }
    const t = q / p;
    if (p < 0) tMin = Math.max(tMin, t);
    else tMax = Math.min(tMax, t);
    if (tMin > tMax) return false;
  }
  return tMin <= tMax;
}

/** A destructible block directly above the bird, wide enough to stop an arc. */
/** Half-extents of a level object, for AABB tests. */
function half(o: LevelObject): { hw: number; hh: number } {
  // Half-extents: LevelObject stores full w/h.
  return o.type === 'ball' ? { hw: o.r ?? 0, hh: o.r ?? 0 } : { hw: (o.w ?? 0) / 2, hh: (o.h ?? 0) / 2 };
}

function coveredFromAbove(bird: LevelObject, blocks: LevelObject[]): LevelObject | null {
  for (const block of blocks) {
    if (block.type !== 'block') continue;
    // Stone and metal cannot be broken by a pig, so a stone roof would seal the bird
    // forever (level rule 3). Only destructible tops count as shelter.
    if (block.material === 'stone' || block.material === 'metal') continue;
    // The roof must span the bird with margin, and its underside must be above the bird.
    const { hw, hh } = half(block);
    const coversX = bird.x - (bird.r ?? 0) >= block.x - hw && bird.x + (bird.r ?? 0) <= block.x + hw;
    const above = block.y + hh < bird.y - (bird.r ?? 0);
    if (coversX && above) return block;
  }
  return null;
}

function audit(def: LevelDef): { blocks: number; birds: number; exposed: string[]; props: string[]; collisions: string[] } {
  const blocks = def.objects.filter((o) => o.type === 'block');
  const birds = def.targets ?? [];
  const origin = { x: def.cannon.x, y: def.cannon.y };
  const exposed: string[] = [];
  for (const bird of birds) {
    const blocked = def.objects.some((o) => o.type === 'block' && overlapsSegment(origin, bird, o));
    const roof = coveredFromAbove(bird, blocks);
    if (!blocked || !roof) exposed.push(`bird x=${Math.round(bird.x)} y=${Math.round(bird.y)} line=${blocked ? 'blocked' : 'OPEN'} roof=${roof ? 'yes' : 'NONE'}`);
  }
  // Scenery is backdrop (D29): a prop overlapping gameplay geometry dims the target.
  const props: string[] = [];
  for (const prop of def.scenery ?? []) {
    if (prop.kind === 'plinth') continue; // the launcher's own plinth is meant to sit under the cannon
    const left = prop.x - (prop.w ?? 0) / 2;
    const right = prop.x + (prop.w ?? 0) / 2;
    const top = prop.y - (prop.h ?? 0) / 2;
    const bottom = prop.y + (prop.h ?? 0) / 2;
    for (const o of birds) {
      const { hw, hh } = half(o);
      if (right > o.x - hw && left < o.x + hw && bottom > o.y - hh && top < o.y + hh) {
        props.push(`${prop.kind} at ${Math.round(prop.x)} overlaps ${o.type} at ${Math.round(o.x)},${Math.round(o.y)}`);
      }
    }
  }
  // Authored bodies must touch but never interpenetrate: overlapping bodies jitter and
  // push each other apart on the first frame (docs/physics.md gotcha 5).
  const collisions: string[] = [];
  const bodies = [...def.objects, ...(def.targets ?? [])];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const { hw: aw, hh: ah } = half(a);
      const { hw: bw, hh: bh } = half(b);
      const dx = Math.abs(a.x - b.x) - (aw + bw);
      const dy = Math.abs(a.y - b.y) - (ah + bh);
      if (dx < -1 && dy < -1) collisions.push(`${a.type}@${Math.round(a.x)},${Math.round(a.y)} overlaps ${b.type}@${Math.round(b.x)},${Math.round(b.y)}`);
    }
  }
  return { blocks: blocks.length, birds: birds.length, exposed, props, collisions };
}

let problems = 0;
for (const def of LEVELS) {
  const result = audit(def);
  const total = def.objects.length + (def.targets ?? []).length + def.statics.length;
  const clean = result.exposed.length === 0 && result.props.length === 0 && result.collisions.length === 0;
  if (!clean) problems++;
  console.log(`${def.name}: bodies ${total} (blocks ${result.blocks}, birds ${result.birds}) ${clean ? 'shielded, props clear, no interpenetration' : 'PROBLEMS'}`);
  for (const e of result.exposed) console.log(`  exposed ${e}`);
  for (const p of result.props) console.log(`  prop over gameplay: ${p}`);
  for (const c of result.collisions) console.log(`  interpenetration: ${c}`);
}
console.log(problems === 0 ? 'ALL STAGES PASS THE SHIELD AUDIT' : `${problems} stage(s) have problems`);
