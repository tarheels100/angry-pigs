import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { build } from 'esbuild';

/**
 * The shipped artifact must be self-contained (design decision D6): GitHub Pages serves it
 * statically and the same file must play when opened from disk, so nothing it needs is
 * loaded over the network.
 *
 * Static checks cover the markup and dynamic imports. A bundled library may still *contain*
 * unused network code (Tone.js ships a notation loader), so the real guarantee is empirical:
 * `tests/browser/game.browser.mjs` boots the artifact with every network request aborted and
 * still plays the stage.
 *
 * This rebuilds dist/ rather than trusting a previous build, so `npm test` proves the release
 * artifact even in a clean CI checkout.
 */
test('release artifact is self-contained: no remote references, no dynamic imports', async () => {
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
  // Nothing in the markup may point outside the artifact.
  assert.ok(!/<(script|link|img|a)\s[^>]*https?:\/\//i.test(html), 'no markup references a remote URL');
  assert.ok(!/href\s*=\s*["']\//.test(html), 'no root-absolute paths (Pages serves under /user/repo/)');
  assert.ok(!/\bimport\s*\(\s*['"`]/.test(html), 'no dynamic import of a module path — everything must be in the single bundle');
  
});
