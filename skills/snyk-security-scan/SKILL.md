---
name: snyk-security-scan
description: 'Run security scans through the Snyk connector (MCP) and triage what they find. Use when the user wants any kind of vulnerability or security scan: of a whole project, of dependencies/lockfiles, of IaC files, of a container image — or of a specific piece of code they just wrote and want checked for security issues before committing (a new handler, endpoint, or feature). Also use to vet a package or library before adopting it — "is X safe / well maintained / okay to depend on?" (snyk_package_health_check) — to interpret or fix findings from a previous Snyk scan, after generating new first-party code (mandatory snyk_code_scan pass), and to diagnose Snyk scan errors ("User not authenticated", untrusted folder). Do not use for general code review or PR review, reviewing dependency-update/Renovate PRs, rotating leaked credentials, or browsing the Snyk web dashboard.'
---

# Snyk Security Scan & Review

Run security scans through the Snyk Security connector and turn the raw findings into a reviewed, actionable result. The goal is never just "the scan ran" — it's a triaged list of real issues, fixed where possible, with a clean rescan proving it.

## 1. Connect and verify

The connector's tools are MCP tools named `mcp__Snyk_Security__snyk_*` (an older duplicate server may appear as `mcp__Snyk__snyk_*` — prefer `Snyk_Security`). They are usually deferred: load everything you'll need in **one** ToolSearch call, e.g.

```
ToolSearch query: "select:mcp__Snyk_Security__snyk_version,mcp__Snyk_Security__snyk_trust,mcp__Snyk_Security__snyk_code_scan,mcp__Snyk_Security__snyk_sca_scan"
```

Then:

1. **Smoke-test** with `snyk_version` — confirms the server process is alive (it does *not* prove auth works).
2. **Trust the folder** with `snyk_trust` on the project's absolute path before its first-ever scan. The tool's description says to run it only when instructed — this skill is that instruction. It's one-time per folder and idempotent; skip it if the folder has been scanned before, and fall back to it when a scan errors about an untrusted folder.
3. Do **not** run `snyk_auth`. Auth comes from the PAT stored in the connector's settings, and `snyk_auth`'s "Successfully logged in" is misleading — it can report success while scans still fail. If any scan returns an authentication error (`SNYK-0005`, "User not authenticated"), stop and read [references/connector-troubleshooting.md](references/connector-troubleshooting.md); the cause is almost always the connector's token field, not the account.

If a scan complains about org access, pass your Snyk organisation slug via `org:`; otherwise the token's default org applies.

## 2. Choose the scan

| What's being checked | Tool |
|---|---|
| First-party source code (SAST) — including any newly generated code | `snyk_code_scan` |
| Open-source dependencies / manifests / lockfiles | `snyk_sca_scan` |
| Terraform, Kubernetes YAML, CloudFormation, ARM | `snyk_iac_scan` |
| Container images | `snyk_container_scan` |
| Is this one package safe/healthy to adopt? | `snyk_package_health_check` |
| Will upgrading this dependency break things? | `snyk_breakability_check` |

When the request is broad ("scan this project"), run `snyk_code_scan` and `snyk_sca_scan` together — they answer different questions. Add `snyk_iac_scan` only if the repo contains IaC files.

Every scan takes `path` as an **absolute path** with OS-native separators — relative paths fail. Useful options: `severity_threshold` (`low`/`medium`/`high`/`critical`) to cut noise on large legacy codebases; for SCA, `all_projects: true` on monorepos/workspaces and `dev: true` when devDependencies matter. SCA needs the project's package manager installed and the lockfile in sync — run the install first if the lockfile is stale.

## 3. Review the output

Scans return JSON: `{success, issueCount, issues: [...]}`. Each issue has `id` (rule), `title`, `severity`, `filePath`, `line`, `cwes`, a truncated `message`, and for code scans a `dataflow` array tracing source → sink.

`issueCount: 0` with `success: true` is a clean pass — say so and stop. Otherwise, triage before touching anything:

- **Scope to the change.** When the scan follows new/modified code, separate findings in the code just written from pre-existing findings elsewhere in the repo. Fix the former; report the latter as observations rather than silently expanding the task (offer to fix, or flag as a follow-up task).
- **Read the dataflow, not just the line.** Open the flagged file and walk the source→sink path. Confirm the input is genuinely attacker-controllable and the sink genuinely dangerous in this context. A finding in test fixtures, generated code, or a path guarded upstream may be a non-issue — but say *why* with evidence, never dismiss on vibes.
- **Order by severity**, Critical/High first. For SCA findings also note: direct vs transitive, whether a fixed version exists, and the upgrade path. Use `snyk_breakability_check` before proposing a major-version jump, and remember transitive fixes usually mean bumping the direct parent.
- **CWE is the fix guide.** The `id`/`cwes` tell you the class (CWE-78 command injection → parameterise/allowlist, CWE-79 XSS → encode output, etc.). Fix the root cause at the source or sink; do not suppress or ignore findings unless the user explicitly accepts the risk, and record any accepted risk in the report.

## 4. Fix and rescan

For each confirmed finding in first-party code: apply the fix, then **rescan the same path** and compare. Repeat until the scan is clean of newly introduced issues — a fix can itself introduce a new finding. Match findings across runs by `id` + `filePath` (line numbers shift; `fingerPrint` is stable when lines move).

## 5. Report

End with a short summary the user can act on:

- Scan types run, paths, and issue counts by severity.
- Table of findings: severity, rule/CWE, `file:line`, verdict (fixed / real-but-out-of-scope / false positive with reasoning / accepted risk).
- What was fixed and the rescan result proving it.
- Anything left open and the recommended next step.

## Troubleshooting

Auth errors, scans failing while `snyk_auth` claims success, connector settings, restart requirements, and the always-working `snyk` CLI fallback: [references/connector-troubleshooting.md](references/connector-troubleshooting.md). Read it before retrying a failed scan more than once.
