---
name: repair-review-finding
description: Repair exactly one fully specified confirmed review finding with a regression-first minimal change.
argument-hint: "<complete CONFIRMED finding>"
disable-model-invocation: true
context: fork
agent: targeted-repairer
background: false
---

Repair exactly this one confirmed finding: `$ARGUMENTS`.

The input must include its contract, trigger, observed and expected behavior,
evidence, and required outcome. If it is incomplete or not `CONFIRMED`, stop
without editing. Follow the targeted repair protocol and stop after verification.

