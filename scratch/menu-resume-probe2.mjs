// Scratch probe v2 (item 8): full player flow — shoot, open menu mid-flight, resume,
// restart from the HUD, then aim with a real mouse drag.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(`${process.cwd()}/dist/index.html`).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.waitForFunction(() => window.__game !== undefined);

const snap = () => page.evaluate(() => ({
  phase: window.__game.rules.snapshot().phase,
  ammo: window.__game.rules.snapshot().ammoLeft,
  pigs: window.__game.adapter.snapshot().filter((b) => b.kind === 'pig').map((p) => `${Math.round(p.x)},${Math.round(p.y)}`),
}));
const drag = async (dx, dy) => {
  const rect = await page.locator('#stage').boundingBox();
  const origin = await page.evaluate(() => window.__game.cannon.config().origin);
  const from = await page.evaluate((p) => window.__camera.worldToScreen(p), origin);
  await page.mouse.move(rect.x + from.x, rect.y + from.y);
  await page.mouse.down();
  await page.mouse.move(rect.x + from.x - dx, rect.y + from.y + dy, { steps: 6 });
  await page.mouse.up();
};

await drag(87, -23);
await page.waitForTimeout(300);
console.log('1. fired:', await snap());

await page.click('.hud-menu');
await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'title');
console.log('2. menu open:', await snap());

await page.click('[data-test="resume"]');
await page.waitForFunction(() => (document.querySelector('.overlay')?.dataset.overlay ?? '') === '');
await page.waitForTimeout(400);
console.log('3. resumed:', await snap());

await page.click('.hud-restart');
await page.waitForTimeout(400);
console.log('4. after hud restart:', await snap());

await drag(87, -23);
await page.waitForTimeout(300);
console.log('5. after a real drag:', await snap());
await browser.close();
