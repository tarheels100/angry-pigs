import { LEVELS } from '../src/levels/index.ts';

const def = LEVELS[0];
def.objects.forEach((o, i) => {
  console.log('block-' + i + ' ' + o.material + ' ' + o.type + ' at ' + Math.round(o.x) + ',' + Math.round(o.y) + ' w=' + o.w + ' h=' + o.h);
});
console.log('targets:');
(def.targets ?? []).forEach((t, i) => console.log('bird-' + (i + 1) + ' at ' + t.x + ',' + t.y + ' r=' + t.r));
