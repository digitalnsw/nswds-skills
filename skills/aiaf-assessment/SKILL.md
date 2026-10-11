---
name: aiaf-assessment
description: 'Draft a NSW AI Assessment Framework (AIAF) assessment from a plain-English description of an AI system and how it is used. By default prepares everything the user enters on the AIAF Platform (triage, use case registration and all 16 core questions, in the Platform''s order and wording) as an entry sheet; as an option, fills in the offline AIAF Excel workbook the user has requested from Digital NSW. Use whenever the user wants to complete, fill in, draft or prepare an AIAF assessment, an AIAF Platform registration or triage, a NSW AI assessment, a NSW Government AI risk assessment, or "the AI assessment spreadsheet/tool" for an AI system, product, pilot or use case.'
argument-hint: "[short description of the AI system and its use, optional]"
---

# NSW AI Assessment Framework draft

Draft an [NSW AI Assessment Framework](https://www.digital.nsw.gov.au/policy/artificial-intelligence/ai-governance-assurance-and-frameworks/nsw-ai-assessment-framework) (AIAF) assessment from a description of an AI system. You gather the facts, choose one answer for each question, and give the user either:

- **a Platform entry sheet** (the default): their triage answers, registration details and the exact option to choose for each of the 16 core questions, laid out in the order the [AIAF Platform](https://aiaf.dac.nsw.gov.au) asks for them, or
- **a filled offline workbook**: the AIAF Excel workbook, if the user has one, with every answer written in so Excel calculates the risk band, DeepDive, Risk Register and Audit Record.

You are drafting an assessment for people to review, not certifying anything. The framework expects input from subject-matter experts (business, data, privacy, security, legal and ethics), and the agency remains accountable for the result. You never sign in to the Platform, submit anything on it, or give its attestations for the user.

## Policy context

- Circular [DCS-2026-02 Use of Artificial Intelligence by NSW Government Agencies](https://arp.nsw.gov.au/dcs-2026-02-use-of-artificial-intelligence-by-nsw-government-agencies) (issued 30 July 2026) is the current policy.
- Since 30 September 2026 the AIAF Platform is mandatory for registering AI use cases and completing AIAF assessments. Agencies register every use case; the Platform's triage decides whether a full assessment is needed.
- The offline workbook is available on request (Digital NSW's AIAF page links "Request offline assessment" to govai@customerservice.nsw.gov.au). Its own instructions still refer to the superseded DCS-2024-04.
- Critical and high-risk use cases go to the NSW AI Review Committee within 5 business days of completing the AIAF.
- Use cases are re-assessed when changes to features, data, purpose or decision-making context could affect outcomes or oversight.

Check the circular and the AIAF page for changes before relying on these points, and tell the user if what you find differs.

## Tools

`scripts/aiaf.py` (standard library only) does the file work. Run it from this skill's directory or by full path:

```bash
python3 scripts/aiaf.py platform --answers answers.json                # Platform entry sheet
python3 scripts/aiaf.py questions --workbook <workbook.xlsx>           # offline workbook: every question, option and tag
python3 scripts/aiaf.py fill --workbook <workbook.xlsx> --answers answers.json --out "<completed>.xlsx"
```

`platform` needs Python 3.9 or later. `questions` and `fill` read workbook XML and need Python 3.11 or later with Expat 2.7.2 or later; they check this before doing anything. If they report an unsupported runtime, use an interpreter that meets both requirements (check with `python3 -c 'import sys; from xml.parsers import expat; print(sys.version, expat.EXPAT_VERSION)'`).

Paths are selected by the person running this local CLI. Do not expose it as a service that accepts paths from untrusted users. See [security notes](references/security.md).

References:

- [questions.md](references/questions.md): the 16 core questions (question set PROD-01) with every option, tag and description, and where each question sits on the Platform
- [platform.md](references/platform.md): the Platform's triage, registration, assessment and requirements steps.

## 1. Get the facts

Use the user's description if they gave one. Otherwise ask them to describe:

- what the AI system is and who built or supplies it (in-house, vendor, SaaS, off-the-shelf, open source, generative, agentic)
- what it is for and who it affects (staff, customers, the public, priority or vulnerable groups)
- what data it uses, especially personal, health or other sensitive information
- how autonomous it is, and what decisions or actions it drives
- where it is in its lifecycle (concept, design, development, deployment, operational, review, retirement)
- human oversight, whether outputs can be reversed, how people get errors corrected, and whether community and stakeholder impacts have been assessed.

Then ask which route they want: the Platform (the default) or the offline workbook. For the workbook route they must already have the workbook file.

Ask follow-up questions only where the answer would change a high-impact choice (data sensitivity, autonomy, who is affected, worst credible harm, oversight) and you cannot reasonably infer it. Ask a few targeted questions, then draft.

## 2. Choose an answer for every core question

Read the options from the source for the route: [questions.md](references/questions.md) for the Platform, or `questions` on the user's workbook for the offline route (the workbook is the source of truth for that route, in case its version differs). Choose the one option per question whose full text and technical and ethical descriptions best match the system, and record its tag, for example `phase:deployment`.

- Choose what is true, not the lowest-risk option. The assessment is a risk instrument, and understating risk defeats it.
- Answer for the current lifecycle phase, not a planned one.
- Where the data question allows several categories, choose the most sensitive that applies, as the question instructs.
- If you have to assume something the user did not say, choose the reasonable answer and list the assumption in your summary.
- Answer every question. Neither the Platform nor the workbook produces a result until all 16 are answered.

## 3a. Platform route

Read [platform.md](references/platform.md). Draft the triage and registration as well as the core answers:

- **Triage:** answer the three questions from the facts. For "agency-approved", use what the user knows about their agency's approved technology; the Platform has no list to check, and "Not sure" is the honest answer when they cannot confirm. If the user is assessing a product or platform itself rather than a use of it, stop: the AIAF is the wrong process (see platform.md).
- **Registration:** a plain-English title in the form [Domain] + [Use case] with no vendor names (at most 64 characters); the team; the platform (Other plus a name when it is not listed); the closest use case type from the Platform's list; and a description of at most 150 words saying what the system does, who uses it and what outcomes it achieves.

Write `answers.json`:

```json
{
  "triage": {
    "approved_tool": "Not sure",
    "purpose": "Pilot or official agency use",
    "higher_impact": "Yes"
  },
  "registration": {
    "title": "AI-assisted pull request code review",
    "team": "…",
    "platform": "Other",
    "platform_other": "GitHub Copilot",
    "use_case_type": "Quality defect detection",
    "description": "…"
  },
  "answers": {
    "Q1": "phase:operational",
    "Q2": "system:saas_tool"
  }
}
```

Include all 16 answers. Run `platform`. It checks everything at once (unknown triage options, title length, description length, use case types, missing or misplaced tags) and prints the entry sheet. Fix `answers.json` until it runs cleanly, then save the sheet as a Markdown file in the user's folder, for example `AIAF Platform entry - <title>.md`.

Look for answer combinations the Platform is likely to flag (platform.md gives an example) and draft a short, factual explanation for any that are correct, so the user has it ready.

## 3b. Offline workbook route

Write `answers.json` with the use-case details from the workbook's Instructions sheet instead of `triage` and `registration`. Leave any the user does not give blank rather than inventing them:

```json
{
  "meta": {
    "project_title": "…",
    "project_description": "…",
    "over_5m_or_drf": "NO",
    "completed_by": "…",
    "date_completed": "23/09/2026"
  },
  "answers": {
    "Q1": "phase:deployment",
    "Q2": "system:saas_tool"
  }
}
```

`over_5m_or_drf` is `YES` or `NO`: whether the project is valued at over $5 million (estimated total cost) or funded by the Digital Restart Fund. The date is dd/mm/yyyy.

Run `fill`, writing to a new file such as `AIAF Assessment - <project title>.xlsx` in the user's folder. The user's workbook is not changed. `fill` finds each answer cell from the workbook's own dropdowns, writes the exact option text, fills the use-case details and sets the workbook to recalculate when opened. It changes nothing else. It checks every answer first and lists all the problems at once. If the workbook's structure has changed, it stops and says what it could not find; do not work around that by hand-editing cells.

## 4. Return the draft

Give the user the entry sheet or completed workbook (send the file if your agent can; otherwise give its path) and a short summary:

- the option you chose for each question, in words rather than tags, with a one-line reason
- every assumption you made
- any question where you were unsure and they should check with a subject-matter expert.

For the Platform route, tell them:

- sign in to the AIAF Platform, run triage, register the use case and enter the answers from the sheet; the Platform shows the risk band and saves as they go
- the Platform asks them to confirm the assessment reflects their use case and to give their name and role; that confirmation is theirs to give
- after submission the Platform lists the governance requirements to acknowledge. If they want help with the "how will this be addressed" notes, ask them for the list the Platform shows.

For the offline route, tell them:

- open the workbook in Microsoft Excel to see the risk band and required assurance actions. It recalculates on open; other spreadsheet apps may not calculate it correctly.
- work through the DeepDive and Audit Record tabs, and settle the Assessment answers before starting the DeepDive (the workbook warns against changing them afterwards)
- the AIAF Platform is the mandatory route for registering use cases, so they should still register this one there.

For both: this is a draft for their subject-matter experts to validate; refer high or critical results to the AI Review Committee within 5 business days; and keep the completed assessment in their agency's records system.

Do not calculate or state the risk band yourself. Only the Platform's or Excel's calculation is authoritative.
