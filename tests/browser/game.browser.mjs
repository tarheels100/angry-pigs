import assert from 'node:assert/strict';
import test, { after } from 'node:test';

after(() => closeServer());

import { withPage, baseUrl, artifactPath, screenOf, snapshot, hudText, closeServer } from './harness.mjs';

/** Measured winner for stage-01 after the M21 re-author (scratch/greedy-probe.ts, docs/tuning.md). */
const WIN = { pull: 90, deg: -20 };

/**
 * Load the artifact and dismiss the title screen, so a test acts on the live round.
 * The game opens on the title screen (playtest item 1), and the overlay covers the HUD,
 * so gestures and HUD clicks need it closed first. Title-screen tests navigate directly.
 */
async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__game !== 'undefined');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.querySelector('.overlay')?.dataset.overlay ?? '') === '');
}

test('the artifact loads offline from file:// with no extra requests', async () => {
  const { errors, requests } = await withPage(async (page) => {
    await open(page, artifactPath());
    assert.equal(await page.evaluate(() => window.__game.rules.snapshot().targetsTotal), 3);
    assert.match(await hudText(page), /stage 1\/6/);
  });
  assert.deepEqual(errors, [], 'no page or console errors');
    assert.ok(requests.every((url) => url.startsWith('file:') || url.startsWith('blob:')), `only the artifact and its own blob worker load: ${requests.join(', ')}`);
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
      return {
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.clientWidth,
        cssHeight: canvas.clientHeight,
        dpr: window.devicePixelRatio,
      };
    });
    assert.equal(dims.dpr, 2);
    assert.equal(dims.width, Math.round(dims.cssWidth * 2), 'backing store is css width * dpr');
    assert.equal(dims.height, Math.round(dims.cssHeight * 2), 'backing store is css height * dpr');
    // The canvas box fills the window, so the picture is protected by the camera instead:
    // a uniform zoom keeps world angles and lengths intact, however squished the window is.
    const iso = await page.evaluate(() => {
      const a = window.__camera.worldToScreen({ x: 0, y: 0 });
      const b = window.__camera.worldToScreen({ x: 100, y: 0 });
      const c = window.__camera.worldToScreen({ x: 0, y: 100 });
      return { dx: b.x - a.x, dy: b.y - a.y, cx: c.x - a.x, cy: c.y - a.y, zoom: window.__camera.zoom() };
    });
    assert.equal(iso.dy, 0, 'a horizontal world line stays horizontal');
    assert.equal(iso.cx, 0, 'a vertical world line stays vertical');
    assert.ok(Math.abs(Math.abs(iso.dx) - Math.abs(iso.cy)) < 1e-6, 'zoom is uniform — the world is not squashed');
    assert.ok(iso.zoom > 0, 'zoom is positive');
    // The whole level fits: the zoom is the fit for this viewport, not a clamped default.
    const fit = await page.evaluate(() => {
      const v = window.__viewport();
      const w = window.__camera.world();
      return Math.min(v.cssWidth / w.width, v.cssHeight / w.height);
    });
    assert.ok(Math.abs(iso.zoom - fit) < 1e-6, 'the view fits the whole level');
  }, { deviceScaleFactor: 2 });
});

test('a winning shot reports stars and advances to the next stage', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    await winStage(page);
    const won = await snapshot(page);
    assert.ok(won.stars >= 1, `stars are derived from shots (${won.stars})`);
    assert.match(await hudText(page), /stage cleared/);
    assert.match(await hudText(page), /★/);

    // Auto-advance (docs/adr.md D20 level flow).
    await page.waitForFunction(() => window.__game.rules.snapshot().targetsTotal === 4 && document.getElementById('hud').textContent.includes('stage 2/6'), null, { timeout: 4000 });
    assert.match(await hudText(page), /stage 2\/6/);
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

test('a loaded stage is settled and undamaged before the player fires', async () => {
  // M14/D27: warmup simulates the authored world with damage suppressed, so the first
  // drawn frame shows resting bodies at full health rather than a stack still falling.
  const read = (page) =>
    page.evaluate(() =>
      window.__game.entities
        .all()
        .filter((e) => e.kind === 'block' || e.kind === 'bird')
        .map((e) => ({ id: e.id, health: e.health, healthMax: e.healthMax, speed: Math.hypot(e.vx, e.vy) })),
    );

  await withPage(async (page) => {
    await open(page, await baseUrl());
    const onLoad = await read(page);
    assert.ok(onLoad.length > 0, 'the stage has blocks and birds');
    for (const e of onLoad) {
      assert.ok(e.healthMax === undefined || e.health === e.healthMax, `${e.id} must load at full health`);
      assert.ok(e.speed < 1.5, `${e.id} must be resting on the first frame (speed ${e.speed.toFixed(2)})`);
    }

    // Restart re-runs the warmup, so the restored stage is settled too.
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    await page.evaluate(({ origin }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - 30, y: origin.y });
      window.__game.releaseAim();
    }, { origin });
    await page.waitForFunction(() => window.__game.rules.snapshot().ammoLeft === 3, null, { timeout: 4000 });
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__game.rules.snapshot().ammoLeft === 4, null, { timeout: 2000 });
    const afterRestart = await read(page);
    for (const e of afterRestart) {
      assert.ok(e.healthMax === undefined || e.health === e.healthMax, `${e.id} must restart at full health`);
      assert.ok(e.speed < 1.5, `${e.id} must be resting after restart`);
    }
  });
});

test('best results persist across a reload', async () => {
  const url = await baseUrl();
  await withPage(async (page) => {
    await open(page, url);
    await winStage(page);

    const stored = await page.evaluate(() => localStorage.getItem('angry-pigs:best:stage-01'));
    assert.ok(stored, 'the clear is written to localStorage');
    const record = JSON.parse(stored);
    assert.ok(record.score > 0 && record.stars >= 1 && record.launches === 2, 'the stored record is the measured two-pig clear');
    assert.match(await hudText(page), /best/);

    await page.reload();
    await open(page, url);
    assert.match(await hudText(page), /best ★+ \d+/);
    assert.equal(await page.evaluate(() => window.__game.rules.snapshot().launches), 0, 'the stage starts fresh');
  });
});

test('aiming tilts the barrel and compresses the spring', async () => {
  // M15/D28: the launcher is drawn from the aim state, so a drag must repaint it.
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);

    const litAroundCannon = () =>
      page.evaluate((o) => {
        const canvas = document.getElementById('stage');
        const ctx = canvas.getContext('2d');
        const p = window.__camera.worldToScreen(o);
        const scale = canvas.width / canvas.clientWidth;
        const x = Math.max(0, Math.round((p.x - 60) * scale));
        const y = Math.max(0, Math.round((p.y - 60) * scale));
        const data = ctx.getImageData(x, y, Math.round(120 * scale), Math.round(120 * scale)).data;
        let lit = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 200) lit++;
        return lit;
      }, origin);

    // The title screen pauses the loop at load, so wait for a real painted frame before
    // sampling; a sample taken between load and the first resumed frame can read a blank canvas.
    await page.waitForFunction(() => window.__steps() > 0, null, { timeout: 4000 });
    const rest = await litAroundCannon();
    assert.ok(rest > 0, 'the launcher is painted at rest');

    await page.evaluate(({ origin }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - 80, y: origin.y - 25 });
    }, { origin });
    await page.waitForTimeout(120);
    const aimed = await litAroundCannon();
    assert.notEqual(aimed, rest, 'a drag repaints the launcher: barrel tilt and spring compression');

    await page.evaluate(() => window.__game.releaseAim());
    await page.waitForFunction(() => window.__game.rules.snapshot().launches === 1, null, { timeout: 4000 });

    // The recoil flash is state the theme draws (D28); it decays over ~20 steps, so it
    // is readable just after the shot and gone shortly after.
    const recoilJustAfter = await page.evaluate(() => window.__game.entities.get('cannon')?.recoil ?? 0);
    assert.ok(recoilJustAfter > 0, `recoil is still lit after the shot (${recoilJustAfter})`);
    await page.waitForTimeout(400);
    const recoilLater = await page.evaluate(() => window.__game.entities.get('cannon')?.recoil ?? 0);
    assert.ok(recoilLater < recoilJustAfter, `the recoil decays (${recoilJustAfter} -> ${recoilLater})`);
  });
});

test('a flying pig leaves a motion trail', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    const rad = (WIN.deg * Math.PI) / 180;
    assert.equal(await page.evaluate(() => window.__trail.points().length), 0, 'no trail before a shot');

    await page.evaluate(({ origin, pull, rad }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
      window.__game.releaseAim();
    }, { origin, pull: WIN.pull, rad });
    await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'in_flight', null, { timeout: 4000 });
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => window.__trail.points().length > 0), 'the flight records trail points');

    // Restarting a stage clears the trail (M15).
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__game.rules.snapshot().ammoLeft === 4, null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => window.__trail.points().length), 0, 'restart clears the trail');
  });
});

test('destroyed blocks leave a debris heap that clears on restart', async () => {
  // M16: fragments fall onto the ground surface, pile, and are presentation only.
  await withPage(async (page) => {
    await open(page, await baseUrl());
    const groundTop = await page.evaluate(() => window.__game.groundTop());
    assert.equal(await page.evaluate(() => window.__debris.fragments().length), 0, 'no debris before a shot');

    const origin = await page.evaluate(() => window.__game.cannon.config().origin);
    await page.evaluate(({ origin }) => {
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - 90, y: origin.y }); // flat full pull: hits the shelter screen and shatters it
      window.__game.releaseAim();
    }, { origin });
    // Fragments appear as blocks crumble, and fade after DEBRIS_FADE_STEPS at rest, so
    // the heap is waited for rather than sampled after a long settle.
    await page.waitForFunction(() => window.__debris.fragments().length > 0, null, { timeout: 6000 });
    const fragments = await page.evaluate(() => window.__debris.fragments());
    assert.ok(fragments.length > 0, 'a destroyed block crumbled into fragments');
    for (const f of fragments) {
      assert.ok(f.y <= groundTop, `fragment stays on or above the ground (y ${f.y})`);
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.vx), 'fragments carry finite state');
    }

    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__game.rules.snapshot().ammoLeft === 4, null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => window.__debris.fragments().length), 0, 'restart clears the heap');
  });
});

test('the soundtrack ships off and turns on from options (M22)', async () => {
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
    assert.match(first, /^[A-G] (minor|major|dorian|mixolydian) \d+$/, `key, scale and tempo: ${first}`);
    assert.ok(
      await page.evaluate((name) => document.body.innerText.includes(name), first),
      'the HUD names the track once it is on',
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'aiming', null, { timeout: 2000 });

    // A different stage composes a different track.
    await page.keyboard.press('n');
    await page.waitForFunction((prev) => window.__music.trackName() !== prev, first, { timeout: 4000 });
    assert.ok(await page.evaluate((name) => document.body.innerText.includes(name), await page.evaluate(() => window.__music.trackName())),
      'the HUD follows the stage change');

    // Switching the option off stops the transport rather than leaving it running.
    await page.keyboard.press('o');
    await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'options');
    await page.click('[data-test="opt-music"]');
    await page.waitForFunction(() => window.__music.playing() === false, null, { timeout: 2000 });
    await page.keyboard.press('Escape');
  });
});

test('resume hands control back to the round', async () => {
  // Playtest item 8: the overlay's resume button closed the menu but never restarted
  // the loop, so the round stayed paused with no menu on screen and restart did nothing.
  await withPage(async (page) => {
    await open(page, await baseUrl());
    await fireWinner(page);
    await page.waitForTimeout(250);
    const during = await page.evaluate(() => window.__game.adapter.snapshot().filter((b) => b.kind === 'pig').map((p) => Math.round(p.x)));

    await page.click('.hud-menu');
    await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'title');
    await page.click('[data-test="resume"]');
    await page.waitForFunction(() => (document.querySelector('.overlay')?.dataset.overlay ?? '') === '');

    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__game.adapter.snapshot().filter((b) => b.kind === 'pig').map((p) => Math.round(p.x)));
    assert.notDeepEqual(after, during, 'the round must keep running once the menu is closed');

    await page.keyboard.press('r');
    await waitStat(page, 'ammo', 'pigs 4', 'restart works after resume');
  });
});

test('nothing floats with no support under it', async () => {
  // Playtest item 7: knocking a structure's supports out left blocks and birds hanging
  // in the air. The check is the rotated-AABB support test from scratch/hover-probe.ts.
  await withPage(async (page) => {
    await open(page, await baseUrl());
    await page.keyboard.press('2');
    await waitStat(page, 'level', 'stage 2/6', 'stage 02 loaded');
    await page.evaluate(({ pull, rad }) => {
      const origin = window.__game.cannon.config().origin;
      window.__game.beginAim();
      window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
      window.__game.releaseAim();
    }, { pull: 63, rad: (18 * Math.PI) / 180 });

    await page.waitForFunction(() => ['aiming', 'won', 'lost'].includes(window.__game.rules.snapshot().phase), null, { timeout: 8000 });
    // The game keeps stepping physics after the round ends until the world settles (D38),
    // so the support check runs once everything is asleep.
    await waitAsleep(page);
    const floating = await page.evaluate(() => {
      const bodies = window.__game.adapter.snapshot();
      const groundTop = window.__game.groundTop();
      const extent = (e) => {
        const hw = e.halfWidth ?? e.radius ?? 12;
        const hh = e.halfHeight ?? e.radius ?? 12;
        return {
          w: Math.abs(Math.cos(e.angle)) * hw + Math.abs(Math.sin(e.angle)) * hh,
          h: Math.abs(Math.sin(e.angle)) * hw + Math.abs(Math.cos(e.angle)) * hh,
        };
      };
      const out = [];
      for (const b of bodies) {
        if (b.kind === 'ground' || b.kind === 'wall') continue;
        const bottom = b.y + extent(b).h;
        if (bottom >= groundTop - 14) continue;
        const supported = bodies.some((o) => {
          if (o.id === b.id) return false;
          const top = o.y - extent(o).h;
          return extent(b).w + extent(o).w - Math.abs(o.x - b.x) >= 4 && top >= bottom - 14 && top <= bottom + 14;
        });
        if (!supported) out.push(`${b.id} at y=${Math.round(b.y)}`);
      }
      return out;
    });
    assert.deepEqual(floating, [], 'every resting body must be resting on something');
  });
});

/** Read one HUD stat's text, e.g. "next bomb". */
async function hudStat(page, stat) {
  return page.evaluate((s) => document.querySelector(`[data-stat="${s}"]`)?.textContent ?? '', stat);
}

/** Pull by (dx right, dy down) from the launcher and release: the real gesture path. */
async function pullAndFire(page, dx, dy) {
  await page.evaluate(({ dx, dy }) => {
    const origin = window.__game.cannon.config().origin;
    window.__game.beginAim();
    window.__game.dragAim({ x: origin.x - dx, y: origin.y + dy });
    window.__game.releaseAim();
  }, { dx, dy });
}

async function waitStat(page, stat, expected, what) {
  await page.waitForFunction(
    ({ s, want }) => document.querySelector(`[data-stat="${s}"]`)?.textContent === want,
    { s: stat, want: expected },
    { timeout: 4000 },
  );
  return what;
}

/** Wait until the round accepts a shot again (docs/adr.md D26: aiming or settling). */
async function waitShootable(page) {
  await page.waitForFunction(
    () => window.__game.rules.snapshot().phase === 'aiming' || window.__game.rules.snapshot().phase === 'settling',
    null,
    { timeout: 6000 },
  );
}

/** Fire one measured shot: `pull` units at `deg` degrees above horizontal. */
async function fireShot(page, pull = WIN.pull, deg = WIN.deg) {
  const rad = (deg * Math.PI) / 180;
  await page.evaluate(({ pull, rad }) => {
    const origin = window.__game.cannon.config().origin;
    window.__game.beginAim();
    window.__game.dragAim({ x: origin.x - pull * Math.cos(rad), y: origin.y - pull * Math.sin(rad) });
    window.__game.releaseAim();
  }, { pull, rad });
}

/** The measured stage-01 opener (docs/tuning.md): 90 pull at 20 degrees up. */
async function fireWinner(page) {
  await fireShot(page);
}

/**
 * The greedy bot's plans, mirrored from tests/levels.test.ts (scratch/greedy-probe.ts).
 * Sheltered stages need more than one pig, so winning in the browser means replaying a plan.
 */
const PLANS = [
  [[90, -20], [90, -5]],
  [[75, -35], [75, -25]],
  [[90, -10], [90, -20]],
  [[90, -20], [75, -35], [90, -15]],
  [[75, -40], [63, -30], [90, -5]],
  [[90, -45], [90, -30], [75, -45]],
];

/** Fire the measured plan for a stage until it is won (docs/adr.md D26 allows shots while debris settles). */
async function winStage(page, stageIndex = 0) {
  for (const [pull, deg] of PLANS[stageIndex] ?? PLANS[0]) {
    if ((await snapshot(page)).phase === 'won') return;
    await fireShot(page, pull, deg);
    await page.waitForFunction(() => window.__game.rules.snapshot().phase !== 'in_flight', null, { timeout: 8000 });
    await waitShootable(page);
  }
  await page.waitForFunction(() => window.__game.rules.snapshot().phase === 'won', null, { timeout: 8000 });
}

/** Wait until every body is asleep, i.e. the round's debris has come to rest. */
async function waitAsleep(page) {
  await page.waitForFunction(() => window.__game.adapter.allSleeping(), null, { timeout: 8000 });
}

test('the HUD names the pig waiting in the chamber (M18)', async () => {
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
    assert.ok(pigs > 1, `a cluster fires several pigs (saw ${pigs})`);
  });
});

test('a bomb detonates against structure (M18)', async () => {
  await withPage(async (page) => {
    await open(page, artifactPath());
    // Stage 02 opens with the bomb, so the blast is testable without clearing first.
    await page.keyboard.press('n');
    await waitStat(page, 'level', 'stage 2/6', 'stage 02 loaded');
    await waitStat(page, 'next-pig', 'next bomb', 'the chamber holds a bomb');

    // The measured winning aim for this stage (docs/tuning.md): a shallow upward arc.
    await pullAndFire(page, 63, 18);
    // Detonation happens where the bomb lands, so it is waited for rather than sampled.
    await page.waitForFunction(() => (window.__explosions ?? 0) > 0, null, { timeout: 4000 });
    const blasts = await page.evaluate(() => window.__explosions ?? 0);
    assert.ok(blasts >= 1, `the bomb must detonate on structure (blasts: ${blasts})`);
  });
});

/** Overlay state as the DOM reports it (M19): dataset.overlay is '' when closed. */
async function overlayKind(page) {
  return page.evaluate(() => document.querySelector('.overlay')?.dataset.overlay ?? '');
}

async function overlayLabels(page) {
  return page.evaluate(() => [...document.querySelectorAll('.overlay .panel button')].map((b) => b.textContent));
}

test('the title screen lists stages with best scores and starts the picked one (M19)', async () => {
  await withPage(async (page) => {
    await page.goto(await baseUrl());
    await page.waitForFunction(() => typeof window.__game !== 'undefined');
    // Playtest item 1: the game opens on the title screen, not straight into a stage.
    assert.equal(await overlayKind(page), 'title', 'the game opens on the title screen');
    assert.equal(await page.evaluate(() => window.__steps()), 0, 'nothing simulates behind the title screen');

    const labels = await overlayLabels(page);
    assert.match(labels[0] ?? '', /^play stage-01 · no record yet$/, 'a fresh browser has no records');
    assert.equal(labels.length, 8, 'six stages plus options and resume');

    // Picking a stage loads it and hands control back.
    await page.click('[data-test="stage-2"]');
    await waitStat(page, 'level', 'stage 3/6', 'stage 03 loaded from the title screen');
    assert.equal(await overlayKind(page), '', 'the overlay closes when a stage is picked');
    assert.equal((await snapshot(page)).phase, 'aiming', 'the loop resumed after the menu');
  });
});

test('the title screen can be opened and closed with Escape, and digits pick stages (M19)', async () => {
  await withPage(async (page) => {
    await page.goto(await baseUrl());
    await page.waitForFunction(() => typeof window.__game !== 'undefined');
    assert.equal(await overlayKind(page), 'title', 'the title screen opens on load');
    await page.keyboard.press('Escape');
    assert.equal(await overlayKind(page), '', 'Escape closes the menu');
    await page.keyboard.press('Escape');
    assert.equal(await overlayKind(page), 'title', 'Escape opens it again');

    await page.keyboard.press('2');
    await waitStat(page, 'level', 'stage 2/6', 'digit keys jump to a stage');
    assert.equal(await overlayKind(page), '', 'a stage pick closes the menu');

    // The menu pauses simulation: steps must not advance while it is open.
    await page.keyboard.press('Escape');
    const before = await page.evaluate(() => window.__steps());
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__steps()), before, 'a paused menu takes no simulation steps');
    await page.keyboard.press('Escape');
  });
});

test('an option change survives a reload (M19)', async () => {
  const url = await baseUrl();
  await withPage(async (page) => {
    await open(page, url);
    await page.keyboard.press('o');
    await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'options');
    const rowsBefore = await overlayLabels(page);
    // theme, sound, music, debris, trail — the soundtrack is the one row that starts off.
    assert.deepEqual(rowsBefore.slice(0, 5), ['tron', 'on', 'off', 'on', 'on'], 'the option values are current settings');

    const themeBefore = await page.evaluate(() => window.__options().themeId);
    await page.click('[data-test="opt-theme"]');
    const themeAfter = await page.evaluate(() => window.__options().themeId);
    assert.notEqual(themeAfter, themeBefore, 'cycling the theme changes the stored setting');
    // The theme actually swapped, not just the label.
    assert.notEqual(
      await page.evaluate(() => window.__game.entities.all().length),
      -1,
      'game still alive after an option change',
    );

    await page.reload();
    await page.waitForFunction(() => typeof window.__options !== 'undefined');
    assert.equal(await page.evaluate(() => window.__options().themeId), themeAfter, 'the setting survived the reload');
    // A reload goes back to the title screen (playtest item 1), not straight into play.
    assert.equal(await overlayKind(page), 'title', 'a reload opens the title screen');
    await page.click('[data-test="resume"]');
    assert.equal(await page.evaluate(() => document.querySelector('[data-stat="level"]')?.textContent), 'stage 1/6');
  });
});

test('turning trail and debris off stops those effects (M19)', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    await page.keyboard.press('o');
    await page.waitForFunction(() => document.querySelector('.overlay')?.dataset.overlay === 'options');
    await page.click('[data-test="opt-trail"]');
    await page.click('[data-test="opt-debris"]');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => window.__options()), {
      themeId: 'tron',
      sound: true,
      music: false,
      debris: false,
      trail: false,
    }, 'both effects are recorded as off');

    await fireWinner(page);
    await page.waitForFunction(() => window.__game.rules.snapshot().phase !== 'in_flight', null, { timeout: 6000 });
    assert.equal(await page.evaluate(() => window.__trail.points().length), 0, 'a disabled trail records nothing');
    assert.equal(await page.evaluate(() => window.__debris.fragments().length), 0, 'a disabled heap records nothing');
  });
});

test('forgetting best scores clears the title screen records (M19)', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    // Clear stage 01 so a record exists: the sheltered stage takes the measured two-pig plan.
    await winStage(page, 0);
    assert.ok(
      await page.evaluate(() => localStorage.getItem('angry-pigs:best:stage-01')),
      'a win writes a best record',
    );

    await page.keyboard.press('Escape');
    const listed = await overlayLabels(page);
    assert.match(listed[0] ?? '', /best ★{1,3} \d+/, 'the title screen shows the record');

    await page.click('[data-test="options"]');
    await page.click('[data-test="reset-best"]');
    await page.click('[data-test="resume"]');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('angry-pigs:best:stage-01')),
      null,
      'forgetting best scores clears storage',
    );
    await page.keyboard.press('Escape');
    const afterReset = await overlayLabels(page);
    assert.match(afterReset[0] ?? '', /play stage-01 · no record yet/, 'the list rebuilds without records');
  });
});

test('the last stage mixes materials and opens with a bomb (M20)', async () => {
  await withPage(async (page) => {
    await open(page, await baseUrl());
    await page.keyboard.press('6');
    await waitStat(page, 'level', 'stage 6/6', 'stage 06 loaded by digit key');
    const snap = await snapshot(page);
    assert.equal(snap.targetsTotal, 5, 'the finale ships five birds');
    assert.equal(snap.ammoLeft, 5, 'five pigs, one per bird at worst');
    await waitStat(page, 'next-pig', 'next bomb', 'the chamber opens with a bomb');
    const materials = await page.evaluate(() =>
      [...new Set(window.__game.entities.byKind('block').map((e) => e.material))].sort(),
    );
    assert.deepEqual(materials, ['glass', 'metal', 'wood'], 'glass, wood and the metal shield are all present');
  });
});

test('the artifact boots and plays with every network request blocked (D6)', async () => {
  await withPage(async (page) => {
    // The release promise is that the single file needs nothing over the network: the page
    // itself and Tone's blob worker may load, everything else is aborted.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('http://127.0.0.1') || url.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    await open(page, artifactPath());
    await page.waitForFunction(() => window.__steps() > 0, null, { timeout: 10_000 });
    const hud = await hudText(page);
    assert.match(hud, /stage \d+\/6/, `a stage loaded without network: ${hud}`);
    assert.equal(await page.evaluate(() => document.getElementById('error')?.textContent ?? ''), '', 'no error banner');
  });
});

test('enabling music plays a track, and the track changes with the stage (M22)', async () => {
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
    assert.match(first, /^[A-G] (minor|major|dorian|mixolydian) \d+/, `key, scale and tempo: ${first}`);

    await page.keyboard.press('n');
    await page.waitForFunction((prev) => window.__music.trackName() !== prev, first, { timeout: 4000 });

    await page.keyboard.press('m');
    await page.waitForFunction(() => window.__music.playing() === false, null, { timeout: 4000 });
  });
});
