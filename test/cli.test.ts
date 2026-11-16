import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fake } from './fixtures.ts';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');
const tmpDirs: string[] = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};

function makeRepo(): { dir: string; git: (...args: string[]) => string; write: (f: string, c: string | Buffer) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'secret-finder-'));
  tmpDirs.push(dir);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
  git('init', '-q');
  // Hostile settings that would break naive parsing.
  git('config', 'color.ui', 'always');
  git('config', 'diff.mnemonicPrefix', 'true');
  git('config', 'diff.noprefix', 'true');
  const write = (file: string, content: string | Buffer) => {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), content);
  };
  return { dir, git, write };
}

function run(cwd: string, args: string[], input?: string) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    ...(input === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input }),
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('working tree: tracked changes and untracked files, respecting .gitignore', () => {
  const { dir, git, write } = makeRepo();
  write('app/config.js', 'a\nb\nc\n');
  write('.gitignore', 'ignored.env\n');
  git('add', '.');
  git('commit', '-qm', 'init');

  write('app/config.js', `a\nb\nconst key = "${fake.aws}";\nc\n`);
  write('new dir/creds.txt', `first\n${fake.github}\n`);
  write('ignored.env', `TOKEN=${fake.stripe}\n`);
  write('blob.bin', Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(fake.github)]));
  write('huge.txt', 'x'.repeat(1024 * 1024) + fake.github);

  const { code, stdout } = run(dir, ['--json']);
  assert.equal(code, 1);
  const found = JSON.parse(stdout).map((f: { file: string; line: number; rule: string }) => `${f.file}:${f.line} ${f.rule}`);
  assert.deepEqual(found.sort(), ['app/config.js:3 aws-access-key', 'new dir/creds.txt:2 github-token']);
});

test('working tree in a repo with no commits yet', () => {
  const { dir, git, write } = makeRepo();
  write('staged.txt', `${fake.privateKey}\n`);
  git('add', '.');
  const { code, stdout } = run(dir, []);
  assert.equal(code, 1);
  assert.match(stdout, /^staged\.txt:1 {2}private-key {2}/);
});

test('--commit scans only lines added by that commit, including merges', () => {
  const { dir, git, write } = makeRepo();
  write('f.txt', `${fake.aws}\nkeep\n`);
  git('add', '.');
  git('commit', '-qm', 'one');
  write('f.txt', `${fake.aws}\nkeep\nnew ${fake.google}\n`);
  git('commit', '-qam', 'two');

  const { code, stdout } = run(dir, ['--commit', 'HEAD', '--json']);
  assert.equal(code, 1);
  assert.deepEqual(
    JSON.parse(stdout).map((f: { line: number; rule: string; match: string }) => [f.line, f.rule, f.match]),
    [[3, 'google-api-key', 'AIza****']],
  );

  git('checkout', '-qb', 'side');
  write('g.txt', `${fake.slack}\n`);
  git('add', '.');
  git('commit', '-qm', 'side');
  git('checkout', '-q', '-');
  git('merge', '-q', '--no-ff', '-m', 'merge', 'side');
  assert.match(run(dir, ['--commit', 'HEAD']).stdout, /^g\.txt:1 {2}slack/);
});

test('clean change exits 0 with no output', () => {
  const { dir, git, write } = makeRepo();
  write('ok.txt', 'password = "changeme"\n');
  git('add', '.');
  git('commit', '-qm', 'ok');
  assert.deepEqual(run(dir, ['--commit', 'HEAD']), { code: 0, stdout: '', stderr: '' });
  assert.deepEqual(JSON.parse(run(dir, ['--commit', 'HEAD', '--json']).stdout), []);
});

test('reads a diff from --diff <file> and from stdin with --diff -', () => {
  const diff = `--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+${fake.jwt}\n`;
  const dir = mkdtempSync(join(tmpdir(), 'secret-finder-'));
  tmpDirs.push(dir);
  writeFileSync(join(dir, 'change.diff'), diff);

  assert.match(run(dir, ['--diff', '-'], diff).stdout, /^x:1 {2}jwt/);
  assert.match(run(dir, ['--diff', 'change.diff']).stdout, /^x:1 {2}jwt/);
});

test('stdin is ignored without --diff -', () => {
  const { dir } = makeRepo();
  const diff = `--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+${fake.jwt}\n`;
  assert.deepEqual(run(dir, [], diff), { code: 0, stdout: '', stderr: '' });
});

test('errors exit 2', () => {
  const { dir } = makeRepo();
  assert.equal(run(dir, ['--diff', 'a', '--commit', 'b']).code, 2);
  assert.equal(run(dir, ['--bogus']).code, 2);
  assert.equal(run(dir, ['--diff', 'missing.diff']).code, 2);
  assert.deepEqual(run(dir, ['--commit', 'nope']), {
    code: 2,
    stdout: '',
    stderr: 'secret-finder: unknown commit: nope\n',
  });

  const outside = mkdtempSync(join(tmpdir(), 'secret-finder-'));
  tmpDirs.push(outside);
  const notRepo = { code: 2, stdout: '', stderr: 'secret-finder: not a git repository\n' };
  assert.deepEqual(run(outside, []), notRepo);
  assert.deepEqual(run(outside, ['--commit', 'HEAD']), notRepo);
});

test('--commit values cannot inject git options', () => {
  const { dir } = makeRepo();
  const target = join(dir, 'pwned');
  assert.deepEqual(run(dir, [`--commit=--output=${target}`]), {
    code: 2,
    stdout: '',
    stderr: `secret-finder: unknown commit: --output=${target}\n`,
  });
  assert.ok(!existsSync(target));
});
