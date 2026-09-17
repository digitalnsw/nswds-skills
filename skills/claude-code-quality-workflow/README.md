# Claude Code quality review

Three Claude Code commands for reviewing a feature branch before it merges. They install once, globally, and work in any Git repository with no per-repository setup.

| Command | Edits files | What it does |
| --- | --- | --- |
| `/quality-review` | Never | Reviews the whole branch against its base and returns a Markdown report of concrete defects, or `No actionable findings`, with a coverage table. |
| `/fix-review [F1 F3 …]` | Yes | Repairs the findings you select (by default, the clearly actionable ones from the report in the conversation), runs proportionate checks, and reports what changed and what remains. Leaves the changes uncommitted. |
| `/final-review` | Never | Reviews the branch again after repairs: confirms from the code whether each earlier finding is resolved, looks for regressions, and reports. It does not repair what it finds. |

Each command is one model turn by one reviewer. There are no subagents, no background workers, no saved run state, no evidence directories and no fix-and-review loop. Git history and the conversation are the only state.

## Requirements

- Claude Code 2.1.218 or later (skill frontmatter hooks with `once`, `disallowed-tools`)
- Git, and Node.js 18 or later
- Optional: the GitHub CLI (`gh`), signed in. When present, the base branch of the branch's pull request is used as the review base.

## Install

```bash
./install.sh --dry-run
```

```bash
./install.sh
```

The installer writes to `~/.claude/skills/` (or `$CLAUDE_CONFIG_DIR`, or `--target <directory>`). Running it again changes nothing. It records what it installed, with hashes, in `skills/quality-review/.install-manifest.json`.

A file is backed up only when the installer is about to overwrite something it did not write, or something you edited after installation. Backups go to one place, `~/.claude/backups/quality-review/`, and the installer lists each one. An ordinary update creates no backups.

Version 1 of this package installed agents, hooks in `settings.json`, an import in `CLAUDE.md` and a `quality-workflow/` runtime directory. The installer removes exactly those and nothing else.

Remove the commands:

```bash
./install.sh --uninstall
```

Uninstalling removes the files the installer wrote. A file you edited is kept and named in the output.

## Use

On a feature branch, in Claude Code:

```text
/quality-review
```

Read the report. Then, if you want repairs:

```text
/fix-review F1 F3
```

```text
/final-review
```

Run `/fix-review` and `/final-review` in the same conversation as the review, because they read the findings from it.

`/quality-review` and `/final-review` take an optional argument. A branch name overrides the detected base (`/quality-review release/2.4`). Anything else is passed to the reviewer as a focus (`/quality-review concentrate on the parser`).

### How the base is chosen

You are never asked for a branch or a commit. The base is the first of these that resolves:

1. a branch named in the command;
2. the base branch of the current branch's pull request (from `gh`);
3. the remote's default branch (`origin/HEAD`, then `upstream/HEAD`);
4. whichever of `main`, `master`, `trunk`, `develop` has the merge base nearest to `HEAD`.

The report states the base, the merge base and the reason. When candidates disagree, it states the assumption. The review covers every commit since the merge base, plus uncommitted and untracked changes. The review stops without a report only when the repository has none of these branches.

### What the review covers

The command starts by building a change-surface inventory from the diff: production files, configuration and CI, tests, documentation, and generated files. Skill, agent and prompt files count as production. The reviewer reads every changed production file in full, then the callers, consumers, tests and configuration needed to judge the consequences.

The report's Coverage table lists every changed production file as assessed or as a named gap, along with any other modified file that lost 20 or more lines, because unintended removals hide in documentation, tests and CI. A finding is reported only with a location, a trigger, a consequence, a fix direction, a severity and a confidence.

### Checks

The review uses the commands the repository already defines: `package.json` scripts, Makefile targets, and the `run:` steps of pull-request workflows. It runs the cheap ones (lint, type check, unit tests) and leaves browser, end-to-end and build suites alone unless the change concerns them.

- It never installs dependencies or changes configuration.
- A check that fails or cannot run is recorded as evidence or as a gap. The code review carries on.
- When a port is in use, it picks a free one with `scripts/free-port.mjs` instead of stopping.
- The report says which CI jobs were not reproduced locally. A local pass is not a claim about hosted CI.

### How the commands are kept honest

- **Read-only.** `/quality-review` and `/final-review` remove the `Edit`, `Write`, `NotebookEdit`, `Agent` and `AskUserQuestion` tools for their turn. The report records a worktree fingerprint from the start and the end of the review.
- **Completion.** A `Stop` hook runs `scripts/report-lint.mjs` on the final answer. If the answer is JSON, an apology, a status update or a promise, or lacks an outcome, a coverage section, a field in a finding, or a changed production file, the hook sends it back once with the reasons. The hook removes itself after the report passes, and never blocks twice in a row.

## Model and cost

`/quality-review` and `/final-review` set `model: sonnet` and `effort: medium` for their own turn, whatever model the session uses. `/fix-review` uses the session's model.

Sonnet is the default because the work is mostly reading and tracing with a fixed method, and one Sonnet turn per review keeps a daily habit affordable. Use a larger model when a missed defect would be expensive: authentication and authorisation, concurrency, migrations and data formats, money, or a branch of several thousand changed lines.

```bash
./install.sh --model opus
```

That rewrites the `model:` line of the two review commands at install time. Run `./install.sh` without the flag to go back to Sonnet.

Because the commands pin their own model, changing the session model does not change the reviewer. To make the commands follow whatever model the session uses, install with `--model inherit`.

## Limits

- The hook and the tool restrictions need Claude Code's skill frontmatter support. On an older Claude Code the commands still run, without those two guarantees.
- The completion check verifies the report's form and coverage, not the truth of a finding. Treat findings as a reviewer's claims.
- If you interrupt a review, its completion hook is still registered and checks the next answer in that session once.
- `/quality-review` can run commands through Bash. It is told not to write, and the fingerprint shows whether anything changed, but Bash itself is not sandboxed by these commands.
- The file classification is by path. The reviewer is told to reclassify, and the completion check uses the path rules.

## Develop

```bash
node --test "test/*.test.mjs"
```

These tests need no model. They cover base selection, the surface inventory, check discovery, the free-port helper, the report check (including the Stop-hook protocol) and the installer.

```bash
node test/live/run-live.mjs
```

The live tests run the installed commands through `claude -p` against fixture repositories and use model quota. They cover a branch with real defects and a failing check, a clean branch, a single selected repair, and the final review. Reports are written to a temporary directory that the run prints.

## Layout

```text
.claude/skills/quality-review/SKILL.md          the review command
.claude/skills/quality-review/review-guide.md   method, finding bar and report format (shared with final-review)
.claude/skills/quality-review/scripts/          review-scope.mjs, report-lint.mjs, free-port.mjs
.claude/skills/fix-review/SKILL.md              the repair command
.claude/skills/final-review/SKILL.md            the post-repair review command
scripts/install.mjs                             installer and uninstaller
test/                                           deterministic tests; test/live/ uses the model
```
