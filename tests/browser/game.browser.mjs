import assert from 'node:assert/strict';
import test, { after } from 'node:test';

after(() => closeServer());

import { withPage, baseUrl, artifactPath, screenOf, snapshot, hudText, closeServer } from './harness.mjs';

const WIN = { pull: 90, deg: 15 }; // measured winner for stage-01 (docs/tuning.md)

async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__game !== 'undefined');
}

test('the artifact loads offline from file:// with no extra requests', async () => {
  const { errors, requests } = await withPage(async (page) => {
    await open(page, artifactPath());
    assert.equal(await page.evaluate(() => window.__game.rules.snapshot().targetsTotal), 2);
    assert.match(await hudText(page), /stage-01/);
  });
  assert.deepEqual(errors, [], 'no page or console errors');
  assert.equal(requests.length, 1, `only the artifact itself loads: ${requests.join(', ')}`);
  assert.ok(requests[0].startsWith('file:'), 'loaded from disk, not http');
});

test('the artifact loads over http with no runtime fetch', async () => {
  const { errors, requests } = await withPage(async (page) => {
    await open(page, await baseUrl());
    assert.ok(await page.evaluate(() => typeof window.__game !== 'undefined'));
  });
  assert.deepEqual(errors, []);
  assert.ok(requests.every((u) => !u.includes('levels') && !u.endsWith('.json')), 'no level files fetched at runtime');
});

test('a drag aims, a release fires, and ammo is spent', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);

    const press = await screenOf(page, origin);
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();

    // A press alone is not a shot (docs/adr.md D14).
    assert.equal((await snapshot(page)).phase, 'aiming');
    assert.equal((await snapshot(page)).launches, 0);

    const target = await screenOf(page, { x: origin.x - 60, y: origin.y + 20 });
    await page.mouse.move(target.x, target.y);
    const aimed = await page.evaluate(() => window.__game.frame().aim);
    assert.ok(aimed, 'the aim gesture is live');
    assert.ok(Math.hypot(aimed.pull.x, aimed.pull.y) > 12, 'the drag produced a pull above MIN_DRAG');
    assert.ok((await page.evaluate(() => window.__game.frame().trajectory)).length > 0, 'a trajectory preview is computed');

    await page.mouse.up();
    assert.equal((await snapshot(page)).phase, 'in_flight');
    assert.equal((await snapshot(page)).ammoLeft, 3);
    assert.equal((await snapshot(page)).launches, 1);
  });
});

test('pressing without dragging never fires', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    const press = await screenOf(page, origin);
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal((await snapshot(page)).launches, 0, 'a click spends no ammo');
    assert.equal((await snapshot(page)).ammoLeft, 4);
  });
});

// Touch coverage is partial: a tap exercises the browser's pointer-event path, but a
// real finger drag (touch move + capture) still needs a physical device
// (docs/checklist.md §1, docs/browser-testing.md).
test('a touch tap on the canvas spends no ammo', async () => {
  const { errors } = await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    const tap = await screenOf(page, origin);
    await page.touchscreen.tap(tap.x, tap.y);
    assert.equal((await snapshot(page)).launches, 0, 'a tap is a press, not a shot');
    assert.equal((await snapshot(page)).ammoLeft, 4);
  }, { hasTouch: true });
  assert.deepEqual(errors, [], 'a touch tap raises no page or console errors');
});

test('a touch tap on the HUD restart button restarts the stage', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    const rad = (WIN.deg * Math.PI) / 180;
    await page.evaluate(({ origin, pull, rad }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
      window.__game.releaseAim();
    }, { origin, pull: WIN.pull, rad });
    await page.waitForFunction(() => window.__game.rules.snapshot().launches === 1, null, { timeout: 4000 });

    const box = await page.locator('.hud-restart').boundingBox();
    assert.ok(box, 'the restart button is visible');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    const snap = await snapshot(page);
    assert.equal(snap.launches, 0, 'the tap restarted the round');
    assert.equal(snap.ammoLeft, 4);
    assert.equal(snap.targetsAlive, snap.targetsTotal);
  }, { hasTouch: true });
});

test('theme swap changes painted pixels', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const read = () => page.evaluate(() => {
      const canvas = document.getElementById('stage');
      const ctx = canvas.getContext('2d');
      const px = ctx.getImageData(0, 0, 1, 1).data;
      return { r: px[0], g: px[1], b: px[2] };
    });

    const tron = await read();
    assert.ok(tron.r + tron.g + tron.b < 120, `tron background is dark (${JSON.stringify(tron)})`);

    await page.keyboard.press('t');
    await page.waitForTimeout(120);
    const next = await read();
    assert.notDeepEqual(next, tron, 'a theme switch repaints the canvas');
    assert.match(await hudText(page), /theme:/);

    await page.keyboard.press('t');
    await page.waitForTimeout(120);
    assert.notDeepEqual(await read(), next, 'cycling keeps changing the look');
  });
});

test('resizing during a drag still completes the gesture', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    const press = await screenOf(page, origin);
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();

    const mid = await screenOf(page, { x: origin.x - 70, y: origin.y + 10 });
    await page.mouse.move(mid.x, mid.y);
    assert.equal((await snapshot(page)).phase, 'aiming');

    await page.setViewportSize({ width: 900, height: 520 });
    await page.waitForTimeout(120);

    const after = await screenOf(page, { x: origin.x - 80, y: origin.y + 10 });
    await page.mouse.move(after.x, after.y);
    await page.mouse.up();

    assert.equal((await snapshot(page)).phase, 'in_flight', 'the resized drag still fires');
    assert.equal((await snapshot(page)).ammoLeft, 3);
  });
});

test('device pixel ratio maps the backing store', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const dims = await page.evaluate(() => {
      const canvas = document.getElementById('stage');
      return { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, dpr: window.devicePixelRatio };
    });
    assert.equal(dims.dpr, 2);
    assert.equal(dims.width, Math.round(dims.cssWidth * 2), 'backing store is css width * dpr');
    assert.equal(dims.height, Math.round(dims.cssWidth * (9 / 16) * 2), 'aspect ratio is preserved');
  }, { deviceScaleFactor: 2 });
});

test('a winning shot reports stars and advances to the next stage', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    const rad = (WIN.deg * Math.PI) / 180;

    await page.evaluate(({ origin, pull, rad }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
      window.__game.releaseAim();
    }, { origin, pull: WIN.pull, rad });

    await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'won', null, { timeout: 8000 });
    const won = await snapshot(page);
    assert.ok(won.stars >= 1, `stars are derived from shots (${won.stars})`);
    assert.match(await hudText(page), /stage cleared/);
    assert.match(await hudText(page), /★/);

    // Auto-advance (docs/adr.md D20 level flow).
    await page.waitForFunction(() => window.__game.rules.snapshot().targetsTotal === 2 && document.getElementById('hud').textContent.includes('stage 2/3'), null, { timeout: 4000 });
    assert.match(await hudText(page), /stage-02/);
  });
});

test('restart restores the authored stage', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    await page.evaluate(({ origin }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - 30, y: origin.y });
      window.__game.releaseAim();
    }, { origin });
    await page.waitForFunction(() => window.__game.rules.snapshot().ammoLeft === 3, null, { timeout: 4000 });

    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__game.rules.snapshot().ammoLeft === 4, null, { timeout: 2000 });
    const snap = await snapshot(page);
    assert.equal(snap.launches, 0, 'restart clears the shot count');
    assert.equal(snap.targetsAlive, snap.targetsTotal, 'restart restores the birds');
  });
});

test('best results persist across a reload', async () => {
  const url = await baseUrl();
  await withPage(async (page) => {
    await open(page, url);
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    const rad = (WIN.deg * Math.PI) / 180;
    await page.evaluate(({ origin, pull, rad }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
      window.__game.releaseAim();
    }, { origin, pull: WIN.pull, rad });
    await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'won', null, { timeout: 8000 });

    const stored = await page.evaluate(() => localStorage.getItem('angry-pigs:best:stage-01'));
    assert.ok(stored, 'the clear is written to localStorage');
    const record = JSON.parse(stored);
    assert.ok(record.score > 0 && record.stars >= 1 && record.launches === 1);
    assert.match(await hudText(page), /best/);

    // A reload must show the stored best without replaying.
    await page.reload();
    await open(page, url);
    assert.match(await hudText(page), /best ★+ \d+/);
    assert.equal(await page.evaluate(() => window.__game.rules.snapshot().launches), 0, 'the stage starts fresh');
  });
});
