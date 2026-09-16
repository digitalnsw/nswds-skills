# Coverage and reporting contract

## Initialise the matrix

The optional helper requires Node.js 18 or newer, uses only built-in modules and performs no network requests. Run it from the skill directory, or substitute its absolute path:

```sh
node scripts/coverage.mjs init --level AA \
  --scope '/sign-in;anonymous;empty;desktop' \
  --scope '/sign-in;anonymous;error;desktop' \
  --scope '/sign-in;anonymous;empty;mobile' \
  --output /tmp/wcag-audit.json
node scripts/coverage.mjs check /tmp/wcag-audit.json
node scripts/coverage.mjs check /tmp/wcag-audit.json --complete
node --test scripts/coverage.test.mjs
```

Use unique scope IDs that identify states and environments, not just URLs. Enumerate the agreed scope before initialising; add new items and their criterion results when discovery expands it. Do not remove scope items to make validation pass. The output is created without overwriting an existing file. Keep the coverage JSON with the human-readable report and evidence.

The helper is pinned to WCAG 2.2, with 31 A criteria, 24 additional AA criteria and 31 additional AAA criteria: 55 at AA and 86 at AAA. The IDs, levels and anchors in [criteria.json](criteria.json) were checked against the linked W3C Recommendation. Consult the current selected standard and errata during each audit; update the catalogue deliberately if the standard changes. For other versions use a separately verified inventory, not this helper.

## Populate results

Set target, build, date (a real calendar date in `YYYY-MM-DD` format; blank only in drafts), environments and coverageMode (`exhaustive` or `sampled`). Record complete browser/OS/assistive-technology versions, viewport and settings in the environment descriptions. For each result, retain its scope and criterion IDs, then supply:

- `status`: pass, fail, not-applicable, not-tested, blocked or manual-needed.
- `methods`: the methods actually performed, from automated, dom, keyboard, pointer, visual, screen-reader, media, document, source or manual-review.
- `evidence`: specific report-section or artefact references, including measured values, DOM excerpts, screenshots, recordings or interaction transcripts as appropriate.
- `reason`: explain the observation, applicability decision, exception or outstanding limitation.
- `finding`: a finding ID for a failure, with full details in the issue list.
- `remainingTests`: an array of outstanding checks, including untested clauses when another clause already fails. Keep it empty only when no checks remain; a known failure does not make the evaluation complete.

A placeholder, planned test or unverified assertion is not evidence. The checker verifies structure and completeness, not whether the evidence is truthful, adequate or a correct interpretation of WCAG. Human/evaluator review remains necessary. In particular, recording only an automated method must not pass a criterion whose applicable clauses require manual evidence.

Assess every conformance requirement separately using its own result. Non-interference and accessibility-supported use cannot be waived with not-applicable. A claimed pass for the target-level requirement must agree with all applicable criterion results. Full-page and complete-process results must agree with inventory coverage, including third-party steps.

The ordinary `check` accepts a structurally valid unfinished audit. `--complete` rejects unfinished results, missing evidence fields, missing coverage and absent environment metadata. It accepts an adequately documented completed audit that found failures. Neither command awards conformance. Console counts concern criterion results; inspect the five conformance-requirement results too.

## Deliver the report

Include the following, scaled to scope:

- **Target and boundary:** version/level, URLs, commit/release, evaluation date, environments, technologies relied on, accounts/roles and any exclusions. Identify exhaustive versus sampled coverage, sample selection and limits on inference.
- **Outcome:** whether nonconformance was found, whether evaluation is complete, and whether outstanding evidence prevents a conformance conclusion. Separate coverage from the number of failures. Do not turn a pass percentage into a certificate.
- **Criterion matrix:** every selected criterion against every scoped item, evidence, methods and statuses. Explain not-applicable decisions and document both successful and unsuccessful checks. Include all five conformance-requirement results.
- **Findings:** ID, criterion link and level, location/state, reproduction steps, expected versus actual result, affected users, severity with rationale, evidence, suggested fix and verification steps. Distinguish confirmed failures from advisory improvements and suspected issues needing confirmation.
- **Remaining work:** precise blocked/manual tests, access or equipment needed, affected coverage and next actions. A missing screen-reader session must remain visible here.
- **Retests when requested:** baseline and fixed build, changed files, original finding, repeated procedures, new evidence, result and residual issues. Source changes alone do not close a runtime or assistive-technology finding.

A useful finding describes an observed barrier, such as an opened dialog leaving keyboard focus behind its modal overlay, and cites the requirement actually violated. ‘Add ARIA’, ‘Lighthouse is below 100’ or ‘use best practices’ is not a sufficient finding.

## Conforming alternate versions

The optional `alternateVersions` array defaults to empty for existing records. Each claimed mapping contains `original` (a scope ID), `alternates` (one or more unique scope IDs), and non-empty arrays of evidence references named `equivalence`, `currency`, `availability` and `reachability`. Record evidence for equivalent information, functionality and language; current content; equally free availability; and the applicable access mechanism. Set `reachabilityMode` to `accessible-mechanism`, `only-via-alternate` or `only-via-conforming-gateway`, matching the verified condition in the [normative definition](https://www.w3.org/TR/WCAG22/#dfn-conforming-alternate-version).

Include every alternate page/state in the evaluation inventory, even when it is outside the claimed site boundary, and distinguish that boundary in the report. Multiple alternate pages can jointly replace one original. Every alternate must directly pass all applicable criteria at the audit level, with evidence. Mapping chains, cycles, duplicate originals and self-references are rejected. Only record a mapping once its conditions are verified; describe proposed or unfinished mappings in remaining work.

Retain original failures and finding IDs. A verified mapping permits those failures alongside a conformance-level pass, but never waives outstanding checks, full-page/process coverage, accessibility support or non-interference. The checker rejects a non-interference pass when its four universally applicable criteria fail or remain untested on any evaluated item. Evidence adequacy and the other conformance requirements still require evaluator review.

The repository runs the checker regression suite through `.github/workflows/wcag-technical-audit.yml` for changes to this skill or that workflow.
