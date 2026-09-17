---
name: fix-review
description: Repairs selected findings from a /quality-review or /final-review report with targeted edits, runs proportionate verification, and reports exactly what changed and what remains. Does not commit, and does not look for new problems.
argument-hint: "[finding numbers, e.g. F1 F3 — default: every clearly actionable finding]"
disable-model-invocation: true
disallowed-tools: Agent, Task
---

Repair findings from the most recent review report in this conversation. Selection: $ARGUMENTS

## Select

- When the selection names findings (`F1 F3`, "the high ones", a title), repair exactly those.
- When the selection is empty, repair every finding in the most recent report that is Blocker, High or Medium with high confidence and a single obvious repair. Leave out any finding whose fix direction offers alternatives or depends on a product decision, and list it under "Not repaired".
- When this conversation has no review report and the selection does not describe a defect precisely enough to locate it, say so in one sentence and stop. This is the only case where you stop without editing. Do not run a review from here.

## Repair

For each selected finding, in severity order:

1. Open the location and confirm the defect still exists as described. When the code has moved on and it no longer applies, record it as "No longer applies" and do not edit.
2. Make the smallest complete change that removes the consequence for the stated trigger. Follow the surrounding code's patterns. Do not refactor, rename, reformat or tidy anything else, and do not weaken a test, type, lint rule or validation to make something pass.
3. When the finding named unprotected behaviour and the repository has tests for that area, add or adjust one focused test that fails without the repair.

Stay inside the selection. When you notice another problem while repairing, do not fix it: mention it in one line under "Noticed, not changed". Do not go looking for more.

## Verify

Run the narrowest repository-defined checks that cover what you changed: the affected test file or package, plus lint or type check when they are cheap. Run them once. When a check fails because of your repair, correct the repair once and re-run that check; after that, report the failure instead of iterating. Never install dependencies, change configuration or use another project's port: for a busy port run `node ${CLAUDE_SKILL_DIR}/../quality-review/scripts/free-port.mjs 3000` and pass the result to the tool. A check that cannot run is reported as not run; it does not block the repair.

Before writing the summary, run `git status --short` and `git diff --stat` and make sure every changed file belongs to a selected finding. Revert any edit that does not.

## Report

Leave the changes uncommitted. End with this Markdown summary and nothing after it:

```markdown
# Fix review: <branch>

## Repaired
- **F1 · <title>** — `path:line`: <what changed, one sentence>. Test: <added or adjusted test, or "none: <reason>">

## Not repaired
- **F2 · <title>** — <not selected / no longer applies / needs a decision: <which> / attempted and reverted: <why>>

## Verification
- `<command>` → passed / failed (<cause>) / not run (<reason>)

## Files changed
<output of `git diff --stat`>

## Noticed, not changed
- <one line each, or "Nothing">
```

"Repaired" means the code was changed and the verification listed ran. It is not a claim that the finding is resolved: `/final-review` decides that. Say "changed", not "fixed", for anything whose verification did not run. Finish with the line `Next: /final-review`.
