import type { EntityState } from './types.ts';

/**
 * Entity registry: maps entity ids to their simulation state. The renderer reads
 * snapshots from here; nothing in this module draws.
 */
export interface EntityRegistry {
  all(): EntityState[];
  get(id: string): EntityState | undefined;
  byKind(kind: EntityState['kind']): EntityState[];
}

/** Stub — implemented in M5 on top of the physics adapter. */
export function createEntityRegistry(): EntityRegistry {
  throw new Error('not implemented: createEntityRegistry (M5)');
}
