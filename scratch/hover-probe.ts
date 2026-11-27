// Scratch probe (playtest item 7): after a round ends, is any body floating with no
// support under it? Reports per stage.
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import type { EntityState } from '../src/core/types.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const GROUND_TOP = 840; // per-level: replaced by game.groundTop() below
const DT = 1 / 60;

function hovering(game: ReturnType<typeof createGame>): string[] {
  const bodies = game.adapter.snapshot();
  const out: string[] = [];
  const rot = (e: EntityState) => {
    const hw = e.halfWidth ?? e.radius ?? 12;
    const hh = e.halfHeight ?? e.radius ?? 12;
    // Rotated AABB: a column knocked onto its side is wide and short, so authored
    // half-extents alone report a false "floating" body.
    return {
      w: Math.abs(Math.cos(e.angle)) * hw + Math.abs(Math.sin(e.angle)) * hh,
      h: Math.abs(Math.sin(e.angle)) * hw + Math.abs(Math.cos(e.angle)) * hh,
    };
  };
  const halfH = (e: EntityState) => rot(e).h;
  const halfW = (e: EntityState) => rot(e).w;
  for (const b of bodies) {
    if (b.kind === 'ground' || b.kind === 'wall') continue;
    const bottom = b.y + halfH(b);
    if (bottom >= game.groundTop() - 14) continue; // resting on the ground
    const supported = bodies.some((o) => {
      if (o.id === b.id) return false;
      const oTop = o.y - halfH(o);
      const overlapX = halfW(b) + halfW(o) - Math.abs(o.x - b.x);
      // Ground and walls are static supports; a body resting on their surface is not floating.
      return overlapX >= 4 && oTop >= bottom - 14 && oTop <= bottom + 14;
    });
    if (!supported) out.push(`${b.id} ${b.kind} ${b.material} y=${Math.round(b.y)} sleeping=${b.sleeping}`);
  }
  return out;
}

for (const def of LEVELS) {
  const loaded = loadLevel(def);
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });

  const before = hovering(game);

  // A greedy-ish shot: aim at the structure band, then run the round to its end.
  const origin = game.cannon.config().origin;
  game.beginAim();
  game.dragAim({ x: origin.x - 90 * Math.cos((14 * Math.PI) / 180), y: origin.y - 90 * Math.sin((14 * Math.PI) / 180) });
  game.releaseAim();
  for (let i = 0; i < 420; i++) game.step(DT);
  const phase = game.rules.snapshot().phase;

  // A second shot after the round resolved, in case it lost.
  if (phase !== 'won') {
    game.beginAim();
    game.dragAim({ x: origin.x - 90 * Math.cos((22 * Math.PI) / 180), y: origin.y - 90 * Math.sin((22 * Math.PI) / 180) });
    game.releaseAim();
    for (let i = 0; i < 420; i++) game.step(DT);
  }
  const after = hovering(game);
  const snapshot = game.adapter.snapshot();
  console.log(
    `${def.name}: phase=${game.rules.snapshot().phase} bodies=${snapshot.length} asleep=${snapshot.filter((b) => b.sleeping).length} hovering before=${before.length} after=${after.length}`,
  );
  for (const line of after.slice(0, 8)) console.log(`    ${line}`);
}
