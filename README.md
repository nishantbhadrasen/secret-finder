# secret-finder

## What it does

secret-finder scans a git change for accidentally committed secrets such as API keys, tokens and private keys. It looks only at lines the change adds, reports each finding with file, line and rule, and redacts the secret in its output.

## Requirements

- Node 24.3 or newer (TypeScript runs directly through Node's type stripping)
- No runtime dependencies

## How to run

```sh
node src/cli.ts                         # working tree vs HEAD, plus untracked files
node src/cli.ts --commit <hash>         # changes introduced by a commit
node src/cli.ts --diff <file>           # a unified diff from a file
git diff | node src/cli.ts --diff -     # a unified diff from stdin
node src/cli.ts --json                  # findings as JSON (combines with any input)
```

Stdin is read only with `--diff -`.

To suppress findings on a line, add the marker `secret-finder:ignore` anywhere on it, for example in a comment.

Exit codes:

- `0` no findings
- `1` findings
- `2` error (bad arguments, not a git repository, unknown commit, unreadable file)

## How it works

- The diff parser tracks new-file line numbers from the `@@` hunk headers, so findings point at the right line.
- Only added lines are scanned. Context and removed lines are skipped.
- Seven specific rules match known formats (AWS, GitHub, private keys, Slack, Stripe, Google, JWT). A generic rule catches high-entropy values assigned to names like `password`, `secret`, `token` or `api_key`, and skips placeholders, URLs, paths and code.
- Output is redacted to the first 4 characters plus `****`.

## Tests

```sh
npm test
npm run typecheck
```

## Where it fails

- Weak human passwords. The generic rule needs at least 3.5 bits per character of entropy, which in practice means about 12 or more distinct characters, so `password = "Summer2024!"` passes unnoticed.
- Connection strings like `postgres://user:pw@host`.
- `Authorization: Bearer` headers with non-JWT tokens.
- Secrets split across lines or base64 encoded.
- Only 7 specific rules, and no config for custom rules.
- Quoted non-ASCII paths in external diffs are reported with git's escapes left in.
- The size limit (1 MiB) and binary check apply only to untracked files.
- The ignore marker covers the whole line, so it can hide a second secret on the same line.
- Removed lines are not scanned. A removed secret is already leaked and must be rotated.
- History is not scanned, only a single change.

## What I'd do next

- A pre-commit hook
- A baseline file for accepted findings
- Configurable rules
- Live verification of keys against their providers
- An npm package with a build step

## Related tools

This is a focused version of what [Gitleaks](https://github.com/gitleaks/gitleaks) and [TruffleHog](https://github.com/trufflesecurity/trufflehog) do in production.

## AI usage

Built with Cursor (Claude Opus 5.5) in agent mode, reviewed independently in a fresh Claude Code session, with planning done in a separate Claude chat. Logs are in `ai-logs/`.

## Time

TIME: fill in
