# Planning log

Planning and decision support were done in a separate Claude chat (claude.ai), alongside the build in Cursor. This file summarizes what was asked and decided there.

## 1. Initial plan
I shared the task and asked how difficult it is and how to approach it. The plan:
- TypeScript on Node with zero runtime dependencies (node:util parseArgs, child_process, node:test).
- Three layers: input selection, a unified-diff parser, and detection rules.
- Scan only added lines, with line numbers taken from the hunk headers.
- Specific rules for known key formats, plus a generic rule for secret-like names with high-entropy values.
- Redact matches in output, and use exit codes so the tool works in CI.
- A README that is honest about where the tool fails.

## 2. Tooling
I asked whether to use Claude Code and chose to build in Cursor agent mode instead. The first prompt in cursor-build.md was drafted in the planning chat.

## 3. Design decisions
Cursor asked four questions before coding. I decided them with input from the planning chat:
- Default mode: scan git diff HEAD plus untracked files, skipping binary files, files over 1 MB, and anything in .gitignore.
- Stdin: read only when stdin is a pipe or a redirected file. After the review found that this can hang in CI or agent shells, I changed it to an explicit --diff - flag.
- Exit codes: 0 clean, 1 findings, 2 usage or git errors, so CI can tell a finding apart from a crash.
- Running: .ts files run directly on Node, with no build step, since this is not published to npm.

## 4. Verification
- The planning chat drafted a status-report prompt for Cursor and an independent review prompt.
- The review ran in a fresh Claude Code session that had not seen how the code was built (claude-code-review.md).

## 5. Review triage
I went through the review findings and decided:
- Fix: README, AI logs, the stdin hang, ANSI-colored diffs, clear errors for "not a git repository" and "unknown commit", URL and path false positives in the generic rule, minimum Node version, removing the bin field, and removing the octal path decoder (rare case, hard to justify).
- Document instead of fix: the effective entropy minimum of about 12 characters, and the missed formats (weak human passwords, connection strings, Bearer headers).
The fixes are in cursor-fixes.md, one commit each.

## 6. Git cleanup
- One baseline commit of the working implementation, then one commit per review fix.
- Set my personal git identity on all commits.
- Removed AI co-author trailers from commit messages. AI use is disclosed here and in the README instead.

## 7. Verifying the AI's work
During the review, a Claude Code script ran git commands in my home folder after a failed mktemp. Claude Code reported cleaning it up, and I verified it myself afterwards (no ~/.git and none of the stray files remained).
