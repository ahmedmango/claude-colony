# Claude Colony — Authentication

_How credentials work today. Honest about what's not built yet._

## TL;DR

**Colony does not handle your Anthropic credentials.**

It tails the local jsonl files Claude Code already writes. To spawn new agents, it shells out to your `claude` CLI — which uses *its own* credential store. Colony never sees a token.

```
your machine
├── ~/.claude/.credentials.json     ← managed by `claude login`, NOT by colony
├── ~/.claude/projects/*.jsonl      ← read by colony (read-only)
└── colony daemon                   ← no creds, no API key, no signing
```

This means:

- ✓ No "set up auth" step in colony.
- ✓ Same Claude account you already use in your terminal works automatically.
- ✓ Switching accounts: `claude login` somewhere else; colony picks up new sessions.
- ✗ No way for colony to charge a different account than the one your `claude` CLI uses.

---

## Two ways your sessions get billed

### 1. Claude Code subscription (the typical case)

You're on a Claude Max or Team plan. `claude` CLI authenticates with that subscription. Colony just observes those sessions — no extra cost beyond what you'd already pay.

### 2. BYO `ANTHROPIC_API_KEY`

You run `claude` with `ANTHROPIC_API_KEY=sk-ant-xxx claude ...`. Anthropic Console bills your card per token. Colony's running cost meter ($X.XX in the drawer) is your real spend.

Colony reads the `model` field from each assistant message and applies approximate per-1M-token pricing for input / output / cache_read / cache_write. Pricing table lives in `server/sessions.ts` — adjust if Anthropic's rates change.

---

## What about hosting colony?

Colony is currently **single-user, local-only.** No multi-user auth. No login. The browser at `localhost:3174` is open to anyone who can reach `localhost:3174` on your machine. If you tunnel it (Cloudflare Tunnel, ngrok, Tailscale), use those tools' access controls.

**Not built:** password gate, magic link, OIDC/SSO. The previous AUTH.md sketched these as if they existed. They don't. They're a `// TODO` — happy to land them if there's demand.

---

## What about Colony Cloud / managed hosting?

Not built. Earlier docs listed `cloud.claudecolony.io` and OAuth flows — those were aspirational. There is no hosted colony today, no signup page, no shared infra.

If you want phone access, the path today is:

1. Run colony on your laptop or a home VPS.
2. Tunnel it: Cloudflare Tunnel / Tailscale / ngrok.
3. Open the URL on your phone.
4. (Optional) Add to home screen — PWA manifest is shipped.

---

## What about SMS / WhatsApp?

Also not built. The README and prior AUTH.md mentioned a Twilio plugin — that file (`scripts/enable-sms.ts`) does not exist. Removed from the docs.

What does work for "ping me when an agent waits":

- macOS Notification Center (built in)
- Linux `notify-send` (built in)
- Windows PowerShell toast (built in)
- Browser tab title flash (built in)

Roadmap: Web Push for true cross-device push notifications. SMS bridge depends on someone wanting it enough to write it.

---

## Security model

What lives where, and who can read it:

| artifact                | where                                 | who can read                            |
| ----------------------- | ------------------------------------- | --------------------------------------- |
| Anthropic API key / Claude Code creds | `~/.claude/.credentials.json` (managed by `claude` CLI) | your OS user; colony never opens it |
| Session transcripts     | `~/.claude/projects/<hash>/<id>.jsonl` | your OS user; colony reads with `fs.openSync` |
| Conversation logs in colony memory | RAM only, lost on restart | the colony process; clients via WS  |
| Spawned subprocess output | inherited stdio, logged to `colony.log` | the colony process |
| Reveal targets          | `osascript` / `open` / `code` / `xdg-open` | local user only; sandbox-safe paths only |
| Text-back to terminal   | `osascript` types into matching iTerm/Terminal tab | requires that tab to be open and visible |

### Path safety

`POST /api/reveal` and `POST /api/text` reject:
- non-absolute paths
- paths containing `..`
- paths with null bytes
- paths that don't exist on disk

This is enforced in `server/reveal.ts`.

### What colony **does not** do

- Send anything over the network beyond `localhost`
- Phone home / telemetry / analytics
- Store anything to disk beyond the in-memory state
- Store your prompts or transcripts (those live where Claude Code put them)
- Touch your `~/.claude/.credentials.json` or any other secret

---

## See also

- [README.md](./README.md) — install, what it does, roadmap
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system topology
