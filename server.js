/**
 * Zero-dependency dev static server. Serves the repo root over http://localhost
 * so ES-module / fetch requests are not blocked by the file:// CORS rule.
 * No HMR: reload the page manually after a rebuild.
 *
 * Run directly (`npm run serve`) or import `startServer()` — `scripts/dev.js` does
 * the latter so watch + serve live in one process and Ctrl+C stops both.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const target = resolve(join(ROOT, pathname === '/' ? '/index.html' : pathname));

  // Never escape the repo root.
  const rel = relative(ROOT, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${pathname}`);
  }
});

export function startServer(port = Number(process.env.PORT ?? 5173)) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolveListen(server);
    });
  });
}

/** True when this file was the process entry point rather than an import. */
function launchedDirectly() {
  return process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (launchedDirectly()) {
  const port = Number(process.env.PORT ?? 5173);
  await startServer(port);
  console.log(`angry-pigs dev server → http://localhost:${port}`);
  console.log('run `npm run watch` in a second terminal, or `npm run dev` for both');
}
