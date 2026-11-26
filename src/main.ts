import { createPhysicsAdapter } from './physics/adapter.ts';
import { createEventBus } from './core/eventBus.ts';
import { createLoop } from './core/loop.ts';
import { createCamera, type CameraApi } from './camera/camera.ts';
import { createRenderer } from './render/renderer.ts';
import { registerTheme, getTheme, listThemes, type Theme } from './render/theme.ts';
import { createPlaceholderTheme } from './render/themes/placeholder.ts';
import { createTronTheme } from './render/themes/tron.ts';
import { createPixelTheme } from './render/themes/pixel.ts';
import { createPointerSource } from './input/pointer.ts';
import { createGame } from './game/game.ts';
import { createHud } from './ui/hud.ts';
import { createParticleSystem } from './fx/particles.ts';
import { createTrail } from './fx/trail.ts';
import { createDebris } from './fx/debris.ts';
import { createSfx } from './audio/sfx.ts';
import { createSaveStore, memoryStore, type KeyValueStore } from './game/save.ts';
import { WORLD, LEVELS, levelAt, loadLevel } from './levels/index.ts';

/**
 * Entry point and wiring: level -> physics -> game -> renderer, with pointer input
 * mapped through the camera. Presentation state lives here; the simulation never
 * reads the DOM.
 */

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const hudEl = document.getElementById('hud') as HTMLElement | null;

if (!canvas || !hudEl) {
  console.error('angry-pigs: missing #stage or #hud');
} else {
  // Themes are registered here; switching one is the M12 acceptance check.
  registerTheme(createTronTheme());
  registerTheme(createPlaceholderTheme());
  registerTheme(createPlaceholderTheme({ background: '#151a20', pig: '#7fd6a0', bird: '#ff8a5c' }, 'placeholder-dark'));
  // Second theme through the contract only (M12): no pipeline change was needed.
  registerTheme(createPixelTheme());
  // Tron is the product look (M10); the placeholders stay selectable for contract checks.
  let theme: Theme = getTheme('tron');

  const bus = createEventBus();
  // The simulation world is fixed (D13); level bounds only change framing.
  const adapter = createPhysicsAdapter({ width: WORLD.width, height: WORLD.height, gravityY: 1, frictionAir: 0.001 });
  const renderer = createRenderer(canvas, theme);
  const hud = createHud(hudEl);
  let camera: CameraApi = createCamera(renderer.viewport(), WORLD);

  function refit(): void {
    const cssWidth = Math.max(canvas!.clientWidth, 1);
    const cssHeight = Math.max(canvas!.clientHeight, 1);
    renderer.resize(cssWidth, cssHeight);
    // Re-create so the viewport change is applied, then re-frame the current level.
    camera = createCamera(renderer.viewport(), camera.world());
    camera.setZoom(camera.fitZoom());
    camera.panTo(camera.world().width / 2, camera.world().height / 2);
  }

  refit();
  window.addEventListener('resize', refit);

  let levelIndex = 0;
  /** Set when a cleared stage should advance; the timer is cleared by manual actions. */
  let advanceTimer: number | null = null;

  /** Best-result persistence (docs/adr.md D24). `localStorage` when the browser offers
   * it and tolerates a probe write; otherwise in-memory so the game still runs. */
  const save = createSaveStore(browserStore());

  function browserStore(): KeyValueStore {
    const storage = (window as unknown as { localStorage?: Storage }).localStorage;
    if (!storage) return memoryStore();
    const probe = 'angry-pigs:probe';
    try {
      storage.setItem(probe, '1');
      storage.removeItem(probe);
    } catch {
      return memoryStore();
    }
    return {
      get: (key) => storage.getItem(key),
      set: (key, value) => storage.setItem(key, value),
      remove: (key) => storage.removeItem(key),
    };
  }

  function bestLabel(record: { stars: number; score: number } | null): string {
    return record ? `best ${'★'.repeat(record.stars)} ${record.score}` : '';
  }

  function levelLabel(index: number): string {
    return `stage ${index + 1}/${LEVELS.length}`;
  }

  function loadLevelIndex(index: number): void {
    if (advanceTimer !== null) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
    levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    game.loadLevel(loadLevel(levelAt(levelIndex)));
    hud.setLevel(levelLabel(levelIndex));
  }

  // Subscribe before constructing the game, so the first level's load event is seen.
  bus.on('levelLoaded', (e) => {
    camera.setWorld(e.bounds);
    camera.setZoom(camera.fitZoom());
    hud.setBest(bestLabel(save.best(e.levelId)));
    hud.message(`${e.name} — ${e.ammo} pigs · drag to aim, release to fire`);
  });

  bus.on('levelWon', (e) => {
    const best = save.record(e.levelId, { score: e.score, stars: e.stars, launches: game.rules.snapshot().launches });
    hud.setBest(bestLabel(best));
    hud.message(`stage cleared: ${e.levelId} · ${e.score} · ${e.stars} stars · best ${best.score}`);
    if (levelIndex + 1 < LEVELS.length) {
      advanceTimer = window.setTimeout(() => loadLevelIndex(levelIndex + 1), 1400);
    } else {
      hud.message(`all stages cleared · ${e.score} · press R to replay`);
    }
  });

  bus.on('levelLost', (e) => hud.message(`stage failed: ${e.levelId} · press R to restart`));

  const game = createGame({ level: loadLevel(levelAt(0)), adapter, bus });
  hud.setLevel(levelLabel(0));

  // Presentation effects (M11). They subscribe to the same events the HUD does and
  // never touch the simulation.
  const particles = createParticleSystem();
  /** The flying pig's recent path, painted behind entities (M15). */
  const trail = createTrail();
  /** Fragments of destroyed blocks: they fall, pile on the ground, and fade (M16). */
  const debris = createDebris({ groundTop: game.groundTop() });
  const sfx = createSfx();
  sfx.attach(bus);

  bus.on('impact', (e) => {
    const at = game.entities.get(e.aId) ?? game.entities.get(e.bId);
    if (at) particles.spawnBurst({ x: at.x, y: at.y }, theme.palette.outline, Math.min(8, 2 + Math.round(e.energy / 60)), 180);
    camera.shake(Math.min(0.6, e.energy / 300));
  });

  bus.on('destroyed', (e) => {
    const at = game.entities.get(e.id);
    if (at) {
      particles.spawnBurst({ x: at.x, y: at.y }, theme.palette.flash, 14, 300);
      // Crumble: fragment count follows the block's size, spread follows its width.
      const span = (at.halfWidth ?? at.radius ?? 12) * 2;
      debris.spawnFrom(at, Math.min(8, 3 + Math.round(span / 20)), span);
    }
    camera.shake(0.45);
  });

  bus.on('launch', () => {
    particles.spawnBurst(game.cannon.config().origin, theme.palette.pig, 10, 220);
    camera.shake(0.3);
  });

  bus.on('levelLoaded', () => {
    particles.clear();
    trail.reset();
    // A new stage starts with a clean floor; the heap belongs to the stage that made it.
    debris.clear();
  });

  const pointer = createPointerSource(canvas);
  pointer.onDown(() => {
    // Audio needs a user gesture; the first press is the natural unlock point.
    sfx.unlock();
    game.beginAim();
  });
  pointer.onMove((p) => game.dragAim(camera.screenToWorld(p)));
  pointer.onUp(() => game.releaseAim());
  pointer.onCancel(() => game.cancelAim());

  hud.onRestart(() => {
    game.restart();
    hud.message(null);
  });

  window.addEventListener('wheel', (e) => {
    // Wheel zooms; aiming stays pointer-driven so zoom cannot change a pull.
    camera.zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 't': {
        const ids = listThemes();
        const next = ids[(ids.indexOf(theme.id) + 1) % ids.length]!;
        theme = getTheme(next);
        renderer.setTheme(theme);
        hud.message(`theme: ${theme.name}`);
        break;
      }
      case 'r':
        game.restart();
        hud.message(null);
        break;
      case 'n':
        loadLevelIndex(levelIndex + 1);
        break;
      case 'p':
        loadLevelIndex(levelIndex - 1);
        break;
      case 'm':
        sfx.unlock();
        sfx.setMuted(!sfx.muted());
        hud.message(sfx.muted() ? 'sound: off' : 'sound: on');
        break;
      case 'F2':
        renderer.setDebug(!renderer.debugEnabled(), () => ({ fps: lastFps, steps: loop.stepsTaken(), elapsed: performance.now() / 1000 }));
        break;
    }
  });

  /** Track the projectile while it flies; return to the level centre otherwise. */
  function followTarget(): { x: number; y: number } | null {
    if (game.rules.snapshot().phase !== 'in_flight') return null;
    const pig = game.entities.byKind('pig')[0];
    return pig ? { x: pig.x, y: pig.y } : null;
  }

  let lastFps = 0;

  const loop = createLoop({
    step: (dt) => {
      game.step(dt);
      camera.follow(followTarget(), dt);
      camera.update(dt);
      particles.update(dt);
      // Trail ages by fixed step, so a recorded run replays identically.
      trail.update(game.entities.all());
      debris.update();
    },
    render: (dt) => {
      lastFps = dt > 0 ? 1 / dt : 0;
      const frame = game.frame();
      const pigColour = theme.palette.pig;
      renderer.draw(
        {
          camera,
          phase: game.rules.snapshot().phase,
          aim: frame.aim ? { origin: frame.aim.origin, pull: frame.aim.pull, trajectory: frame.trajectory } : null,
        },
        frame.entities.all(),
        {
          // Trail and debris sit behind entities; particles and flashes sit above them.
          behind: [
            { paint: (ctx: CanvasRenderingContext2D) => trail.paint(ctx, pigColour) },
            { paint: (ctx: CanvasRenderingContext2D) => debris.paint(ctx, theme.palette.materials) },
          ],
          front: [particles],
        },
      );
      hud.update(game.rules.snapshot());
    },
  });
  loop.start();

  // Narrow read-only seam for browser tests (docs/browser-testing.md); nothing in the
  // game reads it, and it exposes no setters beyond the game's own API.
  (window as unknown as { __game: unknown }).__game = game;
  (window as unknown as { __camera: unknown }).__camera = camera;
  // Read-only so browser tests can assert a flight leaves a trail (M15).
  (window as unknown as { __trail: unknown }).__trail = trail;
  // Same seam for debris heaps (M16).
  (window as unknown as { __debris: unknown }).__debris = debris;

  console.log(`angry-pigs: ${LEVELS.length} level(s), themes: ${listThemes().join(', ')}`);
}
