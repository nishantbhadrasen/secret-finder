import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDiff } from '../src/diff.ts';

const lines = (...l: string[]) => l.join('\n');

test('tracks file and line numbers across files and hunks', () => {
  const diff = lines(
    'diff --git a/a.txt b/a.txt',
    'index 111..222 100644',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1,3 +1,4 @@',
    ' one',
    '-two',
    '+TWO',
    '+2.5',
    ' three',
    '@@ -10,0 +11,1 @@',
    '+eleven',
    'diff --git a/b.txt b/b.txt',
    '--- a/b.txt',
    '+++ b/b.txt',
    '@@ -5 +5 @@',
    '-old',
    '+new',
  );
  assert.deepEqual(parseDiff(diff), [
    { file: 'a.txt', line: 2, text: 'TWO' },
    { file: 'a.txt', line: 3, text: '2.5' },
    { file: 'a.txt', line: 11, text: 'eleven' },
    { file: 'b.txt', line: 5, text: 'new' },
  ]);
});

test('skips deleted files and binary files', () => {
  const diff = lines(
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    'diff --git a/img.png b/img.png',
    'Binary files a/img.png and b/img.png differ',
    'diff --git a/new.txt b/new.txt',
    '--- /dev/null',
    '+++ b/new.txt',
    '@@ -0,0 +1 @@',
    '+hello',
  );
  assert.deepEqual(parseDiff(diff), [{ file: 'new.txt', line: 1, text: 'hello' }]);
});

test('an added line starting with "++" is content, not a header', () => {
  const diff = lines(
    'diff --git a/x.c b/x.c',
    '--- a/x.c',
    '+++ b/x.c',
    '@@ -0,0 +1,2 @@',
    '+++ b/not-a-file',
    '+--- also content',
  );
  assert.deepEqual(parseDiff(diff), [
    { file: 'x.c', line: 1, text: '++ b/not-a-file' },
    { file: 'x.c', line: 2, text: '--- also content' },
  ]);
});

test('ignores "No newline" markers and CRLF line endings', () => {
  const diff = lines(
    '--- a/w.txt\r',
    '+++ b/w.txt\r',
    '@@ -1 +1,2 @@\r',
    '-a\r',
    '\\ No newline at end of file',
    '+a\r',
    '+b\r',
    '\\ No newline at end of file',
  );
  assert.deepEqual(parseDiff(diff), [
    { file: 'w.txt', line: 1, text: 'a' },
    { file: 'w.txt', line: 2, text: 'b' },
  ]);
});

test('decodes quoted paths and strips timestamps from non-git diffs', () => {
  const quoted = lines('+++ "b/caf\\303\\251 \\"x\\".txt"', '@@ -0,0 +1 @@', '+hi');
  assert.equal(parseDiff(quoted)[0].file, 'café "x".txt');

  const plain = lines('--- old.txt\t2026-01-01', '+++ new.txt\t2026-01-02', '@@ -1 +1 @@', '-a', '+b');
  assert.equal(parseDiff(plain)[0].file, 'new.txt');
});
