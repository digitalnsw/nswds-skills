# Codex quality review

A small, stateless review toolkit for Codex. It installs three skills globally:

- `$codex-quality-review [base branch]` reviews the current branch and working tree without editing it.
- `$codex-fix-review [finding IDs or description]` repairs only selected findings and validates the repair once.
- `$codex-final-review [base branch]` runs the repository's real merge gates once and performs a final review.

The review skill automatically detects the default branch. Pass a branch name only when you want a different comparison. Reports are concise Markdown in the conversation.

There is no persistent run state, frozen commit, separate CLI worker, lane retry, repository initialization, JSON report, or convergence loop. The current Codex task performs the work directly, which avoids paying for several overlapping reviewers.

## Install

```bash
./install.sh --dry-run
./install.sh
```

The default target is `~/.agents/skills`. Use `--target <directory>` for an isolated installation. Updating from the former workflow removes its two old skills and its workflow backup directory. The installer does not create new backups.

## Normal use

```text
$codex-quality-review
```

Then approve only the findings you want changed:

```text
$codex-fix-review F-001 F-003
$codex-final-review
```

Repairs are left uncommitted. Nothing is pushed or resolved remotely unless separately requested.
