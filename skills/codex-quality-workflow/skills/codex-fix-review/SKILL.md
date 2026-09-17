---
name: codex-fix-review
description: Repair explicitly selected findings from a code review, validate them, and inspect the repair diff once.
---

# Fix selected review findings

Repair only finding IDs or descriptions explicitly named by the user, or explicitly approved from the immediately preceding review. If neither exists, ask which findings to fix before editing.

For every selected finding, reconfirm it against the current source. Skip and explain findings invalidated by later changes. Make the smallest complete repair, preserve unrelated behavior, and add or update a focused test when practical. Never weaken tests, validation, types, lint, or security controls to make the repair pass.

After one coherent repair batch, run the narrowest relevant checks once. A directly caused failure may be corrected within the same intended repair; do not start an open-ended fix-the-fix loop. An environment-blocked child check does not override trustworthy equivalent evidence from the current parent task.

Then inspect the exact repair diff once for regressions, unrelated changes, resolution of each selected finding, and test sensitivity. Incorporate a directly actionable correction at most once; otherwise report it. Do not launch a new whole-branch review.

Leave changes uncommitted. Report in Markdown: repaired, skipped, validation passed, validation not run, and repair-diff assessment. Do not create workflow state or JSON reports.
