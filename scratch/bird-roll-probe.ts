import { createPhysicsAdapter } from '../src/physics/adapter.ts';

/**
 * Does a bird on the ground roll forever? Rolling resistance applies to pigs and birds
 * (docs/tuning.md). A bird is settled on the ground first, then pushed along it, and we
 * measure how far it travels and whether it sleeps inside the settle window (240 steps).
 */
const adapter = createPhysicsAdapter({ width: 1600, height: 900, gravityY: 1, frictionAir: 0.001 });
adapter.addBody({ id: 'ground', kind: 'ground', shape: 'box', material: 'ground', isStatic: true, x: 800, y: 860, halfWidth: 800, halfHeight: 20 });
// Ground top = 840, so a resting ball of r=20 sits at y = 820.
adapter.addBody({ id: 'bird-1', kind: 'bird', shape: 'circle', material: 'feather', x: 300, y: 820, radius: 20 });

for (let step = 0; step < 30; step++) adapter.step(1 / 60);
adapter.launch('bird-1', { x: 8, y: 0 });

for (let step = 1; step <= 240; step++) {
  adapter.step(1 / 60);
  const s = adapter.state('bird-1')!;
  if (s.sleeping) {
    console.log(`bird slept at step ${step}: travelled ${(s.x - 300).toFixed(0)} units, speed ${Math.hypot(s.vx, s.vy).toFixed(3)}`);
    break;
  }
  if (step === 240) console.log(`bird still awake at step 240: travelled ${(s.x - 300).toFixed(0)} units, speed ${Math.hypot(s.vx, s.vy).toFixed(3)}`);
}
console.log(`all sleeping: ${adapter.allSleeping()}`);
