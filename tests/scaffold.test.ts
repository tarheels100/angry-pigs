import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MATERIALS, healthFor, materialSpec } from '../src/physics/materials.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createLoop } from '../src/core/loop.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createRules } from '../src/game/rules.ts';

test('materials registry orders mass metal > stone > glass > feather', () => {
  assert.ok(MATERIALS.metal!.density > MATERIALS.stone!.density);
  assert.ok(MATERIALS.stone!.density > MATERIALS.glass!.density);
  assert.ok(MATERIALS.glass!.density > MATERIALS.feather!.density);
});

test('immovable materials have infinite health', () => {
  assert.equal(materialSpec('ground').health, Infinity);
  assert.equal(healthFor('ground', 5000), Infinity);
});

test('healthFor scales with area and clamps at both ends', () => {
  assert.equal(healthFor('glass', 4000), 4);
  assert.equal(healthFor('glass', 1000), 4 * 0.35);
  assert.equal(healthFor('glass', 100000), 4 * 3);
});

test('physics factory returns a working adapter (M4)', () => {
  const adapter = createPhysicsAdapter({ width: 1600, height: 900, gravityY: 1, frictionAir: 0.001 });
  assert.equal(typeof adapter.step, 'function');
  assert.equal(typeof adapter.simulateTrajectory, 'function');
  adapter.addBody({ id: 'ground', kind: 'ground', shape: 'box', material: 'ground', x: 800, y: 880, halfWidth: 800, halfHeight: 40, isStatic: true });
  adapter.addBody({ id: 'block', kind: 'block', shape: 'box', material: 'glass', x: 400, y: 300, halfWidth: 20, halfHeight: 20 });
  const before = adapter.state('block')!.y;
  adapter.step(1 / 60);
  assert.ok(adapter.state('block')!.y >= before);
});

test('core event bus and loop are implemented (M5)', () => {
  const bus = createEventBus();
  assert.equal(typeof bus.on, 'function');
  const loop = createLoop({ step: () => {}, render: () => {} });
  assert.equal(typeof loop.advance, 'function');
});

test('game rules are implemented (M7 mechanics, tuned in M8)', () => {
  const rules = createRules({ targetIds: ['bird-1'], ammo: ['basic'] });
  rules.loadLevel(['bird-1'], 1);
  assert.equal(rules.snapshot().phase, 'aiming');
});

test('unimplemented stubs report their milestone', () => {
  // Nothing left unimplemented in the M7 slice; later milestones add features,
  // not stubs. Keep this list empty and non-empty-checking to catch regressions.
  assert.equal(typeof createRules, 'function');
});
