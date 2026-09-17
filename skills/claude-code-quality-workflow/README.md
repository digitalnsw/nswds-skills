# Claude Code quality review

A small, stateless review toolkit for Claude Code. It installs three explicit commands:

- `/quality-review [base branch]` reviews the current branch and working tree without editing it.
- `/fix-review [finding IDs or description]` repairs only selected findings, runs targeted checks, and independently reviews the repair diff once.
- `/final-review [base branch]` runs the repository's real merge gates once and performs one final read-only review.

The reviewer automatically detects the repository's default branch. Pass a branch name only when you want a different comparison. Reports are Markdown written to the conversation, not JSON files.

There is no freeze step, persistent run state, background lane, convergence loop, repository setup, hook, or global `CLAUDE.md` import.

## Install

```bash
./install.sh --dry-run
./install.sh
```

Use `--target <directory>` to test against another Claude configuration directory. Updating from the former workflow removes its managed agents, skills, hooks, import marker, and runtime directory. The installer does not create backups.

## Normal use

```text
/quality-review
```

Read the report, then either leave the branch unchanged or approve selected findings:

```text
/fix-review F-001 F-003
/final-review
```

Repairs are left uncommitted. The commands never push or resolve pull-request comments unless separately asked.
