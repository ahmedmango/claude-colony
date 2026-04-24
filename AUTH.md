# Claude Colony — Authentication

_How you connect your Claude account. Three modes, all user-controlled._

## TL;DR

Colony is a viewer and orchestrator — **it never stores your credentials**. You hand the worker a way to call Anthropic, and it just forwards. Pick the mode that matches how you already use Claude:

| Mode                            | Setup time | Who pays                      | Best for                        |
| ------------------------------- | ---------- | ----------------------------- | ------------------------------- |
| **① Claude Code inherit**       | 0 min      | your Claude Code subscription | you already use Claude Code     |
| **② BYO Anthropic API key**     | 2 min      | per-token billing             | teams, CI, ephemeral self-host  |
| **③ Colony Cloud** (roadmap)    | 1 min OAuth | managed plan                  | phone-only, no laptop at all    |

You can switch at any time by editing one config file or env var. Mixing per-colony is fine.

---

## ① Claude Code inheritance (default)

If you have the `claude` CLI installed and are logged in (Max / Team plan), colony just reads those credentials:

```
~/.claude/.credentials.json       ← written by `claude login`
```

Colony uses the Agent SDK, which already knows how to source these. You do nothing.

### Why this works

The `@anthropic-ai/claude-agent-sdk` package honors the same credential resolution as the `claude` CLI. When the colony worker spawns an agent, it inherits your subscription seat.

### Flow

```
  you ─┐
       │ 1. `claude login`  (once, interactively)
       ▼
  Claude Code   ──── writes ────▸   ~/.claude/.credentials.json
                                          │
  colony worker ◂──── reads ────────────┘
       │
       │ 2. SDK.spawnAgent({ cwd, prompt })
       ▼
  Anthropic API ── charges your subscription
```

### Caveats

- **Only works when the worker runs on the same machine as `claude` login.** If you self-host colony on fly.io, use mode ② instead — that server does not have your local creds.
- Your subscription's rate limits apply across all colony agents + your own `claude` sessions.

---

## ② BYO Anthropic API key

Classic, simple, works anywhere:

```bash
# locally
export ANTHROPIC_API_KEY=sk-ant-xxxx
bun run dev

# fly.io deploy
fly secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
```

Or put it in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-xxxx
```

Agents will bill your Anthropic Console account directly, per token, at the listed model prices. Colony shows live cost in the Resources HUD.

### Flow

```
  you ── adds env var ──▸  colony worker
                               │
                               │ SDK.spawnAgent({ apiKey: env.ANTHROPIC_API_KEY, ... })
                               ▼
                          Anthropic API ── charges your console account
```

### Security notes

- The key lives **only** in your worker's environment. Never sent to browsers. Never touches the colony project's servers.
- For team deploys, scope a separate key per environment (`ANTHROPIC_API_KEY_STAGING`, etc.).
- Rotate via Anthropic Console; no colony change needed.

### Cost caps (recommended)

Colony supports per-agent and global token caps to prevent runaway spend:

```ts
// .env or config
COLONY_MAX_TOKENS_PER_AGENT=200000
COLONY_MAX_COST_PER_DAY_USD=10
```

When hit, agents enter `waiting` state with the bubble: _"Hit spend cap. Raise it?"_

---

## ③ Colony Cloud (roadmap)

For people who want a real viewer in their browser with **no laptop or server**. You log in with OAuth; our managed workers run your agents; we forward your Anthropic API key end-to-end.

```
  phone browser ── OAuth ──▸  cloud.claudecolony.io
                                    │
                                    │ (stores: your ANTHROPIC_API_KEY, encrypted at rest,
                                    │  never logged, available only to your worker)
                                    ▼
                              managed bun worker
                                    │
                                    ▼
                              Anthropic API ── charges your key
```

### What we never store

- Your code. Worktrees live on worker disks and are wiped on session end.
- Your prompts long-term. We retain 7 days for replay; zeroed after.
- Tool call contents beyond retention window.

### Pricing

Planned: $9/mo flat for managed hosting (3 concurrent agents, unlimited worktrees). Your Anthropic bill is separate, straight to your card via Anthropic.

### Availability

Not yet shipped. Self-hosted (mode ①/②) covers 100% of functionality today.

---

## Authentication for the colony UI itself

Separate concern: who can access the **UI** you host. Three built-in options:

| Mode             | Setup                              | Use when                          |
| ---------------- | ---------------------------------- | --------------------------------- |
| **Password**     | `TOWN_PASSWORD=xxx` env var        | solo, dev, small team             |
| **Magic link**   | SMTP config + `@allowed-emails`    | team of < 20                      |
| **OIDC / SSO**   | `OIDC_CLIENT_*` env vars           | org-wide deploy                   |

All three guard the `/api/*` and `/ws` endpoints. The public pages (`/`, `/demo`, `/gallery`) remain open — they're the marketing site.

---

## Device identity (phone / laptop pairing)

When you open colony from a new device, a short-lived **device token** pairs it with your existing session:

```
  new device → scans QR on desktop
                  ▼
            /api/device/pair?token=xxx
                  ▼
      colony marks device as trusted for 30 days
                  ▼
      browser gets signed cookie → same auth as desktop
```

This is how you get your colony on your phone without typing an API key on a tiny keyboard.

---

## SMS / WhatsApp bridge auth

Optional plugin. Needs a Twilio account:

```bash
bun run scripts/enable-sms.ts \
  --twilio-sid=ACxxxxxx \
  --twilio-token=xxxxxx \
  --phone=+44xxxx
```

Twilio → colony HMAC-signs incoming webhooks. Outbound SMS uses your Twilio key. Nothing touches Anthropic — Twilio is only the human ↔ colony channel. Agent auth is still mode ① or ②.

---

## Security model summary

| Artifact                | Where it lives                              | Who has access         |
| ----------------------- | ------------------------------------------- | ---------------------- |
| Anthropic API key       | worker env var only                         | the worker process     |
| Claude Code creds       | `~/.claude/.credentials.json` (mode ①)     | the worker OS user     |
| Your code               | git worktree on worker disk                 | the worker, git        |
| Conversation logs       | worker state store (memory / SQLite)        | you, via the UI        |
| Session cookie          | signed HMAC (`TOWN_PASSWORD` derived)       | the browser, the worker |
| Twilio webhook secret   | worker env var (`TWILIO_AUTH_TOKEN`)        | the worker             |
| Web Push VAPID keys     | worker env var                              | the worker             |

**Colony never phones home.** No telemetry by default. No "check for updates" beacon. Your colony is yours.
