import type { EntityState } from '../core/types.ts';
import type { Viewport } from '../camera/camera.ts';
import type { RenderFrame, Theme } from './theme.ts';

export interface Renderer {
  viewport(): Viewport;
  /** cssWidth/cssHeight are layout pixels; the backing store is scaled by dpr. */
  resize(cssWidth: number, cssHeight: number): void;
  setTheme(theme: Theme): void;
  draw(frame: RenderFrame, entities: EntityState[]): void;
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
): void {
  theme.paintBackground(ctx, viewport);

  const pos = frame.camera.position();
  const zoom = frame.camera.zoom();
  ctx.save();
  ctx.translate(viewport.width / 2, viewport.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-pos.x, -pos.y);
  for (const entity of entities) theme.paintEntity(ctx, entity, viewport);
  theme.paintOverlay(ctx, frame, viewport);
  ctx.restore();
}

export function createRenderer(canvas: HTMLCanvasElement, theme: Theme): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas has no 2d context');

  let viewport: Viewport = { width: canvas.clientWidth || canvas.width, height: canvas.clientHeight || canvas.height, dpr: 1 };
  let currentTheme = theme;

  return {
    viewport: () => viewport,
    resize(cssWidth, cssHeight) {
      const dpr = window.devicePixelRatio ?? 1;
      viewport = { width: cssWidth, height: cssHeight, dpr };
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    },
    setTheme(next) {
      currentTheme = next;
    },
    draw(frame, entities) {
      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      drawFrame(ctx, currentTheme, frame, entities, viewport);
    },
  };
}
