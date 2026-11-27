import { readFileSync, writeFileSync } from 'node:fs';
const lines = readFileSync('tests/browser/game.browser.mjs', 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith("test('the HUD names the pig waiting in the chamber"));
if (start === -1) throw new Error('start not found');
let end = start;
while (lines[end] !== '});') end++;
const replacement = `test('the HUD names the pig waiting in the chamber (M18)', async () => {
  await withPage(async (page) => {
    await open(page, artifactPath());
    // Stage 04 ships bomb, heavy, cluster, then two basics (src/levels/l04.ts), and its
    // measured plan takes three pigs, so the chamber is still advancing at the last shot.
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await waitStat(page, 'level', 'stage 4/6', 'stage 04 loaded');
    // The chamber label is written by the render loop, so it is waited for, not read instantly.
    await waitStat(page, 'next-pig', 'next bomb', 'bomb queued first');

    await fireShot(page, 90, -20);
    await waitStat(page, 'next-pig', 'next heavy', 'heavy queued next');
    await waitShootable(page);

    await fireShot(page, 75, -35);
    // A heavy pig is one bigger body, not a burst.
    await page.waitForFunction(() => window.__game.entities.byKind('pig').length >= 1, null, { timeout: 1500 });
    await waitStat(page, 'next-pig', 'next cluster', 'cluster queued next');
    await waitShootable(page);

    await fireShot(page, 90, -15);
    // Counted after the first simulation step registers the bodies, but before the pigs
    // settle and are consumed, so the burst is visible.
    await page.waitForFunction(() => window.__game.entities.byKind('pig').length > 1, null, { timeout: 1500 });
    const pigs = await page.evaluate(() => window.__game.entities.byKind('pig').length);
    assert.ok(pigs > 1, \`a cluster fires several pigs (saw \${pigs})\`);
  });
});`.split('\n');
lines.splice(start, end - start + 1, ...replacement);
writeFileSync('tests/browser/game.browser.mjs', lines.join('\n'));
console.log(`replaced lines ${start + 1}..${end + 1}`);
