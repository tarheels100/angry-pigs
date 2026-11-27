import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';
const loaded = loadLevel(LEVELS[0]!);
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const game = createGame({ level: loaded, adapter, bus: createEventBus() });
for (const s of game.adapter.snapshot()) console.log(s.id, s.kind, s.shape, JSON.stringify({ hw: s.halfWidth, hh: s.halfHeight, r: s.radius }), 'y', Math.round(s.y));
console.log('groundTop', loaded.groundTop);
