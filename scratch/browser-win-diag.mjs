import { withPage, baseUrl, snapshot } from '../tests/browser/harness.mjs';
import { pathToFileURL } from 'node:url';

const WIN = { pull: 90, deg: -20 };

await withPage(async (page) => {
  await page.goto(pathToFileURL(`${process.cwd()}/dist/index.html`).href);
  await page.waitForFunction(() => typeof window.__game !== 'undefined');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.querySelector('.overlay')?.dataset.overlay ?? '') === '');

  for (let shot = 1; shot <= 4; shot++) {
    await page.evaluate(({ pull, deg }) => {
      const origin = window.__game.cannon.config().origin;
      const rad = (deg * Math.PI) / 180;
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
      window.__game.releaseAim();
    }, WIN);
    await page.waitForFunction(() => ['aiming', 'won', 'lost'].includes(window.__game.rules.snapshot().phase), null, { timeout: 10000 });
    const snap = await snapshot(page);
    const birds = await page.evaluate(() => window.__game.entities.byKind('bird').length);
    console.log(`shot ${shot}: phase=${snap.phase} launches=${snap.launches} ammo=${snap.ammoLeft} birds=${birds} score=${snap.score}`);
    if (snap.phase === 'won') break;
  }
  await page.evaluate(() => {
    // Let the world settle fully, then report.
    window.__game.adapter.wakeAll();
  });
});
