// Which birds exist and where, per stage (vision-review follow-up).
import { artifactPath, closeServer, withPage } from '../tests/browser/harness.mjs';
await withPage(async (page) => {
  await page.goto(artifactPath());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__steps && window.__steps() > 0, { timeout: 15000 });
  for (const stage of [1, 3, 5]) {
    await page.keyboard.press(String(stage));
    await page.waitForTimeout(600);
    const birds = await page.evaluate(() =>
      window.__game.entities.byKind('bird').map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), variant: b.variant })),
    );
    console.log(`stage ${stage}: ${birds.length} birds -> ${birds.map((b) => `${b.id}@${b.x},${b.y}${b.variant ? '(' + b.variant + ')' : ''}`).join(' ')}`);
  }
});
await closeServer();
