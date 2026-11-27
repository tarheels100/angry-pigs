// Screenshot probes for the vision review (not a gate - docs/browser-testing.md).
// Usage: npx tsx scratch/screens.mjs [idle|aim|stage3|nest]
import { artifactPath, closeServer, screenOf, withPage } from '../tests/browser/harness.mjs';

const which = process.argv[2] ?? 'idle';
await withPage(async (page) => {
  await page.goto(artifactPath());
  // The title screen pauses the loop, so unpause before waiting for steps (D35).
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__steps && window.__steps() > 0, { timeout: 15000 });
  await page.waitForTimeout(400);

  if (which === 'aim' || which === 'stage3') {
    if (which === 'stage3') {
      await page.keyboard.press('3');
      await page.waitForTimeout(600);
    }
    const origin = await screenOf(page, { x: 120, y: 700 });
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    const back = await screenOf(page, { x: 120 - 86 * Math.cos(-0.3), y: 700 + 86 * Math.sin(-0.3) });
    await page.mouse.move(back.x, back.y, { steps: 8 });
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: `scratch/shots/${which}.png` });
  console.log(`${which}: written`);
}, { viewport: { width: 1280, height: 720 } });
await closeServer();
