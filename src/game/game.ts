import type { PhysicsAdapter } from '../physics/adapter.ts';
import type { EventBus } from '../core/eventBus.ts';
import type { EntityRegistry } from '../core/entities.ts';
import type { GamePhase, TrajectorySample, Vec2, EntityState } from '../core/types.ts';
import type { LoadedLevel } from '../levels/index.ts';
import { createEntityRegistry } from '../core/entities.ts';
import { createCannon, type Cannon } from './cannon.ts';
import { createRules, type GameRules, type RulesSnapshot } from './rules.ts';
import { materialSpec } from '../physics/materials.ts';

/** Composition root for gameplay: level + cannon + physics + rules. */

/** Tuning knobs from docs/tuning.md / docs/adr.md D15. */
const PIG_SPEED_EPS = 1.2;
const PIG_SLOW_STEPS = 45;
const SETTLE_TIMEOUT_STEPS = 240;
const TRAJECTORY_STEPS = 120;
const PIG_RADIUS = 18;
/** A release must drag at least this far from the cannon to count as a shot. */
const MIN_DRAG = 12;
/** Fraction of `energy / threshold` health that one impact spends (docs/tuning.md).
 * Below 1 so a single hit rarely erases a block: partial health is what makes tilt and
 * partial shatter visible. */
const DAMAGE_SCALE = 0.35;
/** Steps a destroyed entity keeps a flashing silhouette after it leaves the world. */
const FLASH_STEPS = 10;

export interface GameOptions {
  level: LoadedLevel;
  adapter: PhysicsAdapter;
  bus: EventBus;
}

export interface Frame {
  entities: EntityRegistry;
  /** Present while the player is dragging the cannon. */
  aim: { origin: Vec2; pull: Vec2 } | null;
  /** Ballistic preview for the current aim, computed from the physics layer. */
  trajectory: TrajectorySample[];
}

export interface Game {
  adapter: PhysicsAdapter;
  bus: EventBus;
  entities: EntityRegistry;
  /** Live views: restart()/loadLevel() replace these instances (see below). */
  rules: GameRules;
  cannon: Cannon;
  step(dt: number): void;
  frame(): Frame;
  /** Open a drag gesture. A press alone is not a shot; only drags set a pull. */
  beginAim(): void;
  dragAim(worldPoint: Vec2): void;
  cancelAim(): void;
  /** Release the drag: fire the next pig if ammo remains. */
  releaseAim(): boolean;
  loadLevel(level: LoadedLevel): void;
  restart(): void;
}

export function createGame(options: GameOptions): Game {
  const { adapter, bus } = options;
  const entities = createEntityRegistry(adapter);
  let level = options.level;
  let cannon = createCannon({
    origin: level.cannonOrigin,
    maxPull: level.maxPull,
    powerScale: level.powerScale,
    ammo: level.ammo,
  });
  let rules = createRules({ targetIds: level.targetIds, ammo: level.ammo });

  const pigs = new Map<string, { slowSteps: number }>();
  /** Destroyed bodies no longer appear in the snapshot (D17); these display-only
   * extras flash where they died, then drop out. */
  const corpses = new Map<string, { state: EntityState; steps: number }>();
  /** Last collision partner per body, so a death can be attributed to the pig that
   * hit it or to falling debris (docs/checklist.md §2). */
  const lastHit = new Map<string, { partnerKind: EntityState['kind'] }>();
  let flightSteps = 0;
  let settleSteps = 0;
  let trajectory: TrajectorySample[] = [];
  let pigCounter = 0;
  /** True between pointer-down and pointer-up; a press alone is not a shot. */
  let aiming = false;

  function buildLevel(): void {
    for (const body of level.bodies) adapter.addBody(body);
    bus.emit('levelLoaded', { levelId: level.def.name, name: level.def.name, ammo: level.ammo.length, bounds: level.def.bounds });
    rules.loadLevel(level.targetIds, level.ammo.length);
    refreshDisplay();
    bus.emit('phaseChanged', { phase: rules.snapshot().phase });
  }

  /**
   * Display-only entities: the cannon, and the next pig resting on it while the
   * player is aiming. They are not physics bodies and never collide, so they cannot
   * affect the simulation (docs/architecture.md).
   */
  function refreshDisplay(): void {
    const origin = cannon.config().origin;
    const list: EntityState[] = [
      {
        id: 'cannon', kind: 'cannon', shape: 'box', material: 'metal',
        x: origin.x, y: origin.y + 16, angle: 0, vx: 0, vy: 0,
        sleeping: true, destroyed: false, health: Infinity, impactEnergy: 0,
        halfWidth: 30, halfHeight: 14,
      },
    ];
    if (rules.snapshot().phase === 'aiming' && cannon.ammoLeft() > 0) {
      list.push({
        id: 'cannon-pig', kind: 'pig', shape: 'circle', material: 'light',
        x: origin.x, y: origin.y, angle: 0, vx: 0, vy: 0,
        sleeping: true, destroyed: false, health: Infinity, impactEnergy: 0,
        radius: PIG_RADIUS,
      });
    }
    for (const corpse of corpses.values()) {
      list.push({ ...corpse.state, destroyed: true, fade: 1 - corpse.steps / FLASH_STEPS });
    }
    entities.setExtras(list);
  }

  function targetsAlive(): number {
    return level.targetIds.filter((id) => {
      const s = adapter.state(id);
      return s !== undefined && !s.destroyed;
    }).length;
  }

  /** Slice damage model: energy above a material's threshold spends health.
   * Pigs are consumed rather than damaged (docs/adr.md D15); M8 formalises this. */
  function applySliceDamage(aId: string, bId: string, energy: number): void {
    for (const id of [aId, bId]) {
      const s = adapter.state(id);
      if (!s || s.destroyed || s.kind === 'pig' || s.kind === 'ground' || s.kind === 'wall') continue;
      const threshold = materialSpec(s.material).damageThreshold;
      if (energy > threshold) adapter.applyDamage(id, (DAMAGE_SCALE * energy) / threshold);
    }
  }

  function consumePig(id: string, reason: 'settled' | 'outOfBounds' | 'timeout'): void {
    pigs.delete(id);
    adapter.removeBody(id);
    bus.emit('pigConsumed', { id, reason });
  }

  function updatePigs(): void {
    for (const id of [...pigs.keys()]) {
      const s = adapter.state(id);
      if (!s) {
        pigs.delete(id);
        continue;
      }
      if (s.x < 0 || s.x > level.def.bounds.width || s.y > level.def.bounds.height) {
        consumePig(id, 'outOfBounds');
        continue;
      }
      const entry = pigs.get(id)!;
      entry.slowSteps = Math.hypot(s.vx, s.vy) < PIG_SPEED_EPS ? entry.slowSteps + 1 : 0;
      if (entry.slowSteps >= PIG_SLOW_STEPS) consumePig(id, 'settled');
    }
  }

  function advancePhase(): void {
    const phase = rules.snapshot().phase;
    if (phase === 'in_flight') {
      flightSteps++;
      if (pigs.size === 0 || flightSteps >= SETTLE_TIMEOUT_STEPS) {
        if (flightSteps >= SETTLE_TIMEOUT_STEPS) {
          for (const id of [...pigs.keys()]) consumePig(id, 'timeout');
        }
        rules.pigsSettled();
        bus.emit('phaseChanged', { phase: rules.snapshot().phase });
        settleSteps = 0;
      }
      return;
    }
    if (phase === 'settling') {
      settleSteps++;
      const settled = adapter.allSleeping() || settleSteps >= SETTLE_TIMEOUT_STEPS;
      if (!settled) return;
      // A window that expired is not a rest: freeze so "settled" means visually
      // stopped before scoring reads it (docs/adr.md D16).
      if (!adapter.allSleeping()) adapter.freezeAll();
      const won = targetsAlive() === 0;
      rules.worldSettled(won);
      const snap = rules.snapshot();
      bus.emit('phaseChanged', { phase: snap.phase });
      if (snap.phase === 'won') bus.emit('levelWon', { levelId: level.def.name, score: snap.score, stars: snap.stars });
      if (snap.phase === 'lost') bus.emit('levelLost', { levelId: level.def.name });
    }
  }

  function step(dt: number): void {
    const phase = rules.snapshot().phase;
    if (phase === 'won' || phase === 'lost') return;

    const impacts = adapter.step(dt);
    for (const impact of impacts) {
      bus.emit('impact', impact);
      const a = adapter.state(impact.aId);
      const b = adapter.state(impact.bId);
      if (a && b) {
        lastHit.set(impact.aId, { partnerKind: b.kind });
        lastHit.set(impact.bId, { partnerKind: a.kind });
      }
      applySliceDamage(impact.aId, impact.bId, impact.energy);
    }
    for (const id of adapter.destroyedLastStep()) {
      rules.targetDestroyed(id);
      // Keep the last known state for a short flash; the body itself is gone (D17).
      const s = adapter.state(id);
      if (s) corpses.set(id, { state: s, steps: 0 });
      // Attribution: a pig hit is a direct kill, debris is a crush, hitting the ground
      // or a wall is a fall. Only events carry it; nothing scores on it yet.
      const partner = lastHit.get(id)?.partnerKind;
      const cause = partner === 'pig' ? 'impact' : partner === 'ground' || partner === 'wall' ? 'fall' : 'crush';
      bus.emit('destroyed', { id, cause });
    }
    for (const [id, corpse] of corpses) {
      corpse.steps++;
      if (corpse.steps >= FLASH_STEPS) corpses.delete(id);
    }
    updatePigs();
    advancePhase();
    refreshDisplay();
  }

  function refreshTrajectory(): void {
    const velocity = cannon.launchVelocity();
    trajectory = velocity
      ? adapter.simulateTrajectory(cannon.config().origin, velocity, TRAJECTORY_STEPS, PIG_RADIUS)
      : [];
  }

  function beginAim(): void {
    if (rules.snapshot().phase !== 'aiming' || cannon.ammoLeft() === 0) return;
    // A press alone is not a shot: the pull starts at zero and only drags move it.
    aiming = true;
    cannon.clearAim();
    trajectory = [];
  }

  function dragAim(point: Vec2): void {
    if (rules.snapshot().phase !== 'aiming' || cannon.ammoLeft() === 0) return;
    // Moves are reported only while a button is held (src/input/pointer.ts), so a
    // drag can re-open the gesture if restart()/loadLevel() closed it mid-drag.
    aiming = true;
    cannon.setAim(point);
    refreshTrajectory();
  }

  function cancelAim(): void {
    aiming = false;
    cannon.clearAim();
    trajectory = [];
  }

  function releaseAim(): boolean {
    if (!aiming) return false;
    aiming = false;
    const aim = cannon.aim();
    const velocity = cannon.launchVelocity();
    if (!velocity || !aim || Math.hypot(aim.pull.x, aim.pull.y) < MIN_DRAG) {
      // A click with no drag (or a negligible one) must not spend ammo.
      cancelAim();
      return false;
    }
    const id = `pig-${++pigCounter}`;
    adapter.addBody({ id, kind: 'pig', shape: 'circle', material: 'light', x: cannon.config().origin.x, y: cannon.config().origin.y, radius: PIG_RADIUS });
    adapter.launch(id, velocity);
    pigs.set(id, { slowSteps: 0 });
    cannon.consumeAmmo();
    rules.launch();
    flightSteps = 0;
    trajectory = [];
    bus.emit('launch', { id, velocity });
    bus.emit('phaseChanged', { phase: rules.snapshot().phase });
    refreshDisplay();
    return true;
  }

  function loadLevel(next: LoadedLevel): void {
    for (const body of adapter.snapshot()) adapter.removeBody(body.id);
    pigs.clear();
    aiming = false;
    corpses.clear();
    lastHit.clear();
    level = next;
    cannon = createCannon({ origin: next.cannonOrigin, maxPull: next.maxPull, powerScale: next.powerScale, ammo: next.ammo });
    rules = createRules({ targetIds: next.targetIds, ammo: next.ammo });
    trajectory = [];
    buildLevel();
  }

  /** Rebuild the level from its data: physics, registry, cannon, rules (M9 does retries). */
  function restart(): void {
    rules.restart();
    aiming = false;
    cannon = createCannon({ origin: level.cannonOrigin, maxPull: level.maxPull, powerScale: level.powerScale, ammo: [...level.ammo] });
    adapter.clear();
    pigs.clear();
    corpses.clear();
    lastHit.clear();
    settleSteps = 0;
    trajectory = [];
    pigCounter = 0;
    for (const body of level.bodies) adapter.addBody(body);
    refreshDisplay();
    bus.emit('levelLoaded', { levelId: level.def.name, name: level.def.name, ammo: level.ammo.length, bounds: level.def.bounds });
    bus.emit('phaseChanged', { phase: rules.snapshot().phase });
  }

  buildLevel();

  return {
    adapter,
    bus,
    entities,
    // Getters rather than captured values: restart() and loadLevel() build new
    // cannon/rules instances, and a captured reference would keep reading the
    // pre-restart cannon (empty ammo, no aim) — the M7 restart bug.
    get rules() {
      return rules;
    },
    get cannon() {
      return cannon;
    },
    step,
    frame: () => {
      refreshDisplay();
      return {
        entities,
        aim: cannon.aim() ? { origin: cannon.config().origin, pull: cannon.aim()!.pull } : null,
        trajectory,
      };
    },
    beginAim,
    dragAim,
    cancelAim,
    releaseAim,
    loadLevel,
    restart,
  };
}

/** Convenience for the HUD: current rule snapshot. */
export function gameSnapshot(game: Game): RulesSnapshot {
  return game.rules.snapshot();
}
