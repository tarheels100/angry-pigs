import { loadLevel, LEVELS } from '../src/levels/index.ts';
import { reachTable } from './reachTable.ts';

/**
 * Which shelters can a pig actually descend onto? A roof above a bird is only killable if a
 * measured path passes through the roof plane over its span while falling, above the bird's
 * top (level rule 1, docs/level-format.md). Paths come from `scratch/reachTable.ts`, which
 * launches live pigs in an empty world and records the trajectory up to the first contact.
 */
for (const def of LEVELS) {
  const loaded = loadLevel(def);
  const beams = loaded.bodies.filter((b) => b.kind === 'block' && (b.halfHeight ?? 0) <= 15);
  const birds = loaded.bodies.filter((b) => b.kind === 'bird');
  const paths = reachTable(loaded).map((row) => row.outcome.path);

  for (const bird of birds) {
    const radius = bird.radius ?? 20;
    const roof = beams.find(
      (beam) => beam.y < bird.y && Math.abs(beam.x - bird.x) <= (beam.halfWidth ?? 20) + radius,
    );
    if (!roof) {
      console.log(`${def.name} bird ${bird.id}: no roof above it (rule 1 violation)`);
      continue;
    }
    const half = roof.halfWidth ?? 20;
    const roofTop = roof.y - (roof.halfHeight ?? 12);
    const birdTop = bird.y - radius;
    let hit = false;
    for (const path of paths) {
      for (let i = 1; i < path.length; i++) {
        const p = path[i]!;
        const prev = path[i - 1]!;
        if (p.x >= roof.x - half && p.x <= roof.x + half && p.y < roofTop - 2 && p.y > birdTop + 2 && p.y > prev.y) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    console.log(`${def.name} bird ${bird.id} roof x=${roof.x} top=${Math.round(roofTop)} ${hit ? 'reachable' : 'UNREACHABLE'}`);
  }
}
