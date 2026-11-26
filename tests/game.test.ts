import assert from 'node:assert/strict';
import test from 'node:test';

import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { createCannon, MAX_LAUNCH_ANGLE } from '../src/game/cannon.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';
import type { LevelDef } from '../src/levels/index.ts';

const DT = 1 / 60;
const level = loadLevel(levelAt(0));

function makeGame(def: LevelDef = levelAt(0)) {
  const loaded = loadLevel(def);
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const bus = createEventBus();
  const game = createGame({ level: loaded, adapter, bus });
  return { game, adapter, bus, loaded };
}

/** Pull in the direction `deg` (degrees, +y downward) at full strength. */
function pullFor(loaded: ReturnType<typeof loadLevel>, deg: number) {
  const a = (deg * Math.PI) / 180;
  return {
    x: loaded.cannonOrigin.x - loaded.maxPull * Math.cos(a),
    y: loaded.cannonOrigin.y - loaded.maxPull * Math.sin(a),
  };
}

function settle(game: ReturnType<typeof createGame>, maxSteps = 320): number {
  let steps = 0;
  while (steps < maxSteps) {
    const phase = game.rules.snapshot().phase;
    if (phase === 'aiming' || phase === 'won' || phase === 'lost') return steps;
    game.step(DT);
    steps++;
  }
  throw new Error(`world never settled within ${maxSteps} steps`);
}

test('cannon clamps pull length and launch angle', () => {
  const cannon = createCannon({ origin: { x: 100, y: 400 }, maxPull: 90, powerScale: 0.22, ammo: ['basic'] });
  // Drag far past the cap: pull is clamped, speed is capped.
  const far = cannon.setAim({ x: 100 - 500, y: 400 })!;
  assert.equal(Math.hypot(far.pull.x, far.pull.y), 90);
  assert.equal(far.speed, 90 * 0.22);

  // Straight up is clamped to the +75° limit (docs/adr.md D12).
  const up = cannon.setAim({ x: 100 + 80, y: 400 + 80 })!;
  assert.ok(Math.abs(Math.atan2(up.direction.y, up.direction.x)) <= MAX_LAUNCH_ANGLE + 1e-9);
  assert.ok(up.direction.x > 0, 'launch always goes to the right');

  // Backwards drag becomes a forward launch, clamped to the cone.
  const back = cannon.setAim({ x: 100 - 80, y: 400 })!;
  assert.ok(back.direction.x > 0);
});

test('cannon consumes ammo and refuses to aim when empty', () => {
  const cannon = createCannon({ origin: { x: 0, y: 0 }, maxPull: 90, powerScale: 0.22, ammo: ['basic', 'heavy'] });
  assert.equal(cannon.ammoLeft(), 2);
  assert.ok(cannon.setAim({ x: -40, y: -40 }));
  assert.equal(cannon.consumeAmmo(), 'basic');
  assert.equal(cannon.ammoLeft(), 1);
  assert.equal(cannon.nextAmmo(), 'heavy');
  cannon.consumeAmmo();
  assert.equal(cannon.ammoLeft(), 0);
  assert.equal(cannon.setAim({ x: -40, y: -40 }), null);
  assert.equal(cannon.launchVelocity(), null);
});

test('loader validates named fields and merges targets', () => {
  const def = levelAt(0);
  assert.throws(() => loadLevel({ ...def, cannon: { ...def.cannon, ammo: [] } }), /cannon\.ammo/);
  assert.throws(() => loadLevel({ ...def, targets: [] }), /targets/);
  assert.throws(() => loadLevel({ ...def, statics: [{ type: 'ground', x: 2000, y: 860, w: 1600, h: 40 }] }), /static-0.*outside bounds/);
  assert.throws(
    () => loadLevel({ ...def, objects: [{ type: 'block', material: 'glass', x: 400, y: 400, w: 40 }] }),
    /objects\[[^\]]+\]\.h/,
  );

  const loaded = loadLevel(def);
  assert.equal(loaded.targetIds.length, 2);
  assert.deepEqual(loaded.targetIds, ['bird-1', 'bird-2']);
  assert.ok(loaded.bodies.some((b) => b.kind === 'ground' && b.isStatic));
  assert.ok(loaded.bodies.every((b) => b.kind !== 'bird' || b.material === 'feather'));
});

test('a flat shot topples the tower and crushes the bird on it', () => {
  const { game, adapter, bus } = makeGame();
  const events: string[] = [];
  bus.on('pigConsumed', (p) => events.push(`pig:${p.reason}`));
  bus.on('destroyed', (d) => events.push(`destroyed:${d.id}`));
  bus.on('phaseChanged', (p) => events.push(`phase:${p.phase}`));

  game.beginAim(pullFor(level, 0));
  assert.ok(game.frame().trajectory.length > 0, 'aiming produces a trajectory preview');
  assert.ok(game.releaseAim());
  assert.equal(game.rules.snapshot().phase, 'in_flight');

  const steps = settle(game);
  assert.ok(steps < 320);
  assert.equal(game.rules.snapshot().phase, 'aiming', 'targets remain, so the player aims again');
  assert.equal(game.rules.snapshot().ammoLeft, 3);
  assert.ok(events.includes('phase:in_flight') && events.includes('phase:settling'));
  assert.ok(events.some((e) => e.startsWith('pig:')), 'pig was consumed (D15)');
  assert.equal(adapter.snapshot().filter((e) => e.kind === 'pig').length, 0, 'no live pigs after settling');
  assert.ok(adapter.state('bird-2')!.destroyed, 'beam bird died in the collapse');
  assert.ok(events.some((e) => e.startsWith('destroyed:block-')), 'glass blocks shattered');
});

test('a downward shot kills the open bird and the level is won', () => {
  const { game, bus } = makeGame();
  const won: Array<{ score: number }> = [];
  bus.on('levelWon', (e) => won.push({ score: e.score }));

  game.beginAim(pullFor(level, 0));
  game.releaseAim();
  settle(game);

  game.beginAim(pullFor(level, 16));
  game.releaseAim();
  settle(game);

  assert.equal(game.rules.snapshot().phase, 'won');
  assert.equal(game.rules.snapshot().targetsAlive, 0);
  assert.equal(game.rules.snapshot().score, 2000);
  assert.equal(won.length, 1);
});

test('running out of pigs with birds standing loses the level', () => {
  const { game } = makeGame();
  // Aim steeply upward so nothing is hit.
  for (let i = 0; i < 4; i++) {
    game.beginAim(pullFor(level, -70));
    game.releaseAim();
    settle(game);
  }
  assert.equal(game.rules.snapshot().ammoLeft, 0);
  assert.ok(game.rules.snapshot().targetsAlive > 0);
  assert.equal(game.rules.snapshot().phase, 'lost');
});

test('restart rebuilds the level and re-arms the cannon', () => {
  const { game, adapter } = makeGame();
  game.beginAim(pullFor(level, 0));
  game.releaseAim();
  settle(game);
  assert.equal(game.rules.snapshot().ammoLeft, 3);

  game.restart();
  const snap = game.rules.snapshot();
  assert.equal(snap.ammoLeft, 4);
  assert.equal(snap.targetsAlive, 2);
  assert.equal(snap.phase, 'aiming');
  assert.equal(snap.score, 0);
  assert.ok(adapter.snapshot().every((e) => !e.destroyed));
  assert.equal(adapter.snapshot().filter((e) => e.kind === 'pig').length, 0);
});

test('cancelling a drag clears the preview and fires nothing', () => {
  const { game } = makeGame();
  game.beginAim(pullFor(level, 0));
  game.cancelAim();
  assert.equal(game.frame().aim, null);
  assert.equal(game.frame().trajectory.length, 0);
  assert.equal(game.releaseAim(), false);
  assert.equal(game.rules.snapshot().launches, 0);
});

test('aiming is ignored outside the aiming phase', () => {
  const { game } = makeGame();
  game.beginAim(pullFor(level, 0));
  game.releaseAim();
  game.step(DT);
  assert.equal(game.rules.snapshot().phase, 'in_flight');
  game.beginAim(pullFor(level, 16));
  assert.equal(game.cannon.aim(), null, 'no aiming mid-flight');
});
