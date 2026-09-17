# nswds-skills

A collection of agent skills for product development workflows, maintained by Digital NSW. It contains two kinds of entry:

- **Skills** — self-contained instruction sets an AI coding agent (Claude Code, Cursor, Copilot, and others) loads when its trigger conditions match.
- **Workflow packages** — tools built for one specific agent, with their own installer.

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

Install a workflow package with its own installer, not `npx skills add`, which does not run installers. Preview the changes with `--dry-run` first:

```bash
git clone https://github.com/digitalnsw/nswds-skills.git
cd nswds-skills/skills/claude-code-quality-workflow
./install.sh --dry-run
./install.sh
```

## Skills

| Skill | What it does |
| --- | --- |
| [wcag-technical-audit](skills/wcag-technical-audit/SKILL.md) | Audits web experiences against WCAG 2.2 AA by default, with automated, keyboard, visual and screen-reader testing, complete journey coverage, evidence-backed findings and a criterion-level coverage checker. Supports A and AAA targets and explicitly reports unverified checks. |
| [australian-style-manual](skills/australian-style-manual/SKILL.md) | Assesses every content item in the requested scope against the Australian Government Style Manual and applies necessary corrections. Covers prose, interface text, forms, metadata and accessibility text, with official source guidance and explicit coverage reporting. |
| [dependency-update-review](skills/dependency-update-review/SKILL.md) | Full pull-request-depth review of dependency updates (Renovate/Dependabot bumps, manual version changes, lockfile-only updates). Scales review depth to risk, researches every version in the range, verifies impact against the actual codebase, and never commits migration work to a bot-owned branch. |
| [pr-review-feedback](skills/pr-review-feedback/SKILL.md) | Works through unresolved review feedback on your own PR. Treats every reviewer comment as a hypothesis, validates each against the current branch, then (after approval) implements confirmed fixes, replies to every thread, and resolves the ones that no longer apply. |
| [handover-docs](skills/handover-docs/SKILL.md) | Writes project documentation as a current-state technical knowledgebase for an incoming developer or client — never a project journal. No dated entries, no PR references, no fixed issues retained as history. |
| [snyk-security-scan](skills/snyk-security-scan/SKILL.md) | Runs security scans through the Snyk MCP connector (SAST, SCA, IaC, container) and triages the findings: scope to the change, walk the dataflow, fix root causes, rescan until clean. Includes connector-auth troubleshooting for the token traps that make scans fail while login claims success. |
| [protect-branch](skills/protect-branch/SKILL.md) | Sets up merge-gating branch protection on a GitHub repo: a ruleset requiring up-to-date CI status checks, a CI workflow that fails fast on conflict markers and broken lockfiles, and a deploy-key bypass for release workflows that push to the protected branch — with the traps (admin bypass, GitHub Actions bypass) documented so they're avoided. |

## Workflow packages

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
