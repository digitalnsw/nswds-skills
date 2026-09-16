---
name: codex-quality-workflow
description: Run the Codex quality workflow with prepared repository evidence, independent read-only reviews, triage, and targeted repairs. Use for a requested full review-and-repair workflow; review-only mode never authorizes repair.
---

# Codex quality workflow

Run in the main Codex conversation; do not fork this orchestrator into another
agent. Resolve all relative paths below from the directory containing this skill.
Read `references/orchestration.md` completely before acting. It explicitly
authorizes independent worker sessions for this workflow only.

Modes from the user's request:

- Default/full: prepare, review, triage, repair confirmed actionable findings,
  validate each repair, and independently review the final accepted state.
- Review-only: prepare and independently review; report findings without repairs.
- Prepare: freeze and assemble evidence only.
- Freeze: run `scripts/freeze.sh` with the optional destination branch only.
- Init: read `references/init-protocol.md` and initialize repository validation
  with ENGINE=codex, then stop. With `init refresh`, refresh the generated plan.
- Validate: initialize and perform dependency preflight, then run `scripts/verify.sh full`.

Full, review-only, prepare and validate modes automatically initialize before
validation. Read `references/init-protocol.md` completely for that stage. Setup
writes local Git metadata only; missing configuration is not a reason to ask the
user to hand-write a command list. Freeze-only does not run initialization.

Before validation, read `references/dependency-preflight.md` and follow it. A
missing installed dependency is an environment prerequisite, not automatically a
code failure: the parent may perform one locked restore with required host
permissions, verify source is unchanged, and continue. Never upgrade dependencies
or enable arbitrary install scripts as part of this recovery.

Optional base argument is a branch name. Omit it to auto-detect. An initial clean
committed implementation is required. Never commit, stash, or discard user work to
satisfy that requirement. Once frozen, retain the exact SHA throughout review.

Use `scripts/run-lane.mjs` for independent reviewers and repair workers. It uses
the installed Codex CLI with existing authentication and the selected model.
Pass the user's selected model identifier when known; otherwise explicitly report
that workers use the CLI-configured model, which may differ from the desktop
selection. Do not silently select a different model to recover an error.

For failed validation, read `references/gate-failure.md`: diagnose, attempt one
safe build-output recovery if applicable, then continue initial read-only review
when evidence is reviewable. In full mode confirmed gate defects enter normal
triage and targeted repair. Failed gates block approval, not investigation.

Report evidence and outcomes plainly. Routine partial review recovery is automatic.
Incomplete lanes block triage and a passed result. Stop for product decisions,
unsafe evidence, unresolved external prerequisites, rejected repairs, unavailable
CLI/authentication, or retry exhaustion.
