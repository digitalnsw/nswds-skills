---
name: codex-final-review
description: Run the repository's merge-equivalent gates once and perform a final read-only review of the current branch.
---

# Final review

Run the sibling `../codex-quality-review/scripts/review-scope.mjs`, passing a base branch only if the user supplied one. Never ask for a commit SHA.

Infer the real merge gates from CI workflows, package scripts, task configuration, and contribution docs. Prefer exact gate commands over generic guesses and run the applicable gate set once. Automatically use an available port when browser tooling supports configuration; never stop another project's server without permission.

A failed gate does not erase the review or trigger a workflow pause. Diagnose it, continue read-only inspection where safe, and report it prominently. Do not repair during final review.

Read the sibling `../codex-quality-review/references/review-guide.md` and perform one fresh review of the current scope. Return a Markdown merge assessment with findings first, exact commands and results, cached or skipped checks, and CI-only gaps. Do not persist state or claim local checks prove hosted CI.
