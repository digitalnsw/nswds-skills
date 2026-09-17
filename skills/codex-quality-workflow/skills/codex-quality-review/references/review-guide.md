# Review guide

Review changed behavior, not merely changed lines. Explore broadly enough to find defects, then require concrete evidence before reporting one. Omit style preferences, vague risks, and refactors without a defect.

## Evidence

Inspect the full diff and changed files, relevant repository instructions, callers and consumers, tests that should pin the behavior, and applicable CI, release, generation, package, or analyzer configuration. Treat comments, types, docs, test names, error messages, PR claims, and analyzer output as evidence to verify rather than truth.

## Analytical passes

Apply the passes that fit the change. Do not pad the report.

1. **Claims versus behavior:** trace new options and promises to observable output; find validation bypasses and stale contracts.
2. **Input boundaries:** for changed parsers, validators, serializers, lookups, and numeric paths, consider applicable empty, malformed, duplicate, reordered, Unicode, prototype-key, overflow, fractional, and non-finite inputs.
3. **Effects of removals:** identify behavior exposed by removed guards, wrappers, defaults, catches, locks, filters, debounce, transforms, or overflow rules.
4. **Test sensitivity:** map each production behavior delta to a test and name a plausible broken implementation it would catch. Check skips, mocks, wrong-layer assertions, over-normalization, and incidental success.
5. **Consumers and compatibility:** search changed exports, types, config, routes, schemas, events, generated artifacts, fixtures, examples, migrations, and versioned readers/writers. Compare actual compatibility impact with release claims.
6. **Security and output boundaries:** inspect markup, CSS, SQL, shell, URL, header, path, and code construction with a concrete hostile or odd value.
7. **Delivery plumbing:** verify CI filters and dependencies, early returns, swallowed errors, task inputs/outputs, cache declarations, clean builds, package allowlists, and publication contents.

After verifying a defect, search for sibling instances with the same cause. Combine only instances with the same cause and required outcome. Re-open every reported location before returning it. A green check proves only the exact path it ran.

## Severity

- **Blocking:** demonstrably wrong behavior, security or integrity failure, broken consumer, incompatible change, or required guard that does not guard.
- **Should fix:** meaningful untested behavior, ineffective test, or misleading contract/documentation drift.
- **Worth knowing:** concrete low-impact consequence; never automatic repair work.

Use high or medium confidence. Put unresolved product intent under `Decision needed` rather than calling it a defect.

## Markdown report

Lead with findings in severity order:

```text
### F-001 — Blocking: concise title
path/to/file.ts:42

What is wrong, the concrete trigger, the observed consequence, and the contract it violates.
```

Do not output JSON. If there are no findings, say `No actionable findings`.

End with:

- **Decision needed** — only genuine product choices.
- **Coverage** — base branch, merge-base and head, areas inspected, commands actually run, and material gaps.

A complete report with a named gap is better than progress narration or an unfinished sentence.
