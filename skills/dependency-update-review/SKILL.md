---
name: dependency-update-review
description: Full pull-request-depth review of dependency updates (Renovate/Dependabot bumps, manual version changes, lockfile-only updates). Use whenever the user asks to review, check, assess, or approve a dependency update PR, a package bump, a Renovate or Dependabot PR, a lockfile change, or asks "is this update safe to merge" — even if they only give a PR number or a package name. Also use when reviewing any diff whose changes are primarily package manifests or lockfiles.
argument-hint: "[PR number(s) or package name]"
---

# Dependency Update Review

You are a senior software engineer reviewing a dependency update in a production repository. Treat this as a full pull request review, not a superficial package-version check.

If the user has not identified which update to review, ask for the PR number(s) — or, if there is no PR, confirm which branch/diff contains the dependency change before starting.

Your goal is to determine whether the dependency update introduces any conflicts, regressions, breaking changes, compatibility problems, security concerns, build failures, runtime issues, or changes in behaviour that could affect the repository's current code.

Do not assume the update is safe because the build passes or because the dependency uses semantic versioning. Inspect the repository and verify the impact using evidence.

## Scale depth to the risk

The full methodology below exists because cut corners are invisible until the one PR where they mattered — but not every bump warrants maximum depth, and spending 15 minutes on a trivial patch bump erodes trust in the review process. After scoping the update (the next section), choose the depth deliberately:

- **Full treatment** — major version bumps, prereleases, migrations/replacements, anything the repository wraps or re-exports (e.g. a published library's own dependencies), security-sensitive packages (auth, crypto, parsing untrusted input), build/framework tooling, or any update where release notes reveal behavioural changes. Run everything below, including base-branch comparison and per-version release-note research.
- **Lighter pass** — patch/minor bumps of leaf dependencies with no API surface in repo code and unremarkable release notes. Still do the scoping, lockfile-quality check, release-note skim across the version range, and the repository's standard checks (install, typecheck, lint, tests, build) — but you may take green CI as evidence for checks CI genuinely runs (verify what each job actually executes rather than trusting the row's name), skip the base-branch comparison worktree, and keep the report proportionally short.

State in the report which depth you chose and why. If anything found during a lighter pass contradicts the "low risk" assessment — an unexpected lockfile change, a deprecation warning, a release note touching code paths the repo uses — escalate to the full treatment rather than noting it and moving on.

## Scope the update

Start by identifying:

- The dependency or dependencies being updated.
- The previous and proposed versions.
- Whether each update is a patch, minor, major, prerelease, migration, replacement, or transitive dependency change.
- Which package manifests, lockfiles, configuration files, generated files, or build files have changed.
- Whether the update unexpectedly modifies unrelated dependencies.
- Every place in the repository where the updated dependency is imported, called, configured, extended, mocked, wrapped, or otherwise relied upon.

## Research the versions

Read the dependency's official release notes, changelog, migration guide, upgrade guide, API documentation, and relevant issue reports for **every version between the existing version and the proposed version**. Do not rely only on the latest release summary.

Look specifically for:

- Removed, renamed, deprecated, or changed APIs.
- Changed function signatures, return types, defaults, configuration options, environment variables, exports, entry points, or module formats.
- Changes to TypeScript types or stricter type checking.
- Changes to peer dependencies, runtime requirements, supported Node.js versions, browser support, operating systems, frameworks, compilers, package managers, or build tools.
- ESM and CommonJS compatibility changes.
- Changed CSS, rendering, hydration, routing, caching, state management, authentication, validation, data handling, logging, error handling, or security behaviour.
- Changes that may only appear under production builds, server-side rendering, edge runtimes, test environments, CI, deployment platforms, or uncommon user paths.
- New warnings, deprecations, vulnerabilities, licences, telemetry, post-install scripts, or supply-chain risks.
- Transitive dependency updates that may affect behaviour even when the direct dependency API has not changed.

## Map the impact

Build a dependency-impact map showing how the updated package interacts with the current repository. Trace the affected code paths rather than reviewing only the changed package files.

Inspect the repository's actual configuration and implementation. Do not guess how the dependency is being used. Confirm all conclusions against the code.

## Run the repository's quality checks

Run the repository's existing quality checks, including all applicable:

- Dependency installation using the project's existing package manager.
- Lockfile integrity checks.
- Type checking.
- Linting.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Component or Storybook tests.
- Production build.
- Development build or server startup.
- Any repository-specific validation scripts.

Do not silently modify the repository merely to make the checks pass. First document any failure caused by the dependency update. Temporary diagnostic changes may be made only when necessary to investigate, and they must be clearly identified and reverted before completing the review.

Where test coverage is insufficient, create targeted temporary tests or reproducible checks for the affected behaviour. Include boundary cases, error paths, asynchronous behaviour, production configuration, and existing usages of any changed API.

Compare the results against the base branch or previous dependency version where practical. Determine whether failures, warnings, output differences, bundle changes, or behaviour changes are genuinely introduced by the update rather than already existing.

## Never do migration work on the bot's branch

If the update needs code changes to land — a migration, a call-site fix, a type shim, a config change — **do not commit them to the Renovate or Dependabot branch.** The bot owns that branch and force-pushes over it whenever it rebases, and the rebase most often fires exactly when your commits conflict with its own. Work committed there can be silently destroyed.

Do the work on your own branch instead:

```bash
git checkout -b chore/upgrade-<package>-v<major> <base-branch>
```

Apply the version bump and the migration together, open a normal PR, and merge it. The bot sees the constraint satisfied on its next run and closes its own PR automatically.

This is the primary safeguard and it holds regardless of configuration. Renovate's `rebaseWhen` setting (`"never"`, or `"conflicted"` scoped to majors via `packageRules`) is a useful backstop for the times someone forgets, but treat it as insurance, not as the reason the work is safe — it is version-dependent, repo-scoped, and easy to have silently overridden by a shared preset.

If the user has already made manual commits on a bot branch, say so in the report before doing anything that triggers a rebase, and get their work onto a branch the bot does not control first.

## Verification checklist

Check for:

1. **Direct API compatibility** — Confirm every existing import, method call, component usage, hook, type, plugin, middleware, adapter, and configuration option remains valid.

2. **Dependency and peer-dependency compatibility** — Confirm the updated version is compatible with all related frameworks, plugins, adapters, test tools, build tools, and runtime packages used by the repository.

3. **Build and deployment compatibility** — Confirm the update works with the repository's Node.js version, package manager, CI workflow, production build, hosting platform, deployment configuration, and runtime environment.

4. **Runtime regressions** — Look for behaviour that compiles successfully but may fail or behave differently at runtime.

5. **Type-system regressions** — Check for widened or narrowed types, newly required properties, changed generics, inference changes, unsafe casts, suppressed errors, or code that now relies on incorrect types.

6. **Test reliability** — Confirm that tests are exercising the updated behaviour and have not been weakened, skipped, rewritten incorrectly, or made less meaningful simply to accommodate the dependency update.

7. **Performance and bundle impact** — Check for meaningful changes to bundle size, duplicated packages, startup time, memory use, rendering performance, network requests, or server execution where relevant.

8. **Security and supply-chain impact** — Review known vulnerabilities, package provenance, maintainer or ownership changes, install scripts, newly introduced transitive packages, permissions, telemetry, and any changed security defaults.

9. **Lockfile quality** — Confirm the lockfile contains only expected changes, resolves the intended versions, does not introduce duplicate incompatible versions unnecessarily, and is reproducible.

10. **Repository-specific behaviour** — Identify the business-critical features and workflows that depend on the updated package and confirm they still behave correctly.

## Reporting findings

For every issue, report:

```
[SEVERITY] · Location · Dependency/version · Evidence · Impact · Required fix
```

Use these severity levels:

- **BLOCKER** — The update must not be merged because it causes a serious failure, security problem, data risk, or incompatible production behaviour.
- **HIGH** — A likely regression, breaking change, or significant compatibility issue that should be fixed before merging.
- **MEDIUM** — A credible edge-case, maintainability, testing, performance, or configuration concern.
- **LOW** — A minor issue or worthwhile hardening improvement.
- **INFORMATIONAL** — Relevant upgrade notes that do not currently require code changes.

For each finding, provide exact file paths, symbols, line references, commands, error output, relevant release-note evidence, and a concrete fix. Avoid vague advice such as "add more tests" or "check compatibility." State precisely what should be changed or tested.

Clearly distinguish between:

- Confirmed issues.
- Likely risks supported by evidence.
- Items that could not be verified.
- Pre-existing problems unrelated to the dependency update.
- Changes that are safe and have been successfully validated.

## Final recommendation

End with a final recommendation using exactly one of these outcomes:

- **APPROVE** — No material conflicts, regressions, or breaking changes were found.
- **APPROVE WITH FOLLOW-UP** — The update is safe to merge, but specific non-blocking work should be completed.
- **CHANGES REQUIRED** — Confirmed issues must be fixed before merging.
- **DO NOT MERGE** — The update creates unacceptable compatibility, security, or production risk.

## Report structure

The final report must include:

1. Executive summary.
2. Dependency changes reviewed.
3. Repository usage and impact map.
4. Release-note and breaking-change analysis.
5. Commands and tests performed.
6. Results and evidence.
7. Findings ordered by severity.
8. Gaps or items that could not be verified.
9. Required fixes or follow-up work.
10. Final recommendation.

Do not approve the update merely because automated checks pass. Do not report hypothetical concerns without connecting them to the repository's actual code or configuration. Do not make assumptions, hide failures, or claim something was tested when it was not.
