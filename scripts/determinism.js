import esbuild from 'esbuild';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

/**
 * Cross-runtime determinism check (docs/checklist.md §2). One entry point
 * (scratch/sweep-entry.ts) is bundled twice — ESM for Node, IIFE for the browser —
 * and both run the same combos. Outcomes must be identical; the entry records no
 * timing, so there is nothing legitimate to differ.
 */
const ENTRY = 'scratch/sweep-entry.ts';
const NODE_OUT = 'scratch/sweep-node.mjs';
const BROWSER_OUT = 'scratch/sweep-browser.js';

await esbuild.build({ entryPoints: [ENTRY], bundle: true, format: 'esm', platform: 'node', outfile: NODE_OUT });
await esbuild.build({ entryPoints: [ENTRY], bundle: true, format: 'iife', platform: 'browser', globalName: 'sweep', outfile: BROWSER_OUT });

const { sweepAll } = await import(`../${NODE_OUT}`);
const nodeOutcomes = sweepAll();

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ path: BROWSER_OUT });
const browserOutcomes = await page.evaluate(() => window.sweep.sweepAll());
await browser.close();

let mismatches = 0;
for (let i = 0; i < nodeOutcomes.length; i++) {
  const a = nodeOutcomes[i];
  const b = browserOutcomes[i];
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    mismatches++;
    console.log(`mismatch ${a.levelId} pull ${a.pull} @ ${a.deg}°\n  node:    ${JSON.stringify(a)}\n  browser: ${JSON.stringify(b)}`);
  }
}

const wins = nodeOutcomes.filter((o) => o.phase === 'won').length;
const timeouts = nodeOutcomes.filter((o) => o.frozeAtTimeout).length;
console.log(`${nodeOutcomes.length} combos: ${wins} won, ${timeouts} hit the settle timeout`);
console.log(`node ${nodeOutcomes.length} outcomes vs browser ${browserOutcomes.length} outcomes, ${mismatches} mismatch(es)`);
console.log(mismatches === 0 ? 'DETERMINISTIC across node and chromium' : 'NOT deterministic');
process.exit(mismatches === 0 ? 0 : 1);
