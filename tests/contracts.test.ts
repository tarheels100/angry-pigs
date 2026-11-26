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
  let snap: RulesSnapshot = { phase: 'aiming', ammoLeft: 3, targetsAlive: 1, score: 0, launches: 0 };
  return {
    snapshot: () => snap,
    onImpact(a: string, b: string, energy: number, _point: Vec2): void {
      const hitBird = a === 'bird-1' || b === 'bird-1';
      if (hitBird && energy > 2 && snap.targetsAlive > 0) {
        snap = { ...snap, targetsAlive: 0, score: snap.score + 1000 };
      }
    },
    onSettled(timedOut: boolean): void {
      if (timedOut) {
        snap = { ...snap, phase: 'lost' };
      } else if (snap.targetsAlive === 0) {
        snap = { ...snap, phase: 'won' };
      } else if (snap.ammoLeft > 0) {
        snap = { ...snap, phase: 'aiming', ammoLeft: snap.ammoLeft - 1, launches: snap.launches + 1 };
      } else {
        snap = { ...snap, phase: 'no_ammo' };
      }
    },
    restart(): void {
      snap = { phase: 'aiming', ammoLeft: 3, targetsAlive: 1, score: 0, launches: 0 };
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
  const phases: Phase[] = ['ready', 'aiming', 'in_flight', 'settling', 'won', 'lost', 'no_ammo'];
  assert.equal(phases.length, 7);

  // Missed bird: back to aiming, ammo consumed.
  rules.onImpact('pig-1', 'block-1', 1, { x: 0, y: 0 });
  rules.onSettled(false);
  assert.equal(rules.snapshot().phase, 'aiming');
  assert.equal(rules.snapshot().ammoLeft, 2);

  // Killed bird: win.
  rules.onImpact('pig-2', 'bird-1', 5, { x: 0, y: 0 });
  rules.onSettled(false);
  assert.equal(rules.snapshot().phase, 'won');
  assert.ok(rules.snapshot().score > 0);

  // Timeout: lose.
  rules.restart();
  rules.onSettled(true);
  assert.equal(rules.snapshot().phase, 'lost');

  // Out of ammo with the bird standing: three launches, then no_ammo.
  rules.restart();
  for (let i = 0; i < 3; i++) {
    rules.onImpact('pig', 'block-1', 1, { x: 0, y: 0 });
    rules.onSettled(false);
  }
  assert.equal(rules.snapshot().ammoLeft, 0);
  rules.onImpact('pig-4', 'block-1', 1, { x: 0, y: 0 });
  rules.onSettled(false);
  assert.equal(rules.snapshot().phase, 'no_ammo');
});
