import assert from 'node:assert/strict';
import test from 'node:test';

import { createEntityRegistry } from '../src/core/entities.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createGame } from '../src/game/game.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';

function makeRegistry() {
  const adapter = createPhysicsAdapter({ width: 1600, height: 900, gravityY: 1, frictionAir: 0.001 });
  adapter.addBody({ id: 'block-1', kind: 'block', shape: 'box', material: 'glass', x: 400, y: 300, halfWidth: 20, halfHeight: 20 });
  return { adapter, registry: createEntityRegistry(adapter) };
}

const extra = (id: string) => ({
  id, kind: 'cannon' as const, shape: 'box' as const, material: 'metal' as const,
  x: 0, y: 0, angle: 0, vx: 0, vy: 0, sleeping: true, destroyed: false,
  health: Infinity, impactEnergy: 0, halfWidth: 10, halfHeight: 10,
});

test('a display extra cannot shadow a live physics entity', () => {
  const { registry } = makeRegistry();
  assert.throws(() => registry.setExtras([extra('block-1')]), /collides with a physics entity id/);
  registry.setExtras([extra('cannon')]);
  assert.equal(registry.all().length, 2, 'a non-colliding extra is accepted');
});

test('duplicate display extras are rejected', () => {
  const { registry } = makeRegistry();
  assert.throws(() => registry.setExtras([extra('cannon'), extra('cannon')]), /duplicated/);
});

test("the game's own extras never collide with physics ids", () => {
  const loaded = loadLevel(levelAt(0));
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });

  // Aiming adds cannon + cannon-pig while every level body is live.
  game.beginAim();
  game.dragAim({ x: loaded.cannonOrigin.x - 60, y: loaded.cannonOrigin.y });
  assert.ok(game.entities.get('cannon'), 'cannon extra exists');
  assert.ok(game.entities.get('cannon-pig'), 'waiting pig extra exists');

  // During flight the launched pig is a live body, and the waiting-pig extra is gone
  // (phase is no longer aiming), so the two namespaces stay disjoint.
  game.releaseAim();
  game.step(1 / 60);
  assert.ok(game.entities.get('pig-1'), 'the launched pig is a physics entity');
  assert.ok(game.entities.get('cannon'), 'the cannon extra survives the launch');
  assert.equal(game.entities.byKind('pig').length, 1, 'only the live pig during flight');
});
