# Validation report

## Balanced workflow update — 16 September 2026

Both adapter suites now exercise the version-three state machine in isolated Git
fixtures. The default path starts one broad review after quick safety preparation
while the configured full gate runs concurrently. It batches up to five coherent
findings, uses parent-owned targeted verification, requires an independent exact-
diff review for each provisional checkpoint, and runs the full configured gate
again only at final acceptance (or an explicitly cross-cutting checkpoint).

The fixtures also cover separate implementation and verification status, deferred
browser checks, readable Markdown reports, legacy run migration, rejected-repair
persistence, failed-check diagnosis receipts, source/index preservation, occupied-
port routing, moved HEAD detection, and final-only acceptance. Codex tests confirm
the broad reviewer defaults to medium effort while specialist/repair/final roles
remain high effort. This validates orchestration and invariants, not model accuracy
or measured parity with GitHub Copilot Code Review.

## Post-repair diagnosis update — 16 September 2026

Both package self-test suites passed. Independent read-only forward-testing of
both adapters exercised an unexplained resize failure, a subsequent green rerun,
a proven repair regression, a recoverable port collision, moved HEAD with a
pending repair, and exhausted diagnostic allowance. The exercise checked next
actions and acceptance decisions, not keyword presence. It exposed a retry-budget
ambiguity; the protocol now distinguishes pre-test port launches from execution
of the full gate checks. This was instruction-level scenario testing, not a live
end-to-end multi-agent repair run.

In the motivating repository, a browser trace reproduced a 146px measurement
while Public Sans was loading and 147px once it loaded. The resize test now waits
for the iframe document and fonts before measuring; its exact equality assertion
is unchanged. Three targeted runs and all 48 docs browser tests passed. This does
not certify that repository's pending repair or its full merge-gate set.

## Original package validation

Validated on 10 September 2026 with isolated temporary Git repositories and an
isolated Claude configuration target.

Verified behaviors:

- Claude Code accepted every skill and agent definition.
- Complete and partial reviewer envelopes pass structural validation, while the
  orchestrator rejects partial, malformed, truncated, or turn-limited lanes before
  triage and continues them automatically within a bounded allowance, without
  depending on `SendMessage` availability.
- Shell and Node scripts passed syntax checks; ShellCheck reported no findings.
- The example review report passes the dependency-free structured finding validator.
- Initial preparation used the frozen merge base and implementation commit,
  captured quick validation and analyzer evidence, started full validation as a
  separate source-bound run, and left Git clean.
- A failing required analyzer produced `READY=0` and a non-zero exit.
- A repair snapshot included tracked changes and a new untracked file.
- Accepting and preparing that repair did not change the user's real Git index.
- Final evidence targeted the accepted hidden snapshot rather than stale branch HEAD.
- The global installer preserved existing settings and personal instructions,
  installed both new commands and the orchestrator, and remained idempotent on a
  second run.
- Existing validation serialization, cache invalidation, wait/reuse, stale-lock
  recovery, automatic base-branch selection, and commit-SHA rejection tests pass.

The test suite does not invoke paid model reviews. It validates the agent contracts,
orchestration definitions, deterministic scripts, state transitions, installer,
and package structure. Run `./scripts/self-test.sh` after extraction to repeat the
portable checks on the destination machine.
