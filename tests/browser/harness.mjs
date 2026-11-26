import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../server.js';

/**
 * Browser test harness (docs/browser-testing.md). Tests run against the built
 * artifact in dist/, because that is what Pages publishes and what a player opens
 * from disk. One browser per test keeps failures independent; startup cost is small.
 * Plain JS (.mjs) so `node --test` runs it without a transpile step.
 *
 * The server listens on port 0 (an ephemeral port the OS assigns) so a leftover
 * listener from another run can never collide or require killing anything.
 */
let serverPromise = null;

export async function baseUrl() {
  if (!serverPromise) serverPromise = startServer(0);
  const server = await serverPromise;
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}/dist/index.html`;
}

export function artifactPath() {
  return pathToFileURL(`${process.cwd()}/dist/index.html`).href;
}

/** Launch a page against the artifact, run the body, and always clean up. */
export async function withPage(body, options = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: options.deviceScaleFactor ?? 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  try {
    await body(page, { errors, requests });
  } finally {
    await context.close();
    await browser.close();
  }
  return { errors, requests };
}

/** Canvas-space coordinates of a world point, in client pixels. */
export async function screenOf(page, world) {
  const rect = await page.locator('#stage').boundingBox();
  const point = await page.evaluate((p) => window.__camera.worldToScreen(p), world);
  return { x: rect.x + point.x, y: rect.y + point.y };
}

export async function closeServer() {
  if (!serverPromise) return;
  const server = await serverPromise;
  server.close();
  serverPromise = null;
}

export async function snapshot(page) {
  return page.evaluate(() => window.__game.rules.snapshot());
}

export async function hudText(page) {
  return page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
}
