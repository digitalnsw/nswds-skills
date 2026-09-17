---
name: quality-review
description: Read-only review of the whole current branch against its automatically detected base. Returns a Markdown report of concrete, actionable defects, or "No actionable findings", with a coverage table. Never edits files.
argument-hint: "[base branch, or what to focus on]"
disable-model-invocation: true
model: sonnet
effort: medium
allowed-tools: Read, Grep, Glob, Bash(node ${CLAUDE_SKILL_DIR}/scripts/*), Bash(git diff *), Bash(git log *), Bash(git show *), Bash(git status *), Bash(git grep *), Bash(git ls-files *), Bash(git blame *)
disallowed-tools: Edit, Write, NotebookEdit, Agent, Task, AskUserQuestion, EnterPlanMode
hooks:
  Stop:
    - hooks:
        - type: command
          command: node "__QUALITY_REVIEW_DIR__/scripts/report-lint.mjs" --hook
          once: true
          timeout: 30
---

Review the current branch now, in this conversation, and end this turn with the finished report. This command is read-only: do not create, edit, format, stage, commit, stash or delete anything, and do not delegate to other agents.

!`node ${CLAUDE_SKILL_DIR}/scripts/review-scope.mjs --skill`

User's argument for this review (may be empty): $ARGUMENTS

When the argument names a branch, that branch is the base: run `node ${CLAUDE_SKILL_DIR}/scripts/review-scope.mjs --skill <branch>` once and use that scope instead of the one above. Treat any other argument as what to concentrate on; it never reduces the coverage table.

The output above is the review scope followed by the review guide. If it is missing, run that command yourself to get both. The base is already chosen: never ask the user for a branch or a commit unless the scope says no base could be established.

Helper commands:

- Closing fingerprint (run once, immediately before writing the report): `node ${CLAUDE_SKILL_DIR}/scripts/review-scope.mjs --fingerprint`
- Free port when the usual one is taken: `node ${CLAUDE_SKILL_DIR}/scripts/free-port.mjs 3000`

Completion contract: the final answer is the Markdown report from the guide, with either at least one finding or the exact words `No actionable findings`, and a Coverage section that accounts for every changed production file. A failed or unavailable check, a large diff, or a shortage of time are reasons to record a coverage gap, never reasons to stop, apologise, describe a plan or ask whether to continue. A completion check reads the final answer and sends it back if it is anything other than the report.

End the report with one line: `Next: /fix-review F1 F2 …` naming the findings worth repairing, or nothing when there are none.
