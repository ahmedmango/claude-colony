# Claude Colony — Architecture

_One page. No microservice soup._

## Design principles

1. **Single worker, single browser, single truth.** One Bun process holds all state. Browser is a thin view. No distributed coordination.
2. **Remote compute by default.** The browser is always a renderer — never runs the Agent SDK. Your laptop can close.
3. **Files are the filesystem.** Ant positions = literal paths in your repo. No virtual projections.
4. **Events flow in one direction.** Worker emits, browser + integrations subscribe. No polling. No client-side orchestration.
5. **Plugins bolt on, never in.** SMS, Push, Email, Telegram are optional event subscribers. The core never knows about them.

---

## Topology

```
╔══════════════════╗        WebSocket (events)         ╔══════════════════╗
║  BROWSER / PHONE ║◂──────────────────────────────────║   BUN WORKER     ║
║                  ║                                    ║                  ║
║  · Colony SPA    ║    HTTP (REST, control plane)     ║  · Hono router   ║
║  · SVG + divs    ║──────────────────────────────────▸║  · Agent manager ║
║  · ~2% CPU       ║                                    ║  · Event bus     ║
╚══════════════════╝                                    ║  · State store   ║
         ▲                                              ║  · Git worktrees ║
         │  opt: Web Push                               ╚════════╦═════════╝
         │                                                       ║
         │                                 Agent SDK (streaming) ║
╔════════╩═════════╗                                             ▼
║  PLUGIN BUS      ║          ╔═══════════════════════╗
║  · Twilio (SMS)  ║ subscribe║   @anthropic-ai/      ║
║  · WhatsApp      ║◂─────────║   claude-agent-sdk    ║
║  · Telegram      ║          ╚═══════════════════════╝
║  · iMessage      ║                    ║
║  · Email         ║                    ▼ HTTPS
╚══════════════════╝          ╔═══════════════════════╗
                              ║    ANTHROPIC API      ║
                              ╚═══════════════════════╝
```

---

## Components

### 1. `server/` — the Bun worker

A single Hono app on Bun, serving HTTP + WebSocket.

```
server/
├── index.ts               # entry: boot, serve public/, mount routes, ws
├── routes/
│   ├── buildings.ts       # colonies (projects) CRUD
│   ├── agents.ts          # spawn/kill/message agents
│   ├── events.ts          # WS upgrade, subscribe stream
│   └── auth.ts            # password or OAuth handshake
├── agents/
│   ├── manager.ts         # lifecycle: spawn → run → reap
│   ├── sdk.ts             # Agent SDK wrapper, maps SDK events → colony events
│   ├── state.ts           # per-agent state machine (busy/idle/waiting/done/error)
│   └── worktree.ts        # git worktree add/merge/prune
├── store/
│   ├── memory.ts          # in-memory event log + snapshot
│   └── sqlite.ts          # optional durable store
├── bus.ts                 # event emitter (pub/sub)
└── plugins/
    ├── twilio-sms.ts      # SMS in/out via Twilio webhook
    ├── web-push.ts        # VAPID push subscriptions
    └── email.ts           # SMTP fallback
```

**Key call path** — spawning an agent:

```
POST /api/agents  { projectPath, prompt, style }
  └▸ AgentManager.spawn()
      ├▸ Worktree.add()          # git worktree add .git/wt/<id>
      ├▸ SdkAdapter.start()      # @anthropic-ai/claude-agent-sdk
      │   └▸ emits events: message, tool_call, tool_result, question
      └▸ Bus.publish('agent:spawned', {...})
           ├▸ WebSocket broadcast → all connected clients
           ├▸ Twilio plugin (if agent ends up waiting)
           └▸ Web Push (if browser tab hidden + subscription)
```

### 2. `public/` — the UI

No build step required for the mock. Real app:

```
public/
├── index.html          # landing / marketing
├── colony.html         # the app (SVG tunnels, ants, drawer)
├── demo.html           # auto-play walkthrough
├── gallery.html        # 6 UI aesthetic sketches
└── app/                # (production) React 19 + Vite build output
```

UI data flow:

```
[user action]            [event]             [render]
    │                       │                    │
    ▼                       ▼                    ▼
  click ant ─────────▸  GET /api/agents/:id ──▸ drawer populates
  type + Enter ──────▸  POST /agents/:id/msg ▸ message appears in chat, ant keeps working
  approve bubble ────▸  POST /agents/:id/answer ▸ orange ring fades, ant resumes
                        (agent sees answer on next SDK tick)
```

### 3. Event model

Everything the UI shows comes from a single event stream. Reproducible, resumable, replayable.

| Event                  | Payload                                    | Triggers                  |
| ---------------------- | ------------------------------------------ | ------------------------- |
| `agent:spawned`        | id, building, prompt, worktree             | ant appears               |
| `agent:state`          | id, state, task                            | ant color / pose changes  |
| `agent:message`        | id, role, content                          | chat scrolls              |
| `agent:tool_call`      | id, tool, input                            | tool row in drawer        |
| `agent:tool_result`    | id, tool, output, ok                       | chamber pulse (green/red) |
| `agent:question`       | id, text, options                          | bubble + ring + inbox     |
| `agent:answered`       | id, answer                                 | bubble dissolves          |
| `agent:done`           | id, summary                                | ant goes idle in chamber  |
| `agent:error`          | id, error                                  | red halo, log error       |
| `building:created`     | id, path                                   | new tunnel grows          |
| `deploy:status`        | building, url, state                       | deploy panel updates      |

### 4. State store

In-memory by default (fits in < 10 MB per colony). Optionally SQLite for persistence across restarts. No Redis, no Postgres required.

```ts
// shape
{
  buildings: Map<id, Building>,
  agents:    Map<id, Agent>,
  eventLog:  Event[]      // append-only, replayed on reconnect
}
```

Browsers reconnecting replay events since their last cursor — same pattern as Phoenix LiveView or Server-Sent Events. No divergence.

### 5. Git worktree isolation

Each agent gets its own worktree so concurrent agents never stomp on each other:

```
your-repo/
├── .git/
│   └── wt/
│       ├── scout-01/     # agent A's checkout
│       ├── worker-03/    # agent B's checkout
│       └── ...
└── (main working tree untouched)
```

On `agent:done` with clean tests: auto-merge back into the checked-out branch. On conflict: leave the worktree, surface a red chamber pulse, wait for your direction.

---

## Remote-compute math

| Mode                  | Local CPU   | Local RAM  | Battery hit | Works when laptop closed? |
| --------------------- | ----------- | ---------- | ----------- | ------------------------- |
| **Classic local SDK** | 40–90%      | 2–6 GB     | huge        | no                        |
| **Colony (default)**  | 1–3%        | < 200 MB   | negligible  | **yes**                   |
| **Phone only**        | 0%          | 0%         | 0%          | **yes**                   |

The worker runs on cheap infra: a `shared-cpu-1x` fly.io machine is plenty for 5 simultaneous agents and costs ~$2/mo idle, pay-per-use when active.

---

## Deployment

Three supported modes:

### 1. Local-only (dev)
`bun run dev` — worker and UI on your laptop. Not the point of the project, but works.

### 2. Self-host (recommended)
```bash
fly launch --now           # fly.io
# or
railway up                  # railway
# or just any VM
ssh server "bunx claude-colony --data-dir /var/lib/colony"
```
Your UI at `https://colony.<your-domain>`. Your agents run there. You control everything.

### 3. Colony Cloud (future)
Managed tier for folks who want to pay $9/mo and skip deployment. Still end-to-end your Anthropic API key.

---

## Non-goals

- Being a Claude Code replacement. Colony is a **watchtower and orchestrator** on top of Claude agents. It does not try to be your editor.
- Distributed workers. One colony = one worker. If you need more, spin up a second colony.
- Long-term log retention. SQLite holds a week by default. Point at external logging if you need more.
- Owning your agent prompts. Prompts live in your repo (`CLAUDE.md`, `AGENTS.md`). Colony just runs them.

---

## Decisions log

Short, one-line "why":

- **Bun over Node** — single runtime, WebSocket built-in, zero config.
- **Hono over Express** — matches Bun's style, 10× smaller footprint.
- **SVG ants over canvas** — HTML lets us attach click handlers per-ant, accessible, and 5 ants doesn't need WebGL.
- **In-memory state default** — 95% of use cases fit. SQLite opt-in for the 5%.
- **Git worktrees over branches** — parallel agents without commits stomping each other. Native Git, no hacks.
- **One colony = one project directory** — multi-project means multiple trees on the surface. Simpler model.
- **No auth in the core** — the SDK uses whatever Claude creds you point at. Colony just forwards.
