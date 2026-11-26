/**
 * Best-result persistence (docs/adr.md D24). The game layer owns it because it is
 * gameplay state, not presentation. The store is injected, so headless tests use a
 * map and `src/main.ts` uses `localStorage` when the browser provides one.
 */

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface StageRecord {
  levelId: string;
  score: number;
  stars: number;
  launches: number;
}

export interface SaveStore {
  /** Keep the best result for a stage; returns the record now stored. */
  record(levelId: string, result: { score: number; stars: number; launches: number }): StageRecord;
  best(levelId: string): StageRecord | null;
  /** Forget records for the given stages. Explicit ids because a key-value store
   * is not enumerable (localStorage has no portable key list here). */
  clear(levelIds: string[]): void;
}

const PREFIX = 'angry-pigs:best:';

/** Better means higher score, then more stars, then fewer shots. */
function isBetter(candidate: StageRecord, current: StageRecord): boolean {
  if (candidate.score !== current.score) return candidate.score > current.score;
  if (candidate.stars !== current.stars) return candidate.stars > current.stars;
  return candidate.launches < current.launches;
}

/** A `localStorage`-shaped store over a plain Map (tests, or environments without storage). */
export function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

export function createSaveStore(store: KeyValueStore = memoryStore()): SaveStore {
  function read(levelId: string): StageRecord | null {
    let raw: string | null;
    try {
      raw = store.get(PREFIX + levelId);
    } catch {
      // Storage can be disabled (private mode, blocked cookies); treat it as empty.
      return null;
    }
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return null;
      const record = parsed as Record<string, unknown>;
      if (typeof record.score !== 'number' || typeof record.stars !== 'number' || typeof record.launches !== 'number') return null;
      return { levelId, score: record.score, stars: record.stars, launches: record.launches };
    } catch {
      // Corrupt storage must not break the game; treat it as no record.
      return null;
    }
  }

  return {
    record(levelId, result) {
      const candidate: StageRecord = { levelId, score: result.score, stars: result.stars, launches: result.launches };
      const current = read(levelId);
      if (current && !isBetter(candidate, current)) return current;
      try {
        store.set(PREFIX + levelId, JSON.stringify(candidate));
      } catch {
        // A full or blocked store loses the record; the game itself is unaffected.
        return candidate;
      }
      return candidate;
    },
    best: read,
    clear(levelIds) {
      for (const levelId of levelIds) {
        try {
          store.remove(PREFIX + levelId);
        } catch {
          /* storage blocked; nothing to forget */
        }
      }
    },
  };
}
