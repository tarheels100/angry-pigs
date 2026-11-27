import assert from 'node:assert/strict';
import test from 'node:test';

import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { createCannon, MAX_LAUNCH_ANGLE } from '../src/game/cannon.ts';
import { loadLevel, levelAt } from '../src/levels/index.ts';
import type { LevelDef } from '../src/levels/index.ts';
import type { PhysicsAdapter } from '../src/physics/adapter.ts';
import type { EntityState } from '../src/core/types.ts';

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

/** Press then drag on stage-01's cannon; the shot is only decided on release (src/input/pointer.ts). */
function aim(game: ReturnType<typeof createGame>, deg: number, pull = 90): void {
  game.beginAim();
  game.dragAim({
    x: level.cannonOrigin.x - pull * Math.cos((deg * Math.PI) / 180),
    y: level.cannonOrigin.y - pull * Math.sin((deg * Math.PI) / 180),
  });
}

function settle(game: ReturnType<typeof createGame>, maxSteps = 900): number {
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
  assert.throws(() => loadLevel({ ...def, statics: [{ type: 'ground', x: 2600, y: 860, w: 2200, h: 40 }] }), /static-0.*outside bounds/);
  assert.throws(
    () => loadLevel({ ...def, objects: [{ type: 'block', material: 'glass', x: 400, y: 400, w: 40 }] }),
    /objects\[[^\]]+\]\.h/,
  );

  const loaded = loadLevel(def);
  assert.ok(loaded.targetIds.length >= 3, 'stage-01 hides at least three birds (M21 scale)');
  assert.deepEqual(loaded.targetIds, ['bird-1', 'bird-2', 'bird-3']);
  assert.ok(loaded.bodies.some((b) => b.kind === 'ground' && b.isStatic));
  assert.ok(loaded.bodies.every((b) => b.kind !== 'bird' || b.material === 'feather'));
});

test('the first shot brings down two shelters and leaves the third standing', () => {
  const { game, adapter, bus } = makeGame();
  const events: string[] = [];
  bus.on('pigConsumed', (p) => events.push(`pig:${p.reason}`));
  bus.on('destroyed', (d) => events.push(`destroyed:${d.id}`));
  bus.on('phaseChanged', (p) => events.push(`phase:${p.phase}`));

  aim(game, -20); // measured winning opener (docs/tuning.md): arcs over the glass gate onto shelter 1's roof
  assert.ok(game.frame().trajectory.length > 0, 'aiming produces a trajectory preview');
  assert.ok(game.releaseAim());
  assert.equal(game.rules.snapshot().phase, 'in_flight');

  const steps = settle(game);
  assert.ok(steps < 900, 'a wider world (M21) still settles inside the step budget');
  assert.equal(game.rules.snapshot().phase, 'aiming', 'targets remain, so the player aims again');
  assert.equal(game.rules.snapshot().ammoLeft, 3);
  assert.ok(events.includes('phase:in_flight') && events.includes('phase:settling'));
  assert.ok(events.some((e) => e.startsWith('pig:')), 'pig was consumed (D15)');
  assert.equal(adapter.snapshot().filter((e) => e.kind === 'pig').length, 0, 'no live pigs after settling');
  assert.ok(adapter.state('bird-1')!.destroyed, 'the shelter roof came down on the bird');
  assert.ok(adapter.state('bird-2')!.destroyed, 'the platform beam came down on its bird');
  assert.ok(!adapter.state('bird-3')!.destroyed, 'the far shelter survives');
  assert.ok(events.some((e) => e.startsWith('destroyed:block-')), 'blocks shattered');
});

test('the measured two-shot plan wins the stage', () => {
  const { game, bus } = makeGame();
  const won: Array<{ score: number }> = [];
  bus.on('levelWon', (e) => won.push({ score: e.score }));

  aim(game, -20); // two shelters down
  game.releaseAim();
  settle(game);

  aim(game, -20); // the same arc lands on the third shelter once the world is clear
  game.releaseAim();
  settle(game);

  assert.equal(game.rules.snapshot().phase, 'won');
  assert.equal(game.rules.snapshot().targetsAlive, 0);
  // Three birds (3000) plus the two pigs left in the budget (2 × 500) — D23.
  assert.equal(game.rules.snapshot().score, 4000);
  assert.equal(won.length, 1);
});

test('a clear pays a bonus for unused pigs', () => {
  const { game } = makeGame();
  aim(game, -20);
  game.releaseAim();
  settle(game);
  aim(game, -20);
  game.releaseAim();
  settle(game);
  const snap = game.rules.snapshot();
  assert.equal(snap.phase, 'won');
  assert.equal(snap.launches, 2);
  assert.equal(snap.targetsTotal, 3);
  assert.equal(snap.stars, 3, 'two pigs on three birds is the efficient line (D19)');
  assert.equal(snap.score, 3 * 1000 + snap.ammoLeft * 500, 'score pays targets plus the ammo bonus');
  assert.ok(snap.score > 3000, 'a clear scores above the target value alone');
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
  assert.equal(snap.targetsAlive, 3, 'the authored birds come back');
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
  assert.equal(game.rules.snapshot().targetsTotal, 3);

  aim(game, -20); // the measured efficient plan: two pigs take three shelters down
  game.releaseAim();
  settle(game);
  aim(game, -20);
  game.releaseAim();
  settle(game);
  assert.equal(game.rules.snapshot().phase, 'won');
  assert.equal(game.rules.snapshot().launches, 2);
  assert.equal(game.rules.snapshot().stars, 3, 'clearing within the one-shot budget earns three stars');

  const slow = makeGame();
  aim(slow.game, -70, 30); // short steep lobs that land near the launcher and break nothing (scratch/wasted-and-open.ts)
  slow.game.releaseAim();
  settle(slow.game);
  aim(slow.game, -60, 24);
  slow.game.releaseAim();
  settle(slow.game);
  aim(slow.game, -20);
  slow.game.releaseAim();
  settle(slow.game);
  aim(slow.game, -20);
  slow.game.releaseAim();
  settle(slow.game);
  assert.equal(slow.game.rules.snapshot().phase, 'won');
  assert.equal(slow.game.rules.snapshot().launches, 4, 'the two wasted shots cost two of the four pigs (scratch/wasted-and-open.ts)');
  assert.equal(slow.game.rules.snapshot().stars, 1, 'four pigs on three birds earns one star');

  const many = makeGame();
  for (let i = 0; i < 4; i++) {
    aim(many.game, -70, 24); // four wasted shots burn the whole ammo budget
    many.game.releaseAim();
    settle(many.game);
  }
  assert.equal(many.game.rules.snapshot().phase, 'lost');
  assert.equal(many.game.rules.snapshot().stars, 0, 'a lost level has no stars');
});

test('a destroyed entity flashes briefly, then is gone', () => {
  const { game } = makeGame();
  aim(game, -20); // the winning opener breaks shelter 1, so something dies
  game.releaseAim();

  let flashed: string[] = [];
  for (let i = 0; i < 200; i++) {
    game.step(DT);
    flashed = game.entities.all().filter((e) => e.destroyed).map((e) => e.id);
    if (flashed.length > 0) break;
  }
  assert.ok(flashed.length > 0, 'something must die in the winning opener');
  const fade = game.entities.all().find((e) => e.destroyed)!.fade!;
  assert.ok(fade > 0 && fade <= 1, 'the flash is fading, not permanent');

  // Flash lifetime expires; corpses never linger as white silhouettes.
  for (let i = 0; i < 12; i++) game.step(DT);
  assert.equal(game.entities.all().some((e) => e.destroyed), false, 'corpses drop out after FLASH_STEPS');
});

test('a block survives a single hit with visible partial damage', () => {
  const { game, adapter } = makeGame();
  // The winning opener lands on shelter 1's roof; the legs under it take hits but do not vanish.
  aim(game, -20);
  game.releaseAim();
  settle(game);

  const damaged = adapter.snapshot().filter((e) => e.kind === 'block' && e.healthMax !== undefined && e.health < e.healthMax);
  assert.ok(damaged.length > 0, 'impact must leave partially damaged blocks, not binary destruction');
  for (const d of damaged) assert.ok(d.health > 0, 'a damaged block still has health');
});

test('a settled round is asleep, whether it slept or hit the timeout', () => {
  const { game, adapter } = makeGame();
  aim(game, -20);
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
  assert.deepEqual(seen[0]!.bounds, { width: 2200, height: 900 }, 'M21 widened the world (docs/adr.md D37)');
  assert.equal(game.rules.snapshot().targetsTotal, 4, 'the new level owns the target count');
  assert.equal(game.rules.snapshot().ammoLeft, loadLevel(levelAt(2)).ammo.length, 'the new level owns the ammo count');
});

/** A bird standing in the open, so a pig can hit it directly. Not a shipped stage. */
const OPEN_BIRD_LEVEL: LevelDef = {
  name: 'open-bird',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['basic'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [],
  targets: [{ type: 'ball', material: 'feather', x: 520, y: 820, r: 20, target: true }],
};

test('bird deaths name their cause: collapse in a sheltered stage, impact in the open', () => {
  // Sheltered birds (level rule 1) die when structure comes down on them, so the shipped
  // stages report crush/fall. A direct pig hit is still attributed, on an open bird.
  const { game } = makeGame();
  const deaths: Array<{ id: string; cause: string }> = [];
  game.bus.on('destroyed', (e) => deaths.push({ id: e.id, cause: e.cause }));
  aim(game, -20);
  game.releaseAim();
  settle(game);
  aim(game, -20);
  game.releaseAim();
  settle(game);
  assert.equal(game.rules.snapshot().phase, 'won');

  const birdDeaths = deaths.filter((d) => d.id.startsWith('bird'));
  assert.equal(birdDeaths.length, 3, 'all three sheltered birds died');
  for (const d of birdDeaths) assert.ok(['impact', 'crush', 'fall'].includes(d.cause), `${d.cause} is a valid cause`);
  assert.ok(birdDeaths.some((d) => d.cause === 'crush' || d.cause === 'fall'), 'a sheltered bird dies to the collapse at least once');

  const open = makeGame(OPEN_BIRD_LEVEL);
  const openDeaths: Array<{ id: string; cause: string }> = [];
  open.game.bus.on('destroyed', (e) => openDeaths.push({ id: e.id, cause: e.cause }));
  open.game.beginAim();
  // A downward flat shot meets the bird on the ground (scratch/wasted-and-open.ts).
  open.game.dragAim({ x: open.loaded.cannonOrigin.x - 90 * Math.cos(Math.PI / 18), y: open.loaded.cannonOrigin.y - 90 * Math.sin(Math.PI / 18) });
  open.game.releaseAim();
  settle(open.game);
  assert.equal(open.game.rules.snapshot().phase, 'won');
  assert.equal(openDeaths.filter((d) => d.id.startsWith('bird')).length, 1);
  assert.equal(openDeaths[0]!.cause, 'impact', 'a direct pig hit is attributed to the pig');
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

/** Bodies with no supporting surface under them, using the rotated AABB. */
function floating(adapter: PhysicsAdapter, groundTop: number): string[] {
  const bodies = adapter.snapshot();
  const extent = (e: EntityState) => {
    const hw = e.halfWidth ?? e.radius ?? 12;
    const hh = e.halfHeight ?? e.radius ?? 12;
    return {
      w: Math.abs(Math.cos(e.angle)) * hw + Math.abs(Math.sin(e.angle)) * hh,
      h: Math.abs(Math.sin(e.angle)) * hw + Math.abs(Math.cos(e.angle)) * hh,
    };
  };
  const out: string[] = [];
  for (const b of bodies) {
    if (b.kind === 'ground' || b.kind === 'wall') continue;
    const bottom = b.y + extent(b).h;
    if (bottom >= groundTop - 14) continue;
    const supported = bodies.some((o) => {
      if (o.id === b.id) return false;
      const top = o.y - extent(o).h;
      const overlapX = extent(b).w + extent(o).w - Math.abs(o.x - b.x);
      return overlapX >= 4 && top >= bottom - 14 && top <= bottom + 14;
    });
    if (!supported) out.push(`${b.id} at y=${Math.round(b.y)}`);
  }
  return out;
}

const towerDef: LevelDef = {
  name: 'tower-test',
  bounds: { width: 1200, height: 900 },
  cannon: { x: 120, y: 480, maxPull: 90, powerScale: 0.22, ammo: ['heavy', 'heavy'] },
  statics: [{ type: 'ground', x: 600, y: 860, w: 1200, h: 40 }],
  objects: [
    { type: 'block', material: 'wood', x: 700, y: 780, w: 34, h: 120 },
    { type: 'block', material: 'wood', x: 780, y: 780, w: 34, h: 120 },
    { type: 'block', material: 'glass', x: 740, y: 708, w: 140, h: 24 },
    { type: 'block', material: 'glass', x: 712, y: 654, w: 26, h: 84 },
    { type: 'block', material: 'glass', x: 768, y: 654, w: 26, h: 84 },
    { type: 'block', material: 'wood', x: 740, y: 594, w: 140, h: 24 },
  ],
  targets: [{ type: 'ball', material: 'feather', x: 740, y: 570, r: 20, target: true }],
};

test('a resolved round comes to rest instead of freezing in the air', () => {
  // Playtest item 7, docs/adr.md D36: the settle timeout freezes bodies where they
  // were, and the game used to stop stepping once the round was decided, so debris
  // caught in flight hung in the air permanently.
  const { game, adapter, loaded } = makeGame(towerDef);
  game.beginAim();
  game.dragAim(pullFor(loaded, 12));
  assert.equal(game.releaseAim(), true);

  let steps = 0;
  while (steps < 600) {
    const phase = game.rules.snapshot().phase;
    if (phase === 'won' || phase === 'lost' || phase === 'aiming') break;
    game.step(DT);
    steps++;
  }
  const decided = game.rules.snapshot().phase;
  assert.ok(decided === 'won' || decided === 'lost' || decided === 'aiming', `round resolved as ${decided}`);

  // Stepping a decided round must finish the settling rather than leave a frozen scene.
  for (let i = 0; i < 300; i++) game.step(DT);
  assert.deepEqual(floating(adapter, loaded.groundTop), [], 'nothing may float after a round ends');
  assert.ok(adapter.allSleeping(), 'a round that ended must come to rest');
});
