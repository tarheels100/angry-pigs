import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const DT = 1 / 60;

/** Find shots that break nothing on stage 1 (for the "slow clear" test) and an open-bird impact shot. */
const loaded = loadLevel(LEVELS[0]!);
const origin = loaded.cannonOrigin;
for (const [pull, deg] of [[30, -70], [24, -60], [30, -45], [40, -75]] as Array<[number, number]>) {
  const game = createGame({ level: loaded, adapter: createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
  game.beginAim();
  const rad = (deg * Math.PI) / 180;
  game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
  game.releaseAim();
  for (let i = 0; i < 400; i++) {
    game.step(DT);
    const p = game.rules.snapshot().phase;
    if (p !== 'in_flight' && p !== 'settling') break;
  }
  const birds = game.entities.byKind('bird').length;
  const blocks = game.entities.byKind('block').length;
  console.log('stage-01 shot ' + pull + '@' + deg + ' birds=' + birds + ' blocks=' + blocks + ' phase=' + game.rules.snapshot().phase);
}

// Open-bird impact: bird on the ground, downward flat shot.
const open = loadLevel({
  name: 'open-bird',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['basic'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [],
  targets: [{ type: 'ball', material: 'feather', x: 520, y: 820, r: 20, target: true }],
});
const openGame = createGame({ level: open, adapter: createPhysicsAdapter({ width: 2200, height: 900, gravityY: 1, frictionAir: 0.001 }), bus: createEventBus() });
const deaths: Array<{ id: string; cause: string }> = [];
openGame.bus.on('destroyed', (e) => deaths.push({ id: e.id, cause: e.cause }));
openGame.beginAim();
const rad = (10 * Math.PI) / 180;
openGame.dragAim({ x: open.cannonOrigin.x - 90 * Math.cos(rad), y: open.cannonOrigin.y - 90 * Math.sin(rad) });
openGame.releaseAim();
for (let i = 0; i < 400; i++) {
  openGame.step(DT);
  const p = openGame.rules.snapshot().phase;
  if (p !== 'in_flight' && p !== 'settling') break;
}
console.log('open-bird shot 90@10 phase=' + openGame.rules.snapshot().phase + ' deaths=' + deaths.map((d) => d.id + '/' + d.cause).join(' '));
