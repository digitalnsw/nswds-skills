---
name: quality-workflow
description: "Run the complete agentic quality pipeline: freeze, prepare evidence, review, triage, repair confirmed defects one at a time, validate, and final-review."
argument-hint: "[base-branch; usually omit]"
disable-model-invocation: true
context: fork
agent: quality-orchestrator
background: false
---

Run the complete quality pipeline now. Optional destination base branch:
`$ARGUMENTS`. Do not ask the user to manually relay output between stages. Preserve
the read-only reviewer/write-enabled repairer boundary and stop on any unsafe or
unaccepted repair rather than looping on fixes.
