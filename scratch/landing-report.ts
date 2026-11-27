// Landing distance at full pull for the current cannon tuning (docs/tuning.md).
// Uses the cannon's own aim math plus the adapter's trajectory preview, so the numbers are
// the ones the game actually shows and fires.
import { LEVELS, loadLevel } from '../src/levels/index.ts';
import { createMatterAdapter } from '../src/physics/matterAdapter.ts';
import { createCannon } from '../src/game/cannon.ts';

const loaded = loadLevel(LEVELS[0]!);
const adapter = createMatterAdapter({
  width: loaded.def.bounds.width,
  height: loaded.def.bounds.height,
  gravityY: 1,
  frictionAir: 0.001,
});
const cannon = createCannon({
  origin: loaded.cannonOrigin,
  maxPull: loaded.maxPull,
  powerScale: loaded.powerScale,
  ammo: loaded.ammo,
});

for (const deg of [45, 30, 10, 0, -20, -35]) {
  const rad = (deg * Math.PI) / 180;
  const aim = cannon.setAim({
    x: loaded.cannonOrigin.x - 90 * Math.cos(rad),
    y: loaded.cannonOrigin.y + 90 * Math.sin(rad),
  });
  if (!aim) continue;
  const velocity = cannon.launchVelocity()!;
  const path = adapter.simulateTrajectory(loaded.cannonOrigin, velocity, 600, 18);
  const land = path.find((s) => s.y >= loaded.groundTop - 24);
  console.log(
    `${deg}deg: speed ${Math.round(Math.hypot(velocity.x, velocity.y))}, lands x=${land ? Math.round(land.x) : 'never (within 600 steps)'} (origin x=${loaded.cannonOrigin.x})`,
  );
}
