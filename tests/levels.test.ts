import assert from 'node:assert/strict';
import test from 'node:test';

import { LEVELS, WORLD, SCENERY_KINDS, loadLevel, levelAt, validateLevel, type LevelDef } from '../src/levels/index.ts';
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

/** Fire one pig and let the world settle; returns birds killed and blocks destroyed. */
function round(levelIndex: number, pull: number, deg: number): { birds: number; blocks: number } {
  const { game, adapter, loaded } = newStage(levelIndex);
  game.beginAim();
  const rad = (deg * Math.PI) / 180;
  game.dragAim({ x: loaded.cannonOrigin.x - pull * Math.cos(rad), y: loaded.cannonOrigin.y - pull * Math.sin(rad) });
  game.releaseAim();
  // game.step takes exactly FIXED_DT (docs/adr.md D12), so a round is a step loop. A bird can
  // die during settling, when a roof comes down on it, so settle before counting.
  for (let i = 0; i < 720; i++) {
    game.step(1 / 60);
    const phase = game.rules.snapshot().phase;
    if (phase !== 'in_flight' && phase !== 'settling') break;
  }
  // Destroyed bodies leave the snapshot (D17), so survivors are the complement.
  return {
    birds: loaded.targetIds.length - adapter.snapshot().filter((s) => s.kind === 'bird').length,
    blocks: loaded.bodies.filter((b) => b.kind === 'block').length - adapter.snapshot().filter((s) => s.kind === 'block').length,
  };
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
 * Winning shots found by the replay-search bot (scratch/greedy-probe.ts) and recorded in
 * docs/tuning.md. A sheltered stage cannot be cleared by hitting birds directly, so the test
 * replays a measured plan rather than aiming at birds.
 */
const WINNING_PLANS: Record<string, Array<{ pull: number; deg: number }>> = {
  // Re-measured after M23 (softer glass, mass-aware blast): scratch/greedy-probe.ts replays
  // these and reports pigs used per stage.
  'stage-01': [{ pull: 75, deg: -20 }, { pull: 90, deg: -10 }],
  'stage-02': [{ pull: 63, deg: -10 }, { pull: 90, deg: -25 }, { pull: 90, deg: 5 }],
  'stage-03': [{ pull: 75, deg: -20 }, { pull: 63, deg: -45 }],
  'stage-04': [{ pull: 90, deg: -5 }, { pull: 75, deg: -45 }],
  'stage-05': [{ pull: 75, deg: -25 }, { pull: 90, deg: 0 }, { pull: 90, deg: -10 }],
  'stage-06': [{ pull: 75, deg: -40 }, { pull: 90, deg: -35 }, { pull: 90, deg: -25 }],
};

/**
 * Fire a whole plan in one round, mirroring the bot: the next shot may be fired while debris is
 * still settling (docs/adr.md D26). Returns the phase at the end.
 */
function playPlan(levelIndex: number, plan: Array<{ pull: number; deg: number }>): { phase: string; shots: number } {
  const { game, loaded } = newStage(levelIndex);
  const origin = loaded.cannonOrigin;
  let shots = 0;
  for (const shot of plan) {
    const phase = game.rules.snapshot().phase;
    if (phase !== 'aiming' && phase !== 'settling') break;
    game.beginAim();
    const rad = (shot.deg * Math.PI) / 180;
    game.dragAim({ x: origin.x - shot.pull * Math.cos(rad), y: origin.y - shot.pull * Math.sin(rad) });
    game.releaseAim();
    shots++;
    for (let i = 0; i < 300 && game.rules.snapshot().phase === 'in_flight'; i++) game.step(1 / 60);
    for (let i = 0; i < 150 && game.rules.snapshot().phase === 'settling'; i++) game.step(1 / 60);
  }
  // The last shot needs to settle before the rules decide win or lose.
  for (let i = 0; i < 600; i++) {
    const p = game.rules.snapshot().phase;
    if (p !== 'in_flight' && p !== 'settling') break;
    game.step(1 / 60);
  }
  return { phase: game.rules.snapshot().phase, shots };
}

test('every single shot sweep finds a shot that connects', () => {
  // Coarse sweep over one-pig rounds (docs/checklist.md records exact win counts). A shot
  // "connects" when it kills a bird or breaks structure: the finale stage is built so no single
  // pig kills a bird (its birds need a chain of failures), so breaking structure is the honest
  // floor for "this stage can be interacted with".
  for (let index = 0; index < LEVELS.length; index++) {
    const def = LEVELS[index]!;
    let best = 0;
    for (let pull = 24; pull <= def.cannon.maxPull; pull += 5) {
      for (let deg = -42; deg <= 42; deg += 2.5) {
        const r = round(index, pull, deg);
        best = Math.max(best, r.birds + r.blocks);
      }
    }
    assert.ok(best > 0, `${def.name} has no shot that kills a bird or breaks a block in the sweep`);
  }
});

test('every stage is clearable with its authored ammo', () => {
  // The plans come from the replay-search bot, which tries every drag the player can make and
  // replays the shots already taken (scratch/greedy-probe.ts).
  for (let index = 0; index < LEVELS.length; index++) {
    const def = LEVELS[index]!;
    const plan = WINNING_PLANS[def.name];
    assert.ok(plan, `${def.name} has no recorded winning plan`);
    const { phase, shots } = playPlan(index, plan!);
    assert.equal(phase, 'won', `${def.name} plan ${JSON.stringify(plan)} did not win`);
    assert.ok(shots <= loadLevel(def).ammo.length, `${def.name} plan uses ${shots} pigs, more than its ${loadLevel(def).ammo.length} of ammo`);
  }
});

test('scenery is art: validated, loaded, and never a physics body', () => {
  const base = LEVELS[0]!;
  const withScenery: LevelDef = {
    ...base,
    scenery: [
      { kind: 'tree', x: 560, y: 770, w: 36, h: 140 },
      { kind: 'ridge', x: 1300, y: 820, w: 260, h: 40 },
    ],
  };
  const loaded = loadLevel(withScenery);
  assert.equal(loaded.scenery.length, 2, 'scenery survives the load');
  assert.ok(loaded.bodies.every((b) => b.kind !== 'scenery'), 'scenery never becomes a body');

  // Validation names the offending field instead of crashing.
  assert.throws(() => loadLevel({ ...base, scenery: [{ kind: '', x: 100, y: 100, w: 20, h: 20 }] }), /scenery\[0\]\.kind/);
  assert.throws(() => loadLevel({ ...base, scenery: [{ kind: 'tree', x: 100, y: 100 }] }), /needs either r or w and h/);
  assert.throws(() => loadLevel({ ...base, scenery: [{ kind: 'tree', x: 9999, y: 100, w: 20, h: 20 }] }), /outside bounds/);

  // The shipped stages ship props, so the theme path is exercised in play.
  for (const def of LEVELS) {
    assert.ok((def.scenery ?? []).length > 0, `${def.name} ships scenery props`);
    assert.ok((def.scenery ?? []).every((s) => (SCENERY_KINDS as readonly string[]).includes(s.kind)), `${def.name} props are known kinds`);
  }

  // Display extras carry the props, and props cannot collide with anything.
  const adapter = createPhysicsAdapter({ width: base.bounds.width, height: base.bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level: loadLevel(withScenery), adapter, bus: createEventBus() });
  game.step(1 / 60);
  assert.equal(game.entities.byKind('scenery').length, 2, 'props appear as display extras');
  assert.ok(game.entities.byKind('scenery').every((e) => (SCENERY_KINDS as readonly string[]).includes(e.variant ?? '')), 'props carry their kind hint');
});

test('birds carry a silhouette variant through the contract (D39)', () => {
  // Levels name the bird kind; themes draw it. The hint must survive loading.
  for (const def of LEVELS) {
    const loaded = loadLevel(def);
    const birds = loaded.bodies.filter((b) => b.kind === 'bird');
    assert.ok(birds.length > 0, `${def.name} has birds`);
    assert.ok(birds.every((b) => typeof b.variant === 'string'), `${def.name} birds all name a variant`);
    assert.ok(new Set(birds.map((b) => b.variant)).size > 1, `${def.name} mixes bird kinds rather than repeating one`);
  }
});
