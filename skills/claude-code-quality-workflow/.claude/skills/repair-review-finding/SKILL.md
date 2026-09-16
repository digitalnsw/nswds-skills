---
name: repair-review-finding
description: Repair one coherent batch of up to five fully specified confirmed findings with a regression-first minimal change.
argument-hint: "<1-5 related complete CONFIRMED findings>"
disable-model-invocation: true
context: fork
agent: targeted-repairer
background: false
---

Repair exactly this coherent batch of one to five confirmed findings: `$ARGUMENTS`.

Each input must include its contract, trigger, observed and expected behavior,
evidence, and required outcome. If any is incomplete or not `CONFIRMED`, stop
without editing. Follow the targeted repair protocol and stop after verification.
