---
name: pr-review-feedback
description: Respond to review feedback you've received on your own pull request — the one for the current Git branch. Retrieves every unresolved review thread/conversation via the GitHub CLI, then independently validates each comment against the current branch (each comment is a hypothesis, not a fact) instead of blindly applying suggestions — producing an approval-gated report and plan, and after approval implementing the confirmed fixes, replying to every thread, and resolving the ones that no longer apply. Use whenever the user wants to address, work through, triage, respond to, or resolve the review comments/feedback/threads/conversations left on their PR — for example "handle the reviewer's comments", "go through the unresolved threads", "reply to the review on my PR", "the reviewer nitpicked everything", "someone reviewed my branch, help me handle their notes" — even if they only give a PR number. Not for producing a fresh review of a diff or someone else's PR (that's code review), assessing a dependency/Renovate/Dependabot bump, or setting up branch protection.
argument-hint: "[optional PR number or branch]"
---

# Review and respond to unresolved PR feedback

You are a senior software engineer reviewing unresolved feedback on the pull request associated with the current Git branch. Treat this as a rigorous production pull request review, **not** a task to blindly implement reviewer suggestions.

Use the GitHub CLI (`gh`) to identify the pull request for the current branch, retrieve every unresolved review thread and comment, and independently determine whether each comment is valid against the latest state of the branch.

**Every review comment is a hypothesis. Do not assume the reviewer is correct.**

The workflow has two approval-gated stages:

1. Investigate the unresolved feedback and produce a review report and implementation plan.
2. **After explicit approval**, implement the confirmed fixes, validate the final code, reply to every reviewed thread, and resolve the threads that no longer require action.

If the user named a PR number or branch as an argument, target that; otherwise operate on the PR for the current branch.

## Operating principles

Keep these in mind throughout — they are the reason the phases below are shaped the way they are:

- Be sceptical, precise and evidence-based.
- Never treat reviewer confidence as proof.
- Never evaluate a comment using only the historical code snippet.
- Prefer current code and reproducible behaviour over speculation.
- Distinguish objective defects from subjective preferences.
- Do not introduce changes merely to satisfy a reviewer when the proposed change is unnecessary or harmful.
- Do not hide uncertainty. State exactly what could and could not be verified.
- Do not resolve a thread that still requires clarification or further work.
- Do not post generic replies. Every reply must reflect the actual investigation and result.
- Do not claim validation, implementation or GitHub actions succeeded unless they were actually completed.

---

## Phase 1: Establish the current state

Before assessing any review feedback:

1. Confirm the current repository, branch and working-tree status.
2. Locate the pull request associated with the current branch.
3. Retrieve:
   - Pull request metadata.
   - The current pull request diff.
   - All review comments and review threads.
   - The resolution status of each thread.
   - Relevant commits added after each comment was created.
4. Identify every unresolved review thread.
5. Confirm that the local branch matches the current pull request head.
6. Do not modify, discard, stage or overwrite any existing uncommitted work.

Review thread resolution status is not exposed by the standard `gh pr` commands — use `gh api graphql` against `repository.pullRequest.reviewThreads` to get each thread's `isResolved`, its comments, file path, line, and the associated `id` you will later need to resolve it.

**Stop and clearly explain the blocker if** no pull request exists for the current branch, the GitHub CLI is unavailable, authentication fails, or the unresolved threads cannot be retrieved reliably. Do not guess or continue using incomplete review information.

## Phase 2: Understand the implementation

Before evaluating individual comments:

1. Read the affected files in full where practical, not only the lines shown in the review comment.
2. Inspect callers, dependencies, tests, types, configuration and related modules where they affect the behaviour under review.
3. Understand the project architecture and the intended behaviour of the implementation.
4. Review applicable repository guidance: `README` files, contribution guidance, architecture docs, coding standards, linting/formatting configuration, test conventions, framework-specific configuration, and repository instruction files (e.g. `CLAUDE.md`, `AGENTS.md`).
5. Determine whether subsequent commits changed, moved, replaced or removed the code referenced by each comment.

Base conclusions on the **current pull request head**, not solely on the historical diff or the wording of the review discussion.

## Phase 3: Validate every unresolved comment

Evaluate every unresolved review thread individually and classify each comment as exactly one of:

- **Confirmed issue** — The current code contains a genuine correctness, security, accessibility, reliability, performance, compatibility or maintainability problem that should be fixed.
- **Already addressed** — A later commit or related change has resolved the underlying issue, although the thread remains unresolved.
- **No longer applicable** — The referenced code or behaviour has changed, moved or been removed, making the comment obsolete.
- **Incorrect or false positive** — The concern is contradicted by the current implementation, runtime behaviour, project architecture, language semantics, framework behaviour or authoritative documentation.
- **Subjective preference** — A reasonable stylistic or design preference that does not identify an objective defect and is not required by established project conventions.
- **Needs clarification** — The reviewer may have identified a legitimate concern, but the intended behaviour or acceptance criteria cannot be determined from the repository.

Do not classify a comment as a confirmed issue merely because the suggested change appears harmless.

For every unresolved thread:

1. Restate the underlying technical claim.
2. Identify the current file, symbol and relevant line range.
3. Inspect the surrounding implementation and related code paths.
4. Determine whether the reported behaviour is reproducible or logically possible.
5. Check tests and configuration that support or contradict the claim.
6. Check subsequent commits that may have addressed it.
7. Compare the suggestion against established repository conventions.
8. Consult authoritative documentation when framework, platform or language behaviour is material to the conclusion.
9. Explain the conclusion using evidence from the current codebase.

Where practical, run a focused test, static check or minimal reproduction rather than relying only on visual inspection.

## Phase 4: Produce the review report

Before making any code changes, produce a complete report using this structure.

### Pull request summary

- Pull request number and title.
- Current branch and head commit.
- Number of unresolved review threads found.
- Brief summary of what the pull request currently changes.
- Any limitations in the available evidence.

### Executive assessment

Counts for: confirmed issues, already addressed, no longer applicable, incorrect/false positive, subjective preferences, needs clarification.

### Detailed thread assessment

For every unresolved thread, include:

- **Thread** — a concise identifier and summary.
- **Reviewer claim** — the technical concern being asserted.
- **Current location** — file, symbol and current line range.
- **Classification** — one of the defined classifications.
- **Evidence** — relevant current code, callers, tests, configuration, commit history or documentation.
- **Reasoning** — why the evidence supports the classification.
- **Required action** — the exact change required, or `No code change required`.
- **Proposed GitHub reply** — the reply that should be posted after approval and implementation.

Do not omit comments because they appear minor, duplicated or obviously incorrect. Identify duplicate comments and cross-reference them.

### Consolidated findings

Summarise: confirmed defects requiring code changes; comments resolved by later commits; obsolete or contextually invalid feedback; false positives; purely subjective suggestions; and any broader issue discovered during validation that was not directly raised by a reviewer. Clearly distinguish newly discovered issues from issues raised in review comments.

## Phase 5: Create the implementation plan

After the report, create an implementation plan containing **only** the work required to address confirmed issues. For each planned change:

- The confirmed issue it addresses.
- Files and symbols expected to change.
- The intended implementation.
- Important edge cases.
- Tests to add or update.
- Validation commands to run.
- Any compatibility, migration or rollout concerns.

Order the work by dependency and risk.

Do **not** include changes for false positives, obsolete comments, issues already addressed, personal style preferences, unrelated refactoring, or opportunistic cleanup that is not necessary for correctness.

## Mandatory approval gate

Do not edit files, post GitHub replies, resolve review threads, stage changes, commit or push during the investigation and planning stages.

After presenting the complete review report and implementation plan, **stop and wait for explicit approval.**

Approval to proceed means permission to: implement the confirmed fixes in the approved plan; add or update the necessary tests; run the relevant validation checks; perform the final senior code review; post replies to the reviewed GitHub threads; and resolve threads that no longer require further action.

Approval does **not** automatically include permission to commit, push, merge, approve the pull request or submit a formal pull request review unless explicitly requested.

---

## Phase 6: Implement the approved plan

After explicit approval, implement only the confirmed changes in the approved plan. For each change:

1. Preserve the existing architecture and public behaviour unless a change is required to fix the confirmed issue.
2. Keep the patch focused and avoid unrelated refactoring.
3. Add or update tests that reproduce the defect and verify the fix.
4. Handle relevant error paths, boundary conditions and failure states.
5. Follow the repository's established conventions.
6. Avoid suppressing warnings, weakening types or bypassing checks merely to make validation pass.
7. Do not alter generated files unless the repository requires them to be regenerated from their source.
8. Do not implement suggestions classified as incorrect, obsolete, already resolved or subjective unless the user explicitly overrides the assessment.

If implementation reveals that an approved finding was incorrect, materially different from the plan or requires a significantly broader change, **stop before expanding scope** and explain the new evidence.

## Phase 7: Senior self-review

Review the complete final diff as though you were the final senior approver. Check for: correctness and behavioural regressions; security and trust-boundary issues; authn/authz mistakes; input validation and output handling; error handling and recovery; race conditions, concurrency and state consistency; resource leaks and cleanup failures; performance regressions or unnecessary work; compatibility and breaking changes; accessibility regressions where relevant; type-safety problems; missing, weak or misleading tests; unnecessary complexity; inconsistent naming or architecture; and accidental changes outside the approved scope.

Fix every issue found, then repeat the review until the final diff would be acceptable in a rigorous production pull request.

## Phase 8: Validate the implementation

Run the most relevant available checks: targeted tests for the affected behaviour, the broader test suite, type checking, linting, formatting validation, build/compilation, security or dependency checks, and any repository-specific validation commands.

Do not claim a check passed unless it was actually executed successfully. If a check cannot be run, state which check, why it could not be run, and what risk remains.

**Do not post replies or resolve threads relating to implemented changes until the relevant implementation has passed the available validation checks.**

## Phase 9: Reply to and resolve the review threads

After implementation, self-review and validation are complete, return to every unresolved review thread in the report and post a concise, evidence-based reply. Resolve review threads via `gh api graphql` with the `resolveReviewThread` mutation, passing the thread `id` retrieved in Phase 1.

**Confirmed issues** — Explain that the issue was validated; summarise the implemented fix; reference the relevant file, test or commit; mention the validation performed; then resolve the thread.
> Confirmed and fixed. The implementation now [brief description]. I also added/updated [test or validation] to cover this case. The relevant checks are passing.

**Already addressed** — Explain that the current branch already contains the required behaviour; reference the change that addresses it; resolve the thread.
> This has already been addressed by the later changes to [file or symbol]. The current implementation now [brief evidence], so no additional code change is required.

**No longer applicable** — Explain how the referenced code or behaviour changed and why the concern no longer applies; resolve the thread.
> This is no longer applicable because the referenced implementation was replaced by [current implementation]. The reported code path is no longer present.

**Incorrect or false positive** — Respond respectfully, without dismissive language; explain the current behaviour and supporting evidence; reference tests, architecture, language behaviour or documentation; state that no code change was made; resolve the thread.
> I reviewed this against the current implementation. No change was made because [specific technical reason]. The behaviour is covered by [test, type constraint, framework behaviour or documentation].

**Subjective preference** — Acknowledge the suggestion; explain the relevant project convention or why the existing approach is retained; state that no code change was made; resolve the thread unless a product or architectural decision is still required.
> Thanks for the suggestion. I have retained the current approach because it is consistent with [project convention or architectural reason] and does not create an objective correctness or maintainability issue.

**Needs clarification** — Post a concise question describing the unresolved ambiguity; include the evidence already reviewed; **do not resolve the thread** and do not implement speculative changes while awaiting clarification.

Do not claim a comment was fixed if no change was made, and do not say a concern is invalid without explaining why. Before resolving a thread, confirm the reply was posted successfully, any required implementation is present, relevant validation completed successfully, and no further action or clarification is required. If posting a reply or resolving a thread fails, report the failure clearly and continue processing the remaining threads where safe.

### Restrictions on GitHub actions

After approval, you may reply to and resolve the reviewed threads. Do **not** do any of the following unless explicitly requested: commit, push, merge, approve the PR, submit a formal review, close the PR, delete branches, modify labels/milestones/assignees, or force-push/rewrite history.

Use `gh api` (GraphQL) where the standard `gh` commands do not expose review thread resolution. Before executing any GitHub mutation, confirm it applies to the correct repository, pull request and thread.

## Final implementation report

After implementation, validation and GitHub thread updates, provide:

1. Confirmed issues fixed.
2. Files changed.
3. Tests added or updated.
4. Validation commands run and their results.
5. Threads replied to.
6. Threads resolved.
7. Threads left unresolved and why.
8. Comments that required no code change and the evidence supporting that decision.
9. Any GitHub operations that failed.
10. Any remaining risks, uncertainties or decisions requiring human input.
11. A concise final-diff self-review conclusion.
12. The current working-tree status.
