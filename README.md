<p align="center">
  <img src="./docs/hero.svg" alt="Claude Colony — a pixel-art ant farm that watches your Claude Code sessions" width="720" />
</p>

<h3 align="center"><code>🐜 claude-colony</code></h3>

<p align="center">
  Watch every <a href="https://www.anthropic.com/claude-code">Claude Code</a> session you've started, live, in one pixel-art map.<br/>
  See costs. Get pinged when one needs you. Text back from the same window.
</p>

<p align="center">
  <a href="https://github.com/ahmedmango/claude-colony/actions/workflows/test.yml"><img src="https://github.com/ahmedmango/claude-colony/actions/workflows/test.yml/badge.svg" /></a>
  <img src="https://img.shields.io/badge/license-MIT-8ad06a?style=flat-square" />
  <img src="https://img.shields.io/badge/runtime-bun-f472b6?style=flat-square" />
  <img src="https://img.shields.io/badge/status-v0.1.0-ffb870?style=flat-square" />
</p>

---

## What it actually is

Claude Colony is a tiny **local daemon** + browser app that **tails `~/.claude/projects/**/*.jsonl`** — the append-only transcript Claude Code writes for every session — and shows each live session as an ant crawling through a pixel-art view of your filesystem.

Observer mode. Not orchestrator. **No SDK, no API key, no account.**

> 🐜 You don't run colony to start agents. You run it to *see what your existing claude sessions are doing.*

## Honest scope

| works today | doesn't yet |
|---|---|
| ✓ Live observer of every `claude` session you start | ✗ `bunx claude-colony` (not on npm yet) |
| ✓ macOS / Linux / Windows desktop notifications when an agent waits | ✗ Mobile push notifications (responsive UI ✓, no Web Push) |
| ✓ Cost + token + cache-hit meter per session, in real time | ✗ Cost ceilings that auto-pause (only alerts) |
| ✓ Text back to the running agent (types into its iTerm/Terminal tab) | ✗ True chat IPC into the claude process |
| ✓ Spawn new ants from the UI (`N` key) — claude CLI in target dir | ✗ Multi-user / cloud / SSO |
| ✓ Open the project in Finder / VSCode / iTerm / Terminal one click | ✗ Worktree isolation between ants on same project |
| ✓ Conflict detection (2 ants on same file within 60s) | ✗ Auto-resolve / merge |
| ✓ 6 markdown skills, drop in your own | ✗ Skill marketplace |
| ✓ Claude provider works end-to-end | ✗ OpenAI / Gemini / Ollama (interface stubbed only) |

If your README compares to this table, you're calibrated.

---

## Does it save credits?

It **does not pause** runaway sessions automatically (yet). What it does:

1. **Cost meter per session, live.** Every assistant response updates the running USD total — model-aware pricing for input / output / cache-read / cache-write.
2. **Cache-hit % shown in the drawer.** If a session shows <40% hit rate, you're paying full token price for context Claude Code could be reusing. Visible signal → you investigate.
3. **`COLONY_COST_WARN`** fires a desktop notification once a session crosses the threshold (default $5). You decide what to do — `kill <pid>`, send `Ctrl+C` to its terminal, or let it ride.
4. **`$/event` ratio** in the drawer flags noisy sessions burning money on cheap operations.

What it lets you avoid: surprises. I personally found out I'd spent $385 on Claude lifetime by running this. That alone changed behavior.

## Does it reduce CPU on your Mac?

**No.** Be clear: every `claude` session you run still runs on your Mac (~200-500 MB each). Colony itself is light (~50 MB) but it observes — it doesn't move work.

Where it *does* help your Mac: **closing a runaway session you'd have left running.** The cost alert + visible meter = ant-killing intuition.

A real "remote compute" mode (agents on a server, your Mac just renders) is roadmap, not reality. The previous README implied otherwise. That was wrong, fixed now.

## Can you text it?

Yes. Click any ant → drawer → **TEXT THE AGENT** box → Enter.

Mechanism: `osascript` finds the iTerm session (or Terminal.app tab) whose cwd matches the session's project path, and types your message into it. **Same as you typing.** Works because the running `claude` CLI is reading stdin from that tab.

Caveat: that terminal tab needs to be open. Click the **iTerm** reveal button first if it isn't.

Future: real IPC into claude (no AppleScript) when the CLI exposes one.

## Can you monitor?

Yes:

- **Live event stream** per session (Read, Edit, Bash, etc. with timestamps)
- **Top stats**: how many ants are busy, errored, total spent
- **Per-project health**: tree foliage scales with activity, turns red on error rate >5%
- **File-level conflicts**: 2+ ants on same file within 60s → red toast + chamber pulse
- **Live log panel** (press `L`)
- **Tooltips on hover**: tokens, status, last tool, cost

---

## Install

```bash
git clone https://github.com/ahmedmango/claude-colony
cd claude-colony
bun install
bun run doctor          # verifies your environment
bun start
```

Browser auto-opens **http://localhost:3174/live.html**. First visit shows a 4-step tour. Press `?` anytime to reopen it.

### Requirements

- [Bun](https://bun.sh) ≥ 1.0
- [Claude Code](https://www.anthropic.com/claude-code) (the `claude` CLI on your PATH)
- macOS — full feature set (notifications, iTerm/Terminal text-back, reveal). Linux works for everything except text-back. Windows: UI works, notifications work, native bridges are best-effort.

---

## How to read the colony

| visual                       | means                              |
| ---------------------------- | ---------------------------------- |
| 🐜 walking ant                | session is busy (recent activity)  |
| 🟠 pulsing orange ring        | agent is waiting on you — click    |
| 🔴 red shake                  | session errored                    |
| 💤 faded ant                  | idle (no activity > 20s)           |
| glowing dot on ant's back    | active tool call, color = type     |
| green chamber pulse          | tool returned successfully         |
| red chamber pulse            | error or merge conflict            |
| tree foliage growing         | project getting more activity      |
| tree foliage red             | project's error rate > 5%          |

### Six ways you know an agent needs you

1. Pulsing orange ring around the ant
2. ⚠ NEEDS YOU inbox glow (top-right)
3. Speech bubble above ant
4. Browser tab title flashes `(1) Claude Colony`
5. **macOS / Linux / Windows desktop notification** (also sound on macOS)
6. Dock bounce on the colony's browser tab

Quiet with `COLONY_SILENT=1`.

---

## Spawn ants from the UI

Press **`N`** or click **◆ SPAWN +**. Pick:

- Project (auto-discovered from `~/code/`, `~/projects/`, `~/Desktop/`)
- Skill (6 seeded — see `skills/*/SKILL.md`)
- Provider (only Claude is wired; OpenAI / Gemini / Ollama show as v0.2)
- Model (per-provider list)
- Task prompt

Behind the scenes: `claude -p "<prompt>" --model <model> --allowedTools <...>` in the project dir. The new session writes its own jsonl, the watcher catches it, an egg hatches in the queen chamber and the new ant crawls to its tunnel.

### Adding a skill

Drop `skills/<name>/SKILL.md`:

```markdown
---
name: reviewer
emoji: 🕵️
color: "#a07055"
description: reviews PRs line-by-line, flags risks
model: claude-opus-4-7
allowed-tools: [Read, Grep, Glob, Bash]
denied-tools: [Edit, Write, MultiEdit]
---

You are a PR reviewer ant. Your job is to...
```

Restart server. Skill appears in the spawn modal.

---

## Architecture (real, not aspirational)

```
   your terminals                       your Mac
   ─────────────                        ────────
   claude session A ─┐
   claude session B ─┼─writes─▸ ~/.claude/projects/<hash>/<id>.jsonl
   claude session C ─┘                    │
                                          │ chokidar polling
                                          ▼
                                  ┌─────────────────┐
                                  │  Bun + Hono     │
                                  │  parse + state  │      ← you
                                  │  notify (osa)   │      ↓
                                  │  spawn + reveal │  WebSocket
                                  └────────┬────────┘      │
                                           └─── browser  ◂─┘
                                                live.html
```

No remote worker. No cloud. No database. ~10 MB resident memory. Bun 1.3+, two npm deps (`hono`, `chokidar`).

Full details: **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## Config

| flag / env                    | default | what                              |
| ----------------------------- | ------- | --------------------------------- |
| `--port <n>` / `COLONY_PORT`  | `3174`  | server port                       |
| `--no-open` / `COLONY_NO_OPEN`| off     | don't auto-open browser           |
| `--silent` / `COLONY_SILENT`  | off     | suppress desktop notifications    |
| `COLONY_COST_WARN`            | `5`     | USD threshold for cost alert (`0` = off) |
| `COLONY_DEBUG=1`              | off     | verbose watcher logs              |

## Docker

```bash
docker run --rm -it \
  -p 3174:3174 \
  -v "$HOME/.claude:/root/.claude:ro" \
  ghcr.io/ahmedmango/claude-colony
```

The Docker image is **dashboard-only**. Spawn / reveal / text-back need access to your host's apps — run native for those.

---

## Roadmap

Shipped (v0.1.0):
- [x] Live observer via jsonl tailing (chokidar polling)
- [x] Project + session auto-discovery
- [x] busy / idle / waiting / error state machine
- [x] Desktop notifications on waiting + cost threshold
- [x] Spawn modal w/ 6 skills + provider/model picker
- [x] Conflict detection per file
- [x] Reveal: Finder / VSCode / iTerm / Terminal
- [x] **Text-back via iTerm/Terminal AppleScript**
- [x] First-run tour
- [x] Cache hit rate + $/event meter
- [x] Mobile responsive layout
- [x] PWA manifest (Add to Home Screen)
- [x] CLI entrypoint + auto-open browser
- [x] CI (Ubuntu + macOS, bun test + boot smoke)

Next:
- [ ] `npm publish` → real `bunx claude-colony` one-liner (your call)
- [ ] Cost auto-pause / kill switch
- [ ] OpenAI / Gemini / Ollama adapters (real, not stubs)
- [ ] Web Push (mobile lock-screen alerts)
- [ ] Replay mode: scrub a session
- [ ] Worktree isolation between ants on same project
- [ ] Menu bar app (Tauri)

---

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md). MIT. Fork, break, PR. Issues + Discussions on.

```
claude-colony/
├── server/          # Bun + Hono daemon (watcher, parser, state, notify, spawn, reveal, text)
├── public/          # live.html, demo.html, gallery.html, index.html
├── skills/          # markdown skills
├── bin/colony.mjs   # CLI shim (node + bun)
├── scripts/         # doctor, recorders
├── tests/           # bun test
└── docs/            # ARCHITECTURE, AUTH, hero.svg
```

No build step. Bun runs `.ts` natively.

---

## Sibling

- **[vibecosting](https://github.com/ahmedmango/vibecosting)** — same data source, opposite philosophy. The focused CLI that fell out of building this. `bunx vibecosting --plan max-5x` and you get a clean spend dashboard in <100ms. No daemon, no browser. Use claude-colony if you want the visualization; vibecosting if you just want the number.

## Credits

- [Claude Code](https://www.anthropic.com/claude-code) writes the transcripts that make this possible.
- [Claude Town](https://github.com/yazinsai/town) by Yazin — sibling project, different metaphor.
- [town-watcher](https://github.com/ahmedmango/town-watcher) — original jsonl-tailing reference; `server/watcher.ts` and `server/parse.ts` started there.
- E.O. Wilson on stigmergy.

<sub>~ the queen thanks you ~</sub>
