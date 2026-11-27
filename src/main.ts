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
import { createScreens, bestLabel } from './ui/screens.ts';
import { loadOptions, saveOptions, type Options } from './ui/options.ts';
import { createParticleSystem } from './fx/particles.ts';
import { createTrail } from './fx/trail.ts';
import { createDebris } from './fx/debris.ts';
import { createSfx } from './audio/sfx.ts';
import { createMusicPlayer, type MusicPlayer } from './audio/playback.ts';
import { createSaveStore, memoryStore, type KeyValueStore } from './game/save.ts';
import { WORLD, LEVELS, levelAt, loadLevel } from './levels/index.ts';
import { pigType } from './game/pigs.ts';

/**
 * Entry point and wiring: level -> physics -> game -> renderer, with pointer input
 * mapped through the camera. Presentation state lives here; the simulation never
 * reads the DOM.
 */

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const hudEl = document.getElementById('hud') as HTMLElement | null;
const appEl = document.getElementById('app') as HTMLElement | null;

if (!canvas || !hudEl || !appEl) {
  console.error('angry-pigs: missing #stage, #hud or #app');
} else {
  // Themes are registered here; switching one is the M12 acceptance check.
  registerTheme(createTronTheme());
  registerTheme(createPlaceholderTheme());
  registerTheme(createPlaceholderTheme({ background: '#151a20', pig: '#7fd6a0', bird: '#ff8a5c' }, 'placeholder-dark'));
  // Second theme through the contract only (M12): no pipeline change was needed.
  registerTheme(createPixelTheme());

  const store = browserStore();
  // Player options (M19): persisted settings pick the theme, sound, and effects we start with.
  let options: Options = loadOptions(store);
  let theme: Theme = getTheme(listThemes().includes(options.themeId) ? options.themeId : 'tron');

  const bus = createEventBus();
  // The simulation world is fixed (D13); level bounds only change framing.
  const adapter = createPhysicsAdapter({ width: WORLD.width, height: WORLD.height, gravityY: 1, frictionAir: 0.001 });
  const renderer = createRenderer(canvas, theme);
  const hud = createHud(hudEl);
  let camera: CameraApi = createCamera(renderer.viewport(), WORLD);

  /** Paint one frame. Assigned once the systems exist; `refit` and the paused title screen
   * both need it, because resizing clears the canvas and a paused loop repaints nothing. */
  let repaint: (() => void) | null = null;

  function refit(): void {
    const cssWidth = Math.max(canvas!.clientWidth, 1);
    const cssHeight = Math.max(canvas!.clientHeight, 1);
    renderer.resize(cssWidth, cssHeight);
    // Re-create so the viewport change is applied, then re-frame the current level.
    camera = createCamera(renderer.viewport(), camera.world());
    camera.setZoom(camera.fitZoom());
    camera.panTo(camera.world().width / 2, camera.world().height / 2);
    repaint?.();
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

  function hudBest(record: { stars: number; score: number } | null): string | null {
    return record ? bestLabel(record) : null;
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
    hud.setBest(hudBest(save.best(e.levelId)));
    hud.message(`${e.name} — ${e.ammo} pigs · drag to aim, release to fire`);
  });

  bus.on('levelWon', (e) => {
    const best = save.record(e.levelId, { score: e.score, stars: e.stars, launches: game.rules.snapshot().launches });
    hud.setBest(hudBest(best));
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
  /** Generated per-stage soundtrack (M22): composed from the level, played by Tone's
   * transport. Silent until a pointer gesture unlocks audio, and a started track begins at
   * Tone's current position, so a paused menu never queues a burst (docs/adr.md D40). */
  const music = createMusicPlayer({ getContext: () => sfx.unlock() });
  sfx.attach(bus);

  /** Name the stage, its track if music is on, and how to fire (M17, playtest item 2). */
  function announceTrack(levelId: string, ammo: number): void {
    const track = options.music ? music.trackName() : null;
    hud.message(
      `${levelId} · ${track ?? (options.music ? 'no sound' : 'music off')} · ${ammo} pigs · drag to aim, release to fire · Esc menu`,
    );
  }
  // Registered after the game is built, so the first stage is announced explicitly.
  // Narrow read-only seam for browser tests (docs/browser-testing.md); nothing in the
  // game reads it, and it exposes no setters beyond the game's own API.
  const debug = window as unknown as {
    __game?: unknown;
    /** Live camera view, read through closures: `refit` re-creates the camera on resize. */
    __camera?: {
      zoom: () => number;
      world: () => { width: number; height: number };
      worldToScreen: (p: { x: number; y: number }) => { x: number; y: number };
      screenToWorld: (p: { x: number; y: number }) => { x: number; y: number };
    };
    /** CSS size of the canvas box, so browser tests can assert the layout fills the window. */
    __viewport?: () => { cssWidth: number; cssHeight: number };
    __trail?: unknown;
    __debris?: unknown;
    __music?: unknown;
    /** Blasts observed since load; the browser test asserts a bomb actually detonated. */
    __explosions?: number;
    /** Current persisted options, read as a snapshot (M19). */
    __options?: () => Options;
    /** Simulation steps taken since load; used by browser probes and tests.
     * Tells "the loop is not stepping" apart from "stepping, nothing moving". */
    __steps?: () => number;
  };

  bus.on('levelLoaded', (e) => {
    // Soundtrack wiring lives here, not in the event handler chain: the option decides
    // whether a track runs at all (playtest item 2).
    if (options.music) music.start(e.levelId);
    else music.stop();
    announceTrack(e.levelId, e.ammo);
  });

  bus.on('impact', (e) => {
    const at = game.entities.get(e.aId) ?? game.entities.get(e.bId);
    if (at) particles.spawnBurst({ x: at.x, y: at.y }, theme.palette.outline, Math.min(8, 2 + Math.round(e.energy / 60)), 180);
    camera.shake(Math.min(0.6, e.energy / 300));
  });

  bus.on('explosion', (e) => {
    // A blast gets a wider burst and a harder shake than an ordinary impact (M18).
    // The counter is exposed for browser tests: a bomb must actually detonate.
    debug.__explosions = (debug.__explosions ?? 0) + 1;
    particles.spawnBurst({ x: e.x, y: e.y }, theme.palette.flash, 26, e.radius * 2.2);
    camera.shake(1);
    if (options.debris) {
      debris.spawnFrom(
        { id: 'blast', kind: 'block', shape: 'box', material: 'glass', x: e.x, y: e.y, angle: 0, vx: 0, vy: 0, sleeping: false, destroyed: true, health: 0, impactEnergy: 0, halfWidth: e.radius / 3, halfHeight: e.radius / 3 },
        8,
        e.radius,
      );
    }
  });

  bus.on('destroyed', (e) => {
    const at = game.entities.get(e.id);
    if (at) {
      particles.spawnBurst({ x: at.x, y: at.y }, theme.palette.flash, 14, 300);
      // Crumble: fragment count follows the block's size, spread follows its width.
      const span = (at.halfWidth ?? at.radius ?? 12) * 2;
      if (options.debris) debris.spawnFrom(at, Math.min(8, 3 + Math.round(span / 20)), span);
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

  // Title + options overlays (M19). DOM chrome, not canvas: the theme contract has no
  // notion of a menu. While a menu is open the loop is stopped, so an overlay can never
  // step physics (docs/adr.md D35).
  function applyOptions(next: Options): void {
    options = next;
    saveOptions(store, options);
    // An id that is no longer registered (a theme removed in a later build) falls back.
    const themeId = listThemes().includes(options.themeId) ? options.themeId : 'tron';
    theme = getTheme(themeId);
    renderer.setTheme(theme);
    sfx.setMuted(!options.sound);
    // The soundtrack is off unless the player turns it on (playtest item 2): the M17
    // generator stays available, but it must not run by default.
    if (options.music) {
      music.start(levelAt(levelIndex).name);
      // The HUD names the track, so turning the option on says so in the same place a
      // level load says it.
      announceTrack(levelAt(levelIndex).name, game.rules.snapshot().ammoLeft);
    } else music.stop();
    // Turning an effect off also removes what is already on screen.
    if (!options.trail) trail.reset();
    if (!options.debris) debris.clear();
  }

  const screens = createScreens(appEl, {
    stages: () => LEVELS.map((def, index) => ({ index, name: def.name, best: save.best(def.name) })),
    themes: () => listThemes().map((id) => ({ id, name: getTheme(id).name })),
    options: () => options,
    pickStage: (index) => {
      loadLevelIndex(index);
      closeOverlay();
    },
    changeOptions: (next) => {
      applyOptions(next);
      screens.showOptions();
    },
    resetBest: () => {
      save.clear(LEVELS.map((def) => def.name));
      hud.setBest(null);
      hud.message('best scores forgotten');
      screens.showTitle();
    },
    // Closing the overlay hands control back to the game: the loop has to resume or the
    // round stays paused with the menu gone (playtest item 8). Overlay buttons route
    // through this callback; the keyboard path calls closeOverlay() directly.
    onClose: () => {
      hud.message(null);
      loop.start();
    },
  });

  function openOverlay(kind: 'title' | 'options'): void {
    loop.stop();
    if (kind === 'title') screens.showTitle();
    else screens.showOptions();
  }

  function closeOverlay(): void {
    screens.hide();
    loop.start();
  }

  hud.onMenu(() => openOverlay('title'));

  window.addEventListener('wheel', (e) => {
    // Wheel zooms; aiming stays pointer-driven so zoom cannot change a pull.
    camera.zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 't': {
        const ids = listThemes();
        const next = ids[(ids.indexOf(options.themeId) + 1) % ids.length]!;
        applyOptions({ ...options, themeId: next });
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
        // M for music: the soundtrack is the one effect a player wants to opt into (item 2).
        sfx.unlock();
        applyOptions({ ...options, music: !options.music });
        hud.message(options.music ? 'music: on' : 'music: off');
        break;
      case 'Escape':
        // The menu is the way out of a stage you cannot clear; Esc also closes it.
        if (screens.openKind() !== null) closeOverlay();
        else openOverlay('title');
        break;
      case 'o':
        openOverlay(screens.openKind() === 'options' ? 'title' : 'options');
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6': {
        const index = Number(e.key) - 1;
        if (index < LEVELS.length) {
          loadLevelIndex(index);
          if (screens.openKind() !== null) closeOverlay();
        }
        break;
      }
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

  function drawFrame(): void {
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
          ...(options.trail ? [{ paint: (ctx: CanvasRenderingContext2D) => trail.paint(ctx, pigColour) }] : []),
          ...(options.debris ? [{ paint: (ctx: CanvasRenderingContext2D) => debris.paint(ctx, theme.palette.materials) }] : []),
        ],
        front: [particles],
      },
    );
    hud.update(game.rules.snapshot());
    // The launcher's queue names the next pig, so a bomb or cluster is not a surprise.
    hud.setNextPig(game.cannon.ammoLeft() > 0 ? pigType(game.cannon.nextAmmo() ?? 'basic').label : null);
  }

  const loop = createLoop({
    step: (dt) => {
      game.step(dt);
      camera.follow(followTarget(), dt);
      camera.update(dt);
      particles.update(dt);
      // Trail ages by fixed step, so a recorded run replays identically. Off means the
      // system is neither updated nor painted (M19).
      if (options.trail) trail.update(game.entities.all());
      if (options.debris) debris.update();
    },
    render: (dt) => {
      lastFps = dt > 0 ? 1 / dt : 0;
      drawFrame();
    },
  });
  loop.start();
  repaint = drawFrame;
  // Paint immediately: the title screen opens right after this and pauses the loop, so the
  // frozen frame has to be on the canvas already (playtest item 1).
  drawFrame();
  // Announce the first stage after the loop exists; the track itself starts on Tone's clock.
  if (options.music) music.start(levelAt(levelIndex).name);
  announceTrack(levelAt(levelIndex).name, game.rules.snapshot().ammoLeft);

  // Playtest item 1: the game opens on the title screen. This runs after the loop exists,
  // so opening the overlay really pauses it; the player dismisses the menu to play.
  openOverlay('title');

  // Narrow read-only seam for browser tests (docs/browser-testing.md); nothing in the
  // game reads it, and it exposes no setters beyond the game's own API.
  debug.__game = game;
  // The camera object is re-created on every resize (refit), so the seam reads the *live*
  // camera through closures rather than handing out the instance captured at load.
  debug.__camera = {
    zoom: () => camera.zoom(),
    world: () => camera.world(),
    worldToScreen: (p: { x: number; y: number }) => camera.worldToScreen(p),
    screenToWorld: (p: { x: number; y: number }) => camera.screenToWorld(p),
  };
  debug.__viewport = () => ({ cssWidth: canvas!.clientWidth, cssHeight: canvas!.clientHeight });
  // Read-only so browser tests can assert a flight leaves a trail (M15).
  debug.__trail = trail;
  // Same seam for debris heaps (M16).
  debug.__debris = debris;
  // Same seam for the generated soundtrack (M17): the HUD and tests read the track name.
  debug.__music = music;
  // Steps taken, so a browser probe can tell "not stepping" from "stepping, nothing moving".
  debug.__steps = () => loop.stepsTaken();
  // Options are asserted across a reload by the browser test (M19).
  debug.__options = () => options;

  console.log(`angry-pigs: ${LEVELS.length} level(s), themes: ${listThemes().join(', ')}`);
}
