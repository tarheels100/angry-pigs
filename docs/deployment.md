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

Inlining is `html.split(entryTag).join('<script>' + bundle + '</script>')`, not
`String.replace`. JavaScript reads `$&`, `$'` and "$`" inside a replacement string as
special patterns, and minified matter-js contains `$&`; with `replace` the entry tag and
the surrounding html were spliced into the middle of the bundle (caught by
`tests/artifact.test.ts` at M18). A literal `</script>` in the bundle is escaped first, so
it cannot terminate the inline tag.

## GitHub Pages

Pages does not build, so publish the built file, not `src/`:

1. Relative paths only — Pages serves under `/username/repo/`. Never root-absolute.
2. Static output only: no server-side code, persistence via `localStorage`.
3. Keep the bundle fetch-free; otherwise offline mode diverges from Pages.
   `tests/artifact.test.ts` asserts this by rebuilding `dist/index.html` and rejecting
   absolute URLs and `fetch(`.

### Publishing through Actions (the route in this repo)

`.github/workflows/deploy.yml` runs `npm run check`, uploads `dist/` as the Pages
artifact, and deploys it. It uses Actions' built-in `GITHUB_TOKEN`; no PAT is stored
in the repo.

Pages source is set to **GitHub Actions** in repo settings (Settings → Pages →
Build and deployment → Source). A push to `main` now builds and publishes; the toggle
is repo settings, not something git can do, so it survives only as a note here.

`dist/` stays gitignored: the artifact is produced by CI, not committed, so a stale
committed copy can never be served instead of a fresh build.

### Alternative, no CI

Publish a `gh-pages` branch containing only the artifact, and set the Pages source to
that branch root:

```
npm run build
git worktree add .gh-pages gh-pages   # or: git checkout -b gh-pages
# commit dist/index.html as index.html on that branch
```

Works from the shell with nothing extra, but the published file is a snapshot — it
diverges from HEAD whenever CI is not re-run. Do not use both routes: Pages serves
whichever source the toggle names.

## Verified at M13

- live Pages URL plays every shipped level;
- offline copy plays identically with zero network requests (check the network
  panel: only the one HTML request).
