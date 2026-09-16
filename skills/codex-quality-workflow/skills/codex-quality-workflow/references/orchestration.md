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
2. First inspect existing Git-local repair/evidence state. If this is a continuation
   of the same frozen HEAD with a known pending repair, follow repair-batches.md's
   resume path; do not freeze again, rerun completed reviews or erase state.
   For a new run, follow `references/init-protocol.md` with ENGINE=codex to initialize or refresh
   repository validation automatically. Read `references/dependency-preflight.md`
   and perform its check/bounded environment restore before freezing. Then run
   `bash <skill>/scripts/freeze.sh [branch]`, then
   `bash <skill>/scripts/prepare-review.sh initial`. Read the printed manifest.
   Initial preparation intentionally runs quick validation. Immediately launch
   `bash <skill>/scripts/run-full-validation.sh` in a managed nonblocking command
   session while the default reviewer runs; retain its printed log/receipt. Do not
   wait for it before starting review. Reconcile its exact-state result before
   repairs: failure adds a scoped gate review/finding; passing is baseline evidence.
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
  "model": "actual selected model identifier",
  "reasoningEffort": "medium"
}
```

Omit model only when it is unknown; workers then use CLI configuration. Broad
senior review defaults to medium effort; other roles default to high. Override
with `reasoningEffort` only for a concrete risk or latency reason. `inputs` are
absolute paths to validated report or finding JSON
files. Optional `timeoutSeconds` is 900 by default, 10–3600 supported. Each review
has at most three attempts; this is a time/attempt budget, not Claude maxTurns.

Execute `node <skill>/scripts/run-lane.mjs <job.json>`. It prints a report path and
progress. Use the product's nonblocking command/session polling so the user sees
updates during longer runs. Nonzero exit blocks dependent stages. Output JSON and
event logs remain in the state directory; do not manually relay findings to users
as instructions for the next stage.

Default: run one senior reviewer covering all nine analytical passes. Add a
specialist only for a concrete high-risk domain or an explicit exhaustive request;
do not launch all four merely because the change touches code and tests. After
failed validation, include gate for the failure domain and avoid duplicating its
deep investigation in other lanes. Explain specialist scope in one sentence.
Independent jobs may run in parallel. Keep conclusions independent; the runner
continues partial review lanes up to three attempts, preserving their assigned
coverage. Routine continuation needs no user approval.

Only proceed after every required job returns a validated COMPLETE report with the
right SHAs and assigned passes. The runner checks these requirements in code. A
model's completeness claim still requires the parent to inspect the coverage note.
Do not rerun a failed job to reset its retry counter. Treat exhausted jobs as blocked.

## Triage, repair and completion

Read references/repair-batches.md completely. It defines parent triage, coherent
1–5 finding batches, separate implementation/verification states, source-bound
targeted checks, independent batch review, provisional checkpoints and final
acceptance. It replaces the former full-gate-per-finding loop.

A delivered repair with DEFERRED verification is normal: the parent validates it
and continues automatically. A legacy PARTIAL report requires inspecting what
remains; a known host-permission limitation resolved by parent verification is
not a reason to stop. Never rerun the write worker just to change its status.

## User-facing output

JSON is internal. Show readable findings before repairs and concise progress
after batches. Use repair-state.mjs status for actual implementation, verification,
independent-review and acceptance counts. Link progress.md plus evidence, not a
raw JSON dump as the report. Final output states fixed and remaining issues,
configured checks, gaps, reviewed SHAs and whether changes remain uncommitted.

## Engineering guidance

Read architecture, contracts, callers and tests before changing code. Prefer existing
patterns and the smallest complete change. No unrelated refactor or dependency
upgrade. For every behavioral repair, demonstrate a regression test would fail
without it, or explain why reproduction is impractical. Never weaken tests, types,
lint, validation, coverage or security controls. Reviewers diagnose and triagers
verify; the repair worker alone implements the supplied finding.
