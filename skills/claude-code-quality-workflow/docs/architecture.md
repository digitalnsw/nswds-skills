# Architecture

## Why the roles are separated

The original workflow optimized review for high recall and then let the same
reviewer fix its findings and review those fixes. In one recorded run, six of ten
later findings were introduced by the preceding repair round. The system was no
longer converging on the original change; it was manufacturing new review surface.

This package treats evidence preparation, review, triage, and repair as different
control functions coordinated by one read-only orchestrator:

```text
requirements
    ↓
implementation (write-enabled)
    ↓
committed freeze checkpoint
    ↓
/prepare-review orchestrator
    ├── immutable diff + expanded context + repository tree
    ├── instructions + tests + symbol/caller references + PR metadata
    └── deterministic validation + static-analysis artifacts
    ↓
independent review (read-only) → structured, sourced findings
    ↓
triage: CONFIRMED | REJECTED | NEEDS_DECISION
    ↓
targeted repair (one confirmed defect class, write-enabled)
    ↓
full deterministic validation → hidden candidate snapshot
    ↓
repair-diff review of exact accepted→candidate range (read-only)
    ↓
accept snapshot or stop; never repair the repair
    ↓
final evidence preparation + one final whole-branch review (fresh, read-only)
```

The reviewer owns diagnosis. The repairer owns the smallest correct implementation.
Neither owns both.

## Controls

| Risk | Control |
|---|---|
| Reviewer modifies code | Forked agent, `permissionMode: plan`, edit/write tools denied |
| Reviewer prescribes a speculative rewrite | Finding schema requires outcome, not implementation |
| False positive is repaired | Mandatory triage and independent reproduction |
| Repair expands scope | One defect class, explicit prohibitions, repair-only diff review |
| Model forgets validation | Post-edit and stop hooks call deterministic scripts |
| LLM receives a raw diff with weak context | `/prepare-review` builds a versioned evidence manifest and repository context |
| Static-analysis signal is lost | ESLint/Ruff plus configured CodeQL/Semgrep/custom outputs are attached to evidence |
| Generic validation overclaims coverage | Preparation labels it baseline-only and warns until the repo defines its gates |
| Review target moves | Freeze records merge base and implementation SHA in `.git` |
| Several uncommitted repairs blur together | Temporary Git-index snapshots isolate accepted state and each candidate without staging |
| Reviewer hits a turn cap | Completion envelope, automatic same-context resume when available or fresh scoped continuation, two bounded attempts, then a blocked result |
| Endless review/fix loop | No auto-fix; one final fresh whole-branch review |
| Green but ineffective test | Review traverses production behavior to tests and asks what mutation fails |

## Review intelligence preserved

The read-only reviewer retains the strongest analytical passes from the supplied
skill: code versus claims, deliberate input-domain sweeps, behavior unmasked by
deletions, test mutation strength, public consumers, release contracts, guard
coverage, generated-output boundaries, and build/cache/publish plumbing. It also
keeps the rules “name the concrete input,” “sweep every instance,” and
“consolidate instances, never defects.”

Removed behavior: default edits, self-review of self-authored fixes, convergence
rounds, round caps, and any instruction to keep mutating until findings disappear.

## What “Copilot-like” means here

This package reproduces the useful architecture, not GitHub's proprietary model or
private implementation: an orchestrator gathers broad repository evidence,
deterministic tools produce machine evidence, and high-reasoning independent agents
review and triage it. The evidence manifest makes the inputs inspectable instead
of hiding them in one oversized prompt.

The model remains responsible for semantic reasoning that linters cannot perform:
tracing contracts, consumers, boundary behavior, test effectiveness, release
compatibility, and cross-file consequences. Deterministic output is never treated
as automatically true; it is a lead tied to code and contract evidence.
