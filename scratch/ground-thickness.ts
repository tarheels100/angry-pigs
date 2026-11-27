// Scratch probe: does a thicker ground static stop falling bodies tunnelling through it?
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, LEVELS } from '../src/levels/index.ts';

function run(index: number, groundH: number) {
  const loaded = loadLevel(LEVELS[index]!);
  const ground = loaded.def.statics.find((s) => s.type === 'ground');
  if (ground) {
    ground.h = groundH;
    ground.y = 840 + groundH / 2; // keep the surface at 840
  }
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  const origin = game.cannon.config().origin;
  for (const deg of [14, 22]) {
    game.beginAim();
    game.dragAim({ x: origin.x - 90 * Math.cos((deg * Math.PI) / 180), y: origin.y - 90 * Math.sin((deg * Math.PI) / 180) });
    game.releaseAim();
    for (let i = 0; i < 420; i++) game.step(1 / 60);
  }
  const sunk = game.adapter.snapshot().filter((s) => s.kind === 'block' || s.kind === 'bird');
  console.log(`stage-0${index + 1} groundH=${groundH} phase=${game.rules.snapshot().phase}`);
  for (const s of sunk) {
    const half = s.halfHeight ?? s.radius ?? 0;
    console.log(`   ${s.id} bottom=${Math.round(s.y + half)} (ground top 840) sleep=${s.sleeping}`);
  }
}
run(2, 40);
run(2, 120);
