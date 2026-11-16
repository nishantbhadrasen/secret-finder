import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPlaceholder, shannonEntropy } from '../src/rules.ts';
import { IGNORE_MARKER, scan } from '../src/scan.ts';
import { fake } from './fixtures.ts';

const rulesFor = (text: string) => scan([{ file: 'f', line: 1, text }]).map((f) => f.rule);

test('each specific rule fires on its token', () => {
  assert.deepEqual(rulesFor(`id = ${fake.aws}`), ['aws-access-key']);
  assert.deepEqual(rulesFor(`gh ${fake.github}`), ['github-token']);
  assert.deepEqual(rulesFor(fake.privateKey), ['private-key']);
  assert.deepEqual(rulesFor('-----BEGIN OPENSSH PRIVATE KEY-----'), ['private-key']); // secret-finder:ignore
  assert.deepEqual(rulesFor(`hook ${fake.slack}`), ['slack']);
  assert.deepEqual(rulesFor(`stripe(${fake.stripe})`), ['stripe-live-key']);
  assert.deepEqual(rulesFor(`maps ${fake.google}`), ['google-api-key']);
  assert.deepEqual(rulesFor(`Bearer ${fake.jwt}`), ['jwt']);
});

test('specific rules do not fire on near misses', () => {
  assert.deepEqual(rulesFor('AKIA123'), []);
  assert.deepEqual(rulesFor('sk_' + 'test_' + 'Ab12'.repeat(6)), []);
  assert.deepEqual(rulesFor('-----BEGIN PUBLIC KEY-----'), []);
  assert.deepEqual(rulesFor('ghp_short'), []);
});

test('generic rule fires on high-entropy assignments in common syntaxes', () => {
  for (const line of [
    `password = "${fake.password}"`,
    `"db_password": "${fake.password}",`,
    `API_KEY=${fake.password}`,
    `clientSecret: '${fake.password}'`,
    `$token => '${fake.password}'`,
  ]) {
    assert.deepEqual(rulesFor(line), ['generic-assignment'], line);
  }
});

test('generic rule ignores placeholders, low entropy, and code', () => {
  for (const line of [
    'password = "changeme"',
    'password = "example-password-123"',
    'api_key = "${API_KEY}"',
    'TOKEN=${fake.stripe}',
    'token: process.env.GITHUB_TOKEN',
    'password = "aaaaaaaaaaaa"',
    'password = "hunter2"',
    'password: string;',
    'const token = getToken(user);',
    'secret = config.secretValue',
    'if (token === "abcdef")',
    'password: "Please enter your password"',
  ]) {
    assert.deepEqual(rulesFor(line), [], line);
  }
});

test('a specific rule wins over the generic rule for the same span', () => {
  assert.deepEqual(rulesFor(`GITHUB_TOKEN="${fake.github}"`), ['github-token']);
});

test('ignore marker suppresses the whole line', () => {
  assert.deepEqual(rulesFor(`key = "${fake.aws}" // ${IGNORE_MARKER}`), []);
});

test('matches are redacted except non-sensitive headers', () => {
  const [aws] = scan([{ file: 'a.env', line: 3, text: `AWS=${fake.aws}` }]);
  assert.deepEqual(aws, {
    file: 'a.env',
    line: 3,
    rule: 'aws-access-key',
    reason: 'AWS access key ID',
    match: 'AKIA****',
  });
  assert.equal(scan([{ file: 'k', line: 1, text: fake.privateKey }])[0].match, fake.privateKey);
});

test('entropy and placeholder helpers', () => {
  assert.equal(shannonEntropy('aaaa'), 0);
  assert.equal(shannonEntropy('abcd'), 2);
  assert.ok(isPlaceholder('${DB_PASS}'));
  assert.ok(isPlaceholder('CHANGEME'));
  assert.ok(!isPlaceholder(fake.password));
});
