#!/usr/bin/env node
/* claude-colony — CLI entrypoint.
 *
 * Spawns the Bun server from the installed package dir, forwards stdio.
 * Works invoked via `bunx claude-colony` or `npx claude-colony` (requires bun on PATH).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(REPO, 'server', 'index.ts');

function fail(msg) {
  console.error(`\n[claude-colony] ${msg}\n`);
  process.exit(1);
}

if (!existsSync(SERVER)) fail(`server entry missing at ${SERVER}`);

// Require bun.
const hasBun = await new Promise((r) => {
  const t = spawn(process.platform === 'win32' ? 'where' : 'which', ['bun'], { stdio: 'ignore' });
  t.on('close', (code) => r(code === 0));
});
if (!hasBun) {
  fail([
    'Bun is required. Install with:',
    '',
    '  curl -fsSL https://bun.sh/install | bash',
    '',
    'Then re-run:  bunx claude-colony',
  ].join('\n'));
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
claude-colony — watch your Claude Code sessions as a pixel-art ant farm.

Usage:
  bunx claude-colony [options]

Options:
  --port <n>     port to serve on  (default 3174, env COLONY_PORT)
  --no-open      don't auto-open the browser
  --silent       suppress desktop notifications (env COLONY_SILENT=1)
  -h, --help     this help

Once running, open http://localhost:3174/live.html

Env:
  COLONY_PORT    override port
  COLONY_SILENT=1   no desktop notifications
  COLONY_NO_OPEN=1  don't auto-open browser
  COLONY_DEBUG=1    verbose watcher logs

Source: https://github.com/ahmedmango/claude-colony
`);
  process.exit(0);
}

// Flag translations
const env = { ...process.env };
const portIdx = args.indexOf('--port');
if (portIdx >= 0 && args[portIdx + 1]) { env.COLONY_PORT = args[portIdx + 1]; args.splice(portIdx, 2); }
if (args.includes('--silent')) { env.COLONY_SILENT = '1'; args.splice(args.indexOf('--silent'), 1); }

console.log(`◆ claude-colony starting on :${env.COLONY_PORT ?? 3174}`);

const child = spawn('bun', [SERVER, ...args], {
  cwd: REPO,
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT',  () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
