// OpenAI adapter — stub for v0. Real impl needs either:
//   - @openai/agents npm package (ReAct loop with tools), or
//   - our own minimal loop using Responses API.
// For now: not wired in. Marked unavailable so UI can show it greyed.

import type { Adapter } from './index.ts';

export const openai: Adapter = {
  name: 'openai',

  async available() {
    if (!process.env.OPENAI_API_KEY) {
      return { ok: false, reason: 'OPENAI_API_KEY not set. Model-agnostic mode is v0.2.' };
    }
    return { ok: false, reason: 'OpenAI adapter: tool-loop not implemented yet. v0.2.' };
  },

  async spawn() {
    throw new Error('OpenAI adapter not implemented');
  },
};
