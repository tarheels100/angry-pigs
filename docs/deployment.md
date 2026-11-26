# Deployment

## Dev

One command, no process manager:

```
npm run dev       # scripts/dev.js: esbuild watch in-process + server.js → http://localhost:5173
npm run dev:open  # same, and opens the default browser
```

Separate terminals, if you prefer:

```
npm run watch     # esbuild watch → dist/main.js
npm run serve     # static server only
```

Edit a file, esbuild rebuilds in ~8ms, reload the page manually (no HMR).
Plain `esbuild --watch` exits when stdin closes, so the script uses
`--watch=forever`; `scripts/dev.js` uses esbuild's JS API (`context.watch()`), which
has no stdin dependency. `PORT` overrides the port (default 5173).
`npm run typecheck` runs `tsc --noEmit`; `npm test` runs `node --test tests/`.

## Release artifact

`npm run build` bundles + minifies `src/main.ts`, then `build-html.js` inlines the
bundle into **`dist/index.html`** — one self-contained file:

- all JS inlined (including matter-js and level JSON),
- CSS inline in `<head>`,
- **zero runtime fetches**, so GitHub Pages and double-click-from-disk behave
  identically.

## GitHub Pages

Pages does not build, so publish the built file, not `src/`:

1. Relative paths only — Pages serves under `/username/repo/`. Never root-absolute.
2. Publish `dist/index.html` as the Pages source (GitHub Action running
   `npm run build`, or commit `dist/`).
3. Static output only: no server-side code, persistence via `localStorage`.
4. Keep the bundle fetch-free; otherwise offline mode diverges from Pages.

## Verified at M13

- live Pages URL plays every shipped level;
- offline copy plays identically with zero network requests (check the network
  panel: only the one HTML request).
