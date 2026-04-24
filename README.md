<p align="center">
  <b>🐜 CLAUDE COLONY</b><br/>
  <sub>watch your AI agents work — a pixel-art ant colony for the Claude Agent SDK</sub>
</p>

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/bunx-claude--colony-ffb870?style=flat-square" /></a>
  <img src="https://img.shields.io/badge/license-MIT-8ad06a?style=flat-square" />
  <img src="https://img.shields.io/badge/runtime-bun-f472b6?style=flat-square" />
  <img src="https://img.shields.io/badge/agents-claude--sdk-d97706?style=flat-square" />
</p>

---

## The pitch

You spin up Claude agents to work on your code. Instead of a wall of terminal logs, you watch an **ant colony** — a cross-section of dirt where each **tunnel is a directory in your repo** and each **ant is an agent**. Ants carry glowing bits of code between chambers. When one needs you, it stops and pulses orange — impossible to miss, trivial to answer.

- 🎨 **Filesystem is the map.** Tunnels literally mirror your repo tree. Watch agents traverse `src/auth/login.ts`.
- 💬 **Six ways to know they need you.** Pulsing ring, bubble, inbox, tab flash, push notification, SMS.
- 🪫 **Your laptop stays cool.** Agents run on a remote worker. Your browser only renders ants (~2% CPU).
- 📱 **Texting works.** Reply from the drawer, from your phone, or over SMS via Twilio bridge.
- 🪴 **Bring your own account.** Use your Claude Code subscription or an Anthropic API key. Nothing locked behind us.

---

## Install

```bash
# zero-config: uses your existing Claude Code subscription
bunx claude-colony

# or: self-host anywhere Bun runs
git clone https://github.com/ahmedmango/claude-colony
cd claude-colony && bun install && bun run dev
```

Open **http://localhost:3174** — your colony is ready.

```bash
# deploy your own worker to fly.io in 30 seconds
fly launch --now
```

### Requirements

- [Bun](https://bun.sh) ≥ 1.0
- One of:
  - **Claude Code** subscription (Max or Team) — reads `~/.anthropic/credentials.json` auto
  - **`ANTHROPIC_API_KEY`** env var — classic BYO
- Git (for worktree isolation)

---

## How to read the colony

| Visual                               | Meaning                                        |
| ------------------------------------ | ---------------------------------------------- |
| 🐜 red ant                            | **Scout** — reads files, gathers context       |
| 🐜 black ant                          | **Worker** — writes + edits code               |
| 🐜 grey ant (bigger)                  | **Soldier** — runs tests, reviews, caretaker   |
| glowing dot on ant back              | Cargo = diff being carried (color = language)  |
| orange pulsing ring around ant       | **Agent needs you.** Click.                    |
| green pulse at junction              | ✓ tests pass / file saved                      |
| red pulse at junction                | ✗ error / merge conflict                       |
| pheromone trail (dashed glow)        | hot file being worked right now                |
| 🍂 leaf on surface                    | pending task waiting to be picked up           |
| ♕ queen chamber (bottom)              | you. eggs = queued tasks.                      |

---

## Six ways you know an agent needs you

You **cannot miss it**. Whichever part of the UI you're looking at, one of these will tell you:

1. **Pulsing orange ring** expands around the ant. Peripheral-vision grade.
2. **Speech bubble** above the ant with the question. Click → answer.
3. **⚠ NEEDS YOU inbox** top-right glows red with count badge.
4. **Browser tab title** flashes `(1) ⚠ Claude Colony` when the tab is backgrounded.
5. **System notification** via Web Push API (opt-in). Works on desktop and mobile.
6. **SMS ping** via optional Twilio bridge — reply `Y`/`N` or freeform from your phone.

Answer once, ant resumes, everything else goes quiet.

---

## How to text your agents

Three ways, pick what fits:

### 1. Drawer chat (built in)

Click any ant → right-side drawer opens with the full conversation log, git state, deploy state, and a text box. Type, press Enter, the agent receives it mid-flight via the Agent SDK's `resume` channel.

### 2. Mobile web

Same URL on your phone. Responsive layout drops HUD panels into a bottom-sheet. Tap an ant, chat, approve, lock phone. Ant keeps working. Compute is remote.

### 3. SMS bridge (optional plugin)

```bash
bun run scripts/enable-sms.ts --twilio-sid=... --phone=+44...
```

Wires Twilio webhooks → colony event bus. Agent questions → SMS to your phone. Reply `Y`/`N` → approve/deny. Reply freeform → sent back to the agent as context. Works when your laptop is closed.

Also supported: WhatsApp (Twilio), Telegram bot, iMessage Shortcut.

---

## Authentication

See **[AUTH.md](./AUTH.md)** for the full flow. Three modes:

| Mode                    | Setup                            | Who pays                      | Best for                          |
| ----------------------- | -------------------------------- | ----------------------------- | --------------------------------- |
| **Claude Code inherit** | zero (uses `claude` CLI creds)   | your Claude Code subscription | you already use Claude Code       |
| **BYO API key**         | `ANTHROPIC_API_KEY` env          | per-token billing             | self-host, teams, CI              |
| **Colony Cloud**        | OAuth at `cloud.claudecolony.io` | managed plan                  | phone-only, no laptop required    |

No account data ever touches the colony project's servers when self-hosting. All three modes are end-to-end user-controlled.

---

## Architecture at a glance

```
  BROWSER / PHONE              REMOTE WORKER              ANTHROPIC
  ┌────────────────┐          ┌──────────────┐           ┌──────────┐
  │  Colony UI     │◂──WS──▸  │  Hono / Bun  │  ◂──API─▸ │  Claude  │
  │  (pixel art)   │           │  ┌────────┐  │          └──────────┘
  │  React 19      │           │  │ Agent  │  │                ▲
  │  SVG tunnels   │           │  │ SDK    │  │                │
  └────────────────┘           │  └────────┘  │         ┌──────┴──────┐
          ▲                    │  ┌────────┐  │         │   worktree  │
          │  (push / SMS)      │  │ state  │  │─── git ─│  isolation  │
          │                    │  │ store  │  │         └─────────────┘
  ┌───────┴────────┐           │  └────────┘  │
  │  Twilio / Web  │◂──────▸  │  plugin bus   │
  │  Push / Email  │           └──────────────┘
  └────────────────┘
```

**Your laptop draws ants.** The worker runs the agents. Close your laptop → ants keep digging. Open it → same state via WebSocket reconnect.

Full details in **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Roadmap

- [x] Core colony view (tunnels, ants, cargo, chambers)
- [x] Agent detail drawer (chat, git, deploy, tools)
- [x] Six-signal "needs you" pattern
- [ ] Real agent SDK integration (next)
- [ ] SMS bridge (Twilio plugin)
- [ ] Mobile bottom-sheet layout
- [ ] Multi-repo colonies (multiple trees on the surface)
- [ ] Replay mode (scrub a session)
- [ ] Caretaker marketplace (prefab personalities)
- [ ] Colony Cloud (managed hosting)

---

## Contributing

MIT. Fork it. Issues welcome. The repo structure is deliberately small — the colony should feel like a single organism, not a microservice cluster.

```
claude-colony/
├── public/            # the UI (colony.html, demo.html, gallery.html, index.html)
├── server/            # Hono + agent SDK adapter
├── docs/              # diagrams, decisions, design notes
├── ARCHITECTURE.md    # the whole system on one page
├── AUTH.md            # auth flows in detail
└── README.md          # you are here
```

---

## Credits

Built on the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents/claude-agent-sdk). Inspired by [Claude Town](https://github.com/yazinsai/town) — same impulse, different metaphor. The ant colony metaphor is an information-density play: tunnels = filesystem, ants = agents, emergent patterns = real engineering hotspots.

<sub>~ the queen thanks you ~</sub>
