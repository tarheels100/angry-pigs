import { chromium } from 'playwright';

const port = process.env.PROBE_PORT ?? '5174';
const url = `http://localhost:${port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => typeof window.__game !== 'undefined', null, { timeout: 5000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

const info = await page.evaluate(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const zoom = window.__camera.zoom();
  const world = window.__camera.world();
  const bounds = window.__game.levelBounds?.() ?? null;
  const restart = document.querySelector('#hud button');
  const rect = restart?.getBoundingClientRect() ?? null;
  // Any lit pixel anywhere tells us the frame was painted.
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 200) lit++;
  // Is the launcher on screen? Its world x is 120.
  const o = window.__game.cannon.config().origin;
  const p = window.__camera.worldToScreen(o);
  return {
    css: { w: canvas.clientWidth, h: canvas.clientHeight },
    backing: { w: canvas.width, h: canvas.height },
    zoom,
    visibleWorld: { w: canvas.clientWidth / zoom, h: canvas.clientHeight / zoom },
    world: { w: world.width, h: world.height },
    bounds,
    lit,
    steps: window.__steps(),
    cannonScreen: { x: Math.round(p.x), y: Math.round(p.y) },
    restartInView: rect ? rect.bottom <= window.innerHeight && rect.top >= 0 : false,
    docScrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
  };
});
console.log(JSON.stringify(info, null, 2));
console.log('page errors:', errors);

// Portrait / small window check: the whole level should still fit.
await page.setViewportSize({ width: 420, height: 800 });
await page.waitForTimeout(250);
const small = await page.evaluate(() => {
  const canvas = document.getElementById('stage');
  const zoom = window.__camera.zoom();
  return {
    css: { w: canvas.clientWidth, h: canvas.clientHeight },
    zoom,
    visibleWorld: { w: canvas.clientWidth / zoom, h: canvas.clientHeight / zoom },
    world: window.__camera.world(),
    cannonScreen: window.__camera.worldToScreen(window.__game.cannon.config().origin),
  };
});
console.log(JSON.stringify(small));
await browser.close();
