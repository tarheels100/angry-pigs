import type { KeyValueStore } from '../game/save.ts';

/**
 * Player options (M19). Presentation configuration, persisted through the same
 * `KeyValueStore` the best results use (docs/adr.md D24) — Pages has no server, so a
 * local key is the only storage available.
 *
 * Options are *settings*, not gameplay state: they choose a theme, sound, and which
 * effects paint. They never enter the simulation, so determinism is unaffected
 * (docs/checklist.md §2).
 */
export interface Options {
  /** Theme id from the registry; an unknown id falls back to the default. */
  themeId: string;
  /** Impact sounds. */
  sound: boolean;
  /**
   * The generated soundtrack. Off by default: the M17 track is on theme but weak, and
   * several eighth notes landed together at level load, which read as a burst of noise
   * (playtest items 1-2). The generator stays in `src/audio/music.ts` for a revisit.
   */
  music: boolean;
  /** Debris heaps from destroyed blocks. */
  debris: boolean;
  /** Motion trail behind the flying pig. */
  trail: boolean;
}

export const DEFAULT_OPTIONS: Options = { themeId: 'tron', sound: true, music: false, debris: true, trail: true };

const KEY = 'angry-pigs:options';

/** Read options, tolerating a blocked, empty, or corrupt store. */
export function loadOptions(store: KeyValueStore): Options {
  let raw: string | null;
  try {
    raw = store.get(KEY);
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
  if (raw === null) return { ...DEFAULT_OPTIONS };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_OPTIONS };
    const record = parsed as Record<string, unknown>;
    return {
      themeId: typeof record.themeId === 'string' ? record.themeId : DEFAULT_OPTIONS.themeId,
      sound: typeof record.sound === 'boolean' ? record.sound : DEFAULT_OPTIONS.sound,
      music: typeof record.music === 'boolean' ? record.music : DEFAULT_OPTIONS.music,
      debris: typeof record.debris === 'boolean' ? record.debris : DEFAULT_OPTIONS.debris,
      trail: typeof record.trail === 'boolean' ? record.trail : DEFAULT_OPTIONS.trail,
    };
  } catch {
    // Corrupt storage must not break the game; defaults are the honest fallback.
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(store: KeyValueStore, options: Options): void {
  try {
    store.set(KEY, JSON.stringify(options));
  } catch {
    /* a blocked or full store simply keeps the current session settings */
  }
}
