import assert from 'node:assert/strict';
import test from 'node:test';

import { createMatterAdapter } from '../src/physics/matterAdapter.ts';
import { MATERIALS, healthFor } from '../src/physics/materials.ts';

const DT = 1 / 60;

function stage() {
  const adapter = createMatterAdapter({ width: 1600, height: 900, gravityY: 1, frictionAir: 0.001 });
  adapter.addBody({ id: 'ground', kind: 'ground', shape: 'box', material: 'ground', x: 800, y: 880, halfWidth: 800, halfHeight: 40, isStatic: true });
  return adapter;
}

test('adapter steps bodies and reports state', () => {
  const adapter = stage();
  adapter.addBody({ id: 'block', kind: 'block', shape: 'box', material: 'glass', x: 400, y: 300, halfWidth: 20, halfHeight: 20 });
  const before = adapter.state('block')!;
  for (let i = 0; i < 30; i++) adapter.step(DT);
  const after = adapter.state('block')!;
  assert.ok(after.y > before.y, 'unsupported block falls');
  assert.equal(after.shape, 'box');
  assert.equal(after.halfWidth, 20);
  assert.ok(adapter.snapshot().some((e) => e.id === 'ground'));
});

test('adapter rejects a step that is not FIXED_DT', () => {
  const adapter = stage();
  assert.throws(() => adapter.step(1 / 30), /FIXED_DT/);
});

test('health comes from material and scales with area', () => {
  const adapter = stage();
  adapter.addBody({ id: 'small', kind: 'block', shape: 'box', material: 'glass', x: 300, y: 300, halfWidth: 10, halfHeight: 10 });
  adapter.addBody({ id: 'big', kind: 'block', shape: 'box', material: 'glass', x: 500, y: 300, halfWidth: 40, halfHeight: 40 });
  assert.equal(adapter.state('small')!.health, healthFor('glass', 20 * 20));
  assert.ok(adapter.state('big')!.health > adapter.state('small')!.health);
  assert.equal(adapter.state('ground')!.health, Infinity);
});

test('launch sends a pig on an arc and impacts report energy', () => {
  const adapter = stage();
  adapter.addBody({ id: 'bird', kind: 'bird', shape: 'circle', material: 'feather', x: 1100, y: 800, radius: 18 });
  adapter.addBody({ id: 'pig', kind: 'pig', shape: 'circle', material: 'light', x: 120, y: 480, radius: 18 });
  adapter.launch('pig', { x: 14, y: -11 });
  let impacts = 0;
  let maxEnergy = 0;
  for (let i = 0; i < 200; i++) {
    const step = adapter.step(DT);
    impacts += step.length;
    for (const hit of step) maxEnergy = Math.max(maxEnergy, hit.energy);
  }
  assert.ok(impacts > 0, 'collision events produce impacts');
  assert.ok(maxEnergy > MATERIALS.feather.damageThreshold, 'a direct hit exceeds the feather threshold');
  assert.ok(adapter.state('pig')!.x > 600, 'pig travelled across the stage');
});

test('pigs do not collide with each other', () => {
  const adapter = stage();
  adapter.addBody({ id: 'pigA', kind: 'pig', shape: 'circle', material: 'light', x: 300, y: 400, radius: 18 });
  adapter.addBody({ id: 'pigB', kind: 'pig', shape: 'circle', material: 'light', x: 340, y: 400, radius: 18 });
  adapter.launch('pigA', { x: 10, y: 0 });
  let pigPig = 0;
  for (let i = 0; i < 40; i++) {
    for (const hit of adapter.step(DT)) if (hit.aId === 'pigA' && hit.bId === 'pigB') pigPig++;
  }
  assert.equal(pigPig, 0, 'projectile/projectile pairs are filtered out');
});

test('applyDamage destroys a body and drops it from the world', () => {
  const adapter = stage();
  adapter.addBody({ id: 'bird', kind: 'bird', shape: 'circle', material: 'feather', x: 1100, y: 800, radius: 18 });
  const health = adapter.state('bird')!.health;
  adapter.applyDamage('bird', health);
  assert.equal(adapter.state('bird')!.destroyed, true);
  assert.equal(adapter.state('bird')!.health, 0);
  // A destroyed body must stop colliding.
  adapter.addBody({ id: 'pig', kind: 'pig', shape: 'circle', material: 'light', x: 1100, y: 400, radius: 18 });
  for (let i = 0; i < 60; i++) {
    for (const hit of adapter.step(DT)) assert.notEqual(hit.bId, 'bird');
  }
});

test('simulateTrajectory does not mutate the live world', () => {
  const adapter = stage();
  adapter.addBody({ id: 'tower', kind: 'block', shape: 'box', material: 'glass', x: 1000, y: 760, halfWidth: 20, halfHeight: 60 });
  adapter.addBody({ id: 'bird', kind: 'bird', shape: 'circle', material: 'feather', x: 1000, y: 680, radius: 18 });
  const before = adapter.snapshot();
  const samples = adapter.simulateTrajectory({ x: 120, y: 480 }, { x: 12.6, y: -12.6 }, 120);
  const after = adapter.snapshot();
  assert.deepEqual(before, after, 'preview must not touch the live simulation');
  assert.ok(samples.length > 5);
  assert.ok(samples.some((s) => s.y > 700), 'arc descends into the stage');
  assert.ok(samples.some((s) => s.hit), 'preview flags the first contact');
});

test('bodies sleep when settled and wakeAll wakes them', () => {
  const adapter = stage();
  adapter.addBody({ id: 'block', kind: 'block', shape: 'box', material: 'stone', x: 400, y: 300, halfWidth: 20, halfHeight: 20 });
  let sleptAt = -1;
  for (let i = 0; i < 240; i++) {
    adapter.step(DT);
    if (adapter.allSleeping()) { sleptAt = i; break; }
  }
  assert.notEqual(sleptAt, -1, 'world settles within the timeout budget');
  adapter.wakeAll();
  assert.equal(adapter.allSleeping(), false);
});

test('pig rolling resistance makes a grounded pig settle', () => {
  const adapter = createMatterAdapter({ width: 3000, height: 900, gravityY: 1, frictionAir: 0.001 });
  adapter.addBody({ id: 'ground', kind: 'ground', shape: 'box', material: 'ground', x: 1500, y: 880, halfWidth: 1500, halfHeight: 40, isStatic: true });
  adapter.addBody({ id: 'pig', kind: 'pig', shape: 'circle', material: 'light', x: 120, y: 480, radius: 18 });
  adapter.launch('pig', { x: 12.6, y: -12.6 });
  let stopped = -1;
  for (let i = 0; i < 260; i++) {
    adapter.step(DT);
    const s = adapter.state('pig')!;
    if (Math.hypot(s.vx, s.vy) < 1.2) { stopped = i; break; }
  }
  assert.notEqual(stopped, -1, 'pig stops rolling within the settle timeout');
});

test('bird rolling resistance makes a grounded bird settle', () => {
  // Same resistance as pigs (docs/adr.md D15). Before it, a bird knocked onto the
  // ground rolled for 240 steps (327 units) without sleeping, so rounds only ended
  // at the settle timeout.
  const adapter = createMatterAdapter({ width: 1600, height: 900, gravityY: 1, frictionAir: 0.001 });
  adapter.addBody({ id: 'ground', kind: 'ground', shape: 'box', material: 'ground', x: 800, y: 860, halfWidth: 800, halfHeight: 20, isStatic: true });
  adapter.addBody({ id: 'bird', kind: 'bird', shape: 'circle', material: 'feather', x: 300, y: 820, radius: 20 });
  for (let i = 0; i < 30; i++) adapter.step(DT);
  adapter.launch('bird', { x: 8, y: 0 });

  let sleptAt = -1;
  let travelled = 0;
  for (let i = 1; i <= 240; i++) {
    adapter.step(DT);
    const s = adapter.state('bird')!;
    travelled = s.x - 300;
    if (s.sleeping) { sleptAt = i; break; }
  }
  assert.notEqual(sleptAt, -1, 'a rolling bird sleeps inside the settle window');
  assert.ok(travelled < 200, `bird must stop near where it landed, travelled ${travelled.toFixed(0)}`);
  assert.ok(adapter.allSleeping(), 'a settled bird lets the world settle');
});

test('destroying a support makes what rested on it fall', () => {
  const adapter = stage();
  adapter.addBody({ id: 'leg-a', kind: 'block', shape: 'box', material: 'glass', x: 400, y: 780, halfWidth: 15, halfHeight: 60 });
  adapter.addBody({ id: 'leg-b', kind: 'block', shape: 'box', material: 'glass', x: 480, y: 780, halfWidth: 15, halfHeight: 60 });
  adapter.addBody({ id: 'beam', kind: 'block', shape: 'box', material: 'glass', x: 440, y: 708, halfWidth: 70, halfHeight: 12 });
  adapter.addBody({ id: 'bird', kind: 'bird', shape: 'circle', material: 'feather', x: 440, y: 676, radius: 20 });

  for (let i = 0; i < 120; i++) adapter.step(DT);
  const resting = adapter.state('beam')!;
  assert.ok(resting.sleeping, 'a settled tower sleeps');
  const yBefore = resting.y;

  adapter.applyDamage('leg-a', 1000);
  assert.ok(adapter.state('leg-a')!.destroyed, 'the struck leg leaves the world');

  for (let i = 0; i < 60; i++) adapter.step(DT);
  const fallen = adapter.state('beam')!;
  assert.ok(fallen.y > yBefore + 20, `beam must fall when its support is removed (moved ${(fallen.y - yBefore).toFixed(1)} units)`);
  assert.equal(fallen.sleeping, false, 'a body whose support vanished must not stay asleep');
});

test('a destroyed support drops the whole stack above it, not just the first layer', () => {
  // Playtest item 7: two storeys deep. Waking only the bodies touching the departing
  // body left the roof — and the bird riding it — frozen in the air.
  const adapter = stage();
  adapter.addBody({ id: 'leg-a', kind: 'block', shape: 'box', material: 'wood', x: 400, y: 780, halfWidth: 17, halfHeight: 60 });
  adapter.addBody({ id: 'leg-b', kind: 'block', shape: 'box', material: 'wood', x: 480, y: 780, halfWidth: 17, halfHeight: 60 });
  adapter.addBody({ id: 'storey', kind: 'block', shape: 'box', material: 'glass', x: 440, y: 708, halfWidth: 70, halfHeight: 12 });
  adapter.addBody({ id: 'col-a', kind: 'block', shape: 'box', material: 'glass', x: 420, y: 650, halfWidth: 13, halfHeight: 46 });
  adapter.addBody({ id: 'col-b', kind: 'block', shape: 'box', material: 'glass', x: 460, y: 650, halfWidth: 13, halfHeight: 46 });
  adapter.addBody({ id: 'roof', kind: 'block', shape: 'box', material: 'wood', x: 440, y: 592, halfWidth: 70, halfHeight: 12 });
  adapter.addBody({ id: 'bird', kind: 'bird', shape: 'circle', material: 'feather', x: 440, y: 560, radius: 20 });

  for (let i = 0; i < 120; i++) adapter.step(DT);
  const roofBefore = adapter.state('roof')!.y;
  const birdBefore = adapter.state('bird')!.y;

  // Take the whole first storey out, the way a blast does: the roof and the bird
  // riding it are two supports away from anything that was removed.
  adapter.applyDamage('leg-a', 1000);
  adapter.applyDamage('leg-b', 1000);
  adapter.applyDamage('storey', 1000);

  for (let i = 0; i < 180; i++) adapter.step(DT);
  assert.ok(adapter.state('roof')!.y > roofBefore + 15, 'the second storey must fall with its support');
  assert.ok(adapter.state('bird')!.y > birdBefore + 15, 'a bird riding the roof must fall too');
  // A heap is a legitimate rest; hanging in the air is not. Every survivor must be
  // resting on a surface, so this is the check that catches the reported bug.
  for (const id of ['roof', 'bird']) {
    const s = adapter.state(id)!;
    const half = s.halfHeight ?? s.radius ?? 0;
    const bottom = s.y + half;
    const supported = adapter.snapshot().some((o) => {
      if (o.id === id) return false;
      const oHalf = o.halfHeight ?? o.radius ?? 0;
      const overlapX = (o.halfWidth ?? o.radius ?? 0) + (s.halfWidth ?? s.radius ?? 0) - Math.abs(o.x - s.x);
      return overlapX >= 4 && Math.abs(o.y - oHalf - bottom) <= 14;
    });
    assert.ok(supported, `${id} must rest on something (bottom ${Math.round(bottom)})`);
  }
  assert.ok(adapter.allSleeping(), 'the rubble must come to rest');
});

test('destroyed bodies leave snapshot() but state() keeps the final state', () => {
  const adapter = stage();
  adapter.addBody({ id: 'block', kind: 'block', shape: 'box', material: 'glass', x: 400, y: 700, halfWidth: 20, halfHeight: 20 });
  adapter.applyDamage('block', 1000);

  assert.equal(adapter.snapshot().some((e) => e.id === 'block'), false, 'a corpse is not a renderable entity (D17)');
  const final = adapter.state('block')!;
  assert.equal(final.destroyed, true, 'queries still report the final state');
  assert.equal(final.health, 0);
});

test('freezeAll forces a rest so settled means visually stopped', () => {
  const adapter = stage();
  adapter.addBody({ id: 'block', kind: 'block', shape: 'box', material: 'glass', x: 400, y: 400, halfWidth: 20, halfHeight: 20 });
  for (let i = 0; i < 10; i++) adapter.step(DT);
  assert.ok(Math.hypot(adapter.state('block')!.vx, adapter.state('block')!.vy) > 0, 'still moving');

  adapter.freezeAll();
  const s = adapter.state('block')!;
  assert.equal(Math.hypot(s.vx, s.vy), 0);
  assert.equal(adapter.allSleeping(), true, 'a frozen world reports settled');
});

test('a pig rolls a long way on the ground instead of stopping dead', () => {
  // Regression guard for the tuning ask: pig rolling friction was too high.
  const adapter = stage();
  adapter.addBody({ id: 'pig', kind: 'pig', shape: 'circle', material: 'light', x: 200, y: 820, radius: 18 });
  adapter.launch('pig', { x: 12, y: 0 });
  const startX = adapter.state('pig')!.x;
  for (let i = 0; i < 90; i++) adapter.step(DT);
  const rolled = adapter.state('pig')!.x - startX;
  assert.ok(rolled > 120, `pig rolled only ${rolled.toFixed(1)} units; expected a long roll`);
});

test('explode damages and pushes what is inside the blast radius', () => {
  const adapter = stage();
  adapter.addBody({ id: 'near', kind: 'block', shape: 'box', material: 'wood', x: 300, y: 300, halfWidth: 20, halfHeight: 20 });
  adapter.addBody({ id: 'far', kind: 'block', shape: 'box', material: 'wood', x: 700, y: 300, halfWidth: 20, halfHeight: 20 });
  for (let i = 0; i < 5; i++) adapter.step(DT);

  const farBefore = adapter.state('far')!;
  const farSpeedBefore = Math.hypot(farBefore.vx, farBefore.vy);

  adapter.explode({ x: 300, y: 320 }, { radius: 80, damage: 8, impulse: 0.2 });

  // Close to the centre: full damage, pushed away from the blast.
  assert.equal(adapter.state('near')?.destroyed, true, 'a body at the centre takes the full blast');
  assert.ok(adapter.state('far')?.destroyed !== true, 'a body outside the radius is untouched');
  const far = adapter.state('far')!;
  assert.equal(far.health, farBefore.health, 'outside the radius nothing is chipped');
  assert.ok(Math.hypot(far.vx, far.vy) < farSpeedBefore + 0.01, 'outside the radius nothing is pushed');

  // Linear falloff: a body half way out loses about half the damage.
  const adapter2 = stage();
  adapter2.addBody({ id: 'edge', kind: 'block', shape: 'box', material: 'wood', x: 340, y: 300, halfWidth: 20, halfHeight: 20 });
  const before = adapter2.state('edge')!;
  adapter2.explode({ x: 300, y: 300 }, { radius: 80, damage: 4, impulse: 0 });
  const after = adapter2.state('edge')!;
  assert.ok(after.health < before.health, 'a mid-radius body is damaged');
  assert.ok(before.health - after.health < 4 && before.health - after.health > 0, 'falloff charges less than the full amount');
});

test('explode never flings a body it already destroyed', () => {
  const adapter = stage();
  adapter.addBody({ id: 'block', kind: 'block', shape: 'box', material: 'glass', x: 300, y: 300, halfWidth: 20, halfHeight: 20 });
  adapter.explode({ x: 300, y: 300 }, { radius: 100, damage: 10, impulse: 0.5 });
  assert.equal(adapter.state('block')?.destroyed, true);
  adapter.explode({ x: 300, y: 300 }, { radius: 100, damage: 10, impulse: 0.5 });
  assert.equal(adapter.snapshot().some((s) => s.id === 'block'), false, 'a destroyed body stays gone');
});
