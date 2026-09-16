---
name: validate-change
description: Run the repository's deterministic quick or full quality gate.
argument-hint: "[quick|full]"
disable-model-invocation: true
---

For full/default, first read `${CLAUDE_SKILL_DIR}/../../quality-workflow/init-protocol.md`
and initialize validation with ENGINE=claude. Quick mode needs no setup. Setup may
write only Git-local metadata during init. For full/default also read
`${CLAUDE_SKILL_DIR}/../../quality-workflow/dependency-preflight.md` and perform its
bounded environment preparation. Then run
`${CLAUDE_SKILL_DIR}/../../quality-workflow/scripts/verify.sh ${ARGUMENTS:-full}`.
For setup failures, read `../../quality-workflow/gate-failure.md` relative to this
skill. Automatically use the repository's supported free-port mechanism for
occupied test ports and rerun without cached validation results; never stop or
reuse another project's server. Report every command and result. Do not modify
code or weaken a failing gate.
