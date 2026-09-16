---
name: australian-style-manual
description: Assess and edit every content item in the requested scope against the Australian Government Style Manual. Use when writing, reviewing or updating Australian English content, auditing a website or repository for Australian Government style, or checking copy, documentation, interface text, forms and accessibility text against stylemanual.gov.au. Make necessary corrections unless the user requests an assessment only.
---

# Australian Style Manual

Assess every piece of content within the user's requested scope and update it where necessary to follow the [Australian Government Style Manual](https://www.stylemanual.gov.au/). Review meaning, structure, accessibility, inclusion and editorial conventions, not just spelling. Leave content that already meets the guidance unchanged.

## Establish scope and coverage

Use the supplied text, files, page, feature or project as the boundary. For a whole-project request, inventory all first-party content sources, not only recently changed files. For a writing task, assess every part of the new content before delivering it. An explicit assessment-only request produces findings without edits; otherwise apply clear corrections within the authorised scope.

Read project instructions and any existing editorial style sheet. Establish the audience, purpose, medium and Australian English dictionary preference from available context. Ask only when missing information prevents a reliable edit; continue with independent corrections meanwhile.

Inventory content before editing. Include, where present:

- Pages, articles, documentation, help content and downloadable documents.
- Navigation, headings, buttons, labels, tooltips, banners and notifications.
- Form instructions, validation messages, errors, empty states and success states.
- Page titles, descriptions, social previews and other human-readable metadata.
- Alternative text, accessible names, captions, transcripts, tables and charts.
- Email and message templates, localisation values, CMS records and content embedded in components or data files.

Track each file, route, record or supplied item as reviewed unchanged, updated, blocked or excluded, with a reason for any gap. Use a compact working inventory; for a large audit, retain it as a reviewable report. Review complete content in manageable batches: keyword searches and spelling tools help discovery but do not replace reading. Do not claim full coverage from a sample.

Trace rendered copy to its editable source and confirm which templates and components are actually used. Distinguish active content from unused examples; do not imply that editing an unused template changes a live email. Assess shared text in its different contexts. Inspect conditional states and dynamically assembled text, including plural forms and interpolation. Identify inaccessible CMS content, unreadable files and uninspected media explicitly. Exclude dependencies, build output and machine-only data from prose editing; edit generators or templates when those produce in-scope content.

## Consult the authoritative guidance

Use [the review checklist and source map](references/review-checklist.md) to cover the applicable dimensions. Open the current official pages for the rules and content types being applied, following topic links for details and exceptions. Reuse a page already checked during the task. Search the official site if a link has moved.

Treat the live manual as authoritative over remembered rules or the bundled checklist. Distinguish firm rules, recommendations, context-dependent exceptions and local choices. Do not invent a universal rule from an example. Apply the user's explicit requirements and record any resulting departure from the manual. Resolve local style conflicts explicitly rather than silently claiming both conventions comply.

If web access is unavailable, continue with well-supported corrections using available guidance. Mark source-dependent decisions as unverified and describe the assessment as provisional; do not claim to have checked the current manual.

## Assess and edit

Review each item for user need and meaning first, then structure, language and conventions. Use the relevant checklist entries for the medium. Apply the smallest edits that achieve clarity and consistency; restructure when that is necessary for comprehension. Keep useful voice and emphasis instead of making every piece sound identical.

Preserve facts, amounts, eligibility criteria, deadlines, obligations and qualifications. In particular, do not swap ‘must’, ‘should’ and ‘may’ as stylistic synonyms. Flag ambiguous facts or wording that needs subject-matter confirmation; never guess what a date, policy or technical statement means.

Protect material whose exact form matters:

- Preserve the wording of quotations, official names and legally prescribed text; check the applicable conventions around them and flag issues within protected text. Preserve the identity and words of published titles while applying the manual's specific capitalisation, italics and reference-formatting rules. Do not treat a title as ordinary prose or exempt it from those rules.
- Do not translate or anglicise personal names or Aboriginal and Torres Strait Islander language words. Respect people's stated names, pronouns and terminology preferences.
- Preserve URLs, file paths, code identifiers, commands, API fields, localisation keys, placeholders and machine-readable values. Edit human-readable values without changing their contracts or escaping.
- Preserve non-English content unless translation is requested. Distinguish editorial punctuation in prose from syntax in executable examples.

Use contextual edits rather than blind global replacements. If a heading changes, check dependent navigation and generated anchors; preserve stable links or update in-scope references. Keep visible labels and accessible names consistent. Never invent an image description without inspecting the image or a reliable description, and never invent transcript content.

Where an improvement needs unavailable evidence, a policy decision or work outside the authorised scope, record the precise issue and required action. Continue editing the remaining content. A style review does not itself authorise sending messages or publishing changes to a live service.

## Verify and report

Read the revised content in context and check the diff for changed meaning, dropped information and unintended edits. Reconcile the inventory so every item has a status. Repeat targeted searches for inconsistent terms, but also proofread the complete edited material.

For content stored in code or structured files, run the relevant existing syntax, formatting or build checks and check interpolation. Verify which files editorial tools actually checked: a successful command that checked zero files is a coverage gap, not a pass. Inspect rendered output when available for broken headings, links, wrapping and inaccessible or truncated labels. For documents, check the resulting structure and layout using available document tools. State any verification that could not be performed. Editorial review alone does not establish full accessibility compliance.

For supplied prose, return the corrected content with brief notes only where useful. For file or project edits, report:

- The scope reviewed and files or content areas changed, including reviewed items that needed no edits.
- The main corrections, with links to the specific official guidance supporting non-obvious decisions.
- Outstanding findings, deliberate exceptions and coverage or verification gaps, with locations and next actions.
- The checks completed and their results.

Keep citations in review notes unless the content itself needs them. Do not add editorial commentary to product copy. Describe the result as reviewed against the applicable guidance, not as a blanket certification.
