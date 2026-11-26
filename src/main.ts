import { createPhysicsAdapter } from './physics/adapter.ts';
import { createEventBus } from './core/eventBus.ts';
import { createLoop } from './core/loop.ts';
import { createCamera, type CameraApi } from './camera/camera.ts';
import { createRenderer } from './render/renderer.ts';
import { registerTheme, getTheme, listThemes, type Theme } from './render/theme.ts';
import { createPlaceholderTheme } from './render/themes/placeholder.ts';
import { createPointerSource } from './input/pointer.ts';
import { createGame } from './game/game.ts';
import { createHud } from './ui/hud.ts';
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
  registerTheme(createPlaceholderTheme());
  registerTheme(createPlaceholderTheme({ background: '#151a20', pig: '#7fd6a0', bird: '#ff8a5c' }, 'placeholder-dark'));
  let theme: Theme = getTheme('placeholder');

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
    hud.message(`${e.name} — ${e.ammo} pigs · drag to aim, release to fire`);
  });

  bus.on('levelWon', (e) => {
    hud.message(`stage cleared: ${e.levelId} · ${e.score} · ${e.stars} stars`);
    if (levelIndex + 1 < LEVELS.length) {
      advanceTimer = window.setTimeout(() => loadLevelIndex(levelIndex + 1), 1400);
    } else {
      hud.message(`all stages cleared · ${e.score} · press R to replay`);
    }
  });

  bus.on('levelLost', (e) => hud.message(`stage failed: ${e.levelId} · press R to restart`));

  const game = createGame({ level: loadLevel(levelAt(0)), adapter, bus });
  hud.setLevel(levelLabel(0));

  const pointer = createPointerSource(canvas);
  pointer.onDown(() => game.beginAim());
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
    }
  });

  /** Track the projectile while it flies; return to the level centre otherwise. */
  function followTarget(): { x: number; y: number } | null {
    if (game.rules.snapshot().phase !== 'in_flight') return null;
    const pig = game.entities.byKind('pig')[0];
    return pig ? { x: pig.x, y: pig.y } : null;
  }

  const loop = createLoop({
    step: (dt) => {
      game.step(dt);
      camera.follow(followTarget(), dt);
    },
    render: () => {
      const frame = game.frame();
      renderer.draw(
        {
          camera,
          phase: game.rules.snapshot().phase,
          aim: frame.aim ? { origin: frame.aim.origin, pull: frame.aim.pull, trajectory: frame.trajectory } : null,
        },
        frame.entities.all(),
      );
      hud.update(game.rules.snapshot());
    },
  });
  loop.start();

  // Narrow read-only seam for browser tests (docs/browser-testing.md); nothing in the
  // game reads it, and it exposes no setters beyond the game's own API.
  (window as unknown as { __game: unknown }).__game = game;
  (window as unknown as { __camera: unknown }).__camera = camera;

  console.log(`angry-pigs: ${LEVELS.length} level(s), themes: ${listThemes().join(', ')}`);
}
