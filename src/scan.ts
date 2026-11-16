import type { AddedLine } from './diff.ts';
import { rules } from './rules.ts';

export interface Finding {
  file: string;
  line: number;
  rule: string;
  reason: string;
  match: string;
}

export const IGNORE_MARKER = 'secret-finder:ignore';

export function redact(secret: string): string {
  return secret.slice(0, 4) + '****';
}

export function scan(lines: AddedLine[]): Finding[] {
  const findings: Finding[] = [];
  for (const { file, line, text } of lines) {
    if (text.includes(IGNORE_MARKER)) continue;
    const taken: Array<[number, number]> = [];
    for (const rule of rules) {
      for (const m of text.matchAll(rule.pattern)) {
        const start = m.index;
        const end = start + m[0].length;
        if (taken.some(([s, e]) => start < e && s < end)) continue;
        const secret = rule.secret ? rule.secret(m) : m[0];
        if (secret === null) continue;
        taken.push([start, end]);
        findings.push({
          file,
          line,
          rule: rule.name,
          reason: rule.reason,
          match: rule.public ? secret : redact(secret),
        });
      }
    }
  }
  return findings;
}
