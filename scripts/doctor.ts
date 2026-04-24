#!/usr/bin/env bun
// Colony doctor — checks the environment for anything that'd stop the colony from working.
// Run: `bun scripts/doctor.ts`

import { existsSync, accessSync, constants, readdirSync } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();

type Check = { name: string; ok: boolean; detail: string; tip?: string };
const checks: Check[] = [];

function say(ok: boolean, name: string, detail: string, tip?: string) {
  checks.push({ name, ok, detail, tip });
}

// ---------- runtime ----------
say(true, 'platform', `${platform()} ${arch()}`);

try {
  const r = Bun.version;
  say(true, 'bun', r);
} catch {
  say(false, 'bun', 'not available', 'install Bun: curl -fsSL https://bun.sh/install | bash');
}

try {
  say(true, 'node', process.version.replace(/^v/, ''));
} catch {
  say(false, 'node', 'not available');
}

// ---------- claude CLI ----------
async function whichBin(bin: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(['/usr/bin/env', 'which', bin], { stdout: 'pipe', stderr: 'ignore' });
    const out = await new Response(proc.stdout).text();
    const path = out.trim().split('\n')[0];
    return path || null;
  } catch {
    return null;
  }
}

const claudeBin = await whichBin('claude');
if (claudeBin) {
  try {
    const proc = Bun.spawn([claudeBin, '--version'], { stdout: 'pipe', stderr: 'ignore' });
    const v = (await new Response(proc.stdout).text()).trim();
    say(true, 'claude CLI', `${v} (${claudeBin})`);
  } catch {
    say(true, 'claude CLI', `found at ${claudeBin}`);
  }
} else {
  say(false, 'claude CLI', 'not on PATH', 'Colony can still OBSERVE existing transcripts, but SPAWN+ in the UI will fail. Install: https://www.anthropic.com/claude-code');
}

// ---------- code CLI (reveal/vscode) ----------
const codeBin = await whichBin('code');
say(Boolean(codeBin), 'VSCode "code" CLI', codeBin ?? 'not found', codeBin ? undefined : 'optional — enables the VSCODE reveal button. In VSCode: Cmd+Shift+P → Shell Command: Install "code" command.');

// ---------- claude projects dir ----------
const PROJECTS = join(HOME, '.claude', 'projects');
if (!existsSync(PROJECTS)) {
  say(false, '~/.claude/projects', 'missing',
    'Run `claude` at least once to create this directory. The colony has nothing to observe until then.');
} else {
  try {
    accessSync(PROJECTS, constants.R_OK);
    const dirs = readdirSync(PROJECTS, { withFileTypes: true }).filter(d => d.isDirectory()).length;
    const count = readdirSync(PROJECTS, { withFileTypes: true, recursive: true }).filter(d => d.name?.endsWith('.jsonl')).length;
    say(true, '~/.claude/projects', `${dirs} project dirs, ${count} .jsonl files`);
  } catch (e) {
    say(false, '~/.claude/projects', 'not readable: ' + String(e));
  }
}

// ---------- port 3174 free? ----------
async function portFree(p: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${p}/healthz`, { signal: AbortSignal.timeout(400) });
    const j = await r.json().catch(() => null);
    return !(j && j.ok);
  } catch {
    return true;
  }
}
const port = Number(process.env.COLONY_PORT ?? 3174);
const free = await portFree(port);
say(free, `port ${port}`, free ? 'free' : 'occupied (maybe colony is already running)',
  free ? undefined : `fine if it's another colony. Otherwise set COLONY_PORT=<n> to change.`);

// ---------- osascript (macOS notifications) ----------
if (process.platform === 'darwin') {
  const osa = await whichBin('osascript');
  say(Boolean(osa), 'osascript (macOS)', osa ? 'present' : 'missing',
    osa ? undefined : 'desktop notifications will not work');
}

// ---------- print ----------
const pad = Math.max(...checks.map(c => c.name.length));
console.log('\n◆ claude-colony doctor\n');
for (const c of checks) {
  const mark = c.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${mark} ${c.name.padEnd(pad)}  ${c.detail}`);
  if (c.tip) console.log(`        \x1b[33m→\x1b[0m ${c.tip}`);
}
const failed = checks.filter(c => !c.ok);
console.log();
if (failed.length === 0) {
  console.log('  all checks passed. boot with:  \x1b[32mbun start\x1b[0m  or  \x1b[32mbunx claude-colony\x1b[0m\n');
} else {
  console.log(`  ${failed.length} check(s) failed. colony may still partially work. fix the tips above and re-run.\n`);
  process.exit(1);
}
