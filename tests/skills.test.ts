import { test, expect, describe } from 'bun:test';
import { listSkills, getSkill } from '../server/skills.ts';

describe('skill loader', () => {
  const all = listSkills();

  test('loads 6 seeded skills', () => {
    const names = all.map(s => s.name).sort();
    expect(names).toEqual(['debugger', 'engineer', 'scholar', 'scout', 'soldier', 'worker'].sort());
  });

  test('scout is read-only (no Edit/Write/Bash)', () => {
    const scout = getSkill('scout')!;
    expect(scout).toBeDefined();
    expect(scout.allowedTools).toContain('Read');
    expect(scout.deniedTools).toContain('Edit');
    expect(scout.deniedTools).toContain('Write');
    expect(scout.deniedTools).toContain('Bash');
  });

  test('worker has Edit + Write tools', () => {
    const w = getSkill('worker')!;
    expect(w.allowedTools).toContain('Edit');
    expect(w.allowedTools).toContain('Write');
    expect(w.allowedTools).toContain('Bash');
  });

  test('each skill has emoji, color, model', () => {
    for (const s of all) {
      expect(s.emoji).toBeTruthy();
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.model).toContain('claude-');
    }
  });

  test('body is non-empty system prompt', () => {
    for (const s of all) {
      expect(s.body.length).toBeGreaterThan(50);
    }
  });

  test('getSkill returns undefined for unknown name', () => {
    expect(getSkill('nonexistent')).toBeUndefined();
  });
});
