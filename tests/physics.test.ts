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
