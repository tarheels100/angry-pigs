import type { EntityState } from './types.ts';
import type { PhysicsAdapter } from '../physics/adapter.ts';

/**
 * Entity registry: maps entity ids to their simulation state. The renderer reads
 * snapshots from here; nothing in this module draws. It is a read-only view over
 * the physics adapter, so there is exactly one source of truth for positions.
 */
export interface EntityRegistry {
  all(): EntityState[];
  get(id: string): EntityState | undefined;
  byKind(kind: EntityState['kind']): EntityState[];
}

export function createEntityRegistry(adapter: PhysicsAdapter): EntityRegistry {
  return {
    all: () => adapter.snapshot(),
    get: (id) => adapter.state(id),
    byKind: (kind) => adapter.snapshot().filter((e) => e.kind === kind),
  };
}
