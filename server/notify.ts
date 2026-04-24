// Desktop notifications when a session flips to waiting.
// macOS: osascript → Notification Center + dock bounce.
// Linux:  notify-send.
// Windows: PowerShell toast.
// Dedupe per-session so a single wait doesn't spam notifications.
// Suppress entirely with COLONY_SILENT=1.

import type { Session } from './sessions.ts';

const lastNotifiedAt = new Map<string, number>();
const DEDUPE_MS = 60_000;

function shortPath(abs: string): string {
  const home = process.env.HOME ?? '';
  if (home && abs.startsWith(home)) return '~' + abs.slice(home.length);
  return abs;
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function notifyWaiting(session: Session, reason: string) {
  if (process.env.COLONY_SILENT === '1') return;

  const now = Date.now();
  const prev = lastNotifiedAt.get(session.id) ?? 0;
  if (now - prev < DEDUPE_MS) return;
  lastNotifiedAt.set(session.id, now);

  const title = '◆ Claude Colony';
  const subtitle = shortPath(session.projectPath);
  const bodyParts = [
    reason === 'tool:AskUserQuestion' ? 'agent asked a question'
      : reason === 'tool:ExitPlanMode' ? 'agent waiting plan approval'
      : 'agent is waiting on you',
    session.model ? `· ${session.model}` : '',
  ].filter(Boolean);
  const body = bodyParts.join(' ');

  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}" subtitle "${escapeAppleScript(subtitle)}" sound name "Hero"`;
      Bun.spawn(['osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' });
      // Bounce dock icon
      Bun.spawn(['osascript', '-e', 'tell application "System Events" to set frontmost of first process whose frontmost is true to true'], { stdout: 'ignore', stderr: 'ignore' });
    } else if (platform === 'linux') {
      Bun.spawn(['notify-send', title, `${subtitle}\n${body}`], { stdout: 'ignore', stderr: 'ignore' });
    } else if (platform === 'win32') {
      const ps = `[reflection.assembly]::loadwithpartialname('System.Windows.Forms');$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;$n.ShowBalloonTip(3000,'${title}','${body.replace(/'/g, "''")}','Info')`;
      Bun.spawn(['powershell', '-NoProfile', '-Command', ps], { stdout: 'ignore', stderr: 'ignore' });
    }
  } catch (err) {
    console.warn('[notify] failed:', err);
  }

  console.log(`[notify] ${session.id.slice(0,8)} · ${subtitle} · ${body}`);
}

export function clearNotificationDedupe(sessionId: string) {
  lastNotifiedAt.delete(sessionId);
}
