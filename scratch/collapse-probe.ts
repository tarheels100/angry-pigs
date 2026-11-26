import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';

const level = loadLevel(levelAt(0));
const adapter = createPhysicsAdapter({ width: level.def.bounds.width, height: level.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
for (const b of level.bodies) adapter.addBody(b);

const beam = adapter.state('block-3')!;
console.log('beam initial y', beam.y.toFixed(1), 'sleeping', beam.sleeping);

// Let everything settle first (same as a resting tower).
for (let i = 0; i < 120; i++) adapter.step(1 / 60);
console.log('after settle: beam y', adapter.state('block-3')!.y.toFixed(1), 'sleeping', adapter.state('block-3')!.sleeping);

// Knock the left column out of the world, as the damage model does.
adapter.applyDamage('block-1', 999);
console.log('block-1 destroyed', adapter.state('block-1')!.destroyed);
for (let i = 0; i < 90; i++) adapter.step(1 / 60);
const beamAfter = adapter.state('block-3')!;
console.log('A) no wake: beam y', beamAfter.y.toFixed(1), 'sleeping', beamAfter.sleeping, 'angle', beamAfter.angle.toFixed(2));

// Same again, but wake everything on removal.
const adapter2 = createPhysicsAdapter({ width: level.def.bounds.width, height: level.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
for (const b of level.bodies) adapter2.addBody(b);
for (let i = 0; i < 120; i++) adapter2.step(1 / 60);
adapter2.applyDamage('block-1', 999);
adapter2.wakeAll();
for (let i = 0; i < 90; i++) adapter2.step(1 / 60);
const beam2 = adapter2.state('block-3')!;
console.log('B) wakeAll:  beam y', beam2.y.toFixed(1), 'sleeping', beam2.sleeping, 'angle', beam2.angle.toFixed(2));
console.log('B) bird-2 y', adapter2.state('bird-2')!.y.toFixed(1), 'destroyed', adapter2.state('bird-2')!.destroyed);
