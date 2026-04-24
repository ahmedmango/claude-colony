// In-memory session state store. Maps Claude Code .jsonl sessions to colony ants.

import { homedir } from 'node:os';
import type { Event } from './parse.ts';

export type SessionStatus = 'busy' | 'idle' | 'waiting' | 'error';

export type Session = {
  id: string;                    // session uuid (from .jsonl filename)
  projectPath: string;           // decoded cwd, e.g. /Users/ahmedh/code/foo
  projectLabel: string;          // display: ~/code/foo
  filePath: string;              // absolute path to the .jsonl
  status: SessionStatus;
  lastEventTs: number;
  lastEventKind: string;
  lastText: string;              // truncated last thing said / tool called
  lastToolName?: string;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreate: number;
  costUsd: number;
  eventCount: number;
  model?: string;
  firstSeen: number;
  lastError?: string;
};

const sessions = new Map<string, Session>();

const HOME = homedir();
const BUSY_WINDOW_MS = 20_000;   // activity in last 20s = busy

// --- pricing (per 1M tokens, USD). Approx Claude Sonnet 4.x / Opus 4.x. -------
// Simple enough for MVP. Adjust with real rates.
const PRICE: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  sonnet: { in: 3,  out: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  haiku:  { in: 1,  out:  5, cacheRead: 0.10, cacheWrite: 1.25 },
  opus:   { in: 15, out: 75, cacheRead: 1.50, cacheWrite: 18.75 },
};

function priceForModel(model: string | undefined) {
  if (!model) return PRICE.sonnet;
  const lower = model.toLowerCase();
  if (lower.includes('opus'))  return PRICE.opus;
  if (lower.includes('haiku')) return PRICE.haiku;
  return PRICE.sonnet;
}

// Decode Claude Code's project-hash-dir back to a filesystem path.
// `-Users-ahmedh-code-foo` -> `/Users/ahmedh/code/foo`
// Lossy when dir names contain '-'. Good enough for display.
export function decodeProjectDir(hashDir: string): string {
  return hashDir.replace(/^-/, '/').replace(/-/g, '/');
}

export function labelPath(abs: string): string {
  if (abs.startsWith(HOME)) return '~' + abs.slice(HOME.length);
  return abs;
}

// --------- conflict tracking ------------------------------------------------
// Map<filePath, Map<sessionId, touchTs>>. Cleaned on a ticker.
const fileTouches = new Map<string, Map<string, number>>();
const CONFLICT_WINDOW_MS = 60_000;

export type Conflict = {
  filePath: string;
  sessions: string[];    // session ids overlapping on this file
  detectedAt: number;
};

function extractFilePath(ev: Event): string | undefined {
  if (!ev.tool_input || typeof ev.tool_input !== 'object') return undefined;
  const inp = ev.tool_input as Record<string, unknown>;
  // common field names across Claude's tools
  const candidates = [inp.file_path, inp.filePath, inp.path, inp.target, inp.notebook_path];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return undefined;
}

function recordTouch(sessionId: string, ev: Event): Conflict | null {
  if (ev.kind !== 'tool_use') return null;
  const fp = extractFilePath(ev);
  if (!fp) return null;
  let entry = fileTouches.get(fp);
  if (!entry) { entry = new Map(); fileTouches.set(fp, entry); }
  entry.set(sessionId, ev.ts);
  // purge old
  const now = Date.now();
  for (const [sid, ts] of entry) {
    if (now - ts > CONFLICT_WINDOW_MS) entry.delete(sid);
  }
  if (entry.size >= 2) {
    return { filePath: fp, sessions: Array.from(entry.keys()), detectedAt: now };
  }
  return null;
}

// --------- subscribers ------------------------------------------------------
type Listener<T> = (payload: T) => void;
const sessionListeners = new Set<Listener<{ session: Session; prev?: SessionStatus; reason: string }>>();
const eventListeners   = new Set<Listener<{ session: Session; event: Event }>>();
const conflictListeners = new Set<Listener<Conflict>>();
export function onConflict(fn: Listener<Conflict>) { conflictListeners.add(fn); return () => conflictListeners.delete(fn); }

export function onSession(fn: Listener<{ session: Session; prev?: SessionStatus; reason: string }>) {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}
export function onEvent(fn: Listener<{ session: Session; event: Event }>) {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

function emitSessionUpdate(session: Session, prev: SessionStatus | undefined, reason: string) {
  for (const fn of sessionListeners) fn({ session, prev, reason });
}
function emitLiveEvent(session: Session, event: Event) {
  for (const fn of eventListeners) fn({ session, event });
}

// --------- public API -------------------------------------------------------
export function listSessions(): Session[] {
  return Array.from(sessions.values()).sort((a, b) => b.lastEventTs - a.lastEventTs);
}
export function getSession(id: string): Session | undefined { return sessions.get(id); }

export function ensureSession(info: { filePath: string; sessionId: string; projectHashDir: string }): Session {
  const existing = sessions.get(info.sessionId);
  if (existing) return existing;
  const projectPath = decodeProjectDir(info.projectHashDir);
  const s: Session = {
    id: info.sessionId,
    projectPath,
    projectLabel: labelPath(projectPath),
    filePath: info.filePath,
    status: 'idle',
    lastEventTs: 0,
    lastEventKind: 'unknown',
    lastText: '',
    tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheCreate: 0,
    costUsd: 0,
    eventCount: 0,
    firstSeen: Date.now(),
  };
  sessions.set(info.sessionId, s);
  emitSessionUpdate(s, undefined, 'created');
  return s;
}

export function ingestEvent(we: {
  event: Event;
  filePath: string;
  sessionId: string;
  projectHashDir: string;
  fromInitialSeed: boolean;
}) {
  const s = ensureSession(we);
  const ev = we.event;
  const prev = s.status;

  s.lastEventTs   = ev.ts;
  s.lastEventKind = ev.kind;
  s.lastText      = ev.text ?? s.lastText;
  s.eventCount   += 1;

  // Prefer real cwd from raw event (fixes lossy '-' → '/' decoder when project names contain hyphens).
  if (ev.raw && typeof ev.raw === 'object') {
    const cwd = (ev.raw as any).cwd;
    if (typeof cwd === 'string' && cwd.length > 0 && cwd !== s.projectPath) {
      s.projectPath = cwd;
      s.projectLabel = labelPath(cwd);
    }
  }

  if (ev.kind === 'tool_use' && ev.tool_name) s.lastToolName = ev.tool_name;

  if (ev.usage) {
    s.tokensIn     += ev.usage.input_tokens;
    s.tokensOut    += ev.usage.output_tokens;
    s.cacheRead    += ev.usage.cache_read_input_tokens;
    s.cacheCreate  += ev.usage.cache_creation_input_tokens;
    s.model         = ev.usage.model;
    const p = priceForModel(ev.usage.model);
    s.costUsd += (ev.usage.input_tokens  * p.in)         / 1_000_000;
    s.costUsd += (ev.usage.output_tokens * p.out)        / 1_000_000;
    s.costUsd += (ev.usage.cache_read_input_tokens * p.cacheRead)   / 1_000_000;
    s.costUsd += (ev.usage.cache_creation_input_tokens * p.cacheWrite) / 1_000_000;
  }

  if (ev.kind === 'error' || ev.is_error) {
    s.status = 'error';
    s.lastError = ev.text;
  } else {
    // simple rule: recent activity = busy, else idle.
    // Assistant text with no following tool_use within a few seconds often means "asked a question" = waiting,
    // but detecting that cleanly needs lookahead; defer to next iteration.
    s.status = 'busy';
  }

  // don't spam listeners during seed; just update state quietly.
  if (!we.fromInitialSeed) {
    emitLiveEvent(s, ev);
    if (prev !== s.status) emitSessionUpdate(s, prev, 'event');
    const conflict = recordTouch(we.sessionId, ev);
    if (conflict) {
      for (const fn of conflictListeners) fn(conflict);
    }
  }
}

// Background tick: flip busy -> idle when nothing heard recently.
export function startStatusTicker(intervalMs = 2_000) {
  setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values()) {
      if (s.status === 'busy' && now - s.lastEventTs > BUSY_WINDOW_MS) {
        const prev = s.status;
        s.status = 'idle';
        emitSessionUpdate(s, prev, 'idle-timeout');
      }
    }
  }, intervalMs);
}
