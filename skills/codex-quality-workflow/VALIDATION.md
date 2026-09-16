# Validation of the Codex adapter

Version-three fixture coverage adds:

- one medium-effort broad reviewer by default, with specialist lanes opt-in;
- quick initial preparation plus a source-bound full gate that can run alongside review;
- coherent 1–5 finding repair batches and parent-owned targeted verification;
- distinct implemented, verified, independently reviewed and accepted states;
- deferred worker browser checks without misclassifying finished code as partial;
- readable Markdown reports while JSON remains internal evidence;
- provisional checkpoints and one full final gate/review before acceptance;
- legacy paused-run migration without replaying a write worker;
- persisted failed/rejected evidence that a later green result cannot overwrite.

The following checks passed in isolated local fixtures:

- Both Codex skill files pass the skill-creator validator.
- Bash and JavaScript scripts pass syntax checks; ShellCheck reports no findings.
- Preparation reads the existing Claude repository gate and analyzer configuration.
- Evidence preparation leaves a clean implementation unchanged.
- A narration-only output triggers a fresh worker; a partial report also triggers
  continuation and then a completed report is accepted.
- Three failed attempts exhaust the lane. Reinvoking the same job does not reset
  the counter or rerun a completed job.
- Incorrect snapshot SHAs, missing assigned passes and missing triage IDs prevent
  acceptance of a report.
- Source changed since preparation is rejected before a worker starts.
- Temporary-index snapshots include new files and leave the real index unchanged.
- Refreezing archives the previous repair state so the next run uses fresh state.
- A legacy partial repair runs once and leaves its unaccepted changes available to
  inspect; a complete/deferred batch routes automatically to parent verification.
- Installation dry run writes nothing; repeated installation makes no changes.

The worker tests use a fake CLI executable that asserts the expected sandbox
arguments. No live model, authentication, filesystem sandbox attack, or model review
quality test was performed. CLI options were verified with installed Codex 0.153.4.
The underlying skill instructions still require model compliance for semantic
coverage and orchestration; validation cannot prove that a reported code review is
correct. Retry limits, report checks, saved results and state comparisons are
implemented in the runner.

Repeat the fixture suite with `node scripts/self-test.mjs` from the extracted
package. It retains its isolated fixtures in a temporary directory for inspection.
