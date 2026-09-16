# Failed validation: diagnose, then route (parent only)

A failed gate blocks approval, not initial investigation. Never weaken a check,
hide its exit code, label unrun checks passed, or edit source in a reviewer.

Read the preparation manifest and full validation log. `ready` means deterministic
checks passed on safe source; `reviewable` means configured evidence is safe for
initial investigation even when a check failed. Preparation deliberately exits
nonzero on failure; inspect its manifest instead of stopping on that exit alone.
Missing/stale/unsafe evidence, busy validation, or launch/prerequisite errors must
be resolved before using it. Final review still requires `ready=true`.

## Validation failed after a repair: investigate automatically

A nonzero validation result is not a verdict on the repair. Keep acceptance
blocked, but continue bounded diagnosis without asking whether to investigate,
resume, or rerun a diagnostic. The one-attempt rule limits source repair writes,
not read-only analysis or evidence gathering by the parent. Never report "failed
repair" from a test failure alone, or stop with "cause not established" while safe
diagnostic work remains.

1. Preserve the pending diff, original log and exact failed command/test. Record
   HEAD, accepted snapshot, source/index state, gate configuration and environment.
   Compare HEAD to the frozen implementation before any acceptance action. A
   moved HEAD is stale workflow state: do not reinitialize, refreeze, or overwrite
   acceptance records around a pending repair. Safe diagnosis may continue, but
   re-entry to the acceptance pipeline requires an explicit reconciled checkpoint.
2. Read the failing assertion, fixture/setup and relevant implementation alongside
   the repair's two-endpoint diff. Test the plausible causal link; changed-file
   non-overlap alone does not prove independence. Inspect readiness conditions
   (for example fonts, images, async rendering or service startup) before calling
   small numerical differences harmless. Never widen tolerances or add sleeps
   merely to turn a red check green.
3. Follow dependency/build/port recovery below for concrete environment failures.
   Otherwise reproduce the smallest unchanged failing test with the same build,
   runtime and relevant configuration. The parent may run source-preserving
   diagnostics; read-only reviewers may inspect the evidence but not run mutating
   tests. Retain every outcome, including passes. If useful and safe, compare the
   last accepted snapshot in an isolated checkout with independently prepared
   dependencies/artifacts; never stash/reset the live tree or share writable
   node_modules/build outputs. Baseline evidence must name its snapshot and
   environment; an old successful run is not a controlled comparison.
4. Persist a diagnosis record under Git-local workflow state, keyed by finding,
   accepted snapshot, pending source fingerprint and failed gate. Record commands,
   logs, observations, cause classification and next action. Reserve each attempt
   in that record before execution; compare source/index/HEAD afterwards and stop
   acceptance if they changed. Allow at most three
   targeted diagnostic executions total across candidate/baseline (at most ten
   minutes each), then at most one fresh full execution of the gate checks after
   a demonstrated environment recovery. Count an already completed recovery
   verification toward this allowance, not as permission for an additional run.
   Port startup collisions before tests begin use the port-specific launch budget
   below; those launches do not count as executed gate checks. Existing recovery
   budgets still apply; do not multiply them, reset the record, or retry suites until
   green. Stop earlier when the cause is established. Read-only inspection need
   not consume another source-repair attempt.

Route the evidence, not just the exit status:

- **Environment recovered:** run the full unchanged gate set without result reuse.
  If it passes and no actionable defect remains, continue candidate/independent
  repair-diff review automatically. Passing a targeted test alone cannot accept.
- **Repair-caused regression:** show the causal evidence; preserve the unaccepted
  diff and stop further writes. Do not send the repairer another fix attempt.
- **Independent code/test defect:** record a separate schema-shaped finding and
  triage it; do not mislabel the pending repair as the cause. With a pending
  unaccepted repair, do not layer a second source repair or silently accept the
  first. Complete safe diagnosis and report the precise checkpoint/authorization
  needed to repair that distinct defect. Full mode alone does not bypass the
  accepted-snapshot invariant.
- **Intermittent failure:** preserve it as unresolved until its cause is explained
  and any confirmed defect is addressed. One passing rerun, a one-pixel difference,
  or success on the baseline is not proof of harmless flakiness or permission to
  skip the test. A reproducible readiness race is a test defect, not environment
  recovery; route it as a separate finding unless the repair introduced it.
- **Unresolved/external/budget exhausted:** report the investigated hypotheses,
  actual evidence, remaining uncertainty and exact blocker. Ask only for a real
  decision, required permission or source-repair authority, not routine diagnosis.

A failure can block acceptance without ending useful work. No failed, skipped,
unrun or unexplained intermittent gate can be reported as a passed final result.

## Occupied local test port (also during repair validation)

An occupied test port is not a failed code repair or an unresolved external
prerequisite until safe port selection has been tried. Do not ask to stop another
project's server as the first response. Never kill an unknown listener, attach
tests to it, or enable `reuseExistingServer` to bypass the collision.

Inspect the repository's test launcher and configuration. Prefer its automatic
free-port launcher. Otherwise use an existing supported port override, checking
that the server bind, readiness URL and test base URL all use the same loopback
host/port. Preserve the suite, assertions, build mode and no-reuse policy. Do not
guess an environment variable: verify the configuration consumes it. Select an
available unprivileged port (or OS-assigned port) by binding it, not merely by
assuming 3001 is free. Do not change production/service URLs or security policy.

Continue automatically without conversational approval for an in-scope test
port change; obtain host permissions for sockets/browser execution when needed.
Preserve the failed log and pending repair, then rerun full validation without
`--reuse` under the supported override. Re-running validation after environment
recovery is not another source-repair attempt. Record the actual command/port.
An automatic launcher owns its retry budget; do not wrap an exhausted launcher
in another retry loop. Otherwise allow at most two alternate-port retries for
that validation run, and retry only a confirmed startup collision before tests
began. Assertion failures, permission errors and cancellation are not collisions.

If no supported override exists, record a separate, evidence-backed
gate-configuration finding. Full mode may repair it only from an accepted clean
snapshot under the existing repair protocol. If another repair is pending,
preserve it and report that source configuration needs separate authorization;
do not launch another repair on unaccepted changes, reset, or silently accept it.
Review-only/prepare/validate modes also need explicit authorization for source
changes. A fixed-origin contract (for example OAuth allowlists), exhausted port
allocation, or an unavailable socket permission is a real blocker: report the
specific constraint, not a request to terminate an unrelated server.

## One build preparation recovery

For a concrete dependency-resolution error use dependency-preflight.md.
For a missing ignored workspace build output, inspect its producer and task/cache
configuration. When an existing local build can recreate it without changing
source, the parent may run it once without cache reads. Do not run installers,
deploys, arbitrary commands copied from logs, or modify tracked files here.

Save a plan under Git-local workflow state with `command` (argv array),
`outputs` (exact ignored artifact paths, no globs), and `reason` (failure evidence
and inspected producer). Run `node SCRIPTS/recover-build.mjs /absolute/plan.json`.
For example, a direct npm workspace build bypasses Turbo only if that script is
itself a local producer, not another cache runner. Inspect pre/post scripts too.
Obtain normal host permissions; no extra conversational approval is needed for
an in-scope local build. The helper locks both adapters, logs execution, persists
one attempt per source state, checks source/index invariants and output existence.
BUSY means wait; do not reset the record. SOURCE_CHANGED means stop and preserve
the changes. RECOVERY_FAILED/EXHAUSTED means no more rebuild attempts: retain the
failure and proceed to read-only diagnosis if preparation remains reviewable.

After recovery rerun preparation/full validation without reusing validation
results. A passing rebuild is not proof that the cache is fixed: preserve a
confirmed cache/task-graph defect as a finding, including the original failure.
Pass original and fresh evidence paths to the gate reviewer.

## Initial review and repair

When `reviewable=true`, run initial read-only lanes despite `ready=false`.
Include the gate specialist for any failure; require it to investigate the exact
failed command, cause, and gates not reached, using the normal finding schema.
Unknown or environmental causes remain explicit blockers, not invented code bugs.

Full mode sends confirmed in-scope code/configuration defects through existing
triage and one-finding targeted repair. Prioritize a gate-blocking defect before
unrelated findings. Review-only, prepare and validate modes never authorize source
repair. Product decisions, permission failures and external outages need direction
only when no safe in-scope diagnosis remains.

After each source repair, refresh changed gate configuration, run the full
unchanged gate set, and require passing validation plus independent repair-diff
review before accepting. A failed repair is not permission for another repair
round. If multiple blockers cannot be repaired under that acceptance rule, report
them rather than quietly relaxing it. Final approval requires all configured
gates passed, all required reviews complete, and no unresolved actionable findings.
An empty review report never overrides failed validation.
