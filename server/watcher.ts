import chokidar, { type FSWatcher } from 'chokidar';
import { basename, dirname } from 'node:path';
import { statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseLine, type Event } from './parse.ts';

export const PROJECTS_DIR = `${homedir()}/.claude/projects`;
const GLOB = `${PROJECTS_DIR}/**/*.jsonl`;
const INITIAL_SEED_LINES = 50;

export type WatcherEvent = {
  event: Event;
  filePath: string;
  sessionId: string;
  projectHashDir: string;
  fromInitialSeed: boolean;
};

export type WatcherHandlers = {
  onEvent: (we: WatcherEvent) => void;
  onFileKnown?: (info: { filePath: string; sessionId: string; projectHashDir: string }) => void;
};

type FileState = {
  offset: number;
  partial: string;
};

function sessionIdFromPath(filePath: string): string {
  return basename(filePath).replace(/\.jsonl$/, '');
}

function readChunk(fd: number, start: number, end: number): string {
  const size = end - start;
  if (size <= 0) return '';
  const buf = Buffer.alloc(size);
  const n = readSync(fd, buf, 0, size, start);
  return buf.subarray(0, n).toString('utf8');
}

// Read file, split into complete lines (trailing partial kept separately).
function consume(filePath: string, state: FileState): { lines: string[]; newOffset: number; partial: string } {
  const stat = statSync(filePath);
  if (stat.size < state.offset) {
    // truncation / rewrite: reset
    state.offset = 0;
    state.partial = '';
  }
  if (stat.size === state.offset) {
    return { lines: [], newOffset: state.offset, partial: state.partial };
  }
  const fd = openSync(filePath, 'r');
  let text: string;
  try {
    text = readChunk(fd, state.offset, stat.size);
  } finally {
    closeSync(fd);
  }
  const combined = state.partial + text;
  const endsWithNL = combined.endsWith('\n');
  const parts = combined.split('\n');
  let partial = '';
  let lines: string[];
  if (endsWithNL) {
    lines = parts.slice(0, -1);
  } else {
    partial = parts[parts.length - 1] ?? '';
    lines = parts.slice(0, -1);
  }
  return { lines, newOffset: stat.size, partial };
}

// Read and parse last N lines of a file without tracking offset (for seeding).
function tailLines(filePath: string, n: number): string[] {
  const stat = statSync(filePath);
  if (stat.size === 0) return [];
  const fd = openSync(filePath, 'r');
  try {
    // simple approach: read whole file if < 4 MB (JSONL files here are small to moderate)
    // otherwise read last 512 KB which is plenty for 50 lines
    const CAP = 512 * 1024;
    const start = Math.max(0, stat.size - CAP);
    const text = readChunk(fd, start, stat.size);
    const rows = text.split('\n').filter((l) => l.length > 0);
    // if we clipped the first line, drop it (likely incomplete)
    if (start > 0 && rows.length > 0) rows.shift();
    return rows.slice(-n);
  } finally {
    closeSync(fd);
  }
}

export function startWatcher(handlers: WatcherHandlers, opts: { projectsDir?: string } = {}): { stop: () => void; states: Map<string, FileState> } {
  const root = opts.projectsDir ?? PROJECTS_DIR;
  const states = new Map<string, FileState>();

  const emit = (filePath: string, rawLine: string, fromInitialSeed: boolean) => {
    const ev = parseLine(rawLine);
    if (!ev) return;
    const sessionId = ev.session_id || sessionIdFromPath(filePath);
    const projectHashDir = basename(dirname(filePath));
    handlers.onEvent({ event: { ...ev, session_id: sessionId }, filePath, sessionId, projectHashDir, fromInitialSeed });
  };

  const seedFile = (filePath: string) => {
    try {
      handlers.onFileKnown?.({
        filePath,
        sessionId: sessionIdFromPath(filePath),
        projectHashDir: basename(dirname(filePath)),
      });
      const lines = tailLines(filePath, INITIAL_SEED_LINES);
      for (const line of lines) emit(filePath, line, true);
      const { size } = statSync(filePath);
      states.set(filePath, { offset: size, partial: '' });
    } catch (err) {
      console.warn('[watch] seed failed for', filePath, err);
    }
  };

  const tailFile = (filePath: string) => {
    let state = states.get(filePath);
    if (!state) {
      state = { offset: 0, partial: '' };
      states.set(filePath, state);
    }
    try {
      const { lines, newOffset, partial } = consume(filePath, state);
      state.offset = newOffset;
      state.partial = partial;
      for (const line of lines) emit(filePath, line, false);
    } catch (err) {
      console.warn('[watch] tail failed for', filePath, err);
    }
  };

  // ignoreInitial: true because we seed manually via seedFile for deterministic offset positioning.
  // usePolling: true because Bun + chokidar on macOS misses native fsevents for append-only files.
  const watcher: FSWatcher = chokidar.watch(`${root}/**/*.jsonl`, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: false,
    usePolling: true,
    interval: 500,
    binaryInterval: 500,
  });

  // Seed existing files first (synchronous) before starting watcher events.
  try {
    // Use a one-shot scan via chokidar with ignoreInitial:false would fire add events for existing
    // files. Cleaner: do a glob ourselves via fs.
    const { readdirSync, existsSync } = require('node:fs') as typeof import('node:fs');
    if (existsSync(root)) {
      for (const projectDir of readdirSync(root, { withFileTypes: true })) {
        if (!projectDir.isDirectory()) continue;
        const dirPath = `${root}/${projectDir.name}`;
        for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            seedFile(`${dirPath}/${entry.name}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[watch] initial scan failed:', err);
  }

  watcher.on('add', (filePath) => {
    if (!filePath.endsWith('.jsonl')) return;
    handlers.onFileKnown?.({
      filePath,
      sessionId: sessionIdFromPath(filePath),
      projectHashDir: basename(dirname(filePath)),
    });
    // new file: offset 0
    states.set(filePath, { offset: 0, partial: '' });
    tailFile(filePath);
  });

  watcher.on('change', (filePath) => {
    if (!filePath.endsWith('.jsonl')) return;
    if (process.env.COLONY_DEBUG) console.log('[watch] change', filePath);
    tailFile(filePath);
  });

  watcher.on('error', (err) => console.warn('[watch] error:', err));

  // Periodic rescan. Chokidar polling on macOS sometimes misses brand-new subdirs that appear
  // after a sibling session spawns a new claude CLI. Re-read the projects root every few seconds
  // and seed any .jsonl files we haven't seen yet.
  const rescanTimer = setInterval(() => {
    try {
      const { readdirSync, existsSync } = require('node:fs') as typeof import('node:fs');
      if (!existsSync(root)) return;
      for (const projectDir of readdirSync(root, { withFileTypes: true })) {
        if (!projectDir.isDirectory()) continue;
        const dirPath = `${root}/${projectDir.name}`;
        for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
          const full = `${dirPath}/${entry.name}`;
          if (!states.has(full)) {
            if (process.env.COLONY_DEBUG) console.log('[watch] rescan found', full);
            seedFile(full);
            // tail on next tick in case file was partially written during seed
            setTimeout(() => tailFile(full), 200);
          } else {
            // Known file: still try to tail in case change events missed.
            tailFile(full);
          }
        }
      }
    } catch (err) {
      if (process.env.COLONY_DEBUG) console.warn('[watch] rescan failed:', err);
    }
  }, 2_000);

  return {
    stop: () => { clearInterval(rescanTimer); void watcher.close(); },
    states,
  };
}

// CLI smoke test: `bun server/watcher.ts` — logs every parsed event.
if (import.meta.main) {
  console.log('[watch] tailing', PROJECTS_DIR);
  const { states } = startWatcher({
    onEvent: ({ event, sessionId, fromInitialSeed }) => {
      if (fromInitialSeed) return; // skip the seed flood
      const tag = event.kind.padEnd(12);
      const short = sessionId.slice(0, 8);
      console.log(`[${short}] ${tag} ${event.text ?? ''}`);
    },
    onFileKnown: ({ filePath, sessionId }) => {
      console.log(`[watch] known: ${sessionId.slice(0, 8)} ${filePath}`);
    },
  });
  console.log(`[watch] seeded ${states.size} files. live. Ctrl-C to stop.`);
}
