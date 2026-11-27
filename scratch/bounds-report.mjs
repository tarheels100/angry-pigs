import { LEVELS, loadLevel } from '../src/levels/index.ts';

for (const def of LEVELS) {
  const loaded = loadLevel(def);
  const out = loaded.bodies.filter((b) => b.x <= 0 || b.x >= def.bounds.width || b.y <= 0 || b.y >= def.bounds.height);
  if (out.length) {
    console.log(def.name, out.map((b) => b.id + ' (' + b.x + ',' + b.y + ')').join(' '));
  }
}
