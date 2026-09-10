---
name: triage-findings
description: Independently verify and classify review findings before any repair is allowed.
argument-hint: "<findings or path>"
disable-model-invocation: true
context: fork
agent: findings-triager
background: false
---

Triage these findings: `$ARGUMENTS`.

Return each complete finding with exactly one status: `CONFIRMED`, `REJECTED`, or
`NEEDS_DECISION`, plus evidence and rationale. Never edit or propose a fix.

