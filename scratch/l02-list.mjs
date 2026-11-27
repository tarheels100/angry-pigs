import { LEVELS, loadLevel } from '../src/levels/index.ts';

const def = LEVELS[1];
def.objects.forEach((o, i) => {
  console.log('block-' + i, o.material, o.type, 'x=' + Math.round(o.x), 'y=' + Math.round(o.y), 'w=' + o.w, 'h=' + o.h);
});
console.log('--- loaded bodies past right edge ---');
for (const b of loadLevel(def).bodies) if (b.x >= def.bounds.width) console.log(b.id, b.x, b.y);
