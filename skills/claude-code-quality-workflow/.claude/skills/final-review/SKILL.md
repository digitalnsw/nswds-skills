---
name: final-review
description: Run the repository's merge-equivalent validation once and perform a final read-only review of the current branch.
argument-hint: "[optional base branch]"
disable-model-invocation: true
context: fork
agent: quality-reviewer
background: false
---

Run `quality-review/scripts/review-scope.mjs`, passing `$ARGUMENTS` only when supplied. Infer the repository's real merge gates from CI workflows, package scripts, task configuration, and contribution docs. Prefer the exact gate commands over generic guesses.

Run the applicable gate set once. Automatically use an available port when browser tests support one; never stop another project's server without permission. A failed gate does not erase the review: diagnose it, continue read-only inspection where safe, and report the failure prominently.

Perform one fresh review of the current scope using `quality-review/review-guide.md`. Return a Markdown merge assessment with findings first, exact commands and results, cached or skipped checks, and CI-only gaps. Do not repair, persist state, or claim local checks prove hosted CI.
