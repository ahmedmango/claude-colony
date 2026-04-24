// Model adapter layer. Each provider exposes `spawnAgent`.
// Claude is native (uses `claude` CLI → writes to ~/.claude/projects/ → our watcher sees it).
// OpenAI / Gemini / Ollama run via a minimal ReAct loop and stream into a .jsonl-compatible shape.
//
// For v0 we only need spawnAgent to return { sessionId, kill(), onExit() }.
// The colony watcher takes it from there.

export type Provider = 'claude' | 'openai' | 'gemini' | 'ollama';

export type SpawnOpts = {
  provider: Provider;
  model?: string;                      // e.g. 'claude-sonnet-4-6', 'gpt-5', 'gemini-2.5-pro', 'llama3.2'
  cwd: string;                         // project dir
  prompt: string;                      // user task
  systemPrompt?: string;               // skill body
  allowedTools?: string[];
  deniedTools?: string[];
};

export type SpawnResult = {
  provider: Provider;
  model: string;
  pid?: number;
  // Claude writes sessionId itself; other providers we assign client-side.
  sessionHint: string;
  cwd: string;
  spawnedAt: number;
};

export type Adapter = {
  readonly name: Provider;
  available(): Promise<{ ok: boolean; reason?: string }>;
  spawn(opts: SpawnOpts): Promise<SpawnResult>;
};

// --- registry -----------------------------------------------------
import { claude } from './claude.ts';
import { openai } from './openai.ts';
import { gemini } from './gemini.ts';
import { ollama } from './ollama.ts';

export const ADAPTERS: Record<Provider, Adapter> = {
  claude,
  openai,
  gemini,
  ollama,
};

export async function describeAll() {
  const out: Array<{ provider: Provider; ok: boolean; reason?: string; models: string[] }> = [];
  for (const key of Object.keys(ADAPTERS) as Provider[]) {
    const adapter = ADAPTERS[key];
    const status = await adapter.available();
    out.push({ provider: key, ok: status.ok, reason: status.reason, models: DEFAULT_MODELS[key] });
  }
  return out;
}

export const DEFAULT_MODELS: Record<Provider, string[]> = {
  claude: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  openai: ['gpt-5', 'gpt-5-mini', 'o3'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  ollama: ['llama3.2', 'qwen2.5-coder', 'deepseek-r1'],
};
