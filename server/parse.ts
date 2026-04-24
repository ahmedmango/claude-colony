// JSONL line -> normalized Event. Lenient: unknown shapes log once and return null.

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  model: string;
};

export type EventKind =
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'usage'
  | 'error'
  | 'system'
  | 'summary';

export type Event = {
  session_id: string;
  ts: number;
  kind: EventKind;
  text?: string;
  tool_name?: string;
  tool_input?: unknown;
  is_error?: boolean;
  usage?: Usage;
  raw: unknown;
};

const TEXT_LIMIT = 140;
const seenBadShapes = new Set<string>();

function short(s: unknown, limit = TEXT_LIMIT): string | undefined {
  if (typeof s !== 'string') return undefined;
  const trimmed = s.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return undefined;
  return trimmed.length > limit ? trimmed.slice(0, limit - 1) + '…' : trimmed;
}

function parseTs(raw: unknown): number {
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function extractUsage(message: unknown): Usage | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const m = message as Record<string, unknown>;
  const u = m.usage as Record<string, unknown> | undefined;
  if (!u) return undefined;
  const model = typeof m.model === 'string' ? m.model : 'unknown';
  return {
    model,
    input_tokens: Number(u.input_tokens ?? 0) || 0,
    output_tokens: Number(u.output_tokens ?? 0) || 0,
    cache_creation_input_tokens: Number(u.cache_creation_input_tokens ?? 0) || 0,
    cache_read_input_tokens: Number(u.cache_read_input_tokens ?? 0) || 0,
  };
}

function firstToolInputArg(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const values = Object.values(input as Record<string, unknown>);
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) return v.length > 60 ? v.slice(0, 59) + '…' : v;
  }
  return undefined;
}

export function parseLine(raw: string): Event | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    const shape = trimmed.slice(0, 30);
    if (!seenBadShapes.has(shape)) {
      seenBadShapes.add(shape);
      console.warn('[parse] non-JSON line skipped:', shape);
    }
    return null;
  }

  const type = obj.type as string | undefined;
  if (!type) return null;
  if (type === 'file-history-snapshot') return null;

  const session_id = (obj.sessionId as string | undefined) ?? '';
  const ts = parseTs(obj.timestamp);

  if (type === 'summary') {
    return {
      session_id,
      ts,
      kind: 'summary',
      text: short(obj.summary) ?? 'compaction summary',
      raw: obj,
    };
  }

  if (type === 'system') {
    const subtype = obj.subtype as string | undefined;
    const isError = typeof subtype === 'string' && /error/i.test(subtype);
    return {
      session_id,
      ts,
      kind: isError ? 'error' : 'system',
      text: subtype ? `system:${subtype}` : 'system',
      is_error: isError,
      raw: obj,
    };
  }

  if (type === 'user') {
    const message = obj.message as Record<string, unknown> | undefined;
    const content = message?.content;

    if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_result') {
          const isError = Boolean(b.is_error);
          const resultText =
            typeof b.content === 'string' ? short(b.content) : undefined;
          return {
            session_id,
            ts,
            kind: isError ? 'error' : 'tool_result',
            text: resultText ?? (isError ? 'tool error' : 'tool result'),
            is_error: isError,
            raw: obj,
          };
        }
      }
    }

    if (typeof content === 'string') {
      return {
        session_id,
        ts,
        kind: 'user',
        text: short(content) ?? 'user',
        raw: obj,
      };
    }

    return { session_id, ts, kind: 'user', text: 'user', raw: obj };
  }

  if (type === 'assistant') {
    const message = obj.message as Record<string, unknown> | undefined;
    const content = message?.content;
    const usage = extractUsage(message);

    if (Array.isArray(content)) {
      let toolBlock: Record<string, unknown> | undefined;
      let textBlock: string | undefined;
      let thinkingPresent = false;
      for (const block of content) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && !toolBlock) toolBlock = b;
        else if (b.type === 'text' && typeof b.text === 'string' && !textBlock) {
          textBlock = b.text;
        } else if (b.type === 'thinking') {
          thinkingPresent = true;
        }
      }

      if (toolBlock) {
        const tool_name = (toolBlock.name as string | undefined) ?? 'tool';
        const tool_input = toolBlock.input;
        const arg = firstToolInputArg(tool_input);
        return {
          session_id,
          ts,
          kind: 'tool_use',
          text: arg ? `${tool_name}(${arg})` : tool_name,
          tool_name,
          tool_input,
          usage,
          raw: obj,
        };
      }
      if (textBlock !== undefined) {
        return {
          session_id,
          ts,
          kind: 'assistant',
          text: short(textBlock) ?? '…',
          usage,
          raw: obj,
        };
      }
      if (thinkingPresent) {
        return { session_id, ts, kind: 'thinking', text: 'thinking…', usage, raw: obj };
      }
    }

    return { session_id, ts, kind: 'assistant', text: 'assistant', usage, raw: obj };
  }

  if (!seenBadShapes.has(`type:${type}`)) {
    seenBadShapes.add(`type:${type}`);
    console.warn('[parse] unknown line type skipped:', type);
  }
  return null;
}
