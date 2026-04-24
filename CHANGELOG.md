# Changelog

All notable changes to Claude Colony are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-24

Initial public release. The colony observes Claude Code sessions from `~/.claude/projects/` and renders them as ants.

### Added

- **Live observer**: tails all `~/.claude/projects/**/*.jsonl` files in real time (chokidar polling, handles macOS fsevents quirks)
- **Session state model**: busy / idle / waiting / error, with a soft-waiting heuristic (assistant-text + 6s silence → waiting)
- **Desktop notifications** on waiting state (macOS via `osascript`, Linux `notify-send`, Windows PowerShell toast). Dedupe 60s, `COLONY_SILENT=1` to disable.
- **Queen spawn modal** (`N` key) — pick project + skill + model + prompt, shells `claude -p` in target cwd
- **6 seeded skills** in `skills/*/SKILL.md`: scout, worker, soldier, scholar, engineer, debugger — each a Markdown frontmatter + system prompt
- **Model adapter layer** (`server/llm/`) — Claude via CLI today; OpenAI / Gemini / Ollama interfaces sketched for v0.2
- **Conflict detection**: tracks which files each session touches via tool_use events; two sessions on same file within 60s fires a WS `conflict` event
- **Reveal endpoints** (`POST /api/reveal`): open a session's cwd in Finder, VSCode, iTerm, or Terminal.app
- **Cost + token accounting** per session (input/output/cache tokens × model price)
- **CLI entrypoint** (`bin/colony.mjs`) with `--port` / `--no-open` / `--silent` flags
- **Auto-open browser** on boot (`COLONY_NO_OPEN=1` to suppress)
- **PWA manifest** + `apple-mobile-web-app-*` meta tags — installable on iOS + Chrome
- **Mobile responsive** layout in `live.html` (≤768px: bottom-sheet drawer, compact top bar, tap-friendly ants)
- **Landing page** (`/`) + **animated 8-act demo** (`/demo.html`) + **6-vibe gallery** (`/gallery.html`)
- **Tests**: 24 unit tests across `parse.ts`, `reveal.ts`, `skills.ts` using `bun test`

### Technical

- Runtime: Bun ≥ 1.0, Node ≥ 18 (for the CLI shim)
- Dependencies: only `chokidar` + `hono` (2 packages) — zero framework, zero bundler, zero build step
- In-memory state only; no database; reconnecting browsers replay from snapshot
- ~8K LOC of TypeScript + HTML/CSS

### Known gaps

- `bunx claude-colony` not yet live — package.json is `npm publish`-ready but not published
- OpenAI / Gemini / Ollama adapters are stubs (marked as such in UI)
- No git worktree isolation between ants on the same project
- No Web Push (browser-tab notifications only; OS notifications handled server-side)
- No replay / scrub mode (event history persists in-memory only)

### Credits

- [Claude Code](https://www.anthropic.com/claude-code) writes the transcripts that make the observer possible
- [Claude Town](https://github.com/yazinsai/town) by Yazin — sibling metaphor
- [town-watcher](https://github.com/ahmedmango/town-watcher) — reference implementation for jsonl tailing; `server/watcher.ts` + `server/parse.ts` originated there

---

<!--
Unreleased template:

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
-->
