# Failed validation: diagnose, then route (parent only)

A failed gate blocks approval, not initial investigation. Never weaken a check,
hide its exit code, label unrun checks passed, or edit source in a reviewer.

Read the preparation manifest and full validation log. Initial preparation runs
only the quick safety phase so review can start promptly; the full configured gate
runs concurrently and its receipt/log must be reconciled before repair. `ready`
means the phase in that manifest passed on safe source; `reviewable` means evidence
is safe for investigation even when a full or final check failed. Full/final
validation deliberately exits nonzero on failure; inspect the evidence instead of
stopping on that exit alone.
Missing/stale/unsafe evidence, busy validation, or launch/prerequisite errors must
be resolved before using it. Final review still requires `ready=true`.

## Validation after a repair: parent owns the result

Follow repair-batches.md for checkpoint and acceptance rules. A worker unable to
launch browsers has deferred verification, not necessarily unfinished code. The
parent executes required checks with normal host permissions, then automatically
continues independent diff review. A legacy PARTIAL label does not overrule passing
parent evidence for the same code. Inspect actual remaining source work first;
do not rerun the repair worker or ask permission merely to continue review.

A real nonzero parent check blocks the checkpoint but not diagnosis. Preserve the
diff, failed log, HEAD, source/index identity and exact command. Inspect the
assertion/setup and implementation alongside the repair diff. Changed-file
non-overlap or a small numerical difference is not proof of independence. Check
readiness conditions such as fonts/images before calling a failure harmless.

Use bounded dependency/build/port recovery below when applicable. Otherwise allow
up to three targeted diagnostic executions total across the candidate and, when
safe, an isolated baseline checkout, at most ten minutes each. Record attempts
before execution under Git-local state; continuation does not reset the budget.
Never stash/reset live work or share writable build/dependency outputs with the
baseline. Stop sooner when the cause is established. Check source/index afterwards.

- Environment recovered: rerun the affected check through parent verification,
  preserve both logs, and continue diff review. Full gates remain due at final
  preparation or an explicitly justified integration checkpoint.
- Repair-caused regression: preserve evidence and the diff; stop further writes,
  not merely because the worker reported a limitation.
- Separate defect: record and triage it. Do not silently expand the current batch.
  If it prevents adequate verification, explain the concrete dependency rather
  than claiming the current repair caused it.
- Intermittent/unresolved: a green rerun does not erase a failure. Investigate its
  cause; do not loosen assertions or repeat suites until green. After exhausted
  diagnosis, report the actual uncertainty and required decision.
- HEAD/source changed outside the known repair: preserve everything; reconcile
  the snapshot explicitly before any checkpoint. Never erase progress via init.

No failed, unrun or unexplained intermittent gate becomes a passed final result.

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
Preserve the failed log and pending repair, then rerun the affected verification
scope through the parent helper under the supported override, recording recovery.
Initial/final full validation still reruns in full. Re-running checks after environment
recovery is not another source-repair attempt. Record the actual command/port.
An automatic launcher owns its retry budget; do not wrap an exhausted launcher
in another retry loop. Otherwise allow at most two alternate-port retries for
that validation run, and retry only a confirmed startup collision before tests
began. Assertion failures, permission errors and cancellation are not collisions.

If no supported override exists, record a separate, evidence-backed
gate-configuration finding. Full mode may repair it as a separate planned batch
from the latest verified, independently reviewed checkpoint. If another repair is pending,
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

When `reviewable=true`, run initial read-only review while full validation proceeds.
Include the gate specialist when that full run fails; require it to investigate the exact
failed command, cause, and gates not reached, using the normal finding schema.
Unknown or environmental causes remain explicit blockers, not invented code bugs.

Full mode sends confirmed in-scope code/configuration defects through existing
triage and scoped batch repair. Prioritize a gate-blocking defect before
unrelated findings. Review-only, prepare and validate modes never authorize source
repair. Product decisions, permission failures and external outages need direction
only when no safe in-scope diagnosis remains.

After a repair batch, follow repair-batches.md: refresh changed gate configuration,
run parent-owned affected checks and independent batch review before provisional
checkpointing. Final preparation runs the full unchanged gate set once, not once
per finding. Failed checks still need diagnosis; they are never waived.
Final approval requires all configured
gates passed, all required reviews complete, and no unresolved actionable findings.
An empty review report never overrides failed validation.
