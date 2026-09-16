# Repair batches and parent-owned verification

Use this protocol in full mode after initial review. It supersedes the old
one-finding/full-suite-per-repair sequence. Read-only modes never authorize edits.

## Plan once, then execute

The parent triages the review against repository evidence, deduplicating only the
same cause/outcome. Preserve every ID and provenance. Use a separate triage worker
only for a disputed or high-risk finding needing an independent second opinion.
Record product decisions; do not invent intent. Unrelated confirmed work can
continue while a decision is pending if it cannot prejudice that decision.

Save the COMPLETE triage report in Git-local workflow state. Run
`repair-state.mjs init` only for a new clean frozen run, then
`repair-state.mjs plan /absolute/triage.json`. On resume reuse the existing state.

Group 1–5 CONFIRMED BLOCKING/SHOULD_FIX findings only when they share a subsystem,
contract or causal dependency and can be reviewed as one coherent diff. Explain
the grouping. Keep unrelated/security-sensitive changes separate. Prioritize gate
blockers and correctness over cosmetic/documentation improvements. Informational
findings are not automatic work. Supply every complete finding in the batch.
Do not re-review the whole repository before each fix.

## Implement, verify, review, checkpoint

1. Run `repair-state.mjs check` and give the worker CHECKPOINT_SNAPSHOT as its
   base. A checkpoint includes previously reviewed repairs but is not final
   acceptance. The worker edits only the supplied batch and runs permitted
   targeted checks. It does not run the full suite, commit, or choose new work.
2. Separate implementation status from verification status. The worker reports
   implementation COMPLETE/PARTIAL/DISPUTED and verification PASSED/DEFERRED/FAILED.
   Browser/host restrictions mean DEFERRED checks, not incomplete implementation
   when all source work is done. The parent already owns those checks. Never ask
   whether to use parent verification or proceed to independent review.
3. Inspect the report and diff for completed outcomes and unexpected edits. For
   complete implementation, run `repair-state.mjs candidate R-001,R-002`.
   Preserve its BASE_SNAPSHOT and CANDIDATE_SNAPSHOT. This records implemented
   work, not acceptance. Save a verification plan in Git-local state:
   `{"scope":"targeted","reason":"Tests covering the changed collector and exports",
   "commands":[["npm","run","test:collector"],["npm","run","typecheck"]]}`.
   These are illustrative commands: inspect actual repository scripts and their
   side effects. Do not invent scripts or replace checks with echo/true.
4. Run `repair-state.mjs verify /absolute/plan.json` in the parent, requesting
   normal host permissions when required. The helper logs real command exits and
   binds verification to the exact candidate and index, rejecting source mutation.
   Reproduction/mutation tests must establish meaningful coverage, not just green
   assertions. All outcomes remain evidence; no weakened checks or retry-until-green.
   Failed receipts are retained. Before rerunning a failed candidate, add
   `resolution: {"cause":"established cause and recovery","evidence":["/absolute/log"]}`
   to the plan. This must describe demonstrated recovery, not merely a passing
   retry. The independent reviewer receives the original failure and resolution.
   Choose targeted tests plus affected type/lint/build/consumer checks by the diff.
   Use `{"scope":"full","reason":"Cross-cutting package/build changes"}` at a
   genuinely cross-cutting integration checkpoint; it runs the configured full
   gate. Do not run the full suite for every small finding.
5. Give a fresh read-only repair reviewer ALL batch findings, exact two-endpoint
   diff and parent verification receipt/logs. It must verify every required
   outcome, coverage adequacy and absence of regressions. Zero findings and
   COMPLETE coverage are required. Run
   `repair-state.mjs checkpoint R-001,R-002 /absolute/repair-review.json`.
   This helper refuses missing/failed/stale verification and mismatched or
   non-clean reviews. Then automatically start the next planned batch.
6. Emit `repair-state.mjs status` after each checkpoint: readable counts and a
   Markdown progress file. Implemented, verified, reviewed and accepted are
   different states. Checkpoints allow progress; they never certify merge readiness.

## Resume an existing PARTIAL repair

First import the existing COMPLETE triage with
`repair-state.mjs plan /absolute/existing-triage.json`. This upgrades legacy
metadata without changing its checkpoints or source; do not call init. If the
triage report is only UNTRIAGED, finish triage from saved evidence in the parent.
Then use status/candidate normally; legacy singular findingId is supported.
Do not restart its write worker, reset attempt counters, reinitialize the run,
discard the diff or redo completed reviews. Inspect the saved report, finding,
diff, current HEAD and existing parent evidence. Legacy PARTIAL conflates missing
code with missing worker permissions. If the only remaining work is verification
and the source outcomes are present, treat it as implemented and follow steps
3–5 automatically. Parent evidence outranks a worker's inability to run a check,
not an unresolved implementation defect.

An existing passing log is useful evidence, but the new checkpoint helper needs
its own source-bound receipt. Run the smallest adequate parent check through it;
do not repeat the entire suite solely to replace a legacy status label. Record
the earlier full-gate log for the independent reviewer. If HEAD/source changed
outside the known repair, preserve work and report the exact reconciliation
needed; do not silently certify a different snapshot.

A truly partial, disputed or failed implementation needs diagnosis, not a guessed
COMPLETE label. Follow gate-failure.md. No repeated source repair loop. A new
independent defect is a new finding; do not fold unrelated work into this batch.

## Final acceptance

After planned batches, run prepare-review final ONCE. It runs all configured
gates on the complete checkpointed tree and collects final evidence. Do not
pre-run full validation immediately before it. Require ready=true/READY=1, then
one fresh final reviewer over all nine passes. Call
`repair-state.mjs finalize /absolute/final-review.json` only after a COMPLETE
zero-finding review. This rejects outstanding actionable/decision findings and
non-passing final evidence. No repairs means no duplicate final model review:
still check configured gates and source identity before reporting the result.

Do not confuse a worker's returned JSON with the user-facing report. Keep JSON
as internal evidence. Show a short Markdown findings summary before repairs,
then batch progress, and a final result with fixed/remaining findings, tests,
coverage gaps and evidence links. Never say an issue is fixed merely because it
was found or triaged. Include time spent in preparation, review, repair and
validation where available; do not invent timing or claim Copilot parity.
