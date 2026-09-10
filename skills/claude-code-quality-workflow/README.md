# Claude Code quality workflow

A globally installable, evidence-driven pipeline for high-confidence code changes without the unstable
“review → auto-fix → review the fix forever” loop.

The central invariant is simple:

> Reviewers define evidence-backed problems and cannot edit. A separate repair
> agent changes code, one confirmed finding class at a time.

Version 2 adds the missing orchestration layer: repository-wide context,
deterministic validation and analyzer evidence, immutable review snapshots, and
automatic handoff between independent agents.

## Install globally

Extract the ZIP, enter the folder, and run:

```sh
./install.sh --dry-run
./install.sh
```

The installer makes the workflow available in every Claude Code repository. It:

- installs agents to `~/.claude/agents/`;
- installs commands/skills to `~/.claude/skills/`;
- installs shared scripts and schemas to `~/.claude/quality-workflow/`;
- adds an idempotent import block to `~/.claude/CLAUDE.md`;
- merges hooks into `~/.claude/settings.json` without replacing other settings;
- backs up changed collisions under
  `~/.claude/quality-workflow-backups/<timestamp>/`.

Re-running the installer upgrades the same files and does not duplicate imports
or hooks. `CLAUDE_CONFIG_DIR=/custom/path ./install.sh` changes the config root.
For safe testing, use `./install.sh --target /tmp/test-claude-config`.

Requirements:

- Git
- Claude Code 2.1.218 or newer (2.1.267+ recommended)
- POSIX shell on macOS/Linux/WSL
- Node.js 18+ for the merge-safe installer and findings validator
- The tools used by your project's validation commands

Restart Claude Code if this is the first time the global `agents` directory has
been created. Then run `/doctor`.

You can validate the extracted package before installation with:

```sh
./scripts/self-test.sh
```

## Optional project installation

For team-shared configuration, copy `CLAUDE.md` and `.claude/` into a repository
root. Merge existing files rather than overwriting them. The same skills resolve
their scripts correctly at project or global scope.

Make scripts executable if an archive or copy tool discarded modes:

```sh
chmod +x .claude/quality-workflow/scripts/*.sh
```

With Claude Code installed, the self-test also validates the bundled plugin
manifest, skills, and agent definitions.

## Configure deterministic validation

No per-repository setup is required: the verifier safely auto-detects common
JavaScript, Python, Go, and Rust checks.

For an authoritative repository gate, copy `validation.commands.example` into
the repository as `.claude/quality-workflow/validation.commands`. For a shared
fallback used by every repository, create
`~/.claude/quality-workflow/validation.commands`. Put one non-mutating command on
each line, fastest first. Project configuration wins over global configuration.
Explicit project configuration is preferred for important repositories because
only the repository can define its authoritative gates.

This distinction is deliberate: auto-detection is a useful baseline, but it is
not allowed to call itself the repository's full merge gate. `/prepare-review`
records a warning until `validation.commands` explicitly defines that gate, and
the complete `/quality-workflow` stops rather than claiming merge readiness.

## Configure deterministic analysis

`/prepare-review` automatically captures changed-file ESLint output when a local
ESLint binary exists and Ruff output for changed Python files when Ruff is
available. Add project-specific analyzers by copying `analysis.commands.example`
to `.claude/quality-workflow/analysis.commands`.

Each tab-separated line declares `required` or `advisory`, a name, and a command.
Commands receive the evidence directory, base/head SHAs, and diff path as
environment variables. This is where to connect CodeQL, Semgrep, Sonar, custom
architecture checks, or an existing security script. A failing required analyzer
blocks review preparation; advisory output becomes evidence that reviewers must
independently verify.

The included hooks:

- run a lightweight syntax check after `Edit` or `Write`;
- run the full configured gate before Claude stops when tracked or untracked
  project changes exist;
- block the stop once on failure and feed the failure back to Claude.

Full validation is serialized per repository. If a run is already active, the
stop hook waits rather than starting a competing suite, then reuses the result
only when the repository and validation configuration fingerprints are unchanged.
Results expire after ten minutes by default. Stale locks are recovered safely.

Set `QUALITY_SKIP_STOP_VERIFY=1` for a session when you deliberately need to stop
without the full gate. This is an escape hatch, not a normal workflow.

## Daily workflow: one command

Implement the change and commit the intended implementation checkpoint. Then run:

```text
/quality-workflow
```

That command automatically:

1. detects and freezes the destination base branch;
2. runs `/prepare-review` to assemble the diff, expanded context, repository tree,
   instructions, tests, callers/consumers, PR metadata, full validation, and
   analyzer output;
3. sends that evidence to a fresh read-only reviewer;
4. sends the complete structured report to a separate read-only triager;
5. sends each confirmed blocking/should-fix defect to a fresh repair agent, one
   at a time;
6. validates and independently reviews only that repair's hidden snapshot before
   accepting it;
7. prepares the complete accepted state and runs one fresh final review when
   repairs occurred.

If a reviewer reaches its tool-turn limit, the orchestrator automatically continues
the lane. It resumes the same context when that runtime feature exists; otherwise
it starts a fresh, tightly scoped continuation reviewer from the prepared evidence.
It allows two continuations per lane and never asks you to approve routine
continuation. Truncated or explicitly partial reports cannot enter triage and
cannot produce a clean or merge-ready result. Only repeated exhaustion stops the
pipeline as an incomplete review.

You do not copy and paste findings between commands. The workflow stops only when
it needs a real product decision, finds a stale or unsafe state, encounters a
failed gate, or rejects a repair. Repairs remain uncommitted for your inspection;
the workflow never commits or pushes.

Usually the base is detected automatically. In repositories that merge to a
nonstandard branch, use `/quality-workflow develop`. This is a branch name—not a
commit SHA—and means “the branch this work will merge into.”

The component commands (`/freeze-review`, `/prepare-review`, `/quality-review`,
`/triage-findings`, `/repair-review-finding`, `/repair-diff-review`, and
`/final-review`) remain available for debugging or deliberately manual control.
`/quality-review` and `/final-review` prepare their own evidence, so even manual
review no longer requires hand-feeding context.

## Review depth

`/quality-workflow` always uses the senior reviewer and automatically routes the
prepared evidence to relevant independent specialists. A high-risk or explicitly
exhaustive review uses all three:

- `contract-reviewer`: claimed behavior, consumers, compatibility, release contract
- `behavior-reviewer`: input domains, unmasked behavior, generated output
- `gate-reviewer`: test strength, CI guard coverage, build/cache/publish plumbing

The orchestrator unions their findings, deduplicates only identical defects, and
triages the union without asking you to relay anything. Parallel review raises
recall but also raises false-positive volume, so every finding must still pass the
evidence gate.

## Finding handoff

Reviewer output conforms to
`.claude/quality-workflow/schemas/review-findings.schema.json`. A repair needs the
entire confirmed finding—not just its ID—because the repair agent starts with a
fresh context; the orchestrator supplies it directly. See
`.claude/quality-workflow/examples/findings.example.json`.

Validate a saved report without third-party dependencies:

```sh
node ~/.claude/quality-workflow/scripts/validate-findings.mjs review-findings.json
```

The required fields deliberately describe the defect and required outcome, not a
prescribed implementation. This prevents the reviewer from becoming the fixer.

## Safety properties

- Reviewer, triage, repair-diff, and final-review agents run in `plan` permission
  mode and explicitly disallow edit/write tools.
- Review skills run in forked contexts, independent of the implementation chat.
- Repair is the only workflow agent with edit tools.
- Freeze records a stable implementation checkpoint; review never targets a
  moving branch implicitly.
- Prepared evidence is stored below `.git/claude-quality-workflow`, so generated
  reports never pollute commits.
- Accepted repairs are represented by hidden Git snapshots. They include tracked
  and untracked repair files without staging them in the user's real index.
- No skill contains an auto-fix or convergence loop.
- Reviewer lanes have machine-checkable `COMPLETE`/`PARTIAL` status and bounded
  automatic resumption; incomplete lanes block triage and merge readiness.
- A failed deterministic gate is not “fixed” by weakening tests, types, lint,
  validation, coverage, or security checks.

## Adaptation notes

The template is intentionally stack-neutral. Customize `CLAUDE.md`, validation
commands, and severity policy for the repository. Do not casually weaken the
role boundary or make the review command write-enabled; that boundary is the
main quality control.

See [docs/architecture.md](docs/architecture.md) for the rationale and
[docs/operations.md](docs/operations.md) for failure handling and edge cases, and
[docs/validation-report.md](docs/validation-report.md) for the completed checks.
