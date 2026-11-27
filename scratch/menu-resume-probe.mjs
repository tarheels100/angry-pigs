// Scratch probe (item 8): the HUD menu button path — does resume unpause the round?
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(`${process.cwd()}/dist/index.html`).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.waitForFunction(() => window.__game !== undefined);

const origin = await page.evaluate(() => window.__game.cannon.config().origin);
async function fire() {
  await page.evaluate(({ origin }) => {
    window.__game.beginAim();
    window.__game.dragAim({ x: origin.x - 90 * Math.cos(15 * Math.PI / 180), y: origin.y - 90 * Math.sin(15 * Math.PI / 180) });
    window.__game.releaseAim();
  }, { origin });
}
const pig = () => page.evaluate(() => {
  const p = window.__game.adapter.snapshot().filter((b) => b.kind === 'pig');
  return p.length ? { x: Math.round(p[0].x), y: Math.round(p[0].y), sleeping: p[0].sleeping } : null;
});
const steps = () => page.evaluate(() => window.__steps?.() ?? null);

await fire();
await page.waitForTimeout(300);
console.log('baseline pig:', await pig(), 'steps:', await steps());

// HUD menu button, then the resume button (the path the player uses).
await page.click('.hud-menu');
await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'title');
await page.click('[data-test="resume"]');
await page.waitForFunction(() => (document.querySelector('.overlay')?.dataset.overlay ?? '') === '');
console.log('overlay closed:', await page.evaluate(() => document.querySelector('.overlay')?.dataset.overlay));

await page.waitForTimeout(300);
console.log('pig after resume+300ms:', await pig(), 'steps:', await steps());

// A real pointer drag on the canvas, as a player would aim.
const rect = await page.locator('#stage').boundingBox();
await page.mouse.move(rect.x + 100, rect.y + 300);
await page.mouse.down();
await page.mouse.move(rect.x + 200, rect.y + 320, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
console.log('after a real drag:', await pig(), 'phase:', await page.evaluate(() => window.__game.rules.snapshot().phase), 'steps:', await steps());

// Restart from the HUD button.
await page.click('[data-test="restart"]');
await page.waitForTimeout(300);
console.log('after hud restart:', await page.evaluate(() => window.__game.rules.snapshot()), 'steps:', await steps());
await browser.close();
