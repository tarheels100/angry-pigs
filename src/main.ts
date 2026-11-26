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
import { LEVELS, levelAt, loadLevel } from './levels/index.ts';

/**
 * Entry point and wiring (M7 vertical slice): level -> physics -> game -> renderer,
 * with pointer input mapped through the camera. Presentation state lives here; the
 * simulation never reads the DOM.
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

  const level = loadLevel(levelAt(0));
  const bounds = level.def.bounds;
  const bus = createEventBus();
  const adapter = createPhysicsAdapter({ width: bounds.width, height: bounds.height, gravityY: 1, frictionAir: 0.001 });
  const game = createGame({ level, adapter, bus });
  const hud = createHud(hudEl);
  const renderer = createRenderer(canvas, theme);

  let camera: CameraApi = createCamera(renderer.viewport(), bounds);

  function refit(): void {
    const cssWidth = Math.max(canvas!.clientWidth, 1);
    const cssHeight = Math.max(canvas!.clientHeight, 1);
    renderer.resize(cssWidth, cssHeight);
    camera = createCamera(renderer.viewport(), bounds);
    camera.setZoom(camera.fitZoom());
    camera.panTo(bounds.width / 2, bounds.height / 2);
  }

  refit();
  window.addEventListener('resize', refit);

  const pointer = createPointerSource(canvas);
  pointer.onDown(() => game.beginAim());
  pointer.onMove((p) => game.dragAim(camera.screenToWorld(p)));
  pointer.onUp(() => game.releaseAim());
  pointer.onCancel(() => game.cancelAim());

  hud.onRestart(() => {
    game.restart();
    hud.message(null);
  });

  bus.on('levelLoaded', (e) => hud.message(`${e.name} — ${e.ammo} pigs · drag to aim, release to fire`));
  bus.on('levelWon', (e) => hud.message(`stage cleared: ${e.levelId} (${e.score})`));
  bus.on('levelLost', (e) => hud.message(`stage failed: ${e.levelId}`));
  // The first levelLoaded fires during construction, before the HUD exists.
  hud.message(`${level.def.name} — ${level.ammo.length} pigs · drag to aim, release to fire`);

  // Dev-only theme cycling; the real selector arrives in M9/M12.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 't') return;
    const ids = listThemes();
    const next = ids[(ids.indexOf(theme.id) + 1) % ids.length]!;
    theme = getTheme(next);
    renderer.setTheme(theme);
  });

  const loop = createLoop({
    step: (dt) => game.step(dt),
    render: () => {
      const frame = game.frame();
      renderer.draw({ camera, phase: game.rules.snapshot().phase, aim: frame.aim ? { origin: frame.aim.origin, pull: frame.aim.pull, trajectory: frame.trajectory } : null }, frame.entities.all());
      hud.update(game.rules.snapshot());
    },
  });
  loop.start();

  console.log(`angry-pigs: slice running on ${LEVELS.length} level(s), themes: ${listThemes().join(', ')}`);
}
