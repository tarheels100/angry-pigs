import { startServer } from '../server.js';
import { chromium } from 'playwright';
import path from 'node:path';

const server = await startServer(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/dist/index.html`);
await page.waitForFunction(() => typeof window.__game !== 'undefined');
await page.waitForTimeout(600);
await page.screenshot({ path: 'scratch/shot-idle.png' });

const rad = (15 * Math.PI) / 180;
await page.evaluate(({ rad }) => {
  const origin = window.__game.cannon.config().origin;
  window.__game.beginAim();
  window.__game.dragAim({ x: origin.x - 90 * Math.cos(rad), y: origin.y - 90 * Math.sin(rad) });
}, { rad });
await page.waitForTimeout(200);
await page.screenshot({ path: 'scratch/shot-aiming.png' });
await page.evaluate(() => window.__game.releaseAim());
await page.waitForTimeout(300);
await page.screenshot({ path: 'scratch/shot-flight.png' });
await page.keyboard.press('r');
await page.waitForTimeout(300);
await page.screenshot({ path: 'scratch/shot-restart.png' });
console.log('camera', await page.evaluate(() => window.__camera.debug()));
console.log('cannon', await page.evaluate(() => window.__game.entities.extra('cannon')));
await browser.close();
server.close();
