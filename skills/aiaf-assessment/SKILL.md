---
name: aiaf-assessment
description: Draft a NSW AI Assessment Framework (AIAF) assessment by filling in the official AIAF Excel workbook from a plain-English description of an AI system and how it is used, then return the completed .xlsx for review. Use whenever the user wants to complete, fill in, draft or prepare an AIAF assessment, a NSW AI assessment, a NSW Government AI risk assessment, or "the AI assessment spreadsheet/tool" for an AI system, product, pilot or use case. Downloads the current workbook from Digital NSW, reads its questions and options from the workbook itself, chooses the best answer for each question, and writes them in so Excel calculates the risk band, DeepDive, Risk Register and Audit Record.
argument-hint: "[short description of the AI system and its use, optional]"
---

# NSW AI Assessment Framework draft

Fill in the [NSW AI Assessment Framework](https://www.digital.nsw.gov.au/policy/artificial-intelligence/ai-governance-assurance-and-frameworks/nsw-ai-assessment-framework) (AIAF) Excel workbook from a description of an AI system. You gather the facts, choose one answer for each question, write the answers into the official workbook and return the file. Excel then calculates the ethical principle scores, risk band, DeepDive focus questions, Risk Register and Audit Record.

You are drafting an assessment for people to review, not certifying anything. The framework expects input from subject-matter experts (business, data, privacy, security, legal and ethics), and the agency remains accountable for the result.

## Policy context

Circular [DCS-2026-02 Use of Artificial Intelligence by NSW Government Agencies](https://arp.nsw.gov.au/dcs-2026-02-use-of-artificial-intelligence-by-nsw-government-agencies) (issued 30 July 2026) replaced DCS-2024-04. The workbook's own instructions still refer to DCS-2024-04. Under DCS-2026-02:

- agencies must register every AI use case through the AIAF Platform, which is being rolled out
- until the platform is fully adopted, agencies must keep using the AIAF Excel assessment, which is what this skill fills in
- critical and high-risk use cases must be referred to the NSW AI Review Committee within 5 business days of completing the AIAF
- use cases must be re-assessed when changes to risk, context or functionality could affect outcomes or oversight.

Check the circular and the AIAF page for changes before relying on these points, and tell the user if what you find differs.

## Tools

`scripts/aiaf.py` (Python 3.8 or later, standard library only) does the file work. Run it from this skill's directory or by full path:

```bash
python3 scripts/aiaf.py download --dir <folder>                      # current official workbook
python3 scripts/aiaf.py questions --workbook <workbook.xlsx>          # every question, option and tag
python3 scripts/aiaf.py fill --workbook <workbook.xlsx> --answers answers.json --out "<completed>.xlsx"
```

The workbook is the single source of truth. `questions` reads the questions, answer options, tags and each option's technical and ethical description from the workbook's hidden Questions sheet. `fill` finds each answer cell from the workbook's own dropdowns, so a new version of the workbook works as long as its structure is the same. If the structure has changed, the script stops and says what it could not find. Do not work around that by hand-editing cells.

## 1. Get the facts

Use the user's description if they gave one. Otherwise ask them to describe:

- what the AI system is and who built or supplies it (in-house, vendor, SaaS, off-the-shelf, open source, generative, agentic)
- what it is for and who it affects (staff, customers, the public, priority or vulnerable groups)
- what data it uses, especially personal, health or other sensitive information
- how autonomous it is, and what decisions or actions it drives
- where it is in its lifecycle (concept, design, development, deployment, operational, review, retirement)
- human oversight, whether outputs can be reversed, how people get errors corrected, and whether community and stakeholder impacts have been assessed.

Also ask for the use-case details on the workbook's Instructions sheet. Leave any the user does not give blank rather than inventing them:

- project title
- project description (1 to 3 sentences)
- whether the project is valued at over $5 million (estimated total cost) or funded by the Digital Restart Fund: `YES` or `NO`
- who is completing the assessment
- the date completed, as dd/mm/yyyy.

Ask follow-up questions only where the answer would change a high-impact choice (data sensitivity, autonomy, who is affected, worst credible harm, oversight) and you cannot reasonably infer it. Ask a few targeted questions, then draft.

## 2. Get the current workbook

Run `download` into the user's working folder (or a folder they name). It finds the Excel download on the Digital NSW AIAF page, saves it under its published file name and checks it can be read. If the user has their own copy, or the download fails, use theirs and say which file you used.

## 3. Choose an answer for every question

Run `questions` and read all of it. Choose the one option per question whose full text and technical and ethical descriptions best match the system. Record the option's tag, for example `phase:deployment`.

- Choose what is true, not the lowest-risk option. The workbook is a risk instrument, and understating risk defeats it.
- Answer for the current lifecycle phase, not a planned one.
- Where the data question allows several categories, choose the most sensitive that applies, as the question instructs.
- If you have to assume something the user did not say, choose the reasonable answer and list the assumption in your summary.
- Answer every question. The workbook only calculates results when all of them are answered.

## 4. Fill the workbook

Write `answers.json` in a temporary or working folder:

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

Include every question the `questions` command lists (Q1 to Q16 in the current workbook). Then run `fill`, writing to a new file such as `AIAF Assessment - <project title>.xlsx` in the user's folder. The downloaded workbook is not changed.

`fill` writes the exact option text from the workbook into each answer cell, fills the use-case details and sets the workbook to recalculate when opened. It changes nothing else. It checks every answer before writing and lists all the problems at once (a missing answer, an unknown tag, a tag from another question, a date that is not dd/mm/yyyy). Fix `answers.json` and run it again.

## 5. Return the draft

Give the user the completed workbook (send the file if your agent can; otherwise give its path) and a short summary:

- the option you chose for each question, in words rather than tags, with a one-line reason
- every assumption you made
- any question where you were unsure and they should check with a subject-matter expert.

Tell them:

- open the workbook in Microsoft Excel to see the risk band and required assurance actions. It recalculates on open; other spreadsheet apps may not calculate it correctly.
- work through the DeepDive and Audit Record tabs, and settle the Assessment answers before starting the DeepDive (the workbook warns against changing them afterwards)
- this is a draft for their subject-matter experts to validate
- register the use case through the AIAF Platform when their agency has access to it, refer high or critical results to the AI Review Committee within 5 business days, and store the completed workbook in their agency's records system.

Do not calculate or state the risk band yourself. Only Excel's calculation of the workbook is authoritative.
