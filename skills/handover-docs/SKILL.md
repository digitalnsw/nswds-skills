---
name: handover-docs
description: Write or rewrite project documentation as a technical knowledgebase / handover reference for an incoming developer or client — never as a project journal or personal working log. Use this skill whenever the user asks to write, update, clean up, tidy, restructure, or "professionalise" documentation, README content, handover notes, project notes, or a knowledgebase — and whenever converting working notes, session logs, or issue-tracking notes into docs. Trigger even if the user just says "update the docs" or "document this" after a piece of work: the output must follow this style.
---

# Handover-style documentation

Documentation written with this skill is a reference for someone who was not there: an incoming developer or a client picking up the system cold. They need to know what exists now, what is broken now, and what they must do to run it. They do not need — and are actively slowed down by — the history of how the project got here.

The test for every sentence: **would this still be true and useful if the reader knew nothing about the project's past?** If a sentence only makes sense relative to a date, a PR, a previous draft, or a fixed problem, it does not belong.

## Never include

**Journal-style writing.** No dated entries, no "morning/evening" timestamps, no "as of [date]", "re-reviewed on", "earlier drafts of this doc said…". Docs describe the present tense of the system; version control holds the history.

**Decorative section markers.** No §, ✅, ❌, ⬜, or similar symbols as structure or status markers. Use plain Markdown headings, lists, and tables. (Status belongs in words — "Unresolved", "Blocked on X" — not glyphs.)

**Process references.** No PR numbers, commit references, "resolved in PR #33", "verified by re-export", test-window names (e.g. "W3/W4"), or changelog-style narration of who did what and when. The fix's existence in the code is the record; the doc describes the resulting behaviour.

**Fixed issues in any form.** If a bug, issue, or risk has been resolved, delete it entirely. Not a strikethrough, not a "Resolved" subsection, not a historical footnote. A reader scanning "Open issues" must be able to trust that everything listed is live right now.

**First-person and informal commentary.** No "buys time, same cliff later", "ballast", "niggle", "I think", "we decided". Replace with neutral, professional technical language that states the fact or the trade-off directly.

## Structure: three categories per doc

Restructure each relevant doc's content into these three sections (use them as headings, adapted to the doc's scope):

### 1. Current state / how it works
A factual description of what the component, screen, flow, or file currently does. This is the functional reference for the system as it exists today. Write it so it stands alone — no comparisons to previous versions ("now uses X instead of Y" becomes "uses X").

### 2. Open issues
Only problems, bugs, or risks that are unresolved **right now**. For each:
- **What's wrong** — the observable problem
- **Where it lives** — file, screen, control, or flow
- **Why it matters** — the consequence if left unfixed
- **The fix, if known** — the intended remediation, stated as a plan, not a diary of attempts

If an issue gets fixed, delete its entry on the next docs pass — do not demote it to history.

### 3. Administration / operational notes
Everything a developer or admin must do or know to run, deploy, or maintain the system:
- Permissions and access required
- Environment variables and configuration
- Manual setup steps
- Known configuration constraints
- Outstanding decisions that need a person to make a call (state the decision needed and the options, not the deliberation so far)

Not every doc needs all three sections — a pure reference doc may only need "Current state". But content in a doc should map to one of these three; anything that maps to none of them (history, process, commentary) gets deleted.

## Tone and voice

- Write for someone unfamiliar with the project's history. Expand or drop internal shorthand and codenames on first use; never assume the reader watched the work happen.
- Prefer plain prose and standard Markdown — headings, short paragraphs, tables for enumerable facts, bullet lists only where genuinely list-shaped.
- Be concise. No process commentary, speculation, or justification for past decisions. State what is true now.
- Neutral register throughout: "The export omits archived records" not "annoyingly the export still drops archived stuff".

## Preserve accuracy while rewriting

The rewrite changes voice and structure, never facts. File paths, control names, formulas, IDs, URLs, environment variable names, and other specifics must survive intact. When condensing, verify each technical detail carried over exactly — a handover doc with a wrong control name is worse than a wordy one. If a fact in the source notes is ambiguous or looks stale, flag it to the user rather than silently guessing or dropping it.

## Examples

**Journal entry → current state**

Before:
> 2026-05-14 (evening): re-reviewed the export flow after the W3 fixes landed. As of today the CSV export finally includes the ABN column — resolved in PR #33. Earlier drafts of this doc said it was missing.

After:
> The CSV export includes all registered fields, including ABN. Export logic lives in `src/export/csv-builder.ts`.

**Status glyphs → open issue entry**

Before:
> ❌ Date picker on the Renewals screen ignores timezone — niggle, buys time but same cliff later. ✅ ~~Duplicate submission on double-click~~ fixed.

After:
> **Renewals date picker ignores timezone.** The picker on the Renewals screen (`RenewalForm.tsx`, `renewalDate` control) stores dates in local time but the API expects UTC, so submissions near midnight can land on the wrong day. Fix: convert to UTC at the form boundary before submission.

(The double-click issue is fixed, so it is deleted, not retained.)

**Informal decision note → administration note**

Before:
> We still haven't decided whether to keep the service principal or move to managed identity — parking it for now, someone senior needs to weigh in.

After:
> **Decision required: authentication method.** The deployment currently uses a service principal. Moving to managed identity would remove the credential-rotation requirement. A decision owner has not been assigned.
