// Portrait screenshot for the vision review (docs/browser-testing.md).
import { artifactPath, closeServer, withPage } from '../tests/browser/harness.mjs';
await withPage(async (page) => {
  await page.goto(artifactPath());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__steps && window.__steps() > 0, { timeout: 15000 });
  await page.setViewportSize({ width: 420, height: 800 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'scratch/shots/portrait.png' });
  console.log('portrait: written', await page.evaluate(() => window.__camera.zoom()));
}, { viewport: { width: 420, height: 800 } });
await closeServer();
