import { readFileSync, writeFileSync } from 'node:fs';
const lines = readFileSync('tests/browser/game.browser.mjs', 'utf8').split(/\r?\n/);

// --- Replace the M17 soundtrack test with the M22 contract ---
const start = lines.findIndex((l) => l.startsWith("test('the soundtrack ships off and turns on from options'"));
if (start === -1) throw new Error('music test not found');
let end = start;
while (lines[end] !== '});') end++;
lines.splice(start, end - start + 1, `test('the soundtrack ships off and turns on from options (M22)', async () => {
  // Playtest items 1-2: the generated track is a placeholder sound design, so it stays off
  // until the player asks for it.
  await withPage(async (page) => {
    await open(page, await baseUrl());
    assert.equal(await page.evaluate(() => window.__options().music), false, 'music ships off');
    assert.equal(await page.evaluate(() => window.__music.playing()), false, 'no track runs by default');

    await page.keyboard.press('o');
    await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'options');
    await page.click('[data-test="opt-music"]');
    await page.waitForFunction(() => window.__music.playing(), null, { timeout: 2000 });

    const first = await page.evaluate(() => window.__music.trackName());
    assert.ok(first, 'a track starts once the option is on');
    assert.match(first, /^[A-G] (minor|major|dorian|mixolydian) \d+$/, \`key, scale and tempo: \${first}\`);
    assert.ok(
      await page.evaluate((name) => document.body.innerText.includes(name), first),
      'the HUD names the track once it is on',
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'aiming', null, { timeout: 2000 });

    // A different stage composes a different track.
    await page.keyboard.press('n');
    await page.waitForFunction(() => window.__music.trackName() !== first, null, { timeout: 4000 });
    assert.ok(await page.evaluate((name) => document.body.innerText.includes(name), await page.evaluate(() => window.__music.trackName())),
      'the HUD follows the stage change');

    // Switching the option off stops the transport rather than leaving it running.
    await page.keyboard.press('o');
    await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'options');
    await page.click('[data-test="opt-music"]');
    await page.waitForFunction(() => window.__music.playing() === false, null, { timeout: 2000 });
    await page.keyboard.press('Escape');
  });
});`);

// --- Offline route test: file:// and the local server must still load ---
const routeStart = lines.findIndex((l) => l.startsWith("test('the artifact boots and plays with every network request blocked"));
if (routeStart === -1) throw new Error('route test not found');
lines[routeStart + 4] = "      if (url.startsWith('file:') || url.startsWith('http://127.0.0.1')) return route.continue();";
lines[routeStart + 3] = '    // The release promise is that the single file needs nothing else over the network:';
lines[routeStart + 4] = "      if (url.startsWith('file:') || url.startsWith('http://127.0.0.1')) return route.continue();";

// --- New music test: options is a function seam, menu closes with Escape ---
const musStart = lines.findIndex((l) => l.startsWith("test('enabling music plays a track, and the track changes with the stage"));
if (musStart === -1) throw new Error('new music test not found');
let musEnd = musStart;
while (lines[musEnd] !== '});') musEnd++;
lines.splice(musStart, musEnd - musStart + 1, `test('enabling music plays a track, and the track changes with the stage (M22)', async () => {
  await withPage(async (page) => {
    await open(page, artifactPath());
    await page.waitForFunction(() => window.__steps() > 0, null, { timeout: 10_000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'aiming', null, { timeout: 4000 });

    assert.equal(await page.evaluate(() => window.__options().music), false, 'music ships off');
    await page.keyboard.press('m');
    await page.waitForFunction(() => window.__music?.playing() === true, null, { timeout: 4000 });
    const first = await page.evaluate(() => window.__music.trackName());
    assert.ok(first, 'a track is named');
    assert.match(first, /^[A-G] (minor|major|dorian|mixolydian) \d+/, \`key, scale and tempo: \${first}\`);

    await page.keyboard.press('n');
    await page.waitForFunction(() => window.__music.trackName() !== first, null, { timeout: 4000 });

    await page.keyboard.press('m');
    await page.waitForFunction(() => window.__music.playing() === false, null, { timeout: 4000 });
  });
});`);

// --- The offline file:// test must tolerate Tone's blob worker, which is not a network load ---
const offline = lines.findIndex((l) => l.includes('only the artifact itself loads'));
if (offline === -1) throw new Error('offline assertion not found');
lines[offline] = "    assert.ok(requests.every((url) => url.startsWith('file:') || url.startsWith('blob:')), `only the artifact and its own blob worker load: ${requests.join(', ')}`);";
writeFileSync('tests/browser/game.browser.mjs', lines.join('\n'));
