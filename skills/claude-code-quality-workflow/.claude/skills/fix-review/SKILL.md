---
name: fix-review
description: Repair explicitly selected findings from a code review, validate the repairs, and run one independent repair-diff review.
argument-hint: "<finding IDs or description>"
disable-model-invocation: true
---

Repair only the findings named in `$ARGUMENTS` or explicitly approved in the immediately preceding review conversation. If neither exists, ask which findings to fix before editing.

For each selected finding:

1. Reconfirm it against the current source. If the source changed and the finding no longer applies, say so and skip it.
2. Make the smallest complete repair. Do not refactor unrelated code, weaken checks, or change public behavior beyond the finding's required outcome.
3. Add or update a focused test when practical.

After the coherent repair batch, run the narrowest relevant checks once. A directly caused failure may be corrected within the same repair; do not begin an open-ended fix-the-fix loop. If a check is blocked by the environment, use trustworthy equivalent evidence already produced in the parent session and report the remaining gap.

Invoke the `repair-reviewer` agent once on the exact repair diff and selected findings. Incorporate a directly actionable correction at most once; otherwise report the issue. Leave changes uncommitted and summarize repaired, skipped, validation passed, and validation not run in Markdown.
