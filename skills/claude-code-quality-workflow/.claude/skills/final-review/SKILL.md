---
name: final-review
description: Read-only review of the current branch after repairs. Confirms whether each previously reported finding is actually resolved, looks for regressions introduced by the repairs, and reviews the whole branch once more. Never edits files and never repairs what it finds.
argument-hint: "[base branch, or what to focus on]"
disable-model-invocation: true
model: sonnet
effort: medium
allowed-tools: Read, Grep, Glob, Bash(node ${CLAUDE_SKILL_DIR}/../quality-review/scripts/*), Bash(git diff *), Bash(git log *), Bash(git show *), Bash(git status *), Bash(git grep *), Bash(git ls-files *), Bash(git blame *), Bash(npm run *), Bash(npm test*), Bash(pnpm run *), Bash(pnpm test*), Bash(yarn run *), Bash(yarn test*), Bash(bun run *), Bash(bun test*), Bash(node --test*), Bash(make lint*), Bash(make test*), Bash(make check*), Bash(make typecheck*), Bash(make validate*), Bash(make verify*), Bash(cargo check*), Bash(cargo test*), Bash(go vet*), Bash(go test*), Bash(pytest*)
disallowed-tools: Edit, Write, NotebookEdit, Agent, Task, AskUserQuestion, EnterPlanMode
hooks:
  Stop:
    - hooks:
        - type: command
          command: node
          args: ["__QUALITY_REVIEW_DIR__/scripts/report-lint.mjs", "--hook", "--final"]
          once: true
          timeout: 30
---

Review the current branch now, after repairs, and end this turn with the finished report. This command is read-only: do not create, edit, format, stage, commit, stash or delete anything, do not delegate to other agents, and do not repair anything you find. Repairs belong to `/fix-review`, which the user runs separately.

!`node ${CLAUDE_SKILL_DIR}/../quality-review/scripts/review-scope.mjs --skill`

User's argument for this review (may be empty): $ARGUMENTS

When the argument names a branch, that branch is the base: run `node ${CLAUDE_SKILL_DIR}/../quality-review/scripts/review-scope.mjs --skill <branch>` once and use that scope instead of the one above. Treat any other argument as what to concentrate on; it never reduces the coverage table.

The output above is the review scope followed by the review guide. If it is missing, run that command yourself to get both. Never ask the user for a branch or a commit unless the scope says no base could be established.

Follow the guide's method for the whole branch as it stands now, with two additions.

1. **Finding resolution.** Take the findings from the earlier `/quality-review` report and the `/fix-review` summary in this conversation. For each one, open the location as it is now and decide from the code, not from the repair summary: **Resolved** (the trigger no longer produces the consequence), **Partly resolved**, **Not resolved**, or **Not attempted**. A finding the repair summary calls fixed is only Resolved when you have confirmed it. When this conversation holds no earlier findings, say so in that section and review the branch as it stands.
2. **Regressions.** Read the repair itself (`git diff HEAD` when it is uncommitted, otherwise the commits after the first review) and check that it changed nothing beyond the selected findings, broke no caller, and that any test it added would fail without the repair.

Report new defects as findings under the guide's finding bar. An unresolved earlier finding is reported again under its original number rather than as a new one.

Use the guide's report format with the title `# Final review: <branch>` and this section between Findings and Coverage:

```markdown
## Finding resolution

| Finding | Status | Evidence |
| --- | --- | --- |
| F1 · <title> | Resolved | `path:line` now <what it does>; `<check>` passed |
```

Run the repository's cheap checks once, as the guide describes. State plainly which merge gates were not reproduced locally; a local pass is not a claim that hosted CI will pass.

Helper commands:

- Closing fingerprint (run once, immediately before writing the report): `node ${CLAUDE_SKILL_DIR}/../quality-review/scripts/review-scope.mjs --fingerprint`
- Free port when the usual one is taken: `node ${CLAUDE_SKILL_DIR}/../quality-review/scripts/free-port.mjs 3000`

Completion contract: the final answer is the Markdown report, with either at least one finding or the exact words `No actionable findings`, the Finding resolution section, and a Coverage section that accounts for every changed production file. A failed or unavailable check or a shortage of time is a coverage gap, never a reason to stop, apologise, describe a plan or ask whether to continue. A completion check reads the final answer and sends it back if it is anything other than the report.
