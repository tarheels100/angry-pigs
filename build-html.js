/**
 * Produce the release artifact: a single self-contained dist/index.html with the
 * bundle inlined and levels compiled in by esbuild. Works on GitHub Pages and
 * opened directly from disk, with zero runtime fetches.
 */
import { readFile, writeFile } from 'node:fs/promises';

const TAG = '<script type="module" src="./dist/main.js"></script>';

const html = await readFile('index.html', 'utf8');
const js = await readFile('dist/main.js', 'utf8');

if (!html.includes(TAG)) {
  throw new Error('index.html is missing the entry script tag: ' + TAG);
}

// Guard against a literal </script> inside the bundle terminating the inline tag.
const safeJs = js.replace(/<\/script>/g, '<\\/script>');
const out = html.replace(TAG, `<script>${safeJs}</script>`);

await writeFile('dist/index.html', out);
console.log(`dist/index.html written (${(safeJs.length / 1024).toFixed(1)} KB inline)`);
