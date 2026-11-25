import type { PhysicsAdapter, WorldInit } from './adapter.ts';

/** Matter.js implementation of PhysicsAdapter — implemented in M4 (see
 * scratch/physics-spike/spike.ts for the validated behaviour it must reproduce). */
export function createMatterAdapter(init: WorldInit): PhysicsAdapter {
  throw new Error('not implemented: createMatterAdapter (M4)');
}
