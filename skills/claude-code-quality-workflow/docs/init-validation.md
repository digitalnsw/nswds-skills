# Repository initialization validation — 2026-09-11

Implemented `/quality-init` and automatic initialization in the full workflow,
prepare-review and full validation entry points. The model inspects real gate
definitions; the helper discovers inputs, validates a proposed plan, saves it
atomically in Git-local metadata and enforces freshness. It is not a YAML-to-shell
compiler and does not claim to prove arbitrary commands safe.

Executed integration tests cover nested package manifests without a root test,
read-only discovery, idempotent save, clean worktree after setup, Claude/Codex
sharing, actual validation execution, stdin isolation between gates, evidence
configuration and CI-only warnings, stale CI rejection/refresh, invalid and empty
plans, obvious mutating-command rejection, tampered commands, explicit config
preservation (including empty configs), failing-gate propagation, paths with spaces
and linked worktrees. Full Claude package checks and Codex runner regression tests
also pass. Codex worker tests use fixtures, not live paid model calls.

The real nswds-devops repository was initialized with eight local gates and explicit
CI/environment exclusions. Initialization did not change its worktree status.
An actual validation run passed the whitespace, conflict marker, literal override
and shell-lint checks, then failed at actionlint. The installed actionlint 1.7.12
reported app-id/client-id errors for actions/create-github-app-token@v3; CI pins
1.7.7, and exact version parity is explicitly not certified. The remaining commit
type consistency and package-test commands did not run in that failed invocation.
No source fixes, rule suppression or tool installs were attempted.

This verifies the deterministic setup/validation plumbing. It does not certify a
complete live Claude/Codex model-driven review, the repository's current CI status,
or exact equivalence with hosted branch-protection gates.
