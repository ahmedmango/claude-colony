// Claude Colony daemon: tails ~/.claude/projects/**/*.jsonl, renders live sessions as ants.
//
// Run:  bun server/index.ts
// Open: http://localhost:3174

import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWatcher } from './watcher.ts';
import {
  ensureSession,
  ingestEvent,
  listSessions,
  onSession,
  onEvent,
  onConflict,
  startStatusTicker,
} from './sessions.ts';
import { listSkills, getSkill } from './skills.ts';
import { listProjects } from './projects.ts';
import { ADAPTERS, describeAll, type Provider } from './llm/index.ts';
import { notifyWaiting, clearNotificationDedupe } from './notify.ts';

const PORT = Number(process.env.COLONY_PORT ?? 3174);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(REPO, 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.png':  'image/png',
  '.md':   'text/plain; charset=utf-8',
};

// --- API --------------------------------------------------------------------
const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

app.get('/api/skills', (c) =>
  c.json({
    skills: listSkills().map((s) => ({
      name: s.name,
      emoji: s.emoji,
      color: s.color,
      description: s.description,
      model: s.model,
      allowedTools: s.allowedTools,
      deniedTools: s.deniedTools,
    })),
  }),
);

app.get('/api/projects', (c) =>
  c.json({ projects: listProjects() }),
);

app.get('/api/providers', async (c) =>
  c.json({ providers: await describeAll() }),
);

app.post('/api/spawn', async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { projectPath?: string; prompt?: string; skill?: string; provider?: string; model?: string }
    | null;
  if (!body || !body.projectPath || !body.prompt) {
    return c.json({ error: 'projectPath + prompt required' }, 400);
  }
  const provider = (body.provider ?? 'claude') as Provider;
  const adapter = ADAPTERS[provider];
  if (!adapter) return c.json({ error: `unknown provider: ${provider}` }, 400);

  const status = await adapter.available();
  if (!status.ok) return c.json({ error: status.reason ?? 'provider not available' }, 400);

  const skill = body.skill ? getSkill(body.skill) : undefined;
  try {
    const result = await adapter.spawn({
      provider,
      cwd: body.projectPath,
      prompt: body.prompt,
      model: body.model ?? skill?.model,
      systemPrompt: skill?.body,
      allowedTools: skill?.allowedTools,
      deniedTools: skill?.deniedTools,
    });
    return c.json({ ok: true, spawn: result, skill: skill?.name ?? null });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get('/api/sessions', (c) =>
  c.json({
    sessions: listSessions().map((s) => ({
      id: s.id,
      projectPath: s.projectPath,
      projectLabel: s.projectLabel,
      status: s.status,
      lastEventTs: s.lastEventTs,
      lastEventKind: s.lastEventKind,
      lastText: s.lastText,
      lastToolName: s.lastToolName,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      cacheRead: s.cacheRead,
      cacheCreate: s.cacheCreate,
      costUsd: Math.round(s.costUsd * 1000) / 1000,
      eventCount: s.eventCount,
      model: s.model,
      firstSeen: s.firstSeen,
    })),
    serverTs: Date.now(),
  }),
);

// Static: serve /public, plus top-level docs.
app.get('*', async (c) => {
  const url = new URL(c.req.url);
  let p = url.pathname === '/' ? '/index.html' : url.pathname;

  // Top-level readable files (README.md etc.)
  if (['/README.md', '/ARCHITECTURE.md', '/AUTH.md', '/LICENSE'].includes(p)) {
    const full = join(REPO, p);
    if (existsSync(full)) {
      return new Response(Bun.file(full), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  // docs/ directory (svg, md)
  if (p.startsWith('/docs/')) {
    const full = join(REPO, p);
    if (existsSync(full) && full.startsWith(join(REPO, 'docs'))) {
      const ext = full.slice(full.lastIndexOf('.'));
      return new Response(Bun.file(full), {
        headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream' },
      });
    }
  }

  const full = join(PUBLIC, p);
  if (!full.startsWith(PUBLIC)) return c.notFound();
  if (!existsSync(full)) return c.notFound();
  const ext = full.slice(full.lastIndexOf('.'));
  return new Response(Bun.file(full), {
    headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream' },
  });
});

// --- WebSocket clients ------------------------------------------------------
type WSClient = { id: number; send: (msg: string) => void; close: () => void };
const clients = new Set<WSClient>();
let nextClientId = 1;

function publish(msg: { event: string; data: unknown }) {
  const frame = JSON.stringify(msg);
  for (const c of clients) {
    try { c.send(frame); } catch {}
  }
}

onSession(({ session, prev, reason }) => {
  publish({
    event: 'session.update',
    data: {
      id: session.id,
      projectPath: session.projectPath,
      projectLabel: session.projectLabel,
      status: session.status,
      lastEventTs: session.lastEventTs,
      lastEventKind: session.lastEventKind,
      lastText: session.lastText,
      lastToolName: session.lastToolName,
      tokensIn: session.tokensIn,
      tokensOut: session.tokensOut,
      costUsd: Math.round(session.costUsd * 1000) / 1000,
      eventCount: session.eventCount,
      model: session.model,
      lastWaitingKind: session.lastWaitingKind,
      reason,
      prev,
    },
  });

  // Fire desktop notification on transition INTO waiting.
  if (prev !== 'waiting' && session.status === 'waiting') {
    notifyWaiting(session, session.lastWaitingKind ?? 'waiting');
  }
  // Clear dedupe when ant leaves waiting state.
  if (prev === 'waiting' && session.status !== 'waiting') {
    clearNotificationDedupe(session.id);
  }
});

onEvent(({ session, event }) => {
  publish({
    event: 'session.event',
    data: {
      sessionId: session.id,
      kind: event.kind,
      ts: event.ts,
      text: event.text,
      toolName: event.tool_name,
      isError: Boolean(event.is_error),
    },
  });
});

onConflict((conflict) => {
  console.log('[conflict] file=%s sessions=%o', conflict.filePath, conflict.sessions);
  publish({ event: 'conflict', data: conflict });
});

// --- boot -------------------------------------------------------------------
console.log(`[colony] boot — PID ${process.pid}`);
console.log(`[colony] tailing ~/.claude/projects/**/*.jsonl`);

startWatcher({
  onFileKnown: (info) => {
    ensureSession(info);
  },
  onEvent: (we) => {
    ingestEvent(we);
  },
});

startStatusTicker(2_000);

console.log(`[colony] http://localhost:${PORT}`);

// Open browser on boot unless --no-open or COLONY_NO_OPEN=1.
const NO_OPEN = process.argv.includes('--no-open') || process.env.COLONY_NO_OPEN === '1';
const START_PATH = '/live.html';
if (!NO_OPEN) {
  setTimeout(() => {
    const url = `http://localhost:${PORT}${START_PATH}`;
    const cmd = process.platform === 'darwin' ? 'open'
              : process.platform === 'win32'  ? 'start'
              : 'xdg-open';
    try {
      Bun.spawn([cmd, url], { stdout: 'ignore', stderr: 'ignore' });
      console.log(`[colony] opened ${url}`);
    } catch {}
  }, 400);
}

// Clean shutdown.
function shutdown(reason: string) {
  console.log(`[colony] shutdown (${reason})`);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Bun.serve with websocket upgrade
Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (server.upgrade(req)) return; // handled
      return new Response('ws upgrade failed', { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const id = nextClientId++;
      const client: WSClient = {
        id,
        send:  (msg) => ws.send(msg),
        close: () => ws.close(),
      };
      clients.add(client);
      (ws as any).__client = client;
      console.log(`[ws] + client ${id} (total ${clients.size})`);

      // Hello frame: snapshot of all known sessions so UI can hydrate.
      ws.send(JSON.stringify({
        event: 'hello',
        data: {
          sessions: listSessions().map((s) => ({
            id: s.id,
            projectPath: s.projectPath,
            projectLabel: s.projectLabel,
            status: s.status,
            lastEventTs: s.lastEventTs,
            lastEventKind: s.lastEventKind,
            lastText: s.lastText,
            lastToolName: s.lastToolName,
            tokensIn: s.tokensIn,
            tokensOut: s.tokensOut,
            costUsd: Math.round(s.costUsd * 1000) / 1000,
            eventCount: s.eventCount,
            model: s.model,
          })),
          serverTs: Date.now(),
        },
      }));
    },
    close(ws) {
      const client = (ws as any).__client as WSClient | undefined;
      if (client) {
        clients.delete(client);
        console.log(`[ws] - client ${client.id} (total ${clients.size})`);
      }
    },
    message() { /* no-op; client is read-only for now */ },
  },
});
