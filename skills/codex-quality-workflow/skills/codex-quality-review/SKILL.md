---
name: codex-quality-review
description: Review the current branch and working tree for concrete defects without editing it. Use for a fast, evidence-backed code review.
---

# Quality review

Review only. Do not edit, format, stage, commit, install dependencies, or create report files.

Run `scripts/review-scope.mjs` from this skill directory. Pass a base branch only when the user supplied one; otherwise let the script detect the default branch. Never ask the user for a commit SHA. Review committed and uncommitted changes in the printed scope.

Read [references/review-guide.md](references/review-guide.md). Start with the diff, then inspect only enough repository context to verify changed behavior, contracts, consumers, tests, security boundaries, and delivery plumbing. Run fast, non-mutating deterministic checks when useful; do not make a full test suite a prerequisite to reviewing.

Do not delegate to multiple overlapping reviewers by default. Use a specialist only when the change genuinely requires expertise the main review cannot supply. Do not persist workflow state or ask whether an older run should be resumed. If HEAD changed, review the current state afresh.

Return the guide's Markdown report in this conversation. Finish synthesis before spending the task on more discovery.
