// Skill loader. Scans skills/<name>/SKILL.md, parses yaml-ish frontmatter + body.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Skill = {
  name: string;
  emoji: string;
  color: string;
  description: string;
  model: string;
  allowedTools: string[];
  deniedTools: string[];
  body: string;
};

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(REPO, 'skills');

function parseFrontmatter(md: string): { fm: Record<string, unknown>; body: string } {
  if (!md.startsWith('---\n')) return { fm: {}, body: md };
  const end = md.indexOf('\n---', 4);
  if (end === -1) return { fm: {}, body: md };
  const head = md.slice(4, end);
  const body = md.slice(end + 4).replace(/^\n+/, '');
  const fm: Record<string, unknown> = {};
  for (const rawLine of head.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val: unknown = line.slice(idx + 1).trim();
    if (typeof val === 'string') {
      // strip matching quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // array literal
      if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    fm[key] = val;
  }
  return { fm, body };
}

function toSkill(name: string, md: string): Skill {
  const { fm, body } = parseFrontmatter(md);
  const allowed = Array.isArray(fm['allowed-tools']) ? (fm['allowed-tools'] as string[]) : [];
  const denied  = Array.isArray(fm['denied-tools'])  ? (fm['denied-tools']  as string[]) : [];
  return {
    name: (fm.name as string) || name,
    emoji: (fm.emoji as string) || '🐜',
    color: (fm.color as string) || '#8a7a60',
    description: (fm.description as string) || '',
    model: (fm.model as string) || 'claude-sonnet-4-6',
    allowedTools: allowed,
    deniedTools: denied,
    body: body.trim(),
  };
}

let cache: Skill[] | null = null;

export function listSkills(): Skill[] {
  if (cache) return cache;
  if (!existsSync(SKILLS_DIR)) { cache = []; return cache; }
  const out: Skill[] = [];
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    try {
      const md = readFileSync(file, 'utf8');
      out.push(toSkill(entry.name, md));
    } catch (e) {
      console.warn('[skills] load failed:', entry.name, e);
    }
  }
  cache = out;
  return out;
}

export function getSkill(name: string): Skill | undefined {
  return listSkills().find((s) => s.name === name);
}

export function invalidateSkills() { cache = null; }
