import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { PhysicsAdapter, BodyInit, Impact, TrajectorySample, WorldInit } from '../src/physics/adapter.ts';
import type { Theme, RenderFrame } from '../src/render/theme.ts';
import type { Viewport, CameraApi } from '../src/camera/camera.ts';
import type { GameRules, RulesSnapshot, Phase } from '../src/game/rules.ts';
import type { EntityState, MaterialId } from '../src/core/types.ts';
import type { Vec2 } from '../src/core/types.ts';

/** Contracts are only real if someone can implement them. These dummy
 * implementations prove the interfaces are satisfiable without Matter or a DOM,
 * which is M2's compile-check acceptance. */

function fakeState(id: string): EntityState {
  return {
    id,
    kind: 'block',
    shape: 'box',
    material: 'glass',
    x: 0, y: 0, angle: 0,
    halfWidth: 20, halfHeight: 20,
    vx: 0, vy: 0,
    sleeping: true,
    destroyed: false,
    health: 4,
    impactEnergy: 0,
  };
}

function fakeAdapter(): PhysicsAdapter {
  const bodies = new Map<string, EntityState>();
  const impacts: Impact[] = [];
  return {
    addBody(init: BodyInit): void {
      bodies.set(init.id, fakeState(init.id));
    },
    removeBody(id: string): void {
      bodies.delete(id);
    },
    clear(): void {
      bodies.clear();
    },
    step(_dt: number): Impact[] {
      return impacts.splice(0);
    },
    snapshot(): EntityState[] {
      return [...bodies.values()];
    },
    state(id: string): EntityState | undefined {
      return bodies.get(id);
    },
    launch(id: string, velocity: Vec2): void {
      const s = bodies.get(id);
      if (s) { s.vx = velocity.x; s.vy = velocity.y; s.sleeping = false; }
    },
    applyDamage(id: string, amount: number): void {
      const s = bodies.get(id);
      if (!s) return;
      s.health -= amount;
      if (s.health <= 0) s.destroyed = true;
    },
    simulateTrajectory(origin: Vec2, velocity: Vec2, maxSteps: number): TrajectorySample[] {
      const out: TrajectorySample[] = [];
      let x = origin.x, y = origin.y, vy = velocity.y;
      for (let i = 0; i < maxSteps; i++) {
        x += velocity.x; y += vy; vy += 0.5;
        out.push({ x, y, hit: false });
      }
      return out;
    },
    allSleeping(): boolean {
      return [...bodies.values()].every((b) => b.sleeping);
    },
    wakeAll(): void {
      for (const b of bodies.values()) b.sleeping = false;
    },
    freezeAll(): void {
      for (const b of bodies.values()) {
        b.vx = 0; b.vy = 0; b.sleeping = true;
      }
    },
    destroyedLastStep(): string[] {
      return [...bodies.values()].filter((b) => b.destroyed).map((b) => b.id);
    },
  };
}

function fakeTheme(): Theme {
  const palette = {
    background: '#08090c',
    outline: '#6ef3ff',
    grid: '#12181f',
    materials: {
      glass: '#8ef7ff', stone: '#ff9d5c', metal: '#c8d6e0',
      feather: '#ffd166', ground: '#2b3a44', light: '#6ef3ff',
    } satisfies Record<MaterialId, string>,
    pig: '#ffd166', bird: '#ff5f7a', cannon: '#6ef3ff',
    aimGuide: '#6ef3ff', flash: '#ffffff',
  };
  const viewport: Viewport = { width: 1600, height: 900, dpr: 1 };
  const camera: CameraApi = {
    position: () => ({ x: 800, y: 450 }),
    zoom: () => 1,
    panTo: () => {},
    setZoom: () => {},
    worldToScreen: (p: Vec2) => p,
    screenToWorld: (p: Vec2) => p,
    fitZoom: () => 1,
  };
  return {
    id: 'fake',
    name: 'Fake theme',
    palette,
    paintBackground(_ctx: CanvasRenderingContext2D, _vp: Viewport): void {},
    paintEntity(_ctx: CanvasRenderingContext2D, entity: EntityState, _vp: Viewport): void {
      // Appearance is derived purely from semantic state.
      void entity.kind; void entity.material; void entity.destroyed;
    },
    paintOverlay(_ctx: CanvasRenderingContext2D, frame: RenderFrame, _vp: Viewport): void {
      void frame.camera; void frame.phase; void frame.aim;
    },
  };
}

function fakeRules(): GameRules {
  let targets = new Set<string>(['bird-1']);
  let snap: RulesSnapshot = { phase: 'aiming', ammoLeft: 3, targetsAlive: 1, targetsTotal: 1, score: 0, launches: 0, stars: 0 };

  function loadLevel(targetIds: string[], ammo: number): void {
    targets = new Set(targetIds);
    snap = { phase: 'aiming', ammoLeft: ammo, targetsAlive: targetIds.length, targetsTotal: targetIds.length, score: 0, launches: 0, stars: 0 };
  }

  return {
    snapshot: () => snap,
    loadLevel,
    launch(): void {
      if (snap.phase !== 'aiming' || snap.ammoLeft <= 0) return;
      snap = { ...snap, phase: 'in_flight', ammoLeft: snap.ammoLeft - 1, launches: snap.launches + 1 };
    },
    pigsSettled(): void {
      if (snap.phase === 'in_flight') snap = { ...snap, phase: 'settling' };
    },
    worldSettled(won: boolean): void {
      if (snap.phase !== 'settling') return;
      snap = won ? { ...snap, phase: 'won' } : snap.ammoLeft > 0 ? { ...snap, phase: 'aiming' } : { ...snap, phase: 'lost' };
    },
    targetDestroyed(id: string): void {
      if (!targets.has(id)) return;
      snap = { ...snap, targetsAlive: Math.max(0, snap.targetsAlive - 1), score: snap.score + 1000 };
    },
    restart(): void {
      loadLevel([...targets], 3);
    },
  };
}

test('PhysicsAdapter contract is implementable', () => {
  const adapter = fakeAdapter();
  adapter.addBody({ id: 'p1', kind: 'pig', shape: 'circle', material: 'light', x: 10, y: 10, radius: 16 });
  adapter.launch('p1', { x: 8, y: -4 });
  assert.equal(adapter.state('p1')?.vx, 8);
  assert.equal(adapter.allSleeping(), false);
  adapter.applyDamage('block', 1);
  const world: WorldInit = { width: 1600, height: 900, gravityY: 1, frictionAir: 0.001 };
  assert.equal(world.width, 1600);
  assert.equal(adapter.simulateTrajectory({ x: 0, y: 0 }, { x: 1, y: 0 }, 3).length, 3);
});

test('Theme contract reads only semantic state', () => {
  const theme = fakeTheme();
  const state = fakeState('bird-1');
  state.destroyed = true;
  const vp: Viewport = { width: 1600, height: 900, dpr: 1 };
  theme.paintEntity({} as CanvasRenderingContext2D, state, vp);
  theme.paintOverlay({} as CanvasRenderingContext2D, {
    camera: fakeCamera(),
    phase: 'aiming',
    aim: { origin: { x: 120, y: 480 }, pull: { x: 40, y: 20 }, trajectory: [{ x: 200, y: 400, hit: false }] },
  }, vp);
  assert.equal(theme.id, 'fake');
});

function fakeCamera(): CameraApi {
  return {
    position: () => ({ x: 800, y: 450 }),
    zoom: () => 1,
    panTo: () => {},
    setZoom: () => {},
    worldToScreen: (p: Vec2) => p,
    screenToWorld: (p: Vec2) => p,
    fitZoom: () => 1,
  };
}

test('GameRules contract covers every phase', () => {
  const rules = fakeRules();
  const phases: Phase[] = ['ready', 'aiming', 'in_flight', 'settling', 'won', 'lost'];
  assert.equal(phases.length, 6);

  // Missed shot: back to aiming, one launch consumed.
  rules.launch();
  rules.pigsSettled();
  rules.worldSettled(false);
  assert.equal(rules.snapshot().phase, 'aiming');
  assert.equal(rules.snapshot().ammoLeft, 2);

  // Killed bird: win.
  rules.launch();
  rules.targetDestroyed('bird-1');
  rules.pigsSettled();
  rules.worldSettled(true);
  assert.equal(rules.snapshot().phase, 'won');
  assert.ok(rules.snapshot().score > 0);

  // A destroyed block is not a target.
  rules.restart();
  rules.targetDestroyed('block-1');
  assert.equal(rules.snapshot().targetsAlive, 1);

  // Out of ammo with the bird standing: three launches, then lost.
  rules.restart();
  for (let i = 0; i < 3; i++) {
    rules.launch();
    rules.pigsSettled();
    rules.worldSettled(false);
  }
  assert.equal(rules.snapshot().ammoLeft, 0);
  assert.equal(rules.snapshot().phase, 'lost');
});
