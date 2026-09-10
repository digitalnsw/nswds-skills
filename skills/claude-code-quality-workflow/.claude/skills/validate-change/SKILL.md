---
name: validate-change
description: Run the repository's deterministic quick or full quality gate.
argument-hint: "[quick|full]"
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/../../quality-workflow/scripts/verify.sh *)
---

Run `${CLAUDE_SKILL_DIR}/../../quality-workflow/scripts/verify.sh ${ARGUMENTS:-full}`.
Report every command and result. Do not modify code or weaken a failing gate.
