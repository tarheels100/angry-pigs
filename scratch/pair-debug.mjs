import { LEVELS } from '../src/levels/index.ts';

const def = LEVELS[2]!;
const pair = def.objects.filter((o) => Math.round(o.x) === 600 && Math.round(o.y) === 800).concat(def.objects.filter((o) => Math.round(o.x) === 640 && Math.round(o.y) === 720));
for (const o of pair) console.log(JSON.stringify(o));
const a = pair[0]!;
const b = pair[1]!;
console.log('dx', Math.abs(a.x - b.x) - ((a.w ?? 0) + (b.w ?? 0)) / 2 * 1, 'raw');
