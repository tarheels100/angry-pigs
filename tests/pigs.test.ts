import assert from 'node:assert/strict';
import test from 'node:test';

import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { PIG_TYPES, isPigTypeId, pigType, shotVelocities } from '../src/game/pigs.ts';
import { loadLevel, levelAt, type LevelDef } from '../src/levels/index.ts';

const DT = 1 / 60;
/** Stage 01 is the measured baseline (docs/tuning.md): a flat full pull reaches its
 * columns, so pig-type behaviour can be compared against a known shot. */
const BASE = levelAt(0);

function stageWithAmmo(ammo: string[]): LevelDef {
  return { ...BASE, cannon: { ...BASE.cannon, ammo } };
}

function makeGame(ammo: string[]) {
  const loaded = loadLevel(stageWithAmmo(ammo));
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const bus = createEventBus();
  const game = createGame({ level: loaded, adapter, bus });
  return { game, adapter, bus, loaded };
}

/** Flat full-power shot: the measured column-shattering aim (docs/tuning.md). */
function fireFlat(game: ReturnType<typeof createGame>): void {
  game.beginAim();
  game.dragAim({ x: game.cannon.config().origin.x - 90, y: game.cannon.config().origin.y });
  assert.ok(game.releaseAim(), 'a full flat drag fires');
}

function run(game: ReturnType<typeof createGame>, steps: number): void {
  for (let i = 0; i < steps; i++) game.step(DT);
}

/** Register an impact tracker; call it to read the peak energy recorded so far. */
function peakEnergy(bus: ReturnType<typeof createEventBus>): () => number {
  let peak = 0;
  bus.on('impact', (e) => {
    peak = Math.max(peak, e.energy);
  });
  return () => peak;
}

/** Register a destruction tracker; call it to read how many entities died. */
function destroyedCount(bus: ReturnType<typeof createEventBus>): () => number {
  let n = 0;
  bus.on('destroyed', () => {
    n++;
  });
  return () => n;
}

test('pig type registry covers the four types and the `pig` alias', () => {
  const ids = Object.keys(PIG_TYPES).sort();
  assert.deepEqual(ids, ['basic', 'bomb', 'cluster', 'heavy']);

  assert.equal(pigType('pig').id, 'basic', 'a level may write the legacy "pig" id');
  assert.ok(isPigTypeId('pig') && isPigTypeId('bomb'), 'alias and types validate');
  assert.ok(!isPigTypeId('rocket'), 'an unknown id does not validate');
  assert.throws(() => pigType('rocket'), /unknown pig type/);

  // Physical ordering: heavy is biggest and densest, cluster is smallest and many.
  assert.ok(PIG_TYPES.heavy.radius > PIG_TYPES.basic.radius, 'heavy reads bigger');
  assert.ok(PIG_TYPES.heavy.massScale > PIG_TYPES.basic.massScale, 'heavy carries more momentum');
  assert.ok(PIG_TYPES.heavy.damageMultiplier > PIG_TYPES.basic.damageMultiplier, 'heavy hits harder');
  assert.equal(PIG_TYPES.cluster.count, 3, 'cluster fires three pigs');
  assert.ok(PIG_TYPES.cluster.radius < PIG_TYPES.basic.radius, 'cluster pigs are smaller');
  assert.ok(PIG_TYPES.bomb.explosion, 'bomb carries a blast recipe');
  assert.ok(PIG_TYPES.bomb.explosion!.threshold > 0, 'a graze does not detonate a bomb');
});

test('shot velocities fan a cluster deterministically and keep speed', () => {
  const base = { x: 20, y: -4 };
  const basic = shotVelocities(PIG_TYPES.basic, base);
  assert.equal(basic.length, 1);
  assert.ok(Math.abs(basic[0]!.x - base.x) < 1e-9 && Math.abs(basic[0]!.y - base.y) < 1e-9, 'a basic pig goes where it was aimed');

  const cluster = shotVelocities(PIG_TYPES.cluster, base);
  assert.equal(cluster.length, 3);
  assert.deepEqual(cluster, shotVelocities(PIG_TYPES.cluster, base), 'the spread is deterministic');
  for (const v of cluster) {
    assert.ok(Math.abs(Math.hypot(v.x, v.y) - Math.hypot(base.x, base.y)) < 1e-9, 'spread keeps speed');
  }
  const angles = cluster.map((v) => Math.atan2(v.y, v.x));
  assert.ok(angles[0]! < angles[1]! && angles[1]! < angles[2]!, 'the pigs fan out in order');
  assert.ok(Math.abs(angles[1]! - angles[0]!) < 0.1, 'the fan stays inside the launch cone');
});

test('a cluster shot spends one ammo slot and spawns three pigs', () => {
  const { game, adapter } = makeGame(['cluster', 'basic']);
  const before = adapter.snapshot().filter((s) => s.kind === 'pig').length;
  fireFlat(game);

  const pigs = adapter.snapshot().filter((s) => s.kind === 'pig');
  assert.equal(pigs.length - before, 3, 'three pigs leave the launcher');
  assert.equal(game.rules.snapshot().ammoLeft, 1, 'one ammo slot, one shot');
  assert.equal(game.rules.snapshot().launches, 1, 'one shot counted for stars');

  // Spread pigs are staggered so they never spawn on top of each other.
  for (let i = 1; i < pigs.length; i++) {
    assert.ok(Math.abs(pigs[i]!.x - pigs[i - 1]!.x) > 10, `pigs ${i - 1} and ${i} are staggered`);
  }
  // Each pig carries the cluster hint so themes draw three small pigs.
  assert.ok(pigs.every((p) => game.entities.get(p.id)?.variant === 'cluster'), 'every pig carries its type hint');
});

test('a bomb detonates on a solid hit and clears what it lands on', () => {
  const bomb = makeGame(['bomb']);
  // Trackers are registered before the shot, so they observe the round.
  const explosions: Array<{ x: number; y: number; radius: number }> = [];
  bomb.bus.on('explosion', (e) => explosions.push(e));
  const consumed: Array<{ id: string; reason: string }> = [];
  bomb.bus.on('pigConsumed', (e) => consumed.push({ id: e.id, reason: e.reason }));
  const died = destroyedCount(bomb.bus);

  fireFlat(bomb.game);
  // From the plinth height the flat pig lands short and rolls into the tower, so the
  // detonation is later than the old mid-air launcher measured.
  run(bomb.game, 240);

  assert.equal(explosions.length, 1, 'the blast fired once');
  assert.ok(explosions[0]!.radius > 0, 'the event carries the blast radius');
  assert.ok(consumed.some((c) => c.reason === 'exploded'), 'the bomb pig is consumed by the blast');

  // The blast itself did the work: structure that existed at load is gone, and birds
  // fell with it. Outcome counts are physics, so they are measured, not asserted equal.
  const blocksAtLoad = BASE.objects!.filter((o) => o.type === 'block').length;
  const blocksLeft = bomb.adapter.snapshot().filter((s) => s.kind === 'block').length;
  assert.ok(blocksAtLoad - blocksLeft > 0, `the blast removed ${blocksAtLoad - blocksLeft} blocks`);
  assert.ok(died() > 0, 'entities died in the blast');
  assert.ok(bomb.game.rules.snapshot().targetsAlive < BASE.targets!.length, 'a bird went with the structure');
});

test('a bomb that lands on the ground does not detonate', () => {
  const { game, bus, adapter } = makeGame(['bomb']);
  const explosions: unknown[] = [];
  bus.on('explosion', (e) => explosions.push(e));

  // A barely-aimed shot: pull just over the drag minimum, so it lands short on the floor.
  game.beginAim();
  game.dragAim({ x: game.cannon.config().origin.x - 14, y: game.cannon.config().origin.y });
  game.releaseAim();
  run(game, 200);

  assert.equal(explosions.length, 0, 'landing on the ground is not a detonation');
  assert.ok(adapter.snapshot().some((s) => s.kind === 'block'), 'the stage is untouched');
  assert.equal(game.rules.snapshot().targetsAlive, BASE.targets!.length, 'no birds died');
});

test('a heavy pig does more damage than a basic one from the same shot', () => {
  // Trackers must be registered before the shot, or they see nothing.
  const basic = makeGame(['basic']);
  const basicPeak = peakEnergy(basic.bus);
  const heavy = makeGame(['heavy']);
  const heavyPeak = peakEnergy(heavy.bus);

  fireFlat(basic.game);
  run(basic.game, 120);
  fireFlat(heavy.game);
  run(heavy.game, 120);

  // Measured on the impact itself: the heavy pig arrives with more momentum, which is
  // exactly what the damage model charges for (docs/physics.md gotcha 6).
  assert.ok(basicPeak() > 0, 'the basic shot landed an impact');
  assert.ok(
    heavyPeak() > basicPeak(),
    `heavy impact ${heavyPeak().toFixed(1)} should exceed basic impact ${basicPeak().toFixed(1)}`,
  );
});

test('a level with an unknown pig type is rejected at load', () => {
  assert.throws(() => makeGame(['rocket']), /unknown pig type: rocket/);
});
