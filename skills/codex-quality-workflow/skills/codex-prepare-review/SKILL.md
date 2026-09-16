---
name: codex-prepare-review
description: Prepare immutable repository context, validation results and static-analysis evidence in Codex without reviewing or repairing code.
---

Resolve the sibling `../codex-quality-workflow` skill directory. Read its
`references/init-protocol.md` and initialize validation with ENGINE=codex first;
only Git-local metadata may be written during init. Then read the sibling's
`references/dependency-preflight.md` and complete environment preparation (including
one locked dependency restore if needed, with host approval). Run its
`scripts/freeze.sh` with the optional destination branch, then its
`scripts/prepare-review.sh initial` from the repository root. For a specifically
requested final preparation use `prepare-review.sh final` without refreezing.
On failed validation follow the sibling's `references/gate-failure.md` for bounded
environment recovery only. Report both reviewable and ready, manifest path,
validation scope, analyzers and warnings. Failed gates are not a passed result,
but reviewable evidence can support later initial review. Do not edit code or
commit to make preparation succeed. Configured gates
are read from `.codex/quality-workflow` first, then existing `.claude/quality-workflow`.
