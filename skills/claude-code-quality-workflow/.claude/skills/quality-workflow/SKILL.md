---
name: quality-workflow
description: "Run an independent code review, coherent repair batches, parent-owned validation and final review with readable progress."
argument-hint: "[base-branch; usually omit]"
disable-model-invocation: true
context: fork
agent: quality-orchestrator
background: false
---

Run the complete quality pipeline now. Optional destination base branch:
`$ARGUMENTS`. Do not ask the user to manually relay output between stages. Preserve
the read-only reviewer/write-enabled repairer boundary. A failed validation blocks
acceptance, not diagnosis: automatically follow quality-workflow/gate-failure.md's
post-repair investigation protocol before pausing. Follow repair-batches.md for
parent-owned checks, provisional checkpoints and final acceptance. JSON stays
internal: present readable findings and real progress. Resume known pending work
without refreezing or replaying completed stages. Never accept unsafe/unverified work.
