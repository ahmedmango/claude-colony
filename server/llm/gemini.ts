import type { Adapter } from './index.ts';

export const gemini: Adapter = {
  name: 'gemini',
  async available() {
    if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
      return { ok: false, reason: 'GOOGLE_API_KEY not set. v0.2.' };
    }
    return { ok: false, reason: 'Gemini adapter: tool-loop not implemented yet. v0.2.' };
  },
  async spawn() { throw new Error('Gemini adapter not implemented'); },
};
