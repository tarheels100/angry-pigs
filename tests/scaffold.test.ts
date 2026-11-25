import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MATERIALS, healthFor, materialSpec } from '../src/physics/materials.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createLoop } from '../src/core/loop.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createMatterAdapter } from '../src/physics/matterAdapter.ts';
import { createRenderer } from '../src/render/renderer.ts';
import { createGameRules } from '../src/game/rules.ts';

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

test('unimplemented stubs report their milestone', () => {
  assert.throws(() => createEventBus(), /M5/);
  assert.throws(() => createLoop({ step: () => {}, render: () => {} }), /M5/);
  assert.throws(() => createPhysicsAdapter({ width: 1600, height: 900, gravityY: 1, airFriction: 0.001 }), /M4/);
  assert.throws(() => createMatterAdapter({ width: 1600, height: 900, gravityY: 1, airFriction: 0.001 }), /M4/);
  assert.throws(() => createRenderer({} as HTMLCanvasElement), /M6/);
  assert.throws(() => createGameRules(), /M8/);
});
