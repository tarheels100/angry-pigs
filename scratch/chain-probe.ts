// Scratch probe: two-storey stack, destroy the middle beam, watch every layer.
import { createPhysicsAdapter } from '../src/physics/adapter.ts';

const DT = 1 / 60;
const adapter = createPhysicsAdapter({ width: 900, height: 900, gravityY: 1, frictionAir: 0.001 });
adapter.addBody({ id: 'ground', kind: 'ground', shape: 'box', material: 'ground', x: 450, y: 860, halfWidth: 450, halfHeight: 20, isStatic: true });
adapter.addBody({ id: 'leg-a', kind: 'block', shape: 'box', material: 'wood', x: 400, y: 780, halfWidth: 17, halfHeight: 60 });
adapter.addBody({ id: 'leg-b', kind: 'block', shape: 'box', material: 'wood', x: 480, y: 780, halfWidth: 17, halfHeight: 60 });
adapter.addBody({ id: 'storey', kind: 'block', shape: 'box', material: 'glass', x: 440, y: 708, halfWidth: 70, halfHeight: 12 });
adapter.addBody({ id: 'col-a', kind: 'block', shape: 'box', material: 'glass', x: 420, y: 650, halfWidth: 13, halfHeight: 46 });
adapter.addBody({ id: 'col-b', kind: 'block', shape: 'box', material: 'glass', x: 460, y: 650, halfWidth: 13, halfHeight: 46 });
adapter.addBody({ id: 'roof', kind: 'block', shape: 'box', material: 'wood', x: 440, y: 592, halfWidth: 70, halfHeight: 12 });
adapter.addBody({ id: 'bird', kind: 'bird', shape: 'circle', material: 'feather', x: 440, y: 560, radius: 20 });

const dump = (label: string) => {
  console.log(label);
  for (const s of adapter.snapshot()) console.log(`  ${s.id} y=${Math.round(s.y)} sleep=${s.sleeping}`);
};
for (let i = 0; i < 120; i++) adapter.step(DT);
dump('before');
adapter.applyDamage('storey', 1000);
for (let i = 0; i < 120; i++) adapter.step(DT);
dump('after destroying storey');
