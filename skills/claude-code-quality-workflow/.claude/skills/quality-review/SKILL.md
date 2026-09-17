---
name: quality-review
description: Review the current branch and working tree for concrete defects without editing it. Use for a fast Copilot-style code review.
argument-hint: "[optional base branch]"
disable-model-invocation: true
context: fork
agent: quality-reviewer
background: false
---

Run the active Claude configuration directory's `quality-review/scripts/review-scope.mjs`, passing `$ARGUMENTS` only when the user supplied a base branch. Use the detected branch and merge base; do not ask the user for a commit SHA.

Review that scope now. Start with the diff, then inspect only the repository context needed to verify changed behavior, contracts, consumers, tests, security boundaries, and delivery plumbing. Run fast, non-mutating deterministic checks when they materially help; do not make a full test suite a prerequisite to reviewing.

Return the Markdown format from `quality-review/review-guide.md`. Do not edit files, create evidence directories, persist state, or ask whether stale workflow state should be resumed. If HEAD changes, review the current state afresh.
