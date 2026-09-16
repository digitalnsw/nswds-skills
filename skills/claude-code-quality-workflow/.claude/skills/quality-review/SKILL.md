---
name: quality-review
description: Run an independent read-only evidence-driven review of the frozen implementation. Reports findings only.
argument-hint: "[optional scope]"
disable-model-invocation: true
context: fork
agent: senior-code-reviewer
background: false
---

Review the frozen implementation now. Optional user scope: `$ARGUMENTS`.

First run the active config directory's
`quality-workflow/scripts/prepare-review.sh initial`. Require `REVIEWABLE=1`
(or legacy `READY=1`), then read
the emitted evidence manifest and every relevant evidence artifact. Apply the
complete reviewer playbook, verify every finding, and return structured findings
only. Never edit or repair. If preparation fails but evidence is reviewable,
diagnose the failed gate as part of review. Unsafe evidence still blocks review.
