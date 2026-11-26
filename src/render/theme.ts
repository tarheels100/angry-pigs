import type { EntityState, GamePhase, MaterialId, Vec2 } from '../core/types.ts';
import type { TrajectorySample } from '../physics/adapter.ts';
import type { CameraApi, Viewport } from '../camera/camera.ts';

/** What the overlay layer may draw: aim state and phase, never physics internals. */
export interface RenderFrame {
  camera: CameraApi;
  phase: GamePhase;
  /** Present while the player is dragging the cannon. */
  aim: { origin: Vec2; pull: Vec2; trajectory: TrajectorySample[] } | null;
}

/**
 * A theme is exactly three things plus a manifest (docs/theme-contract.md). It
 * reads EntityState and RenderFrame and never mutates either.
 */
export interface ThemePalette {
  background: string;
  outline: string;
  grid: string;
  materials: Record<MaterialId, string>;
  pig: string;
  bird: string;
  cannon: string;
  aimGuide: string;
  /** Colour used for one step after an entity is destroyed. */
  flash: string;
}

export interface Theme {
  id: string;
  name: string;
  palette: ThemePalette;
  paintBackground(ctx: CanvasRenderingContext2D, viewport: Viewport): void;
  paintEntity(ctx: CanvasRenderingContext2D, state: EntityState, viewport: Viewport): void;
  paintOverlay(ctx: CanvasRenderingContext2D, frame: RenderFrame, viewport: Viewport): void;
}

const registry = new Map<string, Theme>();

export function registerTheme(theme: Theme): void {
  registry.set(theme.id, theme);
}

export function getTheme(id: string): Theme {
  const theme = registry.get(id);
  if (!theme) throw new Error(`unknown theme "${id}"; registered: ${[...registry.keys()].join(', ') || 'none'}`);
  return theme;
}

export function listThemes(): string[] {
  return [...registry.keys()];
}
