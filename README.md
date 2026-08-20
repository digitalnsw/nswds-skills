# nswds-skills

A collection of agent skills for product development workflows, maintained by Digital NSW. Each skill is a self-contained instruction set an AI coding agent (Claude Code, Cursor, Copilot, and others) loads when its trigger conditions match.

## Install

Install all skills:

```bash
npx skills add digitalnsw/nswds-skills
```

Install a single skill:

```bash
npx skills add digitalnsw/nswds-skills --skill dependency-update-review
```

## Skills

| Skill | What it does |
| --- | --- |
| [dependency-update-review](skills/dependency-update-review/SKILL.md) | Full pull-request-depth review of dependency updates (Renovate/Dependabot bumps, manual version changes, lockfile-only updates). Scales review depth to risk, researches every version in the range, verifies impact against the actual codebase, and never commits migration work to a bot-owned branch. |
| [pr-review-feedback](skills/pr-review-feedback/SKILL.md) | Works through unresolved review feedback on your own PR. Treats every reviewer comment as a hypothesis, validates each against the current branch, then (after approval) implements confirmed fixes, replies to every thread, and resolves the ones that no longer apply. |
| [handover-docs](skills/handover-docs/SKILL.md) | Writes project documentation as a current-state technical knowledgebase for an incoming developer or client — never a project journal. No dated entries, no PR references, no fixed issues retained as history. |
| [snyk-security-scan](skills/snyk-security-scan/SKILL.md) | Runs security scans through the Snyk MCP connector (SAST, SCA, IaC, container) and triages the findings: scope to the change, walk the dataflow, fix root causes, rescan until clean. Includes connector-auth troubleshooting for the token traps that make scans fail while login claims success. |
| [protect-branch](skills/protect-branch/SKILL.md) | Sets up merge-gating branch protection on a GitHub repo: a ruleset requiring up-to-date CI status checks, a CI workflow that fails fast on conflict markers and broken lockfiles, and a deploy-key bypass for release workflows that push to the protected branch — with the traps (admin bypass, GitHub Actions bypass) documented so they're avoided. |

## Layout

Skills follow the standard directory layout:

```
skills/<name>/SKILL.md        # the skill definition (YAML frontmatter + instructions)
skills/<name>/references/     # supporting reference documents, where present
```

## Contributing

Skills in this collection are deliberately tool-agnostic and org-agnostic: they must not reference specific repositories, organisations, or machines. Supporting material lives in the skill's `references/` directory and is linked from the SKILL.md.
