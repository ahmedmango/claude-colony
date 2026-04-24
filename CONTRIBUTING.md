# Contributing to Claude Colony

Thanks for showing up. The colony's a weird little project — keep it weird.

## Dev loop

```bash
git clone https://github.com/ahmedmango/claude-colony
cd claude-colony
bun install
bun run dev      # starts daemon + auto-opens browser at :3174/live.html
```

Edit `server/*.ts` — Bun runs TypeScript natively, no build step. Save → restart (Bun doesn't hot-reload but the restart is ~50ms).

Edit `public/live.html` (or `demo.html`, `index.html`) — reload the browser.

## Code style

- **No build pipeline.** Keep it that way. Single-file HTMLs, raw TypeScript, zero bundler.
- **Terse over clever.** Colony code reads like a script, not a framework.
- **Types welcome, tests welcome.** Neither mandatory yet. Tests in `tests/` using `bun test`.
- **No lint config** — Bun's formatter does 90% of it. Match the surrounding style.
- **Comments explain WHY, not WHAT.** Function names cover what.

## Commit style

Conventional-ish. Subject ≤ 70 chars. Body explains why when non-obvious.

Good:
```
feat: desktop notifications on waiting (macOS + Linux)

Why: builder won't dogfood without alerts out-of-band from the terminal.
Dedupe per-session 60s to prevent spam. COLONY_SILENT=1 to suppress.
```

Bad:
```
updates
```

## PR process

1. Fork, branch, commit, push, open PR.
2. Small PRs land fast. >500 lines, expect questions.
3. Screenshots/recordings for any UI change.
4. One feature per PR. Refactors and features don't mix.

## What to work on

Look at the roadmap in [README.md](./README.md#roadmap-honest). If nothing there speaks to you, open an issue with your idea first — some things don't fit the metaphor and getting alignment before coding saves time.

**Especially welcome:**
- Real OpenAI / Gemini / Ollama adapters in `server/llm/`
- Windows notification polish
- Tests anywhere
- CLAUDE.md integration (detect and show which repos have them)
- Skills — drop a new `skills/<name>/SKILL.md`

**Harder pulls (talk first):**
- Multi-repo display modes (crowded trees problem)
- Replay / scrub mode (needs event log persistence)
- Sub-agent support (Task tool → spawned children on drawer)

## Questions

Open an issue, tag `question`. Or start a discussion on GitHub.

Weird problems welcome. Rude people not.
