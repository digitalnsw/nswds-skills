# Orchestration protocol

The current conversation coordinates; separate `codex exec` workers review or
repair. Review workers use a read-only filesystem sandbox; the repair worker uses
workspace-write. Reviewers never run tests that modify files: the parent gathers
test evidence first. Do not use external messaging, publishing, browser writes,
or MCP write tools in any worker. Follow existing approval controls.

The engine has no dependency on Claude Code or its hooks. All required validation
runs explicitly inside this workflow. It does not enforce a global Codex Stop hook.

## Preparation

1. Resolve the repo root and this skill directory. Read applicable AGENTS.md and
   repository rules. Check `codex exec --help` is available. Do not launch a worker
   recursively from within a worker job.
2. Follow `references/init-protocol.md` with ENGINE=codex to initialize or refresh
   repository validation automatically. Read `references/dependency-preflight.md`
   and perform its check/bounded environment restore before freezing. Then run
   `bash <skill>/scripts/freeze.sh [branch]`, then
   `bash <skill>/scripts/prepare-review.sh initial`. Read the printed manifest.
   Read `references/gate-failure.md` when preparation fails. Initial lanes require
   reviewable=true (or ready=true for legacy manifests), not passing gates.
   Full mode also requires validation.configured=true. Final approval requires
   ready=true; never interpret reviewable as passed.
   Config priority is repo `.codex/quality-workflow`, then repo
   `.claude/quality-workflow` (reuse the user's existing gate list), then the generated
   Git-local init plan. Global defaults alone do not count as repository setup.
   Never claim baseline auto-detection is full coverage. Carry the manifest's
   validation.configuration.exclusions through to the final report as unverified
   CI-only/inapplicable checks. Configured local gates do not prove CI passed.
3. State is under `git rev-parse --git-path codex-quality-workflow`; resolve this
   path against the repo root (worktrees may use a path outside `.git`). Create job
   JSON files under that state directory, not tracked source. Pass absolute paths.

## Worker jobs and automatic handoff

Each job has this shape (substitute actual values, never these examples):

```json
{
  "role": "senior",
  "repository": "/absolute/repo",
  "evidence": "/absolute/evidence/manifest.json",
  "scope": "Whole changed behavior across passes 1–9",
  "passes": [1,2,3,4,5,6,7,8,9],
  "baseSha": "actual base SHA",
  "headSha": "actual head SHA",
  "target": "frozen-implementation",
  "inputs": [],
  "model": "actual selected model identifier"
}
```

Omit model only when it is unknown; workers then use CLI configuration. Effort
defaults to high. `inputs` are absolute paths to validated report or finding JSON
files. Optional `timeoutSeconds` is 900 by default, 10–3600 supported. Each review
has at most three attempts; this is a time/attempt budget, not Claude maxTurns.

Execute `node <skill>/scripts/run-lane.mjs <job.json>`. It prints a report path and
progress. Use the product's nonblocking command/session polling so the user sees
updates during longer runs. Nonzero exit blocks dependent stages. Output JSON and
event logs remain in the state directory; do not manually relay findings to users
as instructions for the next stage.

Always run senior. Always add gate (4,7,9) when validation failed or build recovery
was needed; give it both original and fresh evidence, and retain any confirmed
cache/producer defect even after recovery passes. Add contract (passes 1,5,6),
behavior (2,3,8), and gate (4,7,9)
when the change touches those areas. Use all four for an exhaustive/high-risk review.
Independent read-only jobs may run in parallel. Supply each its own scope and no
other reviewer's conclusions. The runner retries partial or malformed final output
using fresh workers with the same evidence, original assignment and valid progress.
No report means no completed coverage: the original assigned scope remains due.
Preserve earlier verified findings in a consolidated final report; reverify them.

Only proceed after every required job returns a validated COMPLETE report with the
right SHAs and assigned passes. The runner checks these requirements in code. A
model's completeness claim still requires the parent to inspect the coverage note.
Do not rerun a failed job to reset its retry counter. Treat exhausted jobs as blocked.

## Triage and repair

Review-only mode stops with consolidated findings and coverage. Full mode continues:

1. Union completed reports, deduplicate only the same cause/outcome and assign
   unique R-001-style IDs. Keep reviewer provenance in evidence_sources. Save one
   schema-shaped report and run `validate-findings.mjs` on it.
2. Run a `triage` job with the union in `inputs` and the same base/head/target;
   passes may be empty. Require every supplied ID exactly once with a disposition.
   The runner verifies ID preservation. If any finding NEEDS_DECISION, return the
   explicit question and pause before repairs. Never invent a contract.
3. Run `node <skill>/scripts/repair-state.mjs init` once. For each CONFIRMED
   BLOCKING/SHOULD_FIX finding (gate blockers first), check the accepted state, save exactly that complete
   finding to a file, and launch a `repair` job with that single input and the
   accepted snapshot as baseSha. This worker must reproduce, add a meaningful
   regression test, make the smallest fix, run targeted checks, and return its
   report. It must not touch unrelated findings, weaken gates, commit, or push.
4. Repairs get one attempt only. An error or partial repair stops the workflow;
   leave its diff available for inspection. Do not automatically retry writes.
5. If gate definitions changed, refresh init using the protocol without weakening
   checks. Run full verify in the parent. A concrete dependency-resolution failure
   goes through dependency-preflight.md once; missing build outputs and occupied
   test ports follow gate-failure.md's bounded recovery before classifying a
   repair as failed. Port recovery reruns validation, not the repair worker.
   A genuinely failed repair still stops acceptance;
   do not start a fix-the-fix loop. On success create candidate R-xxx using
   repair-state.mjs. Run `repair-review` with target=repair-diff and the candidate's
   base/head pair; inspect TWO-endpoint diff, never triple-dot. Pass the original
   finding as input. Only COMPLETE and zero findings authorizes snapshot accept.
   A rejected repair stops here; no fix-the-fix loop.
6. After accepted repairs, run prepare-review final and a fresh `final` job with
   all nine passes, the final manifest and its exact SHAs. No further automatic
   repair round. Without repairs the complete initial set is the final assessment;
   still require passing configured validation and recheck that source/HEAD have
   not changed before claiming a passed result. Failed/unrun gates remain blockers
   even when reviewers return no findings.

## Final report

State reviewed branch and SHAs, model selection, required lanes and attempts,
commands and coverage gaps, triage dispositions, accepted repairs, final findings,
and report paths. Clean means complete coverage and no remaining actionable or
undecided findings with the configured gates passed. Repairs remain uncommitted.

## Engineering guidance

Read architecture, contracts, callers and tests before changing code. Prefer existing
patterns and the smallest complete change. No unrelated refactor or dependency
upgrade. For every behavioral repair, demonstrate a regression test would fail
without it, or explain why reproduction is impractical. Never weaken tests, types,
lint, validation, coverage or security controls. Reviewers diagnose and triagers
verify; the repair worker alone implements the supplied finding.
