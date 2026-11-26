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

/** Press then drag; the shot is only decided on release (src/input/pointer.ts). */
function aim(game: ReturnType<typeof createGame>, deg: number): void {
  game.beginAim();
  game.dragAim(pullFor(level, deg));
}

function settle(game: ReturnType<typeof createGame>, maxSteps = 600): number {
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

  aim(game, 0);
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

  aim(game, 0);
  game.releaseAim();
  settle(game);

  aim(game, 16);
  game.releaseAim();
  settle(game);

  assert.equal(game.rules.snapshot().phase, 'won');
  assert.equal(game.rules.snapshot().targetsAlive, 0);
  // Two birds (2000) plus the two pigs left in the budget (2 × 500) — D23.
  assert.equal(game.rules.snapshot().score, 3000);
  assert.equal(won.length, 1);
});

test('a clear pays a bonus for unused pigs', () => {
  const { game } = makeGame();
  aim(game, 20); // one-shot clear: three of four pigs never fired
  game.releaseAim();
  settle(game);
  const snap = game.rules.snapshot();
  assert.equal(snap.phase, 'won');
  assert.equal(snap.launches, 1);
  assert.equal(snap.targetsTotal, 2);
  assert.equal(snap.stars, 3);
  assert.equal(snap.score, 2 * 1000 + snap.ammoLeft * 500, 'score pays targets plus the ammo bonus');
  assert.ok(snap.score > 2000, 'a one-shot clear scores above the target value alone');
});

test('running out of pigs with birds standing loses the level', () => {
  const { game } = makeGame();
  // Aim steeply upward so nothing is hit.
  for (let i = 0; i < 4; i++) {
    aim(game, -70);
    game.releaseAim();
    settle(game);
  }
  assert.equal(game.rules.snapshot().ammoLeft, 0);
  assert.ok(game.rules.snapshot().targetsAlive > 0);
  assert.equal(game.rules.snapshot().phase, 'lost');
});

test('restart rebuilds the level and re-arms the cannon', () => {
  const { game, adapter } = makeGame();
  aim(game, 0);
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
  aim(game, 0);
  game.cancelAim();
  assert.equal(game.frame().aim, null);
  assert.equal(game.frame().trajectory.length, 0);
  assert.equal(game.releaseAim(), false);
  assert.equal(game.rules.snapshot().launches, 0);
});

test('aiming is ignored outside the aiming phase', () => {
  const { game } = makeGame();
  aim(game, 0);
  game.releaseAim();
  game.step(DT);
  assert.equal(game.rules.snapshot().phase, 'in_flight');
  aim(game, 16);
  assert.equal(game.cannon.aim(), null, 'no aiming mid-flight');
});

test('the cannon and the waiting pig are visible before a launch', () => {
  const { game } = makeGame();
  assert.ok(game.entities.all().some((e) => e.kind === 'cannon'), 'the cannon is an entity while aiming');
  const waiting = game.entities.get('cannon-pig');
  assert.ok(waiting && waiting.kind === 'pig' && !waiting.destroyed, 'the next pig rests on the cannon');
  assert.equal(game.entities.byKind('pig').length, 1, 'no physics pig exists before the launch');

  aim(game, 0);
  game.releaseAim();
  game.step(DT);

  assert.equal(game.entities.get('cannon-pig'), undefined, 'the waiting pig is gone once fired');
  assert.ok(game.entities.byKind('pig').some((e) => e.id === 'pig-1'), 'the launched pig is a physics body');
  assert.ok(game.entities.all().some((e) => e.kind === 'cannon'), 'the cannon stays visible');
});

test('a press alone is not a shot and does not spend ammo', () => {
  const { game } = makeGame();
  game.beginAim();
  assert.equal(game.releaseAim(), false, 'press + release without a drag fires nothing');
  assert.equal(game.rules.snapshot().ammoLeft, 4, 'a click does not spend ammo');
  assert.equal(game.rules.snapshot().launches, 0);

  // Press somewhere far from the cannon: still no pull until a drag.
  game.beginAim();
  assert.equal(game.cannon.aim(), null, 'the press position alone does not set a pull');
  assert.equal(game.frame().trajectory.length, 0, 'no preview before a drag');
  game.cancelAim();
});

test('the shot uses the final drag position, not the press position', () => {
  const { game, bus } = makeGame();
  const launched: Array<{ velocity: { x: number; y: number } }> = [];
  bus.on('launch', (e) => launched.push({ velocity: e.velocity }));

  game.beginAim(); // press high-right, unrelated to the shot
  game.dragAim(pullFor(level, 0)); // drag flat-left
  assert.ok(game.cannon.aim(), 'dragging sets the pull');
  assert.ok(game.frame().trajectory.length > 0, 'the preview follows the drag');
  assert.ok(game.releaseAim());

  assert.equal(launched.length, 1);
  const shot = launched[0]!;
  assert.ok(shot.velocity.x > 15, `flat shot leaves a leftward pull (${shot.velocity.x.toFixed(1)})`);
  assert.ok(Math.abs(shot.velocity.y) < 1.5, 'the press position is not part of the launch');
});

test('a restart restores drag-to-aim behaviour', () => {
  const { game } = makeGame();
  aim(game, 0);
  game.releaseAim();
  settle(game);

  game.restart();
  game.beginAim();
  game.dragAim(pullFor(level, 12));
  assert.ok(game.cannon.aim(), 'dragging aims again after a restart');
  assert.ok(game.frame().trajectory.length > 0, 'the preview is rebuilt after a restart');
  assert.ok(game.releaseAim(), 'the shot fires after a restart');
  assert.equal(game.rules.snapshot().launches, 1);
  assert.ok(game.entities.get('pig-1'), 'a pig exists after the restarted shot');
});

test('a drag re-opens the gesture when restart or loadLevel closed it', () => {
  const { game } = makeGame();
  game.beginAim();
  game.dragAim(pullFor(level, 0));
  game.restart();
  assert.equal(game.releaseAim(), false, 'restart does not fire the interrupted drag');

  // The pointer is still held, so the next move aims again.
  game.dragAim(pullFor(level, 12));
  assert.ok(game.cannon.aim(), 'dragging aims after an interrupted gesture');
  assert.ok(game.releaseAim());
  assert.equal(game.rules.snapshot().launches, 1);

  game.beginAim();
  game.dragAim(pullFor(level, 0));
  game.loadLevel(loadLevel(levelAt(0)));
  assert.equal(game.releaseAim(), false, 'loadLevel does not fire the interrupted drag');
  game.dragAim(pullFor(level, 20));
  assert.ok(game.releaseAim(), 'dragging aims after loadLevel');
});

test('stars are derived from shots used, not invented (D19)', () => {
  const { game } = makeGame();
  assert.equal(game.rules.snapshot().targetsTotal, 2);

  aim(game, 20);
  game.releaseAim();
  settle(game);
  assert.equal(game.rules.snapshot().phase, 'won');
  assert.equal(game.rules.snapshot().launches, 1);
  assert.equal(game.rules.snapshot().stars, 3, 'a one-shot clear earns three stars');

  const slow = makeGame();
  aim(slow.game, 0);
  slow.game.releaseAim();
  settle(slow.game);
  aim(slow.game, 16);
  slow.game.releaseAim();
  settle(slow.game);
  assert.equal(slow.game.rules.snapshot().stars, 2, 'two shots on two targets earns two stars');

  const many = makeGame();
  for (let i = 0; i < 4; i++) {
    aim(many.game, -70);
    many.game.releaseAim();
    settle(many.game);
  }
  assert.equal(many.game.rules.snapshot().phase, 'lost');
  assert.equal(many.game.rules.snapshot().stars, 0, 'a lost level has no stars');
});

test('a destroyed entity flashes briefly, then is gone', () => {
  const { game } = makeGame();
  aim(game, 0);
  game.releaseAim();

  let flashed: string[] = [];
  for (let i = 0; i < 200; i++) {
    game.step(DT);
    flashed = game.entities.all().filter((e) => e.destroyed).map((e) => e.id);
    if (flashed.length > 0) break;
  }
  assert.ok(flashed.length > 0, 'something must die in a flat shot');
  const fade = game.entities.all().find((e) => e.destroyed)!.fade!;
  assert.ok(fade > 0 && fade <= 1, 'the flash is fading, not permanent');

  // Flash lifetime expires; corpses never linger as white silhouettes.
  for (let i = 0; i < 12; i++) game.step(DT);
  assert.equal(game.entities.all().some((e) => e.destroyed), false, 'corpses drop out after FLASH_STEPS');
});

test('a block survives a single hit with visible partial damage', () => {
  const { game, adapter } = makeGame();
  // A shot that actually reaches the tower (stage-01 tower sits at x=1040..1150).
  aim(game, 15);
  game.releaseAim();
  settle(game);

  const damaged = adapter.snapshot().filter((e) => e.kind === 'block' && e.healthMax !== undefined && e.health < e.healthMax);
  assert.ok(damaged.length > 0, 'impact must leave partially damaged blocks, not binary destruction');
  for (const d of damaged) assert.ok(d.health > 0, 'a damaged block still has health');
});

test('a settled round is asleep, whether it slept or hit the timeout', () => {
  const { game, adapter } = makeGame();
  aim(game, 0);
  game.releaseAim();
  settle(game);
  assert.equal(adapter.allSleeping(), true, 'settled must mean at rest (D16)');
});

test('switching levels reports the new bounds so the camera can re-frame (D20)', () => {
  const loaded = loadLevel(levelAt(0));
  const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const bus = createEventBus();
  const game = createGame({ level: loaded, adapter, bus });
  const seen: Array<{ levelId: string; bounds: { width: number; height: number } }> = [];
  bus.on('levelLoaded', (e) => seen.push({ levelId: e.levelId, bounds: e.bounds }));

  game.loadLevel(loadLevel(levelAt(2)));
  assert.equal(seen.length, 1, 'one load event per load');
  assert.equal(seen[0]!.levelId, 'stage-03');
  assert.deepEqual(seen[0]!.bounds, { width: 1600, height: 900 });
  assert.equal(game.rules.snapshot().targetsTotal, 2, 'the new level owns the target count');
  assert.equal(game.rules.snapshot().ammoLeft, 5, 'the new level owns the ammo count');
});

test('bird deaths are attributed to the pig or to the collapse', () => {
  const { game, bus, loaded } = makeGame();
  const deaths: Array<{ id: string; cause: string }> = [];
  bus.on('destroyed', (e) => deaths.push({ id: e.id, cause: e.cause }));

  aim(game, 20); // clears both birds: one by direct hit, one by the collapse
  game.releaseAim();
  settle(game);
  assert.equal(game.rules.snapshot().phase, 'won');

  const birdDeaths = deaths.filter((d) => d.id.startsWith('bird'));
  assert.equal(birdDeaths.length, 2, 'both birds died');
  assert.ok(birdDeaths.some((d) => d.cause === 'impact'), 'a direct pig hit is attributed to the pig');
  assert.ok(birdDeaths.some((d) => d.cause !== 'impact'), 'the collapse kill is attributed to debris or the ground');
  for (const d of birdDeaths) assert.ok(['impact', 'crush', 'fall'].includes(d.cause), `${d.cause} is a valid cause`);
  void loaded;
});

test('a level is settled and undamaged before the player gets control', () => {
  // M14: authored stacks used to fall a little on the first drawn frame, and that
  // settling chipped health, so levels started partly damaged. Warmup simulates the
  // world with damage suppressed.
  const { game, adapter } = makeGame();
  const bodies = adapter.snapshot().filter((e) => e.kind === 'block' || e.kind === 'bird');
  assert.ok(bodies.length > 0);
  for (const b of bodies) {
    assert.ok(b.healthMax === undefined || b.health === b.healthMax, `${b.id} must start at full health`);
    const speed = Math.hypot(b.vx, b.vy);
    assert.ok(speed < 1.5, `${b.id} must be resting, not falling (speed ${speed.toFixed(2)})`);
  }
  void game;
});

test('a pig can be fired while debris is still settling', () => {
  // D26: rules used to accept a launch only from 'aiming', so the second shot of a
  // round was silently swallowed until the settle timeout expired.
  const { game } = makeGame();
  aim(game, -70); // steep shot that hits nothing, so the round cannot be won
  assert.equal(game.releaseAim(), true);

  let steps = 0;
  while (game.rules.snapshot().phase !== 'settling' && steps < 500) {
    game.step(DT);
    steps++;
  }
  assert.equal(game.rules.snapshot().phase, 'settling', 'the round must reach settling');

  game.beginAim();
  game.dragAim(pullFor(level, 0));
  assert.equal(game.releaseAim(), true, 'a shot during settling must fire');
  const snap = game.rules.snapshot();
  assert.equal(snap.launches, 2, 'the second shot is counted');
  assert.equal(snap.ammoLeft, 2, 'the second shot costs ammo');
  assert.equal(snap.phase, 'in_flight');
});
