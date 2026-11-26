import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { build } from 'esbuild';

/**
 * The shipped artifact must be self-contained (design decision D6): GitHub Pages
 * serves it statically and the same file must play when opened from disk. So the
 * bundle may not depend on absolute URLs or runtime fetches.
 *
 * This rebuilds dist/ rather than trusting a previous build, so `npm test` proves
 * the release artifact even in a clean CI checkout.
 */
test('release artifact is self-contained: no absolute URLs, no runtime fetch', async () => {
  await build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    minify: true,
    legalComments: 'none',
    format: 'iife',
    outfile: 'dist/main.js',
  });
  execFileSync(process.execPath, ['build-html.js'], { stdio: 'ignore' });

  const html = await readFile('dist/index.html', 'utf8');
  assert.ok(html.includes('<canvas'), 'artifact must contain the canvas shell');
  assert.ok(html.includes('<script>'), 'bundle must be inlined');
  assert.ok(!html.includes('./dist/main.js'), 'no external script reference may survive');
  assert.ok(!/https?:\/\//.test(html), 'no absolute URLs may appear in the artifact');
  assert.ok(!/href\s*=\s*["']\//.test(html), 'no root-absolute paths (Pages serves under /user/repo/)');
  assert.ok(!/\bfetch\s*\(/.test(html), 'no runtime fetches — offline mode must match Pages');
});
