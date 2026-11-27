// Scratch probe: stage-04 layout before/after a shot, to see what floats.
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';
import type { EntityState } from '../src/core/types.ts';

const loaded = loadLevel(LEVELS[3]!);
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const game = createGame({ level: loaded, adapter, bus: createEventBus() });
const line = (s: EntityState) =>
  `${s.id} ${s.kind} ${s.material} x=${Math.round(s.x)} y=${Math.round(s.y)} hw=${s.halfWidth ?? s.radius} hh=${s.halfHeight ?? s.radius} bottom=${Math.round(s.y + (s.halfHeight ?? s.radius ?? 0))} health=${Math.round(s.health)} sleep=${s.sleeping}`;
console.log('--- after warmup');
for (const s of game.adapter.snapshot()) console.log(line(s));
const origin = game.cannon.config().origin;
game.beginAim();
game.dragAim({ x: origin.x - 90 * Math.cos((14 * Math.PI) / 180), y: origin.y - 90 * Math.sin((14 * Math.PI) / 180) });
game.releaseAim();
for (let i = 0; i < 420; i++) game.step(1 / 60);
console.log(`--- after shot 1 (phase ${game.rules.snapshot().phase})`);
for (const s of game.adapter.snapshot()) console.log(line(s));
game.beginAim();
game.dragAim({ x: origin.x - 90 * Math.cos((22 * Math.PI) / 180), y: origin.y - 90 * Math.sin((22 * Math.PI) / 180) });
game.releaseAim();
for (let i = 0; i < 420; i++) game.step(1 / 60);
console.log(`--- after shot 2 (phase ${game.rules.snapshot().phase})`);
for (const s of game.adapter.snapshot()) console.log(line(s));
