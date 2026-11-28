import { createPhysicsAdapter } from '../src/physics/adapter.ts';
import { createEventBus } from '../src/core/eventBus.ts';
import { createGame } from '../src/game/game.ts';
import { loadLevel, type LevelDef } from '../src/levels/index.ts';
import { GROUND_TOP, bird, standing, stackUp } from '../src/levels/pieces.ts';

/**
 * Blast probe (M23). The complaint: "the exploding pig doesn't blast level objects away".
 * This measures what a detonation actually does to *surviving* bodies — how far they move
 * from where they were authored — rather than only whether they died.
 *
 *   node scratch/blast-probe.ts
 *
 * The synthetic stage is two glass columns with a bird between them, a wood stack inside
 * the blast radius that should survive *and move*, and two bodies past the radius that
 * must not move at all.
 */
const DT = 1 / 60;

const LEVEL: LevelDef = {
  name: 'blast-probe',
  bounds: { width: 2200, height: 900 },
  cannon: { x: 120, y: 700, maxPull: 90, powerScale: 0.3, ammo: ['bomb', 'bomb'] },
  statics: [{ type: 'ground', x: 1100, y: 860, w: 2200, h: 40 }],
  objects: [
    // The column the bomb lands on, so a flat shot hits breakable material and detonates
    // (docs/adr.md D34). Everything else is placed relative to that point.
    standing(980, 'glass', 30, 160),
    // Heavy and light bodies *inside* the blast radius: stone must move less than glass,
    // and a wood stack must survive (wood is tougher) while still being shoved.
    standing(1030, 'stone', 40, 120),
    ...stackUp(1090, [{ material: 'wood', w: 40, h: 90 }, { material: 'wood', w: 40, h: 90 }]).blocks,
    // Bodies past the radius must stay exactly where they are: the blast's reach is the
    // difficulty control (docs/level-format.md rule 9).
    standing(1180, 'glass', 30, 120),
    standing(1300, 'wood', 40, 120),
  ],
  targets: [bird(900, 20, GROUND_TOP), bird(1240, 20, GROUND_TOP)],
};

const loaded = loadLevel(LEVEL);
const adapter = createPhysicsAdapter({ width: loaded.def.bounds.width, height: loaded.def.bounds.height, gravityY: 1, frictionAir: 0.001 });
const bus = createEventBus();
const game = createGame({ level: loaded, adapter, bus });

// Where every dynamic body starts, after the load warmup has settled it.
const start = new Map<string, { x: number; y: number }>();
for (const e of adapter.snapshot()) {
  if (e.kind === 'block' || e.kind === 'bird') start.set(e.id, { x: e.x, y: e.y });
}

let blasts: Array<{ x: number; y: number; radius: number }> = [];
bus.on('explosion', (e) => blasts.push(e));
let died = 0;
bus.on('destroyed', () => died++);
/** Fastest any body moved in the 40 steps after the blast, i.e. the shove it received. */
let peakSpeed = 0;
function observe(steps: number): void {
  for (let i = 0; i < steps; i++) {
    game.step(DT);
    if (blasts.length && i < 40) {
      for (const e of adapter.snapshot()) peakSpeed = Math.max(peakSpeed, Math.hypot(e.vx, e.vy));
    }
  }
}

// Flat full pull: measured to land around x 944 at powerScale 0.3 (docs/tuning.md).
game.beginAim();
game.dragAim({ x: loaded.cannonOrigin.x - 90, y: loaded.cannonOrigin.y });
game.releaseAim();
observe(300);
while (game.rules.snapshot().phase === 'settling') observe(60);

console.log(`detonations: ${blasts.length}${blasts.length ? ` at x=${blasts[0]!.x.toFixed(0)} y=${blasts[0]!.y.toFixed(0)} r=${blasts[0]!.radius}` : ''}`);
console.log(`destroyed: ${died}, birds left: ${game.entities.byKind('bird').length}`);
console.log('surviving bodies, distance moved from the authored position:');
const moved: number[] = [];
for (const e of adapter.snapshot()) {
  if (e.kind !== 'block' && e.kind !== 'bird') continue;
  const s = start.get(e.id);
  if (!s) continue;
  const d = Math.hypot(e.x - s.x, e.y - s.y);
  moved.push(d);
  const fromBlast = blasts.length ? Math.hypot(s.x - blasts[0]!.x, s.y - blasts[0]!.y) : Infinity;
  console.log(`  ${e.id} ${e.material}: dist-from-blast ${fromBlast.toFixed(0)}, moved ${d.toFixed(0)} units`);
}
console.log(`survivors: ${moved.length}, max moved ${Math.max(0, ...moved).toFixed(0)}, mean moved ${(moved.reduce((a, b) => a + b, 0) / Math.max(1, moved.length)).toFixed(0)}`);
console.log(`peak speed in the 40 steps after detonation: ${peakSpeed.toFixed(2)} units/step (a full-pull pig flies at ~27)`);
