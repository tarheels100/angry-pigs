// Scratch probe (playtest item 8): does closing the menu resume the simulation?
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(`${process.cwd()}/dist/index.html`).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.waitForFunction(() => window.__game !== undefined);

const origin = await page.evaluate(() => window.__game.cannon.config().origin);
async function fire() {
  await page.evaluate(({ origin, pull, rad }) => {
    window.__game.beginAim();
    window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
    window.__game.releaseAim();
  }, { origin, pull: 90, rad: (15 * Math.PI) / 180 });
}
const pigState = () => page.evaluate(() => {
  const pigs = window.__game.adapter.snapshot().filter((b) => b.kind === 'pig');
  return pigs.length ? Math.round(pigs[0].y) : null;
});

// Baseline: without the menu, a launched pig moves.
await fire();
await page.waitForTimeout(400);
const beforeMenu = await pigState();

await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'title');
await page.keyboard.press('Escape');
await page.waitForFunction(() => (document.querySelector('.overlay')?.dataset.overlay ?? '') === '');

await page.keyboard.press('r');
await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'aiming');
await fire();
await page.waitForTimeout(400);
const afterMenu = await pigState();
const phase = await page.evaluate(() => window.__game.rules.snapshot().phase);

console.log(`pig y right after launch (no menu): ${beforeMenu}`);
console.log(`pig y 400ms after launch (menu opened+closed): ${afterMenu}`);
console.log(`phase after that: ${phase}`);
console.log(afterMenu === beforeMenu ? 'PAUSED — the round did not advance' : 'advancing');
await browser.close();
