import { spawnSync } from 'node:child_process';
import esbuild from 'esbuild';
import { startServer } from '../server.js';

/**
 * One-command launcher: bundles src/main.ts in esbuild watch mode and serves the
 * repo, so `npm run dev` is enough to play. Both halves run in this process — no
 * process manager dependency, and Ctrl+C stops watch and the server together.
 *
 * `--open` launches the default browser. Reload the page manually after a rebuild;
 * there is no HMR (docs/deployment.md).
 */
const PORT = Number(process.env.PORT ?? 5173);
const URL = `http://localhost:${PORT}`;

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/main.js',
  target: 'es2022',
});
await context.watch();

try {
  await startServer(PORT);
} catch (error) {
  await context.dispose();
  if (error.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use. Stop the other server, or: PORT=5174 npm run dev`);
    process.exit(1);
  }
  throw error;
}

console.log(`angry-pigs → ${URL}`);
if (process.argv.includes('--open')) openBrowser(URL);

async function shutdown() {
  await context.dispose();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function openBrowser(url) {
  const command =
    process.platform === 'win32' ? { cmd: 'cmd', args: ['/c', 'start', '', url] }
    : process.platform === 'darwin' ? { cmd: 'open', args: [url] }
    : { cmd: 'xdg-open', args: [url] };
  const result = spawnSync(command.cmd, command.args, { stdio: 'ignore' });
  if (result.error || result.status !== 0) console.log(`could not open a browser; load ${url} manually`);
}
