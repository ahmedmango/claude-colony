// POST /api/reveal — open a session's cwd in Finder, VSCode, or Terminal.
// macOS-first (osascript / `open` / `code`); Linux + Windows fall through to `open`-like equivalents.

import { existsSync } from 'node:fs';

export type RevealTarget = 'finder' | 'vscode' | 'terminal' | 'iterm';

export type RevealRequest = {
  path: string;
  target: RevealTarget;
};

export type RevealResult = {
  ok: boolean;
  target: RevealTarget;
  path: string;
  reason?: string;
};

function sanitize(p: string): string | null {
  // Require absolute path, resolve symlinks lazily. Reject traversal.
  if (!p || p.includes('\0')) return null;
  if (!p.startsWith('/')) return null;
  if (p.includes('..')) return null;
  if (!existsSync(p)) return null;
  return p;
}

export async function reveal(req: RevealRequest): Promise<RevealResult> {
  const path = sanitize(req.path);
  if (!path) return { ok: false, target: req.target, path: req.path, reason: 'invalid or missing path' };

  const platform = process.platform;

  try {
    switch (req.target) {
      case 'finder': {
        if (platform === 'darwin') {
          Bun.spawn(['open', path], { stdout: 'ignore', stderr: 'ignore' });
        } else if (platform === 'linux') {
          Bun.spawn(['xdg-open', path], { stdout: 'ignore', stderr: 'ignore' });
        } else {
          Bun.spawn(['explorer', path], { stdout: 'ignore', stderr: 'ignore' });
        }
        return { ok: true, target: 'finder', path };
      }

      case 'vscode': {
        Bun.spawn(['code', path], { stdout: 'ignore', stderr: 'ignore' });
        return { ok: true, target: 'vscode', path };
      }

      case 'terminal': {
        if (platform === 'darwin') {
          Bun.spawn(['open', '-a', 'Terminal', path], { stdout: 'ignore', stderr: 'ignore' });
        } else if (platform === 'linux') {
          // Best effort on Linux.
          Bun.spawn(['x-terminal-emulator', '-e', 'bash', '-c', `cd "${path}" && exec bash`], { stdout: 'ignore', stderr: 'ignore' });
        } else {
          return { ok: false, target: 'terminal', path, reason: 'not supported on this platform' };
        }
        return { ok: true, target: 'terminal', path };
      }

      case 'iterm': {
        if (platform !== 'darwin') return { ok: false, target: 'iterm', path, reason: 'iTerm is macOS-only' };
        // Open iTerm tab at cwd and launch `claude` immediately — one click = ready to chat.
        const safeP = path.replace(/'/g, `'\\''`);
        const script = `tell application "iTerm"
  activate
  tell current window to create tab with default profile command "/bin/sh -c 'cd \\"${safeP}\\" && exec claude'"
end tell`;
        Bun.spawn(['osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' });
        return { ok: true, target: 'iterm', path };
      }

      default:
        return { ok: false, target: req.target, path, reason: 'unknown target' };
    }
  } catch (err) {
    return { ok: false, target: req.target, path, reason: String(err) };
  }
}
