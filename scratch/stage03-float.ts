// Scratch probe: stage-03's floating glass beam — does it wake under wakeUnsupported?
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

const loaded = loadLevel(LEVELS[2]!);
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const game = createGame({ level: loaded, adapter, bus: createEventBus() });
const origin = game.cannon.config().origin;
for (const deg of [14, 22]) {
  game.beginAim();
  game.dragAim({ x: origin.x - 90 * Math.cos((deg * Math.PI) / 180), y: origin.y - 90 * Math.sin((deg * Math.PI) / 180) });
  game.releaseAim();
  for (let i = 0; i < 420; i++) game.step(1 / 60);
}
const before = adapter.state('block-5');
console.log('phase', game.rules.snapshot().phase, 'block-5 y', before?.y.toFixed(2), 'sleep', before?.sleeping);
for (let i = 0; i < 60; i++) game.step(1 / 60);
const after = adapter.state('block-5');
console.log('after 60 idle steps: y', after?.y.toFixed(2), 'sleep', after?.sleeping);
console.log('all bodies:', adapter.snapshot().map((s) => `${s.id} y=${Math.round(s.y)} sleep=${s.sleeping}`).join(' '));
// Step the adapter directly (bypassing the game's won/lost early return).
for (let i = 0; i < 120; i++) adapter.step(1 / 60);
console.log('after 120 adapter steps:', adapter.snapshot().map((s) => `${s.id} y=${Math.round(s.y)} sleep=${s.sleeping}`).join(' '));
console.log('wake attempts:', (globalThis as any).__wakeCount ?? 0);
for (const s of adapter.snapshot()) {
  console.log(`${s.id} angle=${s.angle.toFixed(2)} x=${Math.round(s.x)} y=${Math.round(s.y)} hw=${s.halfWidth ?? s.radius} hh=${s.halfHeight ?? s.radius} bottom=${Math.round(s.y + (s.halfHeight ?? s.radius ?? 0))}`);
}
