/**
 * M3 physics spike — throwaway prototype, NOT part of src/.
 * Validates the assumptions D1/M4 depend on:
 *   1. unsupported objects fall
 *   2. round objects roll down an incline
 *   3. a projectile knocks a stack over
 *   4. collision events give usable impact velocity / energy
 *   5. launch arc range for tuning cannon.powerScale
 *
 * Run: node scratch/physics-spike/spike.ts
 */
import Matter from 'matter-js';

const { Engine, Bodies, Body, Events, Composite } = Matter;

type SpikeEngine = ReturnType<typeof Engine.create>;

function world(gravityY = 1): SpikeEngine {
  const engine = Engine.create();
  engine.gravity.y = gravityY;
  engine.enableSleeping = true; // matter-js 0.20 engine flag; per-body threshold is body.sleepThreshold (60)
  return engine;
}

/** Relative speed along the contact normal, weighted by the lighter body. */
function energyOf(pair: Matter.Pair): number {
  const a = pair.bodyA, b = pair.bodyB;
  const n = pair.collision?.normal ?? { x: 0, y: 1 };
  const rel = (a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y;
  return Math.abs(rel) * Math.min(a.mass, b.mass);
}

function record(engine: SpikeEngine): number[] {
  const energies: number[] = [];
  Events.on(engine, 'collisionStart', (e: Matter.IEventCollision<SpikeEngine>) => {
    for (const pair of e.pairs) energies.push(energyOf(pair));
  });
  return energies;
}

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) process.exitCode = 1;
}

// --- 1. unsupported object falls ---------------------------------------------------
{
  const engine = world();
  const block = Bodies.rectangle(400, 200, 40, 40, { label: 'block', density: 0.0012 });
  Composite.add(engine.world, block);
  const y0 = block.position.y;
  for (let i = 0; i < 30; i++) Engine.update(engine, 1000 / 60);
  const fell = block.position.y - y0;
  report('unsupported object falls', fell > 60, `dropped ${fell.toFixed(1)} units in 30 steps, vy=${block.velocity.y.toFixed(2)}`);
}

// --- 2. round object rolls down an incline ----------------------------------------
{
  const engine = world();
  const ramp = Bodies.rectangle(700, 400, 600, 20, { isStatic: true, angle: Math.PI / 9, label: 'ramp' });
  const ball = Bodies.circle(500, 300, 20, { label: 'ball', density: 0.0012, friction: 0.3, restitution: 0.1 });
  Composite.add(engine.world, [ramp, ball]);
  const x0 = ball.position.x;
  for (let i = 0; i < 90; i++) Engine.update(engine, 1000 / 60);
  const dx = ball.position.x - x0;
  report('circle rolls down incline', dx > 20 && Math.abs(ball.angularVelocity) > 0.05,
    `moved right ${dx.toFixed(1)} units, angular velocity ${ball.angularVelocity.toFixed(3)}`);
}

// --- 3. projectile knocks a tower over -------------------------------------------
{
  const engine = world();
  const energies = record(engine);
  // Ground top = 840. Bodies must sit ON the ground, not overlap it: an overlapping
  // body gets pushed upward by the solver and the measurements become nonsense.
  const ground = Bodies.rectangle(800, 860, 1600, 40, { isStatic: true, label: 'ground', friction: 0.5, frictionStatic: 0.5 });
  const glass = (x: number, y: number, w: number, h: number) =>
    Bodies.rectangle(x, y, w, h, { density: 0.0012, friction: 0.05, frictionStatic: 0.05 });
  const colL = glass(1080, 780, 30, 120); // top = 720
  const colR = glass(1160, 780, 30, 120);
  const beam = glass(1120, 708, 170, 24); // rests on both columns
  const bird = Bodies.circle(1120, 678, 18, { label: 'bird', density: 0.0008, friction: 0.2, restitution: 0.2 });
  Composite.add(engine.world, [ground, colL, colR, beam, bird]);

  // Pig friction 0.02 so it keeps momentum instead of grinding to a stop on the
  // ground (Matter uses max(frictionA, frictionB), so a grabby pig + ground kills roll).
  const pig = Bodies.circle(120, 620, 18, { label: 'pig', density: 0.004, friction: 0.02, frictionStatic: 0.02, restitution: 0.3, frictionAir: 0.001 });
  Composite.add(engine.world, pig);
  Body.setVelocity(pig, { x: 22, y: -3 });

  const bodies = [colL, colR, beam, bird];
  const before = bodies.map((b) => ({ x: b.position.x, y: b.position.y }));
  for (let i = 0; i < 300; i++) Engine.update(engine, 1000 / 60);

  const displaced = bodies.map((b, i) => Math.hypot(b.position.x - before[i]!.x, b.position.y - before[i]!.y));
  const maxTilt = Math.max(...[colL, colR, beam].map((b) => Math.abs(b.angle)));
  const birdMoved = displaced[3]!;
  const maxEnergy = Math.max(...energies, 0);
  report('projectile knocks tower over', maxTilt > 0.5 && birdMoved > 60,
    `max tilt ${maxTilt.toFixed(2)}, bird moved ${birdMoved.toFixed(0)}, displacements ${displaced.map((d) => d.toFixed(0)).join('/')}, impacts ${energies.length}`);
  report('collision events report impact velocity', maxEnergy >= 3,
    `peak impact energy ${maxEnergy.toFixed(1)} (launch speed 22) vs glass damageThreshold 3; energies 0..${maxEnergy.toFixed(1)}`);
}

// --- 4. settle detection via sleeping ---------------------------------------------
{
  const engine = world();
  const ground = Bodies.rectangle(800, 860, 1600, 40, { isStatic: true, friction: 0.9 });
  const box = Bodies.rectangle(1100, 700, 40, 40, { density: 0.0012, friction: 0.6 });
  Composite.add(engine.world, [ground, box]);
  let settledAt = -1;
  for (let i = 0; i < 400; i++) {
    Engine.update(engine, 1000 / 60);
    if (box.isSleeping) { settledAt = i; break; }
  }
  report('bodies sleep when at rest', settledAt > 0 && settledAt < 240, `slept at step ${settledAt} (timeout budget 240)`);
}

// --- 5. pig keeps rolling momentum ---------------------------------------------
{
  const engine = world();
  const ground = Bodies.rectangle(800, 860, 1600, 40, { isStatic: true, friction: 0.5, frictionStatic: 0.5 });
  Composite.add(engine.world, [ground]);
  const pig = Bodies.circle(120, 700, 18, { density: 0.004, friction: 0.02, frictionStatic: 0.02, frictionAir: 0.001, restitution: 0.3 });
  Composite.add(engine.world, pig);
  Body.setVelocity(pig, { x: 16, y: 0 });
  for (let i = 0; i < 200; i++) Engine.update(engine, 1000 / 60);
  const travelled = pig.position.x - 120;
  report('pig keeps rolling momentum', travelled > 900,
    `ground pig travelled ${travelled.toFixed(0)} units in 200 steps, final vx ${pig.velocity.x.toFixed(2)}`);
}

// --- 6. launch arc range → cannon.powerScale --------------------------------------
{
  const engine = world();
  const ground = Bodies.rectangle(800, 860, 1600, 40, { isStatic: true });
  Composite.add(engine.world, [ground]);
  const pig = Bodies.circle(120, 480, 18, { density: 0.004, friction: 0.02, frictionStatic: 0.02, restitution: 0.3, frictionAir: 0.001 });
  Composite.add(engine.world, pig);
  Body.setVelocity(pig, { x: 22, y: -11 });
  let stepsToGround = 0;
  let reach = 0;
  for (let i = 0; i < 400; i++) {
    Engine.update(engine, 1000 / 60);
    stepsToGround++;
    reach = pig.position.x - 120;
    if (pig.position.y >= 830) break;
  }
  report('ballistic arc crosses the stage', reach > 800,
    `near-full pull launch (v=22,-11) travels ${reach.toFixed(0)} units in ${stepsToGround} steps`);
}

console.log(process.exitCode ? '\nSPIKE FAILED — D1 must be revisited before M4' : '\nSPIKE PASSED — Matter.js satisfies D1');
