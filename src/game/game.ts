import type { PhysicsAdapter } from '../physics/adapter.ts';
import type { EventBus } from '../core/eventBus.ts';
import type { EntityRegistry } from '../core/entities.ts';
import type { GamePhase, TrajectorySample, Vec2 } from '../core/types.ts';
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
  rules: GameRules;
  cannon: Cannon;
  step(dt: number): void;
  frame(): Frame;
  /** Begin a drag from a pointer position in world coordinates. */
  beginAim(worldPoint: Vec2): void;
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
  let flightSteps = 0;
  let settleSteps = 0;
  let trajectory: TrajectorySample[] = [];
  let pigCounter = 0;

  function buildLevel(): void {
    for (const body of level.bodies) adapter.addBody(body);
    bus.emit('levelLoaded', { levelId: level.def.name, name: level.def.name, ammo: level.ammo.length });
    rules.loadLevel(level.targetIds, level.ammo.length);
    bus.emit('phaseChanged', { phase: rules.snapshot().phase });
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
      if (energy > threshold) adapter.applyDamage(id, energy / threshold);
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
      const won = targetsAlive() === 0;
      rules.worldSettled(won);
      const snap = rules.snapshot();
      bus.emit('phaseChanged', { phase: snap.phase });
      if (snap.phase === 'won') bus.emit('levelWon', { levelId: level.def.name, score: snap.score, stars: 1 });
      if (snap.phase === 'lost') bus.emit('levelLost', { levelId: level.def.name });
    }
  }

  function step(dt: number): void {
    const phase = rules.snapshot().phase;
    if (phase === 'won' || phase === 'lost') return;

    const impacts = adapter.step(dt);
    for (const impact of impacts) {
      bus.emit('impact', impact);
      applySliceDamage(impact.aId, impact.bId, impact.energy);
    }
    for (const id of adapter.destroyedLastStep()) {
      rules.targetDestroyed(id);
      bus.emit('destroyed', { id, cause: 'impact' });
    }
    updatePigs();
    advancePhase();
  }

  function refreshTrajectory(): void {
    const velocity = cannon.launchVelocity();
    trajectory = velocity
      ? adapter.simulateTrajectory(cannon.config().origin, velocity, TRAJECTORY_STEPS, PIG_RADIUS)
      : [];
  }

  function beginAim(point: Vec2): void {
    if (rules.snapshot().phase !== 'aiming') return;
    cannon.setAim(point);
    refreshTrajectory();
  }

  function dragAim(point: Vec2): void {
    if (rules.snapshot().phase !== 'aiming') return;
    cannon.setAim(point);
    refreshTrajectory();
  }

  function cancelAim(): void {
    cannon.clearAim();
    trajectory = [];
  }

  function releaseAim(): boolean {
    const velocity = cannon.launchVelocity();
    if (!velocity) {
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
    return true;
  }

  function loadLevel(next: LoadedLevel): void {
    for (const body of adapter.snapshot()) adapter.removeBody(body.id);
    pigs.clear();
    level = next;
    cannon = createCannon({ origin: next.cannonOrigin, maxPull: next.maxPull, powerScale: next.powerScale, ammo: next.ammo });
    rules = createRules({ targetIds: next.targetIds, ammo: next.ammo });
    trajectory = [];
    buildLevel();
  }

  /** Rebuild the level from its data: physics, registry, cannon, rules (M9 does retries). */
  function restart(): void {
    rules.restart();
    cannon = createCannon({ origin: level.cannonOrigin, maxPull: level.maxPull, powerScale: level.powerScale, ammo: [...level.ammo] });
    adapter.clear();
    pigs.clear();
    settleSteps = 0;
    trajectory = [];
    pigCounter = 0;
    for (const body of level.bodies) adapter.addBody(body);
    bus.emit('levelLoaded', { levelId: level.def.name, name: level.def.name, ammo: level.ammo.length });
    bus.emit('phaseChanged', { phase: rules.snapshot().phase });
  }

  buildLevel();

  return {
    adapter,
    bus,
    entities,
    rules,
    cannon,
    step,
    frame: () => ({
      entities,
      aim: cannon.aim() ? { origin: cannon.config().origin, pull: cannon.aim()!.pull } : null,
      trajectory,
    }),
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
