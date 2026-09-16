# Project engineering rules

## Before editing

- Read the relevant architecture, repository instructions, nearby implementation,
  tests, and public contracts before changing code.
- State material assumptions. Ask for a decision when repository evidence does
  not establish the intended behavior.
- Prefer the repository's existing patterns over new abstractions.

## Implementation discipline

- Make the smallest complete change that satisfies the request.
- Do not refactor, rename, reformat, upgrade dependencies, or clean up unrelated
  code while implementing or repairing a finding.
- Do not change public behavior unless the task requires it.
- Trace every changed public symbol, option, schema, environment variable, CLI,
  and generated artifact to its consumers and documentation.
- Add or update a test for each behavioral change where practical. A test must
  fail when the behavior regresses, not merely execute the changed line.
- Never weaken a test, assertion, type, lint rule, validation rule, coverage
  threshold, allowlist, or security control to make a gate pass.
- Treat generated code, lockfiles, snapshots, migrations, and API schemas as
  contracts. Update them only when the requested change requires it.

## Validation

- Run the narrowest relevant check during implementation and the configured full
  gate before declaring the change complete.
- A green gate proves only what that gate actually checks. Inspect its scope,
  skips, allowlists, globs, and failure behavior before citing it as evidence.
- Report commands run, their results, and anything not run.

## Review and repair boundary

- Review agents are read-only. They return evidence-backed findings and never
  modify code, tests, configuration, documentation, or findings files.
- A finding is actionable only when it names a violated contract, concrete
  trigger or state, observed result, expected result, and evidence.
- Triage every finding as `CONFIRMED`, `REJECTED`, or `NEEDS_DECISION` before edits.
- Repair only `CONFIRMED` findings. Group at most five related findings into a
  coherent batch when they share a subsystem, contract or causal dependency.
  Preserve every finding and required outcome; unrelated repairs stay separate.
- For testable behavior, observe a failing reproduction before changing production
  code. If reproduction is impractical, document why and use the strongest
  available deterministic evidence.
- After a batch, the parent runs targeted and affected checks, then an independent
  reviewer checks its exact diff before provisional checkpointing. Run the full
  configured gate at cross-cutting integration checkpoints and final preparation,
  not automatically after every finding. No final acceptance without full gates.
- Browser/sandbox restrictions defer worker verification, not completed source
  work. Parent verification resolves that handoff without another user question.
- Keep JSON internal. Report findings, implemented work, verified checkpoints and
  final acceptance separately in readable Markdown.
- Do not let a reviewer fix its own findings or repeatedly review and mutate its
  own output. One final fresh whole-branch review is permitted after repairs.
- Prefer `/quality-workflow` for the complete pipeline. It prepares repository
  context and deterministic evidence and relays results between agents internally;
  do not ask the user to copy findings between stages.

## Git checkpoints

- Do not create commits, tags, branches, or push unless the user requests it.
- Before review, require a clean committed implementation checkpoint and run the
  global `~/.claude/quality-workflow/scripts/freeze.sh` or project-local equivalent.
- Do not amend or rewrite the frozen implementation commit during review.
- Keep each accepted repair isolated and reviewable. The quality orchestrator may
  use hidden snapshots under `.git/claude-quality-workflow`; these are not branch
  commits and must not modify the user's real index.
