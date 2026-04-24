// Claude adapter: shells out to the `claude` CLI in non-interactive mode.
// The CLI writes events to ~/.claude/projects/<encoded>/<uuid>.jsonl which our watcher tails.
// That means the colony UI sees the new ant appear automatically — no extra plumbing.

import type { Adapter, SpawnOpts, SpawnResult } from './index.ts';

async function which(bin: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(['/usr/bin/env', 'which', bin], { stdout: 'pipe', stderr: 'ignore' });
    const out = await new Response(proc.stdout).text();
    const path = out.trim().split('\n')[0];
    return path || null;
  } catch {
    return null;
  }
}

export const claude: Adapter = {
  name: 'claude',

  async available() {
    const path = await which('claude');
    if (!path) return { ok: false, reason: '`claude` CLI not found. Install via Claude Code or npm.' };
    return { ok: true };
  },

  async spawn(opts: SpawnOpts): Promise<SpawnResult> {
    const model = opts.model ?? 'claude-sonnet-4-6';

    const prompt = composePrompt(opts);

    // Non-interactive: `claude -p "<prompt>"`.
    // --model selects model. We rely on the CLI's own credential resolution (subscription or API key).
    const args = ['-p', prompt, '--model', model];

    // Tool restrictions: Claude Code supports --allowedTools / --disallowedTools flags.
    if (opts.allowedTools?.length) {
      args.push('--allowedTools', opts.allowedTools.join(','));
    }
    if (opts.deniedTools?.length) {
      args.push('--disallowedTools', opts.deniedTools.join(','));
    }

    const proc = Bun.spawn(['claude', ...args], {
      cwd: opts.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      env: { ...process.env },
    });

    console.log(`[spawn] claude pid=${proc.pid} model=${model} cwd=${opts.cwd}`);

    // Fire-and-forget logging of stdout/stderr (optional; useful during dev).
    ;(async () => {
      try {
        const out = await new Response(proc.stdout).text();
        if (out) console.log(`[spawn/${proc.pid}] stdout:`, out.slice(0, 400));
      } catch {}
    })();
    ;(async () => {
      try {
        const err = await new Response(proc.stderr).text();
        if (err) console.warn(`[spawn/${proc.pid}] stderr:`, err.slice(0, 400));
      } catch {}
    })();

    return {
      provider: 'claude',
      model,
      pid: proc.pid,
      // sessionId is assigned by the CLI inside ~/.claude/projects/; watcher discovers it.
      sessionHint: `pid:${proc.pid}`,
      cwd: opts.cwd,
      spawnedAt: Date.now(),
    };
  },
};

function composePrompt(opts: SpawnOpts): string {
  if (!opts.systemPrompt) return opts.prompt;
  return `<skill_context>\n${opts.systemPrompt}\n</skill_context>\n\n${opts.prompt}`;
}
