import { test, expect, describe } from 'bun:test';
import { parseLine, BLOCKING_TOOL_NAMES } from '../server/parse.ts';

describe('parseLine', () => {
  test('returns null for empty / non-JSON input', () => {
    expect(parseLine('')).toBeNull();
    expect(parseLine('   ')).toBeNull();
    expect(parseLine('not json')).toBeNull();
  });

  test('returns null for file-history-snapshot (internal)', () => {
    const line = JSON.stringify({ type: 'file-history-snapshot', snapshot: {} });
    expect(parseLine(line)).toBeNull();
  });

  test('silently skips known noise types', () => {
    for (const t of ['attachment', 'last-prompt', 'progress', 'custom-title', 'agent-name', 'queue-operation']) {
      const line = JSON.stringify({ type: t, sessionId: 'abc', timestamp: '2026-04-24T00:00:00Z' });
      expect(parseLine(line)).toBeNull();
    }
  });

  test('permission-mode surfaces as system event with mode name', () => {
    const line = JSON.stringify({
      type: 'permission-mode',
      permissionMode: 'bypassPermissions',
      sessionId: 'abc',
      timestamp: '2026-04-24T00:00:00Z',
    });
    const ev = parseLine(line);
    expect(ev).not.toBeNull();
    expect(ev!.kind).toBe('system');
    expect(ev!.text).toContain('bypassPermissions');
  });

  test('user message with string content', () => {
    const line = JSON.stringify({
      type: 'user',
      sessionId: 'abc',
      message: { content: 'hello world' },
      timestamp: '2026-04-24T00:00:00Z',
    });
    const ev = parseLine(line)!;
    expect(ev.kind).toBe('user');
    expect(ev.text).toBe('hello world');
  });

  test('assistant tool_use includes tool name + first arg', () => {
    const line = JSON.stringify({
      type: 'assistant',
      sessionId: 'abc',
      message: {
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/tmp/x.ts' } }],
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
      timestamp: '2026-04-24T00:00:00Z',
    });
    const ev = parseLine(line)!;
    expect(ev.kind).toBe('tool_use');
    expect(ev.tool_name).toBe('Read');
    expect(ev.text).toContain('/tmp/x.ts');
    expect(ev.usage?.input_tokens).toBe(10);
  });

  test('assistant text-only becomes assistant kind', () => {
    const line = JSON.stringify({
      type: 'assistant',
      sessionId: 'abc',
      message: { content: [{ type: 'text', text: 'Hello there' }] },
      timestamp: '2026-04-24T00:00:00Z',
    });
    const ev = parseLine(line)!;
    expect(ev.kind).toBe('assistant');
    expect(ev.text).toContain('Hello');
  });

  test('tool_result inside user message becomes tool_result kind', () => {
    const line = JSON.stringify({
      type: 'user',
      sessionId: 'abc',
      message: {
        content: [{ type: 'tool_result', content: 'OK', is_error: false }],
      },
      timestamp: '2026-04-24T00:00:00Z',
    });
    const ev = parseLine(line)!;
    expect(ev.kind).toBe('tool_result');
  });

  test('is_error tool_result flips to error kind', () => {
    const line = JSON.stringify({
      type: 'user',
      sessionId: 'abc',
      message: {
        content: [{ type: 'tool_result', content: 'File not found', is_error: true }],
      },
      timestamp: '2026-04-24T00:00:00Z',
    });
    const ev = parseLine(line)!;
    expect(ev.kind).toBe('error');
    expect(ev.is_error).toBe(true);
  });

  test('BLOCKING_TOOL_NAMES includes AskUserQuestion + ExitPlanMode', () => {
    expect(BLOCKING_TOOL_NAMES.has('AskUserQuestion')).toBe(true);
    expect(BLOCKING_TOOL_NAMES.has('ExitPlanMode')).toBe(true);
    expect(BLOCKING_TOOL_NAMES.has('Read')).toBe(false);
  });

  test('invalid timestamp falls back to Date.now', () => {
    const before = Date.now();
    const line = JSON.stringify({
      type: 'user',
      sessionId: 'abc',
      message: { content: 'hi' },
      timestamp: 'not-a-date',
    });
    const ev = parseLine(line)!;
    expect(ev.ts).toBeGreaterThanOrEqual(before);
    expect(ev.ts).toBeLessThan(before + 1000);
  });
});
