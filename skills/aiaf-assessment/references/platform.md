# AIAF Platform

The [AIAF Platform](https://aiaf.dac.nsw.gov.au) is where NSW Government agencies register AI use cases and complete AIAF assessments. Since 30 September 2026 it is the mandatory route for all new registrations and assessments. Access is by NSW Government sign-in; new users request access from the sign-in page.

This page describes the Platform's flow so a draft can be prepared before the user signs in. `scripts/aiaf.py platform` turns a drafted `answers.json` into an entry sheet that follows this flow.

## Flow

1. Triage
2. Register the use case
3. Assessment (the 16 core questions)
4. Outcome and requirements
5. Deep dive and risks (optional)

The Platform records each step against the signed-in user in the AIAF audit trail. Agency, business owner and owner email come from the user's sign-in.

## 1. Triage

Triage decides the pathway: the full AIAF, another assurance process, or no further action. Whatever the result, the Platform asks for the use case to be registered so it is part of the audit trail.

A gateway step comes first. The AIAF assesses how AI will be used, not the AI product or platform on its own. If the user is assessing a product, platform or tool itself (for example, deciding whether to buy or approve it), the AIAF is the wrong process; they use their agency's procurement, cyber security, privacy or technical assurance process instead.

Then three mandatory questions. Where more than one option applies, choose the one with the greatest potential impact.

| Question | Options |
| --- | --- |
| Will this use case use an agency-approved AI platform, product or tool? | Yes (the agency provides it or it is on an approved technology list) · No (personal, public, free or trial account, or used without agency approval) · Not sure |
| What are you using AI for? | Personal, non-agency use · Individual work productivity · Controlled experiment or prototype · Pilot or official agency use · Assessing the product or platform itself · Not sure |
| Does this use involve higher-impact activity or information? | Yes · No · Not sure |

The first answer only decides whether the low-impact "AIAF not required" pathway can apply. The Platform does not hold a list of approved tools, so the user has to know their agency's position; if they do not, the answer is "Not sure".

"Higher-impact" means any of: organisational, sensitive or personal data; output another person may rely on; influence on a decision about a person or organisation; official or public-facing content; changing or automating a business process; real operational data or a live agency system; interaction with external users; or code that may be deployed, triggers an action in a system or acts autonomously.

A result of "Full AIAF" leads to registration and then the 16 core questions.

## 2. Register the use case

| Field | Rules |
| --- | --- |
| Use case title | Plain English, in the form [Domain] + [Use case]. No vendor names or jargon. At most 64 characters. |
| Team | Free text. |
| Platform | Azure OpenAI, Custom model service, Microsoft 365 Copilot, Salesforce Einstein, or Other. Other asks the user to name the platform. |
| Use case type | One of the Platform's fixed list (`USE_CASE_TYPES` in `scripts/aiaf.py`). There is no coding option; pick the closest type or Other. |
| Description | At most 150 words, plain English, written for a reader who is not a data science team. Describe what the system does, who uses it, and what outcomes it achieves, in that order. |

Registration opens the assessment straight away. Registered use cases appear in the Platform's use case directory, which every signed-in user can browse, with the business owner's name and email.

## 3. Assessment

The 16 core questions, their options and the Platform's section order are in [questions.md](questions.md). All 16 are required. Answers save automatically and the indicative risk band updates as the user answers.

Once all 16 are answered, the Platform may list answer combinations worth reviewing, for example "low impact with continuous oversight may indicate over-engineering or a misunderstood impact classification" (Q8 Low with Q10 Continuous). These do not block submission. The user either changes an answer or explains why the combination is correct; the explanation is recorded with the assessment.

Submitting opens a confirmation showing the risk band and any flagged combinations. The user must tick "Yes, I confirm this accurately reflects my use case" and give their name and role. That attestation is the user's own; an agent must not give it for them.

## 4. Outcome and requirements

After submission the Platform lists the governance requirements the answers trigger, grouped as mandatory, compliance, recommended and ethics (for example cyber compliance, procurement, cloud hosting, privacy laws, the NSW AI Ethics Principles, legal compliance and transparency). The set depends on the answers; do not predict it.

The user ticks each requirement to confirm it has been considered, and can add a note on how it will be addressed. All must be acknowledged before the assessment is finalised and its report generated. The assessment can be left as a draft and finished later from Assessments.
