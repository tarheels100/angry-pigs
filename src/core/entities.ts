import type { EntityState } from './types.ts';
import type { PhysicsAdapter } from '../physics/adapter.ts';

/**
 * Entity registry: maps entity ids to their simulation state. The renderer reads
 * snapshots from here; nothing in this module draws. Physics bodies are the source
 * of truth for positions; `extras` holds display-only entities (the cannon and the
 * pig waiting on it) that have no body and never collide.
 */
export interface EntityRegistry {
  all(): EntityState[];
  get(id: string): EntityState | undefined;
  byKind(kind: EntityState['kind']): EntityState[];
  /** Replace the display-only entities. Ids here are not physics ids. */
  setExtras(list: EntityState[]): void;
}

export function createEntityRegistry(adapter: PhysicsAdapter): EntityRegistry {
  let extras: EntityState[] = [];
  const merged = () => [...adapter.snapshot(), ...extras];
  return {
    all: merged,
    get: (id) => adapter.state(id) ?? extras.find((e) => e.id === id),
    byKind: (kind) => merged().filter((e) => e.kind === kind),
    setExtras: (list) => {
      extras = list;
    },
  };
}
