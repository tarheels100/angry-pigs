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

/**
 * Id namespaces are disjoint by construction: the loader generates `block-N`,
 * `bird-N`, `static-N`; launches generate `pig-N`; display extras use `cannon*` plus
 * the ids of bodies that already left the snapshot (destroyed flashes, D17). The
 * guard below makes a collision loud instead of silently shadowing a live body.
 */

export function createEntityRegistry(adapter: PhysicsAdapter): EntityRegistry {
  let extras: EntityState[] = [];
  const merged = () => [...adapter.snapshot(), ...extras];
  return {
    all: merged,
    get: (id) => adapter.state(id) ?? extras.find((e) => e.id === id),
    byKind: (kind) => merged().filter((e) => e.kind === kind),
    setExtras: (list) => {
      // Namespace guard: an extra that collides with a physics id would shadow a
      // live body's state, which is a bug rather than a look. Throwing here keeps
      // it loud; level validation keeps authored ids out of the reserved space.
      const physicsIds = new Set(adapter.snapshot().map((e) => e.id));
      const seen = new Set<string>();
      for (const extra of list) {
        if (physicsIds.has(extra.id)) {
          throw new Error(`display extra "${extra.id}" collides with a physics entity id`);
        }
        if (seen.has(extra.id)) {
          throw new Error(`display extra "${extra.id}" is duplicated`);
        }
        seen.add(extra.id);
      }
      extras = list;
    },
  };
}
