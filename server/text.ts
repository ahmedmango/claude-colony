// Text-back: type a message into the iTerm/Terminal session running a given claude session.
//
// We don't have a clean IPC into the running `claude` process. Instead, we use macOS's
// scripting bridge (osascript) to find the iTerm tab whose working directory matches the
// session's projectPath, and "write text" into it — same as the user typing.
//
// Best-effort. Fails gracefully if iTerm/Terminal isn't running, or no tab matches.

import type { Session } from './sessions.ts';

export type TextResult = {
  ok: boolean;
  app?: string;        // 'iTerm' | 'Terminal'
  reason?: string;
};

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function textSession(session: Session, message: string): Promise<TextResult> {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'text-back only works on macOS for now' };
  }
  if (!message.trim()) {
    return { ok: false, reason: 'message empty' };
  }

  const cwd = session.projectPath;
  const text = escapeAppleScript(message);

  // Try iTerm first (more common with claude users).
  const iTermScript = `
tell application "System Events"
  if not (exists application process "iTerm2") and not (exists application process "iTerm") then
    return "no-iterm"
  end if
end tell
tell application "iTerm"
  set _matchedSession to missing value
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        try
          set _vars to (variables of s)
          set _path to (variable named "session.path") of s
          if _path is "${escapeAppleScript(cwd)}" then
            set _matchedSession to s
            exit repeat
          end if
        on error
          -- ignore: variable may not exist
        end try
      end repeat
      if _matchedSession is not missing value then exit repeat
    end repeat
    if _matchedSession is not missing value then exit repeat
  end repeat
  if _matchedSession is missing value then
    return "no-match"
  end if
  tell _matchedSession
    write text "${text}"
  end tell
  activate
  return "ok"
end tell
  `.trim();

  try {
    const proc = Bun.spawn(['osascript', '-e', iTermScript], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = (await new Response(proc.stdout).text()).trim();
    if (out === 'ok') return { ok: true, app: 'iTerm' };
    if (out === 'no-iterm') return tryTerminalApp(cwd, text);
    if (out === 'no-match') {
      // Fallback: try Terminal.app too in case session is there.
      const r = await tryTerminalApp(cwd, text);
      if (r.ok) return r;
      return { ok: false, reason: `no iTerm tab with cwd=${cwd}. Open the claude session there, or click iTerm reveal first.` };
    }
    return { ok: false, reason: 'osascript returned: ' + (out || '<empty>') };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

async function tryTerminalApp(cwd: string, text: string): Promise<TextResult> {
  const script = `
tell application "Terminal"
  if not (running) then return "no-terminal"
  set _matched to missing value
  repeat with w in windows
    repeat with t in tabs of w
      try
        set _twd to (do script "pwd" in t)
      end try
      try
        set _name to name of t
        if _name contains "${escapeAppleScript(cwd)}" then
          set _matched to t
          exit repeat
        end if
      end try
    end repeat
    if _matched is not missing value then exit repeat
  end repeat
  if _matched is missing value then return "no-match"
  do script "${text}" in _matched
  activate
  return "ok"
end tell
  `.trim();

  try {
    const proc = Bun.spawn(['osascript', '-e', script], { stdout: 'pipe', stderr: 'pipe' });
    const out = (await new Response(proc.stdout).text()).trim();
    if (out === 'ok') return { ok: true, app: 'Terminal' };
    return { ok: false, reason: 'Terminal: ' + (out || '<empty>') };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}
