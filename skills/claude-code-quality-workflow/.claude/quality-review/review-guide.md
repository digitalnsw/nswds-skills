# Review guide

Review the changed behavior, not merely changed lines. Trade some precision for recall during discovery, then require concrete evidence before reporting a finding. Do not report style preferences, vague risks, or refactors without a defect.

## Evidence to inspect

- The full diff, whole changed files, and relevant repository instructions.
- Callers and consumers of changed public surfaces.
- Tests that should fail when the changed behavior is wrong.
- CI workflows, package/release configuration, generated artifacts, and analyzer output relevant to the change.

Treat comments, types, docs, test names, error messages, and PR claims as contracts to verify, not truth. A green check proves only the code path it actually ran.

## Analytical passes

Apply the passes that fit the change; do not mechanically pad the report.

1. **Claims versus behavior.** Trace new options and documented behavior to observable output. Find alternate paths that bypass new validation and stale names or contracts.
2. **Input boundaries.** For changed parsers, validators, serializers, lookups, and numeric code, test applicable empty, malformed, duplicate, reordered, Unicode, prototype-key, overflow, fractional, and non-finite inputs.
3. **Effects of removals.** Identify behavior previously suppressed by removed guards, wrappers, defaults, catches, locks, filters, debounce, transforms, or overflow rules.
4. **Test sensitivity.** Work from each production behavior delta to its test. Name a plausible broken implementation the assertion would catch; watch for skips, wrong-layer assertions, over-normalization, mocks, and incidental success.
5. **Consumers and compatibility.** Search exports, types, config keys, routes, schemas, events, generated artifacts, fixtures, examples, migrations, and versioned readers/writers. Compare actual compatibility impact with release claims.
6. **Security and output boundaries.** Inspect markup, CSS, SQL, shell, URL, header, path, and code construction. Distinguish value escaping from name validation and use a concrete hostile or odd value.
7. **Delivery plumbing.** Verify CI path/event filters, job dependencies, early returns, swallowed errors, package allowlists, task inputs/outputs, cache declarations, clean-build behavior, and publication contents.

After verifying a defect, search for sibling instances with the same cause. Combine only instances that have the same cause and required outcome. Re-open every reported location before returning it.

## Severity

- **Blocking:** demonstrably wrong behavior, security or integrity failure, broken consumer, incompatible change, or required guard that does not guard.
- **Should fix:** meaningful untested behavior, ineffective test, or contract/documentation drift that can mislead users.
- **Worth knowing:** concrete low-impact consequence. Never turn this tier into opportunistic repair work.

Use high or medium confidence. Put unresolved product intent under `Decision needed`; do not disguise it as a defect.

## Markdown output

Lead with findings in severity order. Each finding has:

```text
### F-001 — Blocking: concise title
path/to/file.ts:42

What is wrong, the concrete trigger, the observed consequence, and the contract it violates.
```

Do not output JSON. If there are no findings, say `No actionable findings` and do not invent one.

End with:

- **Decision needed** — only genuine product choices.
- **Coverage** — base branch, merge-base and head, areas inspected, commands actually run, and material gaps.

Finish synthesis before the tool-turn limit. A complete report with a named coverage gap is better than progress narration or an unfinished sentence.
