---
name: freeze-review
description: Freeze a clean implementation for review, automatically selecting its destination base branch when possible.
argument-hint: "[base-branch; usually omit]"
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/../../quality-workflow/scripts/freeze.sh *)
---

Run `${CLAUDE_SKILL_DIR}/../../quality-workflow/scripts/freeze.sh $ARGUMENTS`
immediately. Do not ask the user for a base first when no argument was supplied:
the script auto-detects the remote default, `main`, or `master` branch.

The optional argument must be a branch—the branch this work will eventually merge
into—not a commit SHA or tag. If automatic detection fails, explain this in plain
language, show the branches printed by the script, and help the user choose. Do not
commit, stash, discard, or alter files to make freeze pass.
