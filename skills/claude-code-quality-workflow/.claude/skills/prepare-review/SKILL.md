---
name: prepare-review
description: Build immutable repository context, validation results, and static-analysis evidence for a read-only review.
argument-hint: "[initial|final]"
disable-model-invocation: true
---

First read `${CLAUDE_SKILL_DIR}/../../quality-workflow/init-protocol.md` and initialize
validation automatically with ENGINE=claude. Only Git-local setup metadata may be
written. Then run `${CLAUDE_SKILL_DIR}/../../quality-workflow/scripts/prepare-review.sh ${ARGUMENTS:-initial}`.
Do not edit code. Report the evidence directory, exact base and head
SHAs, validation scope, analyzer results, and every warning. `READY=0` blocks
review; explain the failing evidence rather than asking a reviewer to reason past it.
