# nswds-skills

A collection of agent skills for product development workflows, maintained by Digital NSW. It contains two kinds of entry:

- **Skills** — self-contained instruction sets an AI coding agent (Claude Code, Cursor, Copilot, and others) loads when its trigger conditions match.
- **Workflow packages** — agent-specific tools with their own installers.

## Install

### Skills

Install all skills:

```bash
npx skills add digitalnsw/nswds-skills
```

Install a single skill:

```bash
npx skills add digitalnsw/nswds-skills --skill dependency-update-review
```

### Workflow packages

| Package | Agent | What it does |
| --- | --- | --- |
| [claude-code-quality-workflow](skills/claude-code-quality-workflow/README.md) | Claude Code | Installs three global commands. `/quality-review` reviews the whole branch against an automatically detected base and returns a Markdown report of concrete defects with a coverage table, without editing anything. `/fix-review` repairs only the findings you select. `/final-review` confirms from the code whether they are resolved and looks for regressions. One reviewer, one turn per command, no saved state and no per-repository setup. |

The package needs Git, Node.js 18 or later and Claude Code 2.1.218 or later. Its README covers installation, use, the model it runs on and its limits.

## Layout

Skills follow the standard directory layout:

```
skills/<name>/SKILL.md        # the skill definition (YAML frontmatter + instructions)
skills/<name>/references/     # supporting reference documents, where present
```

Workflow packages are self-contained directories:

```
skills/<package>/README.md    # requirements, configuration and usage
skills/<package>/install.sh   # installer (supports --dry-run, --uninstall and --target)
skills/<package>/scripts/     # installer implementation
skills/<package>/test/        # automated tests
```

The package's commands and their small deterministic helpers sit under `.claude/skills/` inside the package directory.

## Contributing

Skills in this collection are deliberately tool-agnostic and org-agnostic: they must not reference specific repositories, organisations, or machines. Supporting material lives in the skill's `references/` directory and is linked from the SKILL.md.

Workflow packages target one agent by design, but are held to the same org-agnostic rule. Each carries its own README, installer and tests.

The Australian Style Manual skill includes [opt-in behavioural evaluations](skills/australian-style-manual/evals/README.md) for assessment-only and editing requests, with checks for protected content and unintended file changes.
