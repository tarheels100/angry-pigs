import Matter from 'matter-js';

import type { BodyInit, Impact, PhysicsAdapter, TrajectorySample, WorldInit } from './adapter.ts';
import { healthFor, materialSpec } from './materials.ts';
import type { EntityState, MaterialId, Vec2 } from '../core/types.ts';

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

type EngineT = ReturnType<typeof Engine.create>;
type BodyT = ReturnType<typeof Bodies.rectangle>;

/** Matter's engine step takes milliseconds, not seconds (docs/physics.md gotcha 1). */
const STEP_MS = 1000 / 60;

/** Velocity and angular velocity multiplier applied to pigs while they are in
 * ground contact. Matter has no rolling resistance (docs/tuning.md). */
const PIG_ROLLING_DAMPING = 0.94;

const CATEGORY = { static: 0x0001, object: 0x0002, target: 0x0004, projectile: 0x0008 };

type FilterGroup = 'static' | 'object' | 'target' | 'projectile';

const FILTERS: Record<FilterGroup, { category: number; mask: number }> = {
  static: { category: CATEGORY.static, mask: 0xffff },
  object: {
    category: CATEGORY.object,
    mask: CATEGORY.static | CATEGORY.object | CATEGORY.target | CATEGORY.projectile,
  },
  target: {
    category: CATEGORY.target,
    mask: CATEGORY.static | CATEGORY.object | CATEGORY.target | CATEGORY.projectile,
  },
  // Pigs must not hit other pigs or the launcher, or a second pig knocks the first
  // one around and muddies impact damage.
  projectile: { category: CATEGORY.projectile, mask: CATEGORY.static | CATEGORY.object | CATEGORY.target },
};

function filterGroupFor(kind: EntityState['kind']): FilterGroup {
  switch (kind) {
    case 'bird': return 'target';
    case 'pig': return 'projectile';
    case 'ground':
    case 'wall': return 'static';
    default: return 'object';
  }
}

interface Tracked {
  id: string;
  kind: EntityState['kind'];
  material: MaterialId;
  body: BodyT;
  health: number;
  destroyed: boolean;
  impactEnergy: number;
  radius?: number;
  halfWidth?: number;
  halfHeight?: number;
}

export function createMatterAdapter(init: WorldInit): PhysicsAdapter {
  const engine: EngineT = Engine.create();
  engine.gravity.y = init.gravityY;
  engine.enableSleeping = true; // engine-level flag; threshold is per body

  const tracked = new Map<string, Tracked>();
  const staticInits: BodyInit[] = [];
  let impacts: Impact[] = [];
  let destroyedThisStep: string[] = [];
  const groundedPigs = new Set<string>();

  function energyOf(pair: Matter.Pair): number {
    const a = pair.bodyA;
    const b = pair.bodyB;
    const n = pair.collision?.normal ?? { x: 0, y: 1 };
    const rel = (a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y;
    return Math.abs(rel) * Math.min(a.mass, b.mass);
  }

  function idOf(body: BodyT): string {
    return String(body.label);
  }

  Events.on(engine, 'collisionStart', (event: Matter.IEventCollision<EngineT>) => {
    const stepImpacts: Impact[] = [];
    for (const pair of event.pairs) {
      const energy = energyOf(pair);
      const point = pair.collision?.normal
        ? { x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2, y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2 }
        : { x: pair.bodyA.position.x, y: pair.bodyA.position.y };
      stepImpacts.push({ aId: idOf(pair.bodyA), bId: idOf(pair.bodyB), point, energy });
      for (const id of [idOf(pair.bodyA), idOf(pair.bodyB)]) {
        const t = tracked.get(id);
        if (t) t.impactEnergy = Math.max(t.impactEnergy, energy);
      }
    }
    impacts.push(...stepImpacts);
  });

  // Rolling contact bookkeeping: collisionActive fires while a pair stays in contact.
  Events.on(engine, 'collisionActive', (event: Matter.IEventCollision<EngineT>) => {
    for (const pair of event.pairs) {
      for (const body of [pair.bodyA, pair.bodyB]) {
        if (tracked.get(idOf(body))?.kind === 'pig') groundedPigs.add(idOf(body));
      }
    }
  });
  Events.on(engine, 'collisionEnd', (event: Matter.IEventCollision<EngineT>) => {
    for (const pair of event.pairs) {
      for (const body of [pair.bodyA, pair.bodyB]) groundedPigs.delete(idOf(body));
    }
  });

  function addBody(b: BodyInit): void {
    const spec = materialSpec(b.material);
    const filter = FILTERS[filterGroupFor(b.kind)];
    const common = {
      label: b.id,
      isStatic: b.isStatic ?? false,
      density: spec.density,
      friction: spec.friction,
      frictionStatic: spec.frictionStatic,
      restitution: spec.restitution,
      frictionAir: init.frictionAir,
      sleepThreshold: 60,
      collisionFilter: filter,
    };

    let body: BodyT;
    let area: number;
    let dims: Partial<Record<'radius' | 'halfWidth' | 'halfHeight', number>>;
    if (b.shape === 'circle') {
      const r = b.radius ?? 16;
      body = Bodies.circle(b.x, b.y, r, common);
      area = Math.PI * r * r;
      dims = { radius: r };
    } else {
      const hw = b.halfWidth ?? 20;
      const hh = b.halfHeight ?? 20;
      body = Bodies.rectangle(b.x, b.y, hw * 2, hh * 2, common);
      if (b.angle) Body.setAngle(body, b.angle);
      area = hw * 2 * hh * 2;
      dims = { halfWidth: hw, halfHeight: hh };
    }

    Composite.add(engine.world, body);
    if (b.isStatic) staticInits.push(b);
    tracked.set(b.id, {
      id: b.id,
      kind: b.kind,
      material: b.material,
      body,
      health: b.isStatic ? Infinity : healthFor(b.material, area),
      destroyed: false,
      impactEnergy: 0,
      ...dims,
    });
  }

  function removeBody(id: string): void {
    const t = tracked.get(id);
    if (!t) return;
    wakeNear(t.body);
    Composite.remove(engine.world, t.body);
    const si = staticInits.findIndex((s) => s.id === id);
    if (si >= 0) staticInits.splice(si, 1);
    groundedPigs.delete(id);
    tracked.delete(id);
  }

  /**
   * Matter does not wake a sleeping body when its support disappears: removal
   * produces no collision, so a beam resting on a destroyed column floats in place
   * (docs/physics.md gotcha 11). Wake dynamic bodies overlapping the departing body.
   */
  function wakeNear(body: BodyT): void {
    const margin = 40;
    const minX = body.bounds.min.x - margin;
    const maxX = body.bounds.max.x + margin;
    const minY = body.bounds.min.y - margin;
    const maxY = body.bounds.max.y + margin;
    for (const other of engine.world.bodies) {
      if (other.isStatic || other === body) continue;
      if (other.bounds.min.x > maxX || other.bounds.max.x < minX) continue;
      if (other.bounds.min.y > maxY || other.bounds.max.y < minY) continue;
      // Wake even when the body is not asleep yet: a body resting on a support that
      // is about to vanish is idle, so its sleep counter is close to the threshold
      // and it would fall asleep before gravity can move it.
      Sleeping.set(other, false);
    }
  }

  function step(dt: number): Impact[] {
    if (Math.abs(dt - 1 / 60) > 1e-9) {
      throw new Error(`physics must be stepped at FIXED_DT (1/60), got ${dt}`);
    }
    impacts = [];
    destroyedThisStep = [];

    Engine.update(engine, STEP_MS);

    // Rolling resistance for pigs resting on the ground (docs/adr.md D15).
    for (const id of groundedPigs) {
      const t = tracked.get(id);
      if (!t || t.destroyed) continue;
      Body.setVelocity(t.body, { x: t.body.velocity.x * PIG_ROLLING_DAMPING, y: t.body.velocity.y * PIG_ROLLING_DAMPING });
      Body.setAngularVelocity(t.body, t.body.angularVelocity * PIG_ROLLING_DAMPING);
    }

    return impacts;
  }

  function state(id: string): EntityState | undefined {
    const t = tracked.get(id);
    if (!t) return undefined;
    const body = t.body;
    const base: EntityState = {
      id: t.id,
      kind: t.kind,
      shape: t.radius !== undefined ? 'circle' : 'box',
      material: t.material,
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
      vx: body.velocity.x,
      vy: body.velocity.y,
      sleeping: body.isSleeping,
      destroyed: t.destroyed,
      health: t.health,
      impactEnergy: t.impactEnergy,
    };
    // Dimensions come from the level descriptor, not body.bounds, which is
    // axis-aligned and therefore wrong for a rotated rectangle.
    if (t.radius !== undefined) base.radius = t.radius;
    if (t.halfWidth !== undefined) base.halfWidth = t.halfWidth;
    if (t.halfHeight !== undefined) base.halfHeight = t.halfHeight;
    return base;
  }

  function clear(): void {
    // Level rebuild: drop every body and its tracked record so addBody can insert
    // fresh ones. staticInits stay for trajectory previews built from data.
    Composite.clear(engine.world, false);
    tracked.clear();
    groundedPigs.clear();
    destroyedThisStep = [];
  }

  function launch(id: string, velocity: Vec2): void {
    const t = tracked.get(id);
    if (!t) return;
    Sleeping.set(t.body, false);
    Body.setVelocity(t.body, velocity);
    Body.setAngularVelocity(t.body, 0);
  }

  function applyDamage(id: string, amount: number): void {
    const t = tracked.get(id);
    if (!t || t.destroyed || !Number.isFinite(t.health)) return;
    t.health -= amount;
    if (t.health <= 0) {
      t.destroyed = true;
      t.health = 0;
      // Destroyed bodies leave the physics world; the registry keeps their state so
      // the renderer can flash them before they fade (M11).
      wakeNear(t.body);
      Composite.remove(engine.world, t.body);
      destroyedThisStep.push(id);
    }
  }

  function makeStaticBody(s: BodyInit): BodyT {
    const spec = materialSpec(s.material);
    return s.shape === 'circle'
      ? Bodies.circle(s.x, s.y, s.radius ?? 16, { isStatic: true, friction: spec.friction, frictionStatic: spec.frictionStatic, restitution: spec.restitution })
      : Bodies.rectangle(s.x, s.y, (s.halfWidth ?? 20) * 2, (s.halfHeight ?? 20) * 2, { isStatic: true, friction: spec.friction, frictionStatic: spec.frictionStatic, restitution: spec.restitution });
  }

  function simulateTrajectory(origin: Vec2, velocity: Vec2, maxSteps: number, radius = 18): TrajectorySample[] {
    // Throwaway world: statics only, so the preview shows the arc and the first
    // contact without touching the live simulation.
    const preview = Engine.create();
    preview.gravity.y = init.gravityY;
    preview.enableSleeping = false;

    const pig = Bodies.circle(origin.x, origin.y, radius, {
      density: materialSpec('light').density,
      friction: materialSpec('light').friction,
      frictionStatic: materialSpec('light').frictionStatic,
      restitution: materialSpec('light').restitution,
      frictionAir: init.frictionAir,
    });
    // matter-js has no Bodies.clone, so statics are rebuilt from their descriptors.
    Composite.add(preview.world, staticInits.map((s) => makeStaticBody(s)));
    Composite.add(preview.world, pig);
    Body.setVelocity(pig, velocity);

    let hit = false;
    Events.on(preview, 'collisionStart', () => { hit = true; });

    const samples: TrajectorySample[] = [];
    const bounds = { width: init.width, height: init.height };
    for (let i = 0; i < maxSteps; i++) {
      Engine.update(preview, STEP_MS);
      if (i % 3 === 0) samples.push({ x: pig.position.x, y: pig.position.y, hit });
      if (hit || pig.position.x > bounds.width || pig.position.y > bounds.height) break;
    }
    Composite.clear(preview.world, false);
    return samples;
  }

  function allSleeping(): boolean {
    for (const t of tracked.values()) {
      if (t.destroyed || t.body.isStatic) continue;
      if (!t.body.isSleeping) return false;
    }
    return true;
  }

  function wakeAll(): void {
    for (const t of tracked.values()) {
      if (t.destroyed || t.body.isStatic) continue;
      Sleeping.set(t.body, false);
    }
  }

  return {
    addBody,
    removeBody,
    clear,
    step,
    snapshot: () => [...tracked.keys()].map((id) => state(id)).filter((s): s is EntityState => s !== undefined),
    state,
    launch,
    applyDamage,
    simulateTrajectory,
    allSleeping,
    wakeAll,
    destroyedLastStep: () => destroyedThisStep,
  };
}
