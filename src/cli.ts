#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseDiff, type AddedLine } from './diff.ts';
import { scan, type Finding } from './scan.ts';

const USAGE = `Usage: secret-finder [--diff <file> | --commit <hash>] [--json]

Scans added lines of a git change for secrets.

Input:
  --diff <file>     read a unified diff from a file ("-" for stdin)
  --commit <hash>   scan the changes introduced by a commit
  (default)         working tree vs HEAD, plus untracked files

Options:
  --json            print findings as JSON
  -h, --help        show this help

Add "secret-finder:ignore" to a line to suppress findings on it.
Exit codes: 0 clean, 1 findings, 2 error.`;

const MAX_UNTRACKED_BYTES = 1024 * 1024;

// Pin the output format so user git config (color, prefixes, external diff
// drivers, diff.relative) can't change what the parser sees.
const DIFF_FLAGS = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--no-relative',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '--unified=0',
];

class UsageError extends Error {}

function git(args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitSucceeds(args: string[]): boolean {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

function requireRepo(): void {
  if (!gitSucceeds(['rev-parse', '--git-dir'])) throw new Error('not a git repository');
}

function commitLines(commit: string): AddedLine[] {
  requireRepo();
  if (!gitSucceeds(['rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}^{commit}`])) {
    throw new Error(`unknown commit: ${commit}`);
  }
  return parseDiff(
    git(['show', ...DIFF_FLAGS, '--format=', '--diff-merges=first-parent', '--end-of-options', commit]),
  );
}

function workingTreeLines(): AddedLine[] {
  requireRepo();
  const base = gitSucceeds(['rev-parse', '--verify', '--quiet', 'HEAD'])
    ? 'HEAD'
    : git(['hash-object', '-t', 'tree', '/dev/null']).trim(); // no commits yet: diff against the empty tree
  return [...parseDiff(git(['diff', ...DIFF_FLAGS, base, '--'])), ...untrackedLines()];
}

function untrackedLines(): AddedLine[] {
  const top = git(['rev-parse', '--show-toplevel']).trim();
  const files = git(['-C', top, 'ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const lines: AddedLine[] = [];
  for (const file of files) {
    const path = join(top, file);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size > MAX_UNTRACKED_BYTES) continue;
    const content = readFileSync(path);
    if (content.subarray(0, 8000).includes(0)) continue; // same binary heuristic as git
    content
      .toString('utf8')
      .split('\n')
      .forEach((text, i) => lines.push({ file, line: i + 1, text: text.replace(/\r$/, '') }));
  }
  return lines;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function formatText(findings: Finding[]): string {
  return findings.map((f) => `${f.file}:${f.line}  ${f.rule}  ${f.reason}  ${f.match}`).join('\n');
}

async function main(argv: string[]): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        diff: { type: 'string' },
        commit: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    throw new UsageError((err as Error).message);
  }

  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.diff !== undefined && values.commit !== undefined) {
    throw new UsageError('--diff and --commit cannot be used together');
  }

  let lines: AddedLine[];
  if (values.diff === '-') lines = parseDiff(await readStdin());
  else if (values.diff !== undefined) lines = parseDiff(readFileSync(values.diff, 'utf8'));
  else if (values.commit !== undefined) lines = commitLines(values.commit);
  else lines = workingTreeLines();

  const findings = scan(lines);
  if (values.json) {
    console.log(JSON.stringify(findings, null, 2));
  } else if (findings.length > 0) {
    console.log(formatText(findings));
    console.error(`\n${findings.length} potential secret(s) found.`);
  }
  return findings.length > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: Error & { stderr?: string }) => {
    const detail = err.stderr?.trim() || err.message;
    console.error(`secret-finder: ${detail}`);
    if (err instanceof UsageError) console.error(`\n${USAGE}`);
    process.exitCode = 2;
  },
);
