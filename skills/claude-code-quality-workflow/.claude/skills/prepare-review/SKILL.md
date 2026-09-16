---
name: prepare-review
description: Build immutable repository context, validation results, and static-analysis evidence for a read-only review.
argument-hint: "[initial|final]"
disable-model-invocation: true
---

First read `${CLAUDE_SKILL_DIR}/../../quality-workflow/init-protocol.md` and initialize
validation automatically with ENGINE=claude. Only Git-local setup metadata may be
written during init. Then read `${CLAUDE_SKILL_DIR}/../../quality-workflow/dependency-preflight.md`
and perform bounded environment preparation. Then run
`${CLAUDE_SKILL_DIR}/../../quality-workflow/scripts/prepare-review.sh ${ARGUMENTS:-initial}`.
Do not edit code. Report the evidence directory, exact base and head
SHAs, validation scope, analyzer results, and every warning. On failure read
`../../quality-workflow/gate-failure.md` relative to this skill for bounded
environment recovery. `REVIEWABLE=1` allows initial diagnosis despite `READY=0`;
only `READY=1` allows final approval. This command never authorizes source repair.
