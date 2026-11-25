/**
 * Zero-dependency dev static server. Serves the repo root over http://localhost
 * so ES-module / fetch requests are not blocked by the file:// CORS rule.
 * No HMR: reload the page manually after `npm run watch` rebuilds dist/main.js.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, join, relative, isAbsolute } from 'node:path';

const PORT = Number(process.env.PORT ?? 5173);
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

server.listen(PORT, () => {
  console.log(`angry-pigs dev server → http://localhost:${PORT}`);
  console.log('run `npm run watch` in a second terminal');
});
