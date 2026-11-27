import { createGame } from '../src/game/game.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';
const DT = 1/60;
const loaded = loadLevel(LEVELS[2]);
function play(shots) {
  const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: 2200, height: 900, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
  const origin = loaded.cannonOrigin;
  for (const shot of shots) {
    const p = game.rules.snapshot().phase;
    if (p !== 'aiming' && p !== 'settling') break;
    const rad = shot.deg * Math.PI / 180;
    game.beginAim();
    game.dragAim({ x: origin.x - shot.pull * Math.cos(rad), y: origin.y - shot.pull * Math.sin(rad) });
    game.releaseAim();
    for (let s = 0; s < 300 && game.rules.snapshot().phase === 'in_flight'; s++) game.step(DT);
    for (let s = 0; s < 150 && game.rules.snapshot().phase === 'settling'; s++) game.step(DT);
  }
  return { birds: game.entities.byKind('bird').length, blocks: game.entities.byKind('block').length, phase: game.rules.snapshot().phase };
}
const PULLS = [90,75,63,45,32], DEGS = [-45,-40,-35,-30,-25,-20,-15,-10,-5,0,5];
let plan = [];
for (let i = 0; i < loaded.def.cannon.ammo.length; i++) {
  let best = null, bestScore = { birds: Infinity, blocks: Infinity };
  for (const pull of PULLS) for (const deg of DEGS) {
    const r = play([...plan, { pull, deg }]);
    if (r.birds < bestScore.birds || (r.birds === bestScore.birds && r.blocks < bestScore.blocks)) { bestScore = r; best = { pull, deg }; }
  }
  if (!best) break;
  plan.push(best);
  console.log(`iter ${i+1}: ${best.pull}@${best.deg} birds=${bestScore.birds} blocks=${bestScore.blocks} phase=${bestScore.phase}`);
  if (bestScore.birds === 0) break;
}
console.log('plan', plan.map(s=>`${s.pull}@${s.deg}`).join(' '), 'final birds', play(plan).birds, 'phase', play(plan).phase);
