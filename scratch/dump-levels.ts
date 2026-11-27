import { LEVELS } from '../src/levels/index.ts';

/** Dump authored geometry for a stage, for collision debugging with `shield-probe.ts`. */
for (const i of [2, 3, 4, 5]) {
  const def = LEVELS[i]!;
  console.log('---', def.name);
  for (const o of def.objects) {
    console.log(
      `${o.type} ${o.material} x=${o.x} y=${o.y} ${o.type === 'block' ? `w=${o.w} h=${o.h}` : `r=${o.r}`}`,
    );
  }
  for (const t of def.targets ?? []) console.log(`target x=${t.x} y=${t.y} r=${t.r}`);
}
