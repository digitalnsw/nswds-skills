# Validation report

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
  captured configured validation and analyzer evidence, and left Git clean.
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
