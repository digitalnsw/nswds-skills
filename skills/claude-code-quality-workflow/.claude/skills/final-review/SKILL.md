---
name: final-review
description: Run one fresh read-only whole-branch review after all repairs and full validation.
argument-hint: "[optional scope]"
disable-model-invocation: true
context: fork
agent: final-code-reviewer
background: false
---

Perform the single final whole-branch review now. The recorded base branch is
authoritative; `$ARGUMENTS` is only optional review scope, not a base override.
First run the active config directory's
`quality-workflow/scripts/prepare-review.sh final`. Require `READY=1`, read its
manifest and evidence, state the exact base/head SHAs, return structured findings,
and never edit or start a review/fix loop.
