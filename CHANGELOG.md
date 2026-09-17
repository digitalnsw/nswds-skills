## [2.0.0](https://github.com/digitalnsw/nswds-skills/compare/v1.1.0...v2.0.0) (2026-09-17)

### ⚠ BREAKING CHANGES

* the Codex package (skills/codex-quality-workflow) is removed,
and the quality-reviewer and repair-reviewer agents are no longer installed.

* fix: keep user arguments out of the review scope shell injection

A quote in the argument broke the injected command, and Claude Code aborts a
command whose injection fails. The argument is now plain prompt text, and the
reviewer reruns the scope script when it names a branch. Also runs the
package's deterministic tests in CI.

* fix: make removals and stated intent part of the review scope

The scope now lists the branch's commit subjects as its stated intent, marks
any modified file that lost 20 or more lines, and names the headings,
definitions, tests and CI steps it lost. The completion check requires those
files in Coverage and requires the answer to begin with the report title.
Fixes zero line counts for renamed files, and restores the root README's
Skills table, which an earlier commit on this branch removed by accident.

* feat: warn when the review base has not been fetched recently

A stale remote-tracking base pulls already-merged work into the diff. The
review stays read-only and does not fetch, so the scope reports the age.

* fix: address review feedback on the scope, report check and installer

- Quote package directories taken from the branch in suggested commands,
  and give npm the directory as --prefix so the command stays matchable.
- Run the completion hook in exec form with a JSON-encoded script path,
  so no shell parses the installation path.
- Check rewritten answers again; block a turn at most twice, counted from
  the session transcript, and once when it cannot be read.
- Match Coverage by whole path tokens in table rows, and require deleted
  production files to be accounted for.
- Pre-approve the usual script runners for the review turn so checks run
  without a permission prompt.
- Scope: logical line counts for untracked files, recreated files are no
  longer reported as deleted, a named base with no shared history is
  refused with a reason, packages beyond the cap are named, and quoted
  `on` keys are recognised.
- Installer: refuse before any change when a directory occupies a file
  path, and step past a directory or link at a backup name.

* fix: back up edited files from hashless installs before removing them

Versions 1.0 and 1.1 recorded installed paths without hashes, and every such
file was treated as unmodified, so an edited one was removed or overwritten
with no backup. Both versions copied files verbatim, so the installer now
ships the hashes of everything they released: a matching file is pristine,
anything else is backed up first and listed.

Manifest entries must now name files: `.` and directory-style entries are
refused, and removing a manifest entry never recurses.

* fix: bind the review Stop hook's coverage check to the actual base

The Stop hook regexed **Base:** out of the model's own report and used it
to recompute which changed files must appear in Coverage. A report could
claim a different, still-resolvable ref (an ancestor commit on the same
branch) and the hook would validate coverage against that narrower diff,
letting real changed files skip the mandatory check entirely while the
hook still exited 0.

The hook now reads the operator's actual argument from the prompt that
started the turn, in the transcript: the harness writes that text before
the model runs, so the model can no longer choose what base the coverage
check is measured against.

### Features

* rebuild Claude Code review as three stateless single-turn commands ([#16](https://github.com/digitalnsw/nswds-skills/issues/16)) ([f8313d5](https://github.com/digitalnsw/nswds-skills/commit/f8313d5cd47c4766212713b7a7ed0f2ee04e56bf))

## [1.1.0](https://github.com/digitalnsw/nswds-skills/compare/v1.0.0...v1.1.0) (2026-09-17)

### Features

* replace quality workflows with stateless review tools ([#14](https://github.com/digitalnsw/nswds-skills/issues/14)) ([38e5465](https://github.com/digitalnsw/nswds-skills/commit/38e5465e0d62b793f8f15184fea42cab8b31319a))

## 1.0.0 (2026-09-16)

### Features

* streamline Claude and Codex quality workflows ([#6](https://github.com/digitalnsw/nswds-skills/issues/6)) ([a68729e](https://github.com/digitalnsw/nswds-skills/commit/a68729ea2fdd7cea53b58dfe89432e5f3e21a663))
