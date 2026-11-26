import assert from 'node:assert/strict';
import test from 'node:test';

import { LEVELS, WORLD, loadLevel, levelAt, validateLevel, type LevelDef } from '../src/levels/index.ts';
import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';

test('every bundled level loads and validates', () => {
  assert.ok(LEVELS.length >= 3, 'the roadmap wants at least three stages');
  for (const def of LEVELS) {
    const loaded = loadLevel(def);
    assert.ok(loaded.targetIds.length > 0, `${def.name} has targets`);
    assert.ok(loaded.ammo.length > 0, `${def.name} has ammo`);
    assert.ok(loaded.bodies.some((b) => b.kind === 'bird'), `${def.name} has bird bodies`);
    assert.ok(
      loaded.bodies.every((b) => b.x > 0 && b.x < def.bounds.width && b.y > 0 && b.y < def.bounds.height),
      `${def.name} bodies sit inside bounds`,
    );
  }
  const names = LEVELS.map((d) => d.name);
  assert.equal(new Set(names).size, names.length, 'stage names are unique');
});

test('bounds larger than the world are rejected (D13)', () => {
  const def: LevelDef = {
    name: 'too-wide',
    bounds: { width: WORLD.width + 1, height: WORLD.height },
    cannon: { x: 100, y: 400, maxPull: 90, powerScale: 0.22, ammo: ['basic'] },
    statics: [{ type: 'ground', x: 800, y: 860, w: 1600, h: 40 }],
    objects: [],
    targets: [{ type: 'ball', material: 'feather', x: 400, y: 400, r: 20, target: true }],
  };
  assert.throws(() => validateLevel(def), /exceeds the world/);
});

test('levelAt wraps and indexes the roster', () => {
  assert.equal(levelAt(0).name, LEVELS[0]!.name);
  assert.equal(levelAt(LEVELS.length).name, LEVELS[0]!.name);
  assert.equal(levelAt(-1).name, LEVELS[LEVELS.length - 1]!.name);
});

/** One round: aim, fire, let it settle. Returns how many birds died. */
function round(levelIndex: number, pull: number, deg: number): number {
  const { game, adapter, loaded } = newStage(levelIndex);
  game.beginAim();
  const rad = (deg * Math.PI) / 180;
  game.dragAim({ x: loaded.cannonOrigin.x - pull * Math.cos(rad), y: loaded.cannonOrigin.y - pull * Math.sin(rad) });
  game.releaseAim();
  // game.step takes exactly FIXED_DT (docs/adr.md D12), so a round is a step loop.
  for (let i = 0; i < 720; i++) {
    game.step(1 / 60);
    if (game.rules.snapshot().phase !== 'in_flight') break;
  }
  // Destroyed bodies leave the snapshot (D17), so survivors are the complement.
  return loaded.targetIds.length - adapter.snapshot().filter((s) => s.kind === 'bird').length;
}

function newStage(levelIndex: number) {
  const loaded = loadLevel(levelAt(levelIndex));
  const adapter = createPhysicsAdapter({
    width: loaded.def.bounds.width,
    height: loaded.def.bounds.height,
    gravityY: 1,
    frictionAir: 0.001,
  });
  const game = createGame({ level: loaded, adapter, bus: createEventBus() });
  return { game, adapter, loaded };
}

/**
 * Fire one pig at the closest bird we can actually reach, using the aiming preview
 * (the same trajectory the HUD shows) rather than analytic ballistics, because the
 * engine's gravity/friction is empirical. Returns false if no angle reaches anything.
 */
function fireAtNearestBird(game: ReturnType<typeof createGame>, adapter: ReturnType<typeof createPhysicsAdapter>, loaded: ReturnType<typeof loadLevel>): boolean {
  const birds = adapter.snapshot().filter((s) => s.kind === 'bird');
  if (birds.length === 0) return false;
  const origin = loaded.cannonOrigin;
  let best: { pull: number; rad: number; dist: number } | null = null;
  for (const pull of [loaded.maxPull, loaded.maxPull * 0.7, loaded.maxPull * 0.45]) {
    const speed = pull * loaded.powerScale;
    for (let deg = -45; deg <= 45; deg += 1) {
      const rad = (deg * Math.PI) / 180;
      // The preview is the engine's own integrator, so aiming matches real flight.
      const traj = adapter.simulateTrajectory(origin, { x: speed * Math.cos(rad), y: speed * Math.sin(rad) }, 120, 24);
      for (const p of traj) {
        for (const bird of birds) {
          const dist = Math.hypot(p.x - bird.x, p.y - bird.y);
          if (!best || dist < best.dist) best = { pull, rad, dist };
        }
      }
    }
  }
  if (!best || best.dist > 60) return false;
  game.beginAim();
  game.dragAim({ x: origin.x - best.pull * Math.cos(best.rad), y: origin.y - best.pull * Math.sin(best.rad) });
  game.releaseAim();
  for (let i = 0; i < 720; i++) {
    game.step(1 / 60);
    if (game.rules.snapshot().phase !== 'in_flight') break;
  }
  return true;
}

test('every single shot sweep finds at least one shot that kills a bird', () => {
  // Coarse sweep over one-pig rounds (docs/checklist.md records exact win counts);
  // this guards against a stage where no shot connects at all.
  for (let index = 0; index < LEVELS.length; index++) {
    const def = LEVELS[index]!;
    let kills = 0;
    for (let pull = 20; pull <= def.cannon.maxPull; pull += 5) {
      for (let deg = -40; deg <= 40; deg += 2.5) {
        kills += round(index, pull, deg);
      }
    }
    assert.ok(kills > 0, `${def.name} has no shot that kills a bird in the sweep`);
  }
});

test('every stage is clearable with its authored ammo', () => {
  // Real play: one pig per surviving bird, aimed with the trajectory preview.
  for (let index = 0; index < LEVELS.length; index++) {
    const def = LEVELS[index]!;
    const { game, adapter, loaded } = newStage(index);
    let shots = 0;
    while (adapter.snapshot().some((s) => s.kind === 'bird') && shots < loaded.ammo.length) {
      if (!fireAtNearestBird(game, adapter, loaded)) break;
      shots++;
    }
    assert.equal(
      adapter.snapshot().filter((s) => s.kind === 'bird').length,
      0,
      `${def.name} still has birds after ${shots} of ${loaded.ammo.length} pigs`,
    );
  }
});
