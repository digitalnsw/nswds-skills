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
Report every command and result. Do not modify code or weaken a failing gate.
