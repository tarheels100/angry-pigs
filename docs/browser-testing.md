# Browser testing options

Headless tests (`node --test`) cover simulation and presentation logic through a fake
canvas, but they cannot prove real pointer capture, DPR mapping, `file://` loading, or
what a frame actually looks like. Options, in order of cost.

## Option A: Playwright as a dev dependency (recommended)

`npm i -D playwright` downloads a Chromium build (~120 MB, dev-only; nothing enters
the shipped bundle). It gives:

- **Real pointer gestures.** `page.mouse.down/move/up`, touch taps (`hasTouch` contexts,
  `page.touchscreen.tap`), and `pointercancel`
  through a real browser — the input semantics in `src/input/pointer.ts` get asserted,
  not simulated.
- **Canvas pixels.** Screenshot a frame and sample pixels (theme colour, glow), so a
  theme swap is a measurable assertion rather than a visual check.
- **DOM chrome.** Menus are asserted as DOM state, not pixels: the overlay's
  `dataset.overlay` is `title` / `options` / `''`, buttons carry `data-test="stage-1"`,
  `opt-theme`, `reset-best`, and the listing is read as button text (M19).
- **Viewport/DPR/resize.** `deviceScaleRatio: 2`, resize mid-drag, hidden tab.
- **`file://` loading.** Load `dist/index.html` with no server to prove D6.
- **Network assertions.** `page.route()` fails the test if anything fetches.

Sketch of what a first test looks like:

```ts
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleRatio: 2 });
await page.goto('http://localhost:5173/');
await page.mouse.move(300, 400);
await page.mouse.down();
await page.mouse.move(210, 420);            // drag sets the pull
await page.mouse.up();                       // fires
const pigMoving = await page.evaluate(() => window.__game?.rules.snapshot().phase === 'in_flight');
```

That needs the game to expose a small hook for tests — a deliberate, narrow seam rather
than a test-only rewrite. `src/main.ts` publishes read-only objects:
`window.__game` (rules, cannon, entity registry, aim API), `window.__camera`
(`zoom`, `world`, `worldToScreen`/`screenToWorld` for pixel sampling — closures over the
*live* camera, because `refit()` re-creates it on resize), `window.__viewport()` (the CSS box
size, so layout is assertable), `window.__trail`, `window.__debris`,
`window.__music` (the generated track's flavour and emitted notes),
`window.__explosions` (blast count since load), `window.__steps()` (`loop.stepsTaken()`),
and `window.__options()` (the persisted
settings, so a reload can be asserted). Nothing in the game reads them.

Cost: one dev dependency plus browser binaries, and `npm run test:browser` kept separate
from `npm test` so the dependency-free suite stays fast and CI-installable without
browser downloads.

## Option B: Chrome DevTools Protocol with no dependency

Launch the local browser headless and drive it over its debugging WebSocket:

```
msedge --headless --remote-debugging-port=9222 file:///.../dist/index.html
```

Zero new packages, consistent with the "esbuild is the only build tool" stance, but the
CDP client, screenshot decoding, and event dispatch are hand-written (~150 lines). Use
this if the dependency count matters more than convenience.

## Option C: keep manual checks

`docs/checklist.md` section 1 stays manual, with the harness for repeated measurement
being `scratch/sweep-probe.ts`. Cheapest, but every input/visual claim stays
unverified across machines.

## Recommendation

Option A behind a separate script:

```jsonc
"scripts": {
  "test":         "node --test tests/",          // dependency-free, fast
  "test:browser": "node --test tests/browser/",  // Playwright, run locally + in CI
}
```

Add it when M12 (theme switching) needs pixel assertions, or earlier if touch/DPR
behaviour starts to matter. Until then, section 1 of `docs/checklist.md` is manual.

## Harness notes

Implemented as Option A: `tests/browser/harness.mjs` + `tests/browser/game.browser.mjs`, run with `npm run test:browser` (builds the artifact first).

- Tests drive **dist/index.html**, the same file Pages publishes and a player opens from disk.
- The static server listens on **port 0** (OS-assigned ephemeral port) and is closed in an `after()` hook, so a run can neither collide with a leftover listener nor need anything killed.
- `npm run dev` spawns no long-lived children (`spawnSync` only for the build step), so there is no process registry to clean up.
- Assertions are numeric — pixel sampling, canvas backing-store dimensions, phase transitions, HUD text — so a test passes or fails in CI without image review. A frame can also be *looked at*: vision works through the strata provider (`docs/pushes/vision-model-setup.md`), which makes screenshot review a judgment layer, not a pass condition. Never assert on a model's description of a screenshot.
