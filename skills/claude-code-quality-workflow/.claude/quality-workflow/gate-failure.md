# Failed validation: diagnose, then route (parent only)

A failed gate blocks approval, not initial investigation. Never weaken a check,
hide its exit code, label unrun checks passed, or edit source in a reviewer.

Read the preparation manifest and full validation log. `ready` means deterministic
checks passed on safe source; `reviewable` means configured evidence is safe for
initial investigation even when a check failed. Preparation deliberately exits
nonzero on failure; inspect its manifest instead of stopping on that exit alone.
Missing/stale/unsafe evidence, busy validation, or launch/prerequisite errors must
be resolved before using it. Final review still requires `ready=true`.

## One preparation recovery

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
