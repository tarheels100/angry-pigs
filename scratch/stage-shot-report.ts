import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const DT = 1 / 60;

/**
 * Per-shot report for a plan: which birds died, which blocks were destroyed, phase and score.
 * Used to re-derive the assertions in tests/game.test.ts after the M21 level rewrite.
 */
const loaded = loadLevel(LEVELS[0]!);
const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
const origin = loaded.cannonOrigin;

function fire(pull: number, deg: number): void {
  const rad = (deg * Math.PI) / 180;
  game.beginAim();
  game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
  game.releaseAim();
  for (let step = 0; step < 400 && game.rules.snapshot().phase === 'in_flight'; step++) game.step(DT);
  for (let step = 0; step < 240 && game.rules.snapshot().phase === 'settling'; step++) game.step(DT);
  const snap = game.rules.snapshot();
  console.log(`shot ${pull}@${deg}: phase=${snap.phase} ammo=${snap.ammoLeft} score=${snap.score} stars=${snap.stars} birds=${game.entities.byKind('bird').map((b) => b.id).join(',') || 'none'} blocks=${game.entities.byKind('block').length}`);
}

fire(90, -20);
fire(90, -20);
