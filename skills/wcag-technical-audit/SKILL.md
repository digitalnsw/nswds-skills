---
name: wcag-technical-audit
description: Perform an evidence-based technical WCAG accessibility audit of websites, web applications and complete user journeys. Use for a full accessibility audit, WCAG conformance assessment, keyboard or screen-reader testing, or verification of accessibility fixes. Covers automated checks, manual interaction, assistive technology, responsive states and criterion-level reporting. Defaults to WCAG 2.2 AA. Audit and report first; change application code only when remediation is requested.
---

# Technical WCAG audit

Evaluate the requested web experience against a declared WCAG version and conformance level. Deliver reproducible findings and a complete coverage record. A complete audit considers every success criterion at the target level, its lower levels, all scoped states and the conformance requirements. It can find failures; ‘complete’ does not mean ‘conformant’.

## Establish the target

Use WCAG 2.2 Level AA unless the user or applicable project requirements specify another version or level. State that default early. Include A requirements in AA audits and A and AA requirements in AAA audits. If only selected AAA criteria are requested, report them as supplementary checks, not AAA conformance. Do not substitute WCAG 3 drafts for a requested WCAG 2 standard.

Read project instructions, accessibility requirements and existing tests. Establish the evaluated URL or local build, commit or release, scope boundary, supported technologies, test accounts, roles and critical tasks. Distinguish the technical target from legal or procurement obligations; do not infer jurisdictional compliance from WCAG results.

An audit permits inspection and local diagnostic artefacts, not unsolicited application changes. Use available test accounts and safe test data. Complete processes in a local or test environment when they would otherwise send messages, charge money, delete records or change a real user's account. If a necessary action is not authorised, mark that step blocked and continue independent checks. Do not put credentials or personal data in evidence.

## Build the coverage inventory

Inventory routes, shared shells, templates, components, embedded third-party experiences and documents within scope. Include authenticated and anonymous views, supported roles and languages, responsive breakpoints, themes and important combinations of these. Identify ordinary, loading, empty, validation-error, failure, success, expanded, selected, disabled and modal states.

Map complete journeys, including sign-in, MFA, recovery, onboarding, search, submission, review, confirmation and logout where present. Follow the real paths through dynamic content; a source tree, sitemap or successful HTTP response is not proof that the relevant state was tested.

A whole-site audit must account for the whole requested scope. If exhaustive coverage is impractical, make the sampling method and exclusions explicit using [WCAG-EM](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/). Include common pages, distinct functionality, complete processes and a justified representative sample. Never silently replace a requested complete audit with a homepage scan or claim that a sample proves untested pages conform.

Create a result for every scope-item/criterion pair. A scope item identifies a page or journey state and its test environment; group genuinely equivalent repeated components only with a documented rationale and representative evidence. Use the [coverage helper and reporting contract](references/reporting.md) to initialise and validate a WCAG 2.2 matrix. The helper includes all 86 active criteria across A, AA and AAA; it does not perform accessibility testing. Its catalogue omits removed criterion 4.1.1. For another WCAG version, use that version's official inventory and a separate matrix; do not reuse a 2.2 count or silently omit a version-specific requirement.

## Use authoritative requirements

Consult the [WCAG Recommendation](https://www.w3.org/TR/WCAG22/) for the selected criterion's wording, definitions and exceptions. The matrix stores IDs and fragment anchors so each result can link to the precise requirement. Use the matching W3C Understanding pages and techniques to design tests. Techniques and ARIA Authoring Practices are supporting guidance, not additional normative WCAG requirements or the only acceptable implementation.

Read [technical test procedures](references/testing.md) before execution. Read the relevant linked sources for the features being assessed. If sources are unavailable, record the pinned guidance used and any uncertainty. Do not invent thresholds, promote AAA requirements to AA or convert a usability preference into a WCAG failure.

## Execute the audit

Combine the following evidence; no single method replaces the others:

- **Automated browser checks.** Use the repository's existing accessibility tooling or an available browser-integrated engine. Record tool and ruleset versions, scope, page state and exclusions. Capture violations, passes, incomplete/manual-review results and scan errors. Verify suspected failures in context. A zero-violation result covers only the rules and rendered states that actually ran. Do not add dependencies or change project configuration solely to produce a score when existing tools suffice.
- **DOM and accessibility-tree inspection.** Check semantics, computed accessible names, roles, values, states, relationships and exposed reading order. Inspect native HTML, custom widgets, shadow roots and frames where supported. Inspect runtime output rather than relying on source attributes alone.
- **Keyboard, pointer and visual interaction.** Perform the procedures in the reference using real focus movement and state changes. Test zoom, text resizing, reflow, text spacing, orientation, contrast and focus visibility at the relevant breakpoints and themes.
- **Assistive technology.** Exercise the critical journeys with available screen readers and supported browser/OS combinations. Record actual announcements and interaction steps. An accessibility-tree snapshot is not a screen-reader session. If no suitable assistive technology or operator is available, provide an exact manual test script and mark the affected results manual-needed; do not simulate evidence or infer passes.
- **Media, timing and process checks.** Inspect captions, transcripts, audio description, time limits, moving content, authentication and error recovery where applicable. Include human review of meaning and equivalence. Source inspection alone cannot establish caption accuracy or a usable recovery journey.

Continue until all scope items have a documented result, or a concrete access/tool/evidence limitation prevents further testing. Missing access, missing tools, unsupported scanning and unfinished work are blocked, manual-needed or not-tested, never not-applicable. An accessibility feature absent from the experience can justify not-applicable only after checking the entire relevant scope item and recording why.

## Assess findings and conformance

For each confirmed failure, record the criterion and level, affected location/state, environment, exact reproduction steps, expected and observed behaviour, user impact, evidence and a specific remediation. Separate severity from WCAG level: prioritise barriers to completing tasks, then impact and frequency. Do not equate an engine's severity label with a conformance level.

A result passes only when all applicable clauses and required methods for that scope item have evidence, including relevant exceptions. Record a failure even if other clauses remain untested, and list those checks in remainingTests so the audit stays incomplete. Mark partial evidence manual-needed or not-tested rather than converting it into a pass. Deduplicate shared root causes while listing all known affected locations.

Evaluate the five conformance requirements separately: target level, full pages, complete processes, accessibility-supported technology use and non-interference. Third-party failures still affect the evaluated page. Explain any conforming alternate version and verify the normative conditions rather than excluding the inaccessible version by assertion. Do not claim a formal statement of partial conformance without checking its permitted conditions.

Keep normative failures, advisory improvements and uncertain findings distinct. A passed scanner, percentage, weighted score or clean source review cannot establish WCAG conformance. If failures remain, report them; if required evidence or coverage is missing, report the assessment as incomplete. Do not issue a blanket certification. Even a well-supported conformance statement is limited to the identified version, level, scope, build, date and accessibility-support assumptions.

## Report and optionally remediate

Deliver the report described in [reporting.md](references/reporting.md): scope and environment, executive findings, criterion matrix, conformance-requirement assessment, reproducible issue list, evidence, exclusions, outstanding manual tests and prioritised remediation. Include successful checks and their boundaries. Clearly state whether the audit is exhaustive or sampled and whether evaluation is complete, nonconformance is established, or conformance remains undetermined.

If remediation was requested, implement focused fixes after recording the baseline. Prefer native semantics and existing components; preserve visible/accessible-label alignment, stable identifiers and working interactions. Add meaningful regression checks for reproducible defects. Retest the original failure, neighbouring interactions and affected journey with the same methods, including assistive technology where relevant. Retain original evidence and record the retest build and result; do not erase findings merely because the code changed. Keep residual or unverified issues open.
