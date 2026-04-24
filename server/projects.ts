// Auto-discover git repos in common project dirs. Cheap: looks 2 levels deep.

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type Project = {
  path: string;          // absolute
  label: string;         // ~-relative
  name: string;          // leaf dir
  mtime: number;         // most recent modification (for sort)
  hasClaudeMd: boolean;
};

const HOME = homedir();

const CANDIDATES = [
  join(HOME, 'code'),
  join(HOME, 'ai', 'projects'),
  join(HOME, 'projects'),
  join(HOME, 'Documents', 'code'),
  join(HOME, 'Desktop'),
];

function safeReaddir(p: string) {
  try { return readdirSync(p, { withFileTypes: true }); } catch { return []; }
}

function safeStat(p: string) {
  try { return statSync(p); } catch { return null; }
}

function isRepo(p: string) {
  return existsSync(join(p, '.git'));
}

function labelPath(abs: string): string {
  if (abs.startsWith(HOME)) return '~' + abs.slice(HOME.length);
  return abs;
}

function mostRecentFileMtime(p: string): number {
  // cheap heuristic: look at dir mtime (bumped on any file rename/create in that dir)
  // plus a couple of common signals. Ignore node_modules / .git.
  const rootStat = safeStat(p);
  let newest = rootStat ? rootStat.mtimeMs : 0;
  for (const fname of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'src']) {
    const s = safeStat(join(p, fname));
    if (s && s.mtimeMs > newest) newest = s.mtimeMs;
  }
  return newest;
}

export function listProjects(): Project[] {
  const out = new Map<string, Project>();
  for (const base of CANDIDATES) {
    if (!existsSync(base)) continue;
    for (const entry of safeReaddir(base)) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      const abs = join(base, entry.name);
      if (!isRepo(abs)) continue;
      out.set(abs, {
        path: abs,
        label: labelPath(abs),
        name: entry.name,
        mtime: mostRecentFileMtime(abs),
        hasClaudeMd: existsSync(join(abs, 'CLAUDE.md')),
      });
    }
  }
  return Array.from(out.values()).sort((a, b) => b.mtime - a.mtime);
}
