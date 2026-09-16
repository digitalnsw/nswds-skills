# Quality workflow for Codex

Native Codex companion to the Claude Code package. Install once, invoke in any
repository. Requires Node.js 18+, Bash, Git and an installed, authenticated Codex
CLI. Local desktop/CLI workflows are supported; a cloud-only environment without
the CLI is not supported by this runner.

```sh
./install.sh --dry-run
./install.sh
```

Installs two skills under `~/.agents/skills`, without changing Codex config.toml,
global AGENTS.md, model settings or Claude files. Changed installed skill files
are backed up under `~/.agents/quality-workflow-backups`; unchanged files are not.
The dry run makes no changes. For an isolated install use
`./install.sh --target /absolute/test-skills`.

In Codex, after committing your intended implementation:

```text
$codex-quality-workflow
```

Optional: `$codex-quality-workflow review-only`,
`$codex-quality-workflow prepare`, or `$codex-quality-workflow develop` for a
nonstandard destination branch. `$codex-prepare-review` prepares evidence alone.
These are Codex skill mentions, not the Claude slash commands. Restart Codex if
the installed skills do not appear in its picker.

## What runs

The main conversation prepares evidence and coordinates independent Codex CLI
workers. Senior and relevant specialist reviewers run in read-only sandboxes.
The runner saves their reports, verifies completion and snapshot IDs, and retries
partial/malformed output automatically, up to three attempts. Valid earlier findings
travel into the continuation; narration contributes no completed coverage.

The triager must account for every finding. A separate workspace-write worker
repairs one confirmed defect, once. The parent validates, captures the candidate,
and obtains an independent repair review before acceptance. A final fresh review
checks the whole accepted change. Failed or disputed repairs stop the workflow.
Repairs remain uncommitted, and the user's staging area stays under their control.

The analytical content preserves all nine review passes from the Claude package.
CodeQL/Semgrep/custom analyzers can be supplied using analysis.commands; installed
ESLint and Ruff are detected automatically. No analyzer is downloaded implicitly.

## Repository gates and state

Before validation, dependency preflight detects missing npm workspace links and
stale installed packages. The parent can perform one lockfile-preserving restore
with host permissions, without upgrades or automatic lifecycle scripts. It verifies
source/staging state is unchanged, then reruns validation. Installation is never
delegated to reviewers, hidden inside a gate, or repeated as a fix loop. Init-only
does not install. Other managers need an inspected frozen-install procedure.

Initialization is automatic before validation. `$codex-quality-workflow init`
performs setup only; `init refresh` reinspects gate definitions. Codex reads CI,
workspace manifests and called helpers, then saves a plan in Git-local
`quality-workflow-init` metadata. Setup does not dirty source or run reviews.
Changes to CI/manifests or recorded helpers invalidate the generated plan.

Validation lookup: repo `.codex/quality-workflow/validation.commands`, then
existing repo `.claude/quality-workflow/validation.commands`, then the generated
local plan (shared with Claude). Explicit files are preserved. A global default
inside the skill is a baseline fallback only, not repository onboarding. Analysis
configuration still uses repo .codex, repo .claude, then skill-directory precedence.
CI-only checks are recorded as gaps, not passed gates. Missing tools or failing
checks still block approval; safe failed evidence can proceed to initial review
and targeted repair in full mode. Missing configuration alone needs no manual setup.

Evidence, reports, retry counters and hidden snapshots live under the Git path
`codex-quality-workflow`. Use `git rev-parse --git-path codex-quality-workflow` in
linked worktrees instead of assuming `.git` is a directory. Freeze archives prior
state so an old repair snapshot cannot leak into a new run.

Do not run the Claude and Codex pipelines simultaneously in the same checkout.
They share project files but maintain independent workflow state.

## Model and permissions

Workers use an explicit model from their job packet when supplied. Otherwise they
use the CLI's configured model, which can differ from the desktop selection. High
reasoning effort is requested per worker. No new model is pinned by installation.
Review workers run with read-only filesystem access; repairs use workspace-write.
Workers have no permission escalation. If host sandbox policy prevents launching
the CLI or writing Git state, the workflow reports that limitation; it does not
disable sandboxing or approval controls. Remote MCP tools are outside filesystem
sandbox enforcement; worker instructions prohibit external writes.

Claude Stop/PostToolUse hooks are not ported. Required gates run explicitly within
the workflow; this package makes no claim to enforce checks on every Codex stop.

## Verification

```sh
node scripts/self-test.mjs
```

The tests use isolated Git fixtures and fake CLI workers to exercise retries,
incomplete output, snapshot checks, repair isolation and installation. They do not
spend model usage or prove live model review quality. CLI options were checked
against the installed Codex 0.153.4. A live authenticated end-to-end model run was
not performed as part of packaging.

Sources: [Codex skill discovery](https://learn.chatgpt.com/docs/build-skills),
[Codex non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode).
