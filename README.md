# nswds-skills

Agent skills for developers building NSW Government digital services, maintained by Digital NSW.

A skill is a set of instructions that your AI coding agent loads when a task matches it. Install these and your agent will check content against the Australian Government Style Manual, audit pages against WCAG, review dependency updates properly and more, without you writing the prompt each time. They work with Claude Code, Cursor, GitHub Copilot and other agents that support skills.

## Get started

Run this in the root of your project:

```bash
npx skills add digitalnsw/nswds-skills
```

Then ask your agent to do the work. It picks the right skill for you:

> Audit the apply journey on http://localhost:3000 against WCAG 2.2 AA.

> Check the content in `src/pages/` against the Australian Government Style Manual.

> Is Renovate PR 214 safe to merge?

To install one skill only:

```bash
npx skills add digitalnsw/nswds-skills --skill wcag-technical-audit
```

## Skills

### Content and accessibility

For anything the public reads or uses.

| Skill | What it does | Try asking |
| --- | --- | --- |
| [australian-style-manual](skills/australian-style-manual/SKILL.md) | Assesses every piece of content in scope against the [Australian Government Style Manual](https://www.stylemanual.gov.au/) and fixes what needs fixing. Covers page copy, interface text, forms, metadata and accessibility text, and reports what it checked. | "Review the error messages in this form against the Style Manual." |
| [wcag-technical-audit](skills/wcag-technical-audit/SKILL.md) | Audits pages and complete user journeys against WCAG 2.2 AA by default, using automated, keyboard, visual and screen reader testing. Every finding comes with evidence, and a coverage checker lists each success criterion and anything it could not verify. Supports A and AAA targets. | "Do a WCAG 2.2 AA audit of the sign-in and account pages." |

### Pull requests and dependencies

| Skill | What it does | Try asking |
| --- | --- | --- |
| [dependency-update-review](skills/dependency-update-review/SKILL.md) | Reviews Renovate and Dependabot pull requests, manual version bumps and lockfile-only changes as thoroughly as any other pull request. Scales the depth of review to the risk, researches every version in the range and checks the impact against your code. Never commits migration work to a bot's branch. | "Review the dependency update in PR 88." |
| [pr-review-feedback](skills/pr-review-feedback/SKILL.md) | Works through unresolved review comments on your own pull request. Checks each comment against the current branch rather than accepting it, then (with your approval) makes the confirmed fixes, replies to every thread and resolves the ones that no longer apply. | "Go through the unresolved comments on my PR." |

### Security and repository settings

| Skill | What it does | Try asking |
| --- | --- | --- |
| [snyk-security-scan](skills/snyk-security-scan/SKILL.md) | Runs Snyk code, dependency, infrastructure-as-code and container scans through the Snyk MCP connector, then triages the results: scopes them to your change, traces the data flow, fixes root causes and rescans until clean. Includes fixes for common Snyk sign-in problems. | "Scan the new upload handler for security issues." |
| [protect-branch](skills/protect-branch/SKILL.md) | Sets up branch protection on a GitHub repository so nothing merges unless CI passes. Adds a ruleset requiring up-to-date status checks, a CI workflow that fails on conflict markers and broken lockfiles, and a deploy key so release workflows can still push. | "Protect the main branch of this repo." |

### Documentation

| Skill | What it does | Try asking |
| --- | --- | --- |
| [handover-docs](skills/handover-docs/SKILL.md) | Writes project documentation as a reference for the next developer or the client: what exists now, what is broken now and how to run it. Leaves out project history, dated entries and pull request references. | "Turn my notes into handover docs for this project." |

## Share the skills with your team

When you run `npx skills add` inside a project, the skills are copied into the project (for Claude Code, into `.claude/skills/`) and recorded in `skills-lock.json`. Commit both, and everyone who clones the repository gets the same skills.

To install for yourself only, across all your projects, add `-g`:

```bash
npx skills add digitalnsw/nswds-skills -g
```

To get the latest versions of project skills:

```bash
npx skills update -p
```

Skills run with your agent's full permissions. Read a skill before you install it, as you would any other code.

## Claude Code quality review workflow

[claude-code-quality-workflow](skills/claude-code-quality-workflow/README.md) is a separate package for Claude Code only. It adds 3 commands for checking a branch before it merges:

- `/quality-review` reviews the whole branch and reports concrete defects without editing anything
- `/fix-review` repairs only the findings you select
- `/final-review` confirms each finding is resolved and looks for regressions.

It needs Git, Node.js 18 or later and Claude Code 2.1.218 or later. It has its own installer, because `npx skills add` does not run installers. Preview the changes with `--dry-run` first:

```bash
git clone https://github.com/digitalnsw/nswds-skills.git
cd nswds-skills/skills/claude-code-quality-workflow
./install.sh --dry-run
./install.sh
```

Its [README](skills/claude-code-quality-workflow/README.md) covers installation, use, the model it runs on and its limits.

## Feedback

Tell us what worked, what didn't and what skill your team needs next by [opening an issue](https://github.com/digitalnsw/nswds-skills/issues).

## Contributing

Skills must work with any agent and in any organisation. They must not reference specific repositories, organisations or machines. Supporting material goes in the skill's `references/` directory and is linked from its `SKILL.md`.

Workflow packages target one agent by design but follow the same rule. Each has its own README, installer and tests.

The Australian Style Manual skill has [opt-in behavioural evaluations](skills/australian-style-manual/evals/README.md) for assessment-only and editing requests, with checks for protected content and unintended file changes.

### Layout

Skills use the standard directory layout:

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

The package's commands and their deterministic helpers are in `.claude/skills/` inside the package directory.
