---
name: codex-prepare-review
description: Prepare immutable repository context, validation results and static-analysis evidence in Codex without reviewing or repairing code.
---

Resolve the sibling `../codex-quality-workflow` skill directory. Read its
`references/init-protocol.md` and initialize validation with ENGINE=codex first;
only Git-local metadata may be written. Run its
`scripts/freeze.sh` with the optional destination branch, then its
`scripts/prepare-review.sh initial` from the repository root. For a specifically
requested final preparation use `prepare-review.sh final` without refreezing.
Report the manifest path, validation scope, analyzers and warnings. Stop if ready
is false. Do not edit code or commit to make preparation succeed. Configured gates
are read from `.codex/quality-workflow` first, then existing `.claude/quality-workflow`.
