// Ollama adapter — local models. Checks if ollama is running on localhost:11434.

import type { Adapter } from './index.ts';

export const ollama: Adapter = {
  name: 'ollama',

  async available() {
    try {
      const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(700) });
      if (!r.ok) return { ok: false, reason: 'Ollama daemon not responding on :11434.' };
      return { ok: false, reason: 'Ollama adapter: tool-loop not implemented yet. v0.2.' };
    } catch {
      return { ok: false, reason: 'Ollama not running on :11434. `ollama serve` to enable.' };
    }
  },

  async spawn() { throw new Error('Ollama adapter not implemented'); },
};
