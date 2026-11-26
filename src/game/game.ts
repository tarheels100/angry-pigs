import type { PhysicsAdapter } from '../physics/adapter.ts';
import type { EventBus } from '../core/eventBus.ts';
import type { EntityRegistry } from '../core/entities.ts';
import type { GamePhase, TrajectorySample, Vec2, EntityState } from '../core/types.ts';
import type { LoadedLevel } from '../levels/index.ts';
import { createEntityRegistry } from '../core/entities.ts';
import { createCannon, type Cannon } from './cannon.ts';
import { createRules, type GameRules, type RulesSnapshot } from './rules.ts';
import { isPigTypeId, pigType, shotVelocities, type PigTypeSpec } from './pigs.ts';
import { materialSpec } from '../physics/materials.ts';

/** Composition root for gameplay: level + cannon + physics + rules. */

/** Tuning knobs from docs/tuning.md / docs/adr.md D15. */
const PIG_SPEED_EPS = 1.2;
const PIG_SLOW_STEPS = 45;
const SETTLE_TIMEOUT_STEPS = 240;
const TRAJECTORY_STEPS = 120;
// Pig size comes from the type registry (src/game/pigs.ts), not a constant here.
/** A release must drag at least this far from the cannon to count as a shot. */
const MIN_DRAG = 12;
/** Fraction of `energy / threshold` health that one impact spends (docs/tuning.md).
 * Below 1 so a single hit rarely erases a block: partial health is what makes tilt and
 * partial shatter visible. */
const DAMAGE_SCALE = 0.3;
/** Steps a level is simulated before the player gets control, so authored stacks are
 * resting and nothing starts partly damaged (docs/post-m13-notes.md). */
const SETTLE_WARMUP_STEPS = 90;
/** Steps a destroyed entity keeps a flashing silhouette after it leaves the world. */
const FLASH_STEPS = 10;
/** How fast the cannon recoil relaxes after a shot (presentation only, D28). A flash
 * of about 20 steps reads as a muzzle blink without lingering into the next shot. */
const RECOIL_DECAY = 0.05;

/** Velocity multiplier for blast push, matching the impact impulse convention (D33). */
const IMPULSE_SCALE = 0.02;
/** How far the waiting pig sits down the barrel, as a fraction of the pull (D28). */
const LOAD_DEPTH = 0.5;

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
  /** World y of the ground surface, for presentation effects (debris heaps, M16). */
  groundTop(): number;
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

  const pigs = new Map<string, { slowSteps: number; spec: PigTypeSpec }>();
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
  /** True only while a freshly built level is settling; impacts spend no health. */
  let damagePaused = false;
  /** 1 just after a shot, decaying to 0; drives the barrel recoil (D28). */
  let recoil = 0;

  /**
   * Simulate the authored world before play starts. Bodies authored a pixel apart
   * settle into rest during this window, and damage is suppressed so that settling
   * cannot chip a block's health before the player ever fires (notes: objects fell
   * slightly on first draw and started partly damaged).
   */
  function warmup(): void {
    damagePaused = true;
    for (let i = 0; i < SETTLE_WARMUP_STEPS; i++) adapter.step(1 / 60);
    damagePaused = false;
  }

  function buildLevel(): void {
    // Ammo ids are pig type ids (M18). A level naming an unknown type is a content
    // error, not a silent fallback: it throws at load so authored stages cannot ship a
    // pig that does nothing.
    for (const id of level.ammo) {
      if (!isPigTypeId(id)) throw new Error(`level "${level.def.name}" has unknown pig type: ${id}`);
    }
    for (const body of level.bodies) adapter.addBody(body);
    warmup();
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
    const aim = cannon.aim();
    const pull = aim ? Math.hypot(aim.pull.x, aim.pull.y) : 0;
    const list: EntityState[] = [
      {
        id: 'cannon', kind: 'cannon', shape: 'box', material: 'metal',
        x: origin.x, y: origin.y + 16, angle: 0, vx: 0, vy: 0,
        sleeping: true, destroyed: false, health: Infinity, impactEnergy: 0,
        halfWidth: 30, halfHeight: 14,
        variant: 'cannon',
        // Aim state the theme turns into a tilting barrel and a compressed spring.
        pull,
        aimAngle: aim ? Math.atan2(aim.direction.y, aim.direction.x) : 0,
        recoil,
      },
    ];
    if (canShoot()) {
      // The next pig rests in the barrel; while aiming it is drawn pulled back along
      // the pull, which is what the spring compression means visually.
      const depth = aim ? pull * LOAD_DEPTH : 0;
      const back = aim ? { x: -aim.direction.x, y: -aim.direction.y } : { x: 1, y: 0 };
      list.push({
        id: 'cannon-pig', kind: 'pig', shape: 'circle', material: 'light',
        x: origin.x + back.x * depth, y: origin.y + back.y * depth, angle: aim ? Math.atan2(aim.direction.y, aim.direction.x) : 0,
        vx: 0, vy: 0,
        sleeping: true, destroyed: false, health: Infinity, impactEnergy: 0,
        // The queued pig's shape follows its type: a heavy pig is bigger, a bomb is a
        // bomb, a cluster reads as three small ones (M18).
        radius: pigType(cannon.nextAmmo() ?? 'basic').radius,
        variant: pigType(cannon.nextAmmo() ?? 'basic').id,
      });
    }
    for (const prop of level.scenery) {
      // Art-only props: display extras, never bodies (docs/level-format.md).
      const extra: EntityState = {
        id: `scenery-${prop.kind}-${prop.x}`,
        kind: 'scenery',
        shape: prop.r !== undefined ? 'circle' : 'box',
        material: 'ground',
        x: prop.x, y: prop.y, angle: 0, vx: 0, vy: 0,
        sleeping: true, destroyed: false, health: Infinity, impactEnergy: 0,
        variant: prop.kind,
      };
      if (prop.r !== undefined) extra.radius = prop.r;
      else {
        extra.halfWidth = (prop.w ?? 0) / 2;
        extra.halfHeight = (prop.h ?? 0) / 2;
      }
      list.push(extra);
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
    if (damagePaused) return;
    // A heavy pig delivers more damage than a basic one for the same impact (M18).
    const pigId = adapter.state(aId)?.kind === 'pig' ? aId : adapter.state(bId)?.kind === 'pig' ? bId : null;
    const multiplier = pigId ? pigs.get(pigId)?.spec.damageMultiplier ?? 1 : 1;
    const delivered = energy * multiplier;
    for (const id of [aId, bId]) {
      const s = adapter.state(id);
      if (!s || s.destroyed || s.kind === 'pig' || s.kind === 'ground' || s.kind === 'wall') continue;
      const threshold = materialSpec(s.material).damageThreshold;
      if (delivered > threshold) adapter.applyDamage(id, (DAMAGE_SCALE * delivered) / threshold);
    }
  }

  /**
   * A bomb pig detonates on a solid hit against *structure* (M18): everything within
   * the blast radius is damaged and pushed, and the pig is consumed. Landing on the
   * ground or a wall is not a detonation, and a graze below the threshold behaves like
   * any other pig, so a bomb that lands softly does not erase the stage.
   */
  function detonate(pigId: string, spec: PigTypeSpec, energy: number, partnerKind: EntityState['kind']): boolean {
    if (damagePaused) return false;
    if (partnerKind !== 'block' && partnerKind !== 'bird') return false;
    const explosion = spec.explosion;
    if (!explosion || energy < explosion.threshold) return false;
    const s = adapter.state(pigId);
    if (!s) return false;
    // Blast damage follows the same conversion as impact damage (docs/adr.md D33), so the
    // authored recipe is a roughness number, not a literal health value.
    adapter.explode(
      { x: s.x, y: s.y },
      { radius: explosion.radius, impulse: explosion.impulse * IMPULSE_SCALE, damage: explosion.damage * DAMAGE_SCALE },
    );
    bus.emit('explosion', { x: s.x, y: s.y, radius: explosion.radius });
    consumePig(pigId, 'exploded');
    return true;
  }

  function consumePig(id: string, reason: 'settled' | 'outOfBounds' | 'timeout' | 'exploded'): void {
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
      // Detonation runs after damage so the blast is the last word on this impact.
      const bombId = adapter.state(impact.aId)?.kind === 'pig' ? impact.aId : adapter.state(impact.bId)?.kind === 'pig' ? impact.bId : null;
      if (bombId) {
        const spec = pigs.get(bombId)?.spec;
        const partner = bombId === impact.aId ? impact.bId : impact.aId;
        const kind = adapter.state(partner)?.kind ?? 'ground';
        if (spec) detonate(bombId, spec, impact.energy, kind);
      }
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
    // Recoil relaxes so the barrel returns to rest after a shot (presentation only).
    if (recoil > 0) recoil = Math.max(0, recoil - RECOIL_DECAY);
    refreshDisplay();
  }

  function refreshTrajectory(): void {
    const velocity = cannon.launchVelocity();
    trajectory = velocity
      ? adapter.simulateTrajectory(cannon.config().origin, velocity, TRAJECTORY_STEPS, pigType(cannon.nextAmmo() ?? 'basic').radius)
      : [];
  }

  function beginAim(): void {
    if (!canShoot()) return;
    // A press alone is not a shot: the pull starts at zero and only drags move it.
    aiming = true;
    cannon.clearAim();
    trajectory = [];
  }

  function dragAim(point: Vec2): void {
    if (!canShoot()) return;
    // Moves are reported only while a button is held (src/input/pointer.ts), so a
    // drag can re-open the gesture if restart()/loadLevel() closed it mid-drag.
    aiming = true;
    cannon.setAim(point);
    refreshTrajectory();
  }

  /** Whether the cannon may be aimed: aiming, or settling while debris comes to rest
   * (D26). A shot is refused during flight, after a win, and after a loss. */
  function canShoot(): boolean {
    const phase = rules.snapshot().phase;
    return (phase === 'aiming' || phase === 'settling') && cannon.ammoLeft() > 0;
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
    const phase = rules.snapshot().phase;
    if (phase !== 'aiming' && phase !== 'settling') {
      // Won, lost, or mid-flight: the shot is refused and the gesture is dropped.
      cancelAim();
      return false;
    }
    if (cannon.ammoLeft() === 0) {
      cancelAim();
      return false;
    }
    // One ammo slot, one shot: a cluster spends the slot to fire three pigs (M18).
    const spec = pigType(cannon.consumeAmmo() ?? 'basic');
    const origin = cannon.config().origin;
    const shots = shotVelocities(spec, velocity);
    const ids: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      const id = `pig-${++pigCounter}`;
      // Spread pigs stagger along the launch direction so they never overlap at spawn.
      const offset = i * spec.radius * 1.6;
      const norm = Math.hypot(velocity.x, velocity.y) || 1;
      adapter.addBody({
        id,
        kind: 'pig',
        shape: 'circle',
        material: 'light',
        x: origin.x + (velocity.x / norm) * offset,
        y: origin.y + (velocity.y / norm) * offset,
        radius: spec.radius,
        massScale: spec.massScale,
      });
      adapter.launch(id, shots[i]!);
      pigs.set(id, { slowSteps: 0, spec });
      entities.setVariant(id, spec.id);
      ids.push(id);
    }
    recoil = 1;
    rules.launch();
    flightSteps = 0;
    trajectory = [];
    bus.emit('launch', { id: ids[0]!, velocity });
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
    entities.clearVariants();
    recoil = 0;
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
    entities.clearVariants();
    recoil = 0;
    settleSteps = 0;
    trajectory = [];
    pigCounter = 0;
    for (const body of level.bodies) adapter.addBody(body);
    warmup();
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
    groundTop: () => level.groundTop,
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
