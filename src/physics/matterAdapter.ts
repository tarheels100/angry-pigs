import Matter from 'matter-js';

import type { BodyInit, ExplosionOptions, Impact, PhysicsAdapter, TrajectorySample, WorldInit } from './adapter.ts';
import { healthFor, materialSpec } from './materials.ts';
import type { EntityState, MaterialId, Vec2 } from '../core/types.ts';

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

type EngineT = ReturnType<typeof Engine.create>;
type BodyT = ReturnType<typeof Bodies.rectangle>;

/** Matter's engine step takes milliseconds, not seconds (docs/physics.md gotcha 1). */
const STEP_MS = 1000 / 60;

/** Velocity and angular velocity multiplier applied to rolling bodies (pigs and
 * birds) while they are in ground contact. Matter has no rolling resistance
 * (docs/tuning.md). Kept close to 1 so a body rolls instead of stopping dead; the
 * rest of the stopping power comes from contact friction. */
const ROLLING_DAMPING = 0.98;

/**
 * Blast shove constants (M23, docs/adr.md D41). `impulse` reaches the adapter as the
 * velocity added at the blast centre for a body of `REFERENCE_SHOVE_MASS`, so a heavier
 * body gets proportionally less shove and a lighter one gets more. `LIFT` tilts the push
 * upward so a heap pops rather than slides sideways; `SPIN` tumbles the block.
 */
const REFERENCE_SHOVE_MASS = 4;
const LIFT = 0.4;
const SPIN = 0.06;

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
  healthMax: number;
  destroyed: boolean;
  impactEnergy: number;
  /** Presentation hint from the level (bird silhouette, pig type id). */
  variant?: string;
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
  /** Ids of pigs/birds currently in ground contact, from collisionActive (D15). */
  const groundedRoll = new Set<string>();

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
        const kind = tracked.get(idOf(body))?.kind;
        if (kind === 'pig' || kind === 'bird') groundedRoll.add(idOf(body));
      }
    }
  });
  Events.on(engine, 'collisionEnd', (event: Matter.IEventCollision<EngineT>) => {
    for (const pair of event.pairs) {
      for (const body of [pair.bodyA, pair.bodyB]) groundedRoll.delete(idOf(body));
    }
  });

  function addBody(b: BodyInit): void {
    const spec = materialSpec(b.material);
    const filter = FILTERS[filterGroupFor(b.kind)];
    const common = {
      label: b.id,
      isStatic: b.isStatic ?? false,
      // A heavy pig is denser than a basic one, so it carries more momentum (M18).
      density: spec.density * (b.massScale ?? 1),
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
      healthMax: b.isStatic ? Infinity : healthFor(b.material, area),
      destroyed: false,
      impactEnergy: 0,
      ...(b.variant ? { variant: b.variant } : {}),
      ...dims,
    });
  }

  function removeBody(id: string): void {
    const t = tracked.get(id);
    if (!t) return;
    wakeSupportChain(t.body);
    Composite.remove(engine.world, t.body);
    const si = staticInits.findIndex((s) => s.id === id);
    if (si >= 0) staticInits.splice(si, 1);
    groundedRoll.delete(id);
    tracked.delete(id);
  }

  /**
   * Matter does not wake a sleeping body when its support disappears: removal
   * produces no collision, so a beam resting on a destroyed column floats in place
   * (docs/physics.md gotcha 11). A *chain* floats too — a roof resting on columns
   * that rest on the departing beam is more than one support away, so waking is
   * transitive: whatever rides on top of a woken body wakes with it. Measured with
   * scratch/hover-probe.ts, which flags any resting body with nothing under it.
   */
  function wakeSupportChain(body: BodyT): void {
    const margin = 40;
    const overlapX = (a: BodyT, b: BodyT) =>
      Math.min(a.bounds.max.x, b.bounds.max.x) - Math.max(a.bounds.min.x, b.bounds.min.x);

    // Bodies touching the departing body, within the margin.
    let frontier: BodyT[] = [];
    for (const other of engine.world.bodies) {
      if (other.isStatic || other === body) continue;
      if (other.bounds.min.x > body.bounds.max.x + margin) continue;
      if (other.bounds.max.x < body.bounds.min.x - margin) continue;
      if (other.bounds.min.y > body.bounds.max.y + margin) continue;
      if (other.bounds.max.y < body.bounds.min.y - margin) continue;
      // Wake even when the body is not asleep yet: a body resting on a support that
      // is about to vanish is idle, so its sleep counter is close to the threshold
      // and it would fall asleep before gravity can move it.
      Sleeping.set(other, false);
      frontier.push(other);
    }

    // Up the stack. Four passes is enough for the tallest authored structure; the
    // bound keeps removal work bounded no matter how a level is authored.
    for (let pass = 0; pass < 4 && frontier.length > 0; pass++) {
      const next: BodyT[] = [];
      for (const w of frontier) {
        const top = w.bounds.min.y;
        for (const other of engine.world.bodies) {
          // Only sleeping bodies need waking; an awake one is already under gravity.
          if (other.isStatic || other === body || !other.isSleeping) continue;
          if (overlapX(other, w) < 4) continue;
          if (other.bounds.max.y < top - 12 || other.bounds.min.y > top + 12) continue;
          Sleeping.set(other, false);
          next.push(other);
        }
      }
      frontier = next;
    }
  }

  /**
   * Wake a sleeping body that has no supporting surface under it. Horizontal overlap
   * must be real (>= 4 units) and the support's top must be at the body's bottom, so a
   * body leaning against a wall's side is not treated as resting on it.
   */
  function wakeUnsupported(): void {
    const tolerance = 12;
    for (const t of tracked.values()) {
      if (t.destroyed || t.body.isStatic || !t.body.isSleeping) continue;
      const b = t.body;
      const bottom = b.bounds.max.y;
      let supported = false;
      for (const other of engine.world.bodies) {
        if (other === b) continue;
        const overlapX = Math.min(b.bounds.max.x, other.bounds.max.x) - Math.max(b.bounds.min.x, other.bounds.min.x);
        if (overlapX < 4) continue;
        const top = other.bounds.min.y;
        if (top >= bottom - tolerance && top <= bottom + tolerance) {
          supported = true;
          break; // resting on something — leave it asleep
        }
      }
      if (!supported) Sleeping.set(b, false);
    }
  }

  function step(dt: number): Impact[] {
    if (Math.abs(dt - 1 / 60) > 1e-9) {
      throw new Error(`physics must be stepped at FIXED_DT (1/60), got ${dt}`);
    }
    impacts = [];
    destroyedThisStep = [];

    Engine.update(engine, STEP_MS);

    // Anti-floating invariant (playtest item 7, docs/physics.md gotcha 12): a
    // sleeping body must be resting on something. Matter keeps a sleeping body exactly
    // where it was, so when a support is destroyed *or knocked away* nothing wakes the
    // body that rode on it, and it hangs in the air forever. Wake anything unsupported.
    wakeUnsupported();

    // Rolling resistance for bodies resting on the ground (docs/adr.md D15). Birds
    // need it too: a bird knocked onto the ground rolled for 240 steps (327 units)
    // without sleeping, which only ended at the settle timeout.
    for (const id of groundedRoll) {
      const t = tracked.get(id);
      if (!t || t.destroyed) continue;
      Body.setVelocity(t.body, { x: t.body.velocity.x * ROLLING_DAMPING, y: t.body.velocity.y * ROLLING_DAMPING });
      Body.setAngularVelocity(t.body, t.body.angularVelocity * ROLLING_DAMPING);
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
      // A destroyed body is no longer in the world, so it is not a renderable
      // entity; the presentation layer flashes it from the `destroyed` event instead
      // (docs/adr.md D17). Queries still see the final state.
      destroyed: t.destroyed,
      health: t.health,
      healthMax: t.healthMax,
      impactEnergy: t.impactEnergy,
      ...(t.variant ? { variant: t.variant } : {}),
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
    groundedRoll.clear();
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
      wakeSupportChain(t.body);
      Composite.remove(engine.world, t.body);
      destroyedThisStep.push(id);
    }
  }

  /**
   * Radial blast (M18 bomb pigs, reworked in M23 so it actually shoves things).
   *
   * The push is *impulse-like*, not a bare velocity change: a body set to a velocity
   * moves the same regardless of how heavy it is, so stone flew as far as glass. The
   * shove is therefore scaled by the reference mass (a basic pig), clamped so a heavy
   * body still moves and a feather bird is not launched absurdly. Damage is applied
   * after the push, so a body the blast destroys leaves as crumble rather than being
   * flung, and a body that survives carries the shove into the next step
   * (docs/adr.md D41).
   */
  function explode(center: Vec2, options: ExplosionOptions): void {
    for (const t of [...tracked.values()]) {
      if (t.destroyed || t.body.isStatic || !Number.isFinite(t.health)) continue;
      const dx = t.body.position.x - center.x;
      const dy = t.body.position.y - center.y;
      const dist = Math.hypot(dx, dy);
      // A body exactly at the centre takes the full blast (dist 0), not nothing.
      if (dist > options.radius) continue;
      const falloff = 1 - dist / options.radius;
      const dir = dist < 1e-6 ? { x: 0, y: -1 } : { x: dx / dist, y: dy / dist };
      // Mass-aware: lighter bodies get more shove. The clamp keeps stone moving (a
      // blast that ignores heavy bodies reads as a blast that did nothing) and stops a
      // feather bird from leaving the world outright.
      const heft = Math.min(1.2, Math.max(0.35, REFERENCE_SHOVE_MASS / Math.max(0.1, t.body.mass)));
      const shove = options.impulse * falloff * heft;
      Sleeping.set(t.body, false);
      Body.setVelocity(t.body, {
        x: t.body.velocity.x + dir.x * shove,
        y: t.body.velocity.y + dir.y * shove - shove * LIFT,
      });
      // Tumble: spin follows the outward direction, so a block flies and rotates rather
      // than sliding as one neat line. Deterministic — no RNG (docs/checklist.md §2).
      Body.setAngularVelocity(t.body, t.body.angularVelocity + dir.x * shove * SPIN);
      applyDamage(t.id, options.damage * falloff);
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

  /**
   * Force a rest. Used when a round's settle window expires instead of waiting for
   * bodies to sleep on their own (docs/adr.md D16): "settled" must mean visually
   * stopped, otherwise scoring reads a state the player can see is still moving.
   */
  function freezeAll(): void {
    for (const t of tracked.values()) {
      if (t.destroyed || t.body.isStatic) continue;
      Body.setVelocity(t.body, { x: 0, y: 0 });
      Body.setAngularVelocity(t.body, 0);
      Sleeping.set(t.body, true);
    }
  }

  return {
    addBody,
    removeBody,
    clear,
    step,
    // Destroyed bodies leave the physics world and the snapshot; the presentation
    // layer gets them through destroyedLastStep() and flashes them (D17).
    snapshot: () =>
      [...tracked.keys()]
        .map((id) => state(id))
        .filter((s): s is EntityState => s !== undefined && !s.destroyed),
    state,
    launch,
    applyDamage,
    explode,
    simulateTrajectory,
    allSleeping,
    wakeAll,
    freezeAll,
    destroyedLastStep: () => destroyedThisStep,
  };
}
