import type { EntityState } from '../core/types.ts';
import type { Viewport } from '../camera/camera.ts';
import type { RenderFrame, Theme } from './theme.ts';

/** A world-space layer painted by presentation (trail, debris, particles). */
export interface PaintLayer {
  paint(ctx: CanvasRenderingContext2D): void;
}

/** Where a layer sits in the draw order: behind entities, or above them. */
export interface RenderLayers {
  behind?: PaintLayer[];
  front?: PaintLayer[];
}

export interface Renderer {
  viewport(): Viewport;
  /** cssWidth/cssHeight are layout pixels; the backing store is scaled by dpr. */
  resize(cssWidth: number, cssHeight: number): void;
  setTheme(theme: Theme): void;
  /** Dev diagnostics (F2): entity bounds, ids, and loop counters. Theme-independent. */
  setDebug(enabled: boolean, stats?: () => DebugStats): void;
  debugEnabled(): boolean;
  /** Layers draw in world space: `behind` before entities, `front` after (M15/M16). */
  draw(frame: RenderFrame, entities: EntityState[], layers?: RenderLayers): void;
}

export interface DebugStats {
  fps: number;
  steps: number;
  /** Seconds since the page started; diagnostics only. */
  elapsed: number;
}

/**
 * Theme-independent draw order: background (screen space), then camera transform,
 * then entities and overlay in world space. Themes never touch the transform, so
 * swapping a theme cannot change framing (docs/theme-contract.md).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  frame: RenderFrame,
  entities: EntityState[],
  viewport: Viewport,
  debug?: { enabled: boolean; stats: () => DebugStats },
  layers: RenderLayers = {},
): void {
  theme.paintBackground(ctx, viewport);

  const pos = frame.camera.position();
  const zoom = frame.camera.zoom();
  const shake = frame.camera.shakeOffset();
  ctx.save();
  ctx.translate(viewport.width / 2 + shake.x, viewport.height / 2 + shake.y);
  ctx.scale(zoom, zoom);
  ctx.translate(-pos.x, -pos.y);
  for (const layer of layers.behind ?? []) layer.paint(ctx);
  for (const entity of entities) theme.paintEntity(ctx, entity, viewport);
  theme.paintOverlay(ctx, frame, viewport);
  for (const layer of layers.front ?? []) layer.paint(ctx);
  ctx.restore();

  if (debug?.enabled) paintDebug(ctx, frame, entities, viewport, debug.stats());
}

/** Dev overlay (docs/checklist.md F2). Drawn in screen space after the camera
 * transform is restored, so diagnostics stay readable at any zoom. */
function paintDebug(ctx: CanvasRenderingContext2D, frame: RenderFrame, entities: EntityState[], viewport: Viewport, stats: DebugStats): void {
  ctx.save();
  ctx.strokeStyle = '#00ffa3';
  ctx.lineWidth = 1;
  ctx.setLineDash?.([4, 4]);
  ctx.font = '12px monospace';
  for (const entity of entities) {
    const p = frame.camera.worldToScreen(entity);
    const hw = (entity.halfWidth ?? entity.radius ?? 16) * frame.camera.zoom();
    const hh = (entity.halfHeight ?? entity.radius ?? 16) * frame.camera.zoom();
    ctx.strokeRect(p.x - hw, p.y - hh, hw * 2, hh * 2);
    ctx.fillStyle = '#00ffa3';
    ctx.fillText(entity.id, p.x - hw, p.y - hh - 3);
  }
  ctx.setLineDash?.([]);

  const lines = [
    `fps ${stats.fps.toFixed(1)}  steps ${stats.steps}  t ${stats.elapsed.toFixed(1)}s`,
    `phase ${frame.phase}  camera ${frame.camera.position().x.toFixed(0)},${frame.camera.position().y.toFixed(0)} zoom ${frame.camera.zoom().toFixed(2)}`,
    `entities ${entities.length}  pigs ${entities.filter((e) => e.kind === 'pig').length}  birds ${entities.filter((e) => e.kind === 'bird').length}`,
  ];
  ctx.fillStyle = 'rgba(4, 8, 12, 0.75)';
  ctx.fillRect(8, 8, 320, 58);
  ctx.fillStyle = '#a8f7ff';
  lines.forEach((line, i) => ctx.fillText(line, 14, 24 + i * 16));
  ctx.restore();
}

export function createRenderer(canvas: HTMLCanvasElement, theme: Theme): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas has no 2d context');

  let viewport: Viewport = { width: canvas.clientWidth || canvas.width, height: canvas.clientHeight || canvas.height, dpr: 1 };
  let currentTheme = theme;
  let debugEnabled = false;
  let debugStats: () => DebugStats = () => ({ fps: 0, steps: 0, elapsed: 0 });

  return {
    viewport: () => viewport,
    resize(cssWidth, cssHeight) {
      const dpr = window.devicePixelRatio ?? 1;
      viewport = { width: cssWidth, height: cssHeight, dpr };
      // Only the backing store is set here. The canvas box is CSS-owned (`width: 100%`,
      // `height: calc(100vh - 56px)`); pinning inline styles froze the stage at the size the
      // page loaded with, so a resized or portrait window never reframed the level.
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    },
    setTheme(next) {
      currentTheme = next;
    },
    setDebug(enabled, stats) {
      debugEnabled = enabled;
      if (stats) debugStats = stats;
    },
    debugEnabled: () => debugEnabled,
    draw(frame, entities, layers) {
      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      drawFrame(ctx, currentTheme, frame, entities, viewport, { enabled: debugEnabled, stats: debugStats }, layers);
    },
  };
}
