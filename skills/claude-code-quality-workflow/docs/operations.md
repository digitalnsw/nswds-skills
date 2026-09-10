# Operations and failure handling

## Freeze fails

Freeze requires a Git repository, a resolvable base, and a completely clean work
tree including untracked files. Review the diff, commit the intended implementation,
and remove or intentionally ignore unrelated generated files before retrying.
Freeze never commits for you.

The base is a branch, not a commit: it is the destination branch the feature will
merge into. `/freeze-review` first uses the remote's default branch, then `main`
or `master`. Usually no argument is needed. In repositories using `develop`,
`trunk`, or a release branch, run `/freeze-review develop` (or the appropriate
branch). Raw commit SHAs and tags are rejected because they hide this intent.

The recorded state lives in `.git/claude-quality-workflow/freeze.env`, so it does
not pollute the project or travel to another clone. Re-run freeze in each clone.

`/quality-workflow` runs freeze itself. The separate `/freeze-review` command is
only needed when operating individual stages manually.

## Preparation reports `READY=0`

Open the evidence directory printed by `/prepare-review`. `validation.log` contains
the full deterministic gate, `analyzers/` contains static-analysis output, and
`manifest.json` identifies the exact base/head plus warnings. A failed validation,
failed required analyzer, or command that mutated the reviewed state blocks review.

A warning that validation is `generic-auto-detected` means the repository has not
declared its real merge gate. Add `.claude/quality-workflow/validation.commands`.
Do not treat a hand-run suite from an earlier state as equivalent evidence.

## A reviewer cannot run a useful command

Read-only agents use plan permission mode. If a diagnostic command would mutate
state (a test that rewrites snapshots, a build that generates files), do not grant
the reviewer write access. Run the command before freeze, capture its result, and
provide that evidence to review, or add a non-mutating variant to the repository.

## A reviewer reaches its turn limit

This is routine capacity exhaustion, not a product decision. The orchestrator
rejects the output as final. When the runtime provides same-agent messaging it
resumes that agent; standard sessions may not provide it, so the normal fallback
is a fresh agent of the same specialist type, automatically scoped to the remaining
domain and supplied with the prepared evidence. A valid partial report names
unfinished scope and a precise continuation cursor. A truncated or malformed
report is also partial by definition, and progress narration is never salvaged as
a finding.

Each lane receives two automatic resumptions after its initial segment. Triage
waits for every required lane to return `completion.status=COMPLETE`. If a lane is
still incomplete after three total segments, the workflow stops as
`BLOCKED_INCOMPLETE_REVIEW`; it cannot claim clean or merge ready.

Reviewers reserve roughly the final quarter of their turn allowance for synthesis.
This makes a valid `PARTIAL` checkpoint much more likely than a transcript containing
only exploration. Same-context resume is an optimization, not a prerequisite.

## A finding lacks evidence

Triage it as `REJECTED` when the claimed behavior is false or out of scope.
Use `NEEDS_DECISION` when both behaviors are defensible or repository evidence
does not establish intent. Do not repair either status.

## Reproduction is impractical

Configuration, documentation, CI, race, and environment defects may not admit a
cheap failing unit test. The repair agent must state why, preserve concrete static
or runtime evidence, make the smallest change, and run the strongest available
checks. “It seems right” is not evidence.

## A repair introduces another problem

The orchestrator stops. It does not send the new problem to the repairer. The last
accepted hidden snapshot remains recorded, while the rejected candidate remains in
the working tree for inspection. Deliberately restore or revise that one repair,
then rerun the pipeline. If it depends on unresolved intent, classify it as
`NEEDS_DECISION`.

Hidden snapshots use temporary Git indexes and `git commit-tree`; they do not stage
files, create branch commits, switch branches, or push. They live only in the local
Git object database and may eventually be pruned by normal Git maintenance.

## The stop hook is too expensive

Put fast, authoritative commands in `validation.commands`; move very slow end-to-end
or external-environment checks to CI and document them in `CLAUDE.md`. Temporarily
set `QUALITY_SKIP_STOP_VERIFY=1` only when an intentional intermediate stop is
more important than enforcing the gate. Always run `/validate-change full` before
freeze and final review.

## Validation is already running

`verify.sh full` owns an atomic lock under `.git/claude-quality-workflow/`. A
second explicit full run exits without competing. The stop hook waits up to 60
seconds for the active run and reuses its result only when both the repository
state and selected validation configuration have the same fingerprints. Change
`QUALITY_VALIDATION_WAIT_SECONDS` to adjust the wait and
`QUALITY_VALIDATION_CACHE_SECONDS` to adjust the default ten-minute result window.
Dead, abandoned, or hour-old locks are moved aside and recovered.

## Analyzer configuration

Use project-local `analysis.commands` when an analyzer depends on repository
configuration. Mark a command `required` when inability to run it must block review;
mark it `advisory` when its findings should be captured but tool failure should not
hide the rest of the review. An analyzer success status means the command completed,
not that every emitted result is a confirmed defect.

## Existing project configuration

Merge this template's settings with existing `.claude/settings.json`; JSON cannot
contain duplicate `hooks` keys. Preserve existing project rules in `CLAUDE.md` and
resolve contradictions explicitly. Repository-specific instructions take priority
over generic examples, but not over the reviewer/repair role boundary.

## Global installation and upgrades

Run `./install.sh --dry-run` before installation or upgrade. Existing files that
would change are copied to `~/.claude/quality-workflow-backups/<timestamp>/` before
replacement. The installer parses `settings.json` before writing anything and
stops if it is not valid JSON.

Global rules are included through one marked import block in
`~/.claude/CLAUDE.md`, so existing personal instructions remain intact. Hooks are
deduplicated by workflow script path. The installation manifest is written to
`~/.claude/quality-workflow/install-manifest.json`.
