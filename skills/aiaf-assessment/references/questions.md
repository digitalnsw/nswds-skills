# AIAF core questions (question set PROD-01)

The 16 core AIAF questions, with every answer option, its tag, and its technical and ethical descriptions. The AIAF Platform and the offline AIAF workbook use the same questions and the same option wording. The block below is the output of `python3 scripts/aiaf.py questions` for the PROD-01 workbook. Its tests check it against a workbook when `AIAF_WORKBOOK` is set.

## Where each question sits on the Platform

The Platform groups the questions into four sections, in this order:

| Platform section | Questions |
| --- | --- |
| System context | Q1, Q2, Q3, Q16 |
| Data & deployment | Q4, Q5, Q6 |
| Risk & impact | Q7, Q8, Q9, Q11, Q12 |
| Governance & oversight | Q10, Q13, Q14, Q15 |

The Platform shows each option's ethical description as an "Ethical consideration" once the option is chosen.

## Platform wording

Options are worded the same in both, apart from punctuation (the Platform's Q4 "Operational or Organisational Data" option uses an em dash where the workbook text has a hyphen). Some question titles differ:

| Question | Platform title |
| --- | --- |
| Q2 | What type of AI System are you assessing? |
| Q4 | Which of the following best describes the data your system primarily uses? (If multiple apply, select the category with the highest sensitivity or risk) |
| Q9 | What level of autonomy does the system operate at? |
| Q10 | What level of human oversight or governance is applied to system's decisions and behaviour? |
| Q12 | What is the potential impact of a failure or error by the AI system? |

The entry sheet from `scripts/aiaf.py platform` uses these titles.

## Questions and options

The `(E3)` after each question is its answer cell in the workbook. Tags are what `answers.json` uses; on the Platform, choose the option whose text matches.

```text
AIAF workbook (question set PROD-01): 16 questions. Choose one tag per question.

Q1 (E3): What phase of the system lifecycle are you assessing?
  phase:concept: Concept - Idea only. No design or build work yet.
      technical: The system is still being planned or explored. No development work has started.
      ethical: Early planning must weigh whether AI use is necessary, whether benefits outweigh risks, and whether the concept aligns with community values and rights.
  phase:design: Design - Features, data, and architecture defined. Not built.
      technical: The system’s technical architecture, features, and data requirements are being defined, but it hasn't been built yet.
      ethical: Design choices must anticipate fairness, privacy, and safety risks before build, embedding ethics into system architecture.
  phase:development: Development - Being built, trained, or configured. Not live.
      technical: The system is currently being built, trained, or configured. It is not yet in live use.
      ethical: Development must avoid embedding bias, respect data rights, and ensure transparency in how models are trained.
  phase:deployment: Deployment - Rolling out to live. May be a pilot.
      technical: The system is being rolled out into a live environment but may still be in testing or pilot mode.
      ethical: Pilots and rollouts must include safeguards, clear accountability, and protections for affected users, especially vulnerable groups.
  phase:operational: Operational - Live and used day to day.
      technical: The system is live and in regular use. It is supporting or delivering real-world activities.
      ethical: Ongoing use requires transparency, monitoring for harms, and accountability for AI-influenced outcomes.
  phase:review: Review - Being evaluated for performance, risk, or compliance.
      technical: The system is stable and operational, and ongoing support, maintenance, or performance monitoring is in place.
      ethical: Reviews must assess unintended consequences, fairness across communities, and respect for human rights in ongoing operation.
  phase:retirement: Retirement or replacement - Being phased out and removed.
      technical: The system is being phased out or retired. It is no longer in active use or is being dismantled.
      ethical: System decommissioning must ensure safe handling of data, continuity of services, and accountability for past impacts.

Q2 (E4): Which best describes the AI system being assessed?
  system:saas_tool: SaaS AI Tool (Commercial off-the-shelf SaaS offering)
      technical: A third-party AI tool delivered as a subscription service (e.g. ChatGPT, Copilot). You use it via the cloud and have no control over the model’s internals.
      ethical: Cloud-based tools raise risks around privacy, data sovereignty, and accountability for vendor-controlled models.
  system:off_the_shelf: Off-the-Shelf AI Product (Standalone AI implemented internally)
      technical: A complete AI product you’ve purchased and deployed in your own environment. You didn’t build it, but you run and manage it yourself.
      ethical: Deployment must ensure compliance with local laws, fairness safeguards, and responsible data use even when internal teams did not design the model.
  system:internal_dev: Internally Developed AI System (Built and maintained by your organisation)
      technical: An AI system that your team has designed, built, and maintains. You have full control over the model and its training data.
      ethical: Full control creates full responsibility — ethical risks must be addressed in design, data selection, training, and ongoing monitoring.
  system:vendor_custom: AI System Built by External Vendor (Customised for your organisation)
      technical: A vendor developed this AI specifically for your needs. It may be hosted by you or the vendor, but it's not a generic off-the-shelf tool.
      ethical: Vendor contracts must include safeguards for transparency, accountability, and equitable outcomes, avoiding “black-box” reliance.
  system:embedded_component: Embedded AI Component (Integrated into a larger, non-AI system)
      technical: AI is used as a feature inside a broader system (e.g. analytics in a CRM or fraud detection in a transaction engine). It’s not a standalone tool.
      ethical: Hidden AI features must still respect rights, explainability, and fairness, even when they are only part of a bigger system.
  system:multi_ai_ecosystem: Part of a Multi-System AI Ecosystem (Multiple AI systems working together)
      technical: The system is one of several AI components that interact or coordinate, possibly across different tools or platforms.
      ethical: Interacting AI systems can amplify harms; oversight must address accountability, interoperability, and systemic bias.
  system:genai: Generative AI Model (Custom or fine-tuned generative AI system)
      technical: An AI model that creates content  text, images, audio, etc.  and has been custom trained or fine-tuned for your use case.
      ethical: Content creation carries risks of misinformation, bias, cultural harm, and misuse that require human oversight and safeguards.
  system:research_use: Research or Experimental Use AI System (Used for trials, pilots, or exploratory purposes)
      technical: A prototype or pilot AI being used for research, testing, or experimentation. It’s not yet a mature or production system.
      ethical: Trials must minimise risks to participants, avoid unfair impacts, and ensure informed consent where people are involved.
  system:open_source_internal: Open-Source Model Implemented Internally (Adapted from publicly available open-source models)
      technical: A publicly available AI model (e.g. LLaMA, Whisper) that you’ve installed and are running in your own environment.
      ethical: Adapting open-source models requires careful review of training data ethics, licensing obligations, and potential bias inheritances.
  system:lowcode_tool: No-Code or Low-Code AI Development Tool (Configured internally using visual interfaces)
      technical: AI functionality has been created using a visual platform (e.g. Power Automate, Vertex AI) without writing much or any code.
      ethical: Ease of use must not bypass accountability — teams must still assess bias, privacy, and ethical risks.
  system:agentic: Agentic AI System (Automated system making decisions and acting independently to achieve goals)
      technical: A system that can make decisions and take actions on its own to pursue goals, often by coordinating multiple tools or agents.
      ethical: Autonomy raises risks to human rights, safety, and accountability; strict boundaries and human override are essential.

Q3 (E5): What is the main purpose of the AI system?
  use:internal_ops: Improving internal efficiency or operations (streamlining processes and reducing workload) without influencing decisions.
      technical: The AI is used to make internal processes faster, cheaper, or less manual  for example, optimising scheduling or automating reporting.
      ethical: Even internal automation must uphold fairness in workload distribution and transparency about impacts on staff roles and responsibilities.
  use:customer_facing: Enhance or personalise customer-facing services or interactions (Deliver tailored services or improved user experiences)
      technical: The AI tailors services, content, or responses to individual users or customers  improving engagement or satisfaction (e.g. chatbots, tailored recommendations).
      ethical: Personalisation must respect user autonomy, avoid manipulation, and ensure equitable access to services across all groups.
  use:decision_support: Provide insights or analytical decision support (Enable evidence-based decisions through data analysis)
      technical: The AI analyses data and helps users understand trends, risks, or outcomes to support more informed decisions  without making those decisions itself.
      ethical: Decision support tools must be transparent about limitations and biases in the data so users can make informed and accountable choices.
  use:automation: Automate tasks, processes or physical operations (AI replaces or controls established digital workflows or physical activities without human input
      technical: The AI replaces manual steps with automated ones, such as classifying documents, flagging issues, performing routine tasks, or controlling physical systems like vehicles or equipment.
      ethical: Automation must safeguard against harm, ensure accountability for outcomes, and preserve human oversight where safety or rights are affected.
  use:content_generation: Create or generate original outputs (Produce text, images, code, or other creative content)
      technical: The AI generates new content, such as writing reports, producing images, composing emails, or generating software code.
      ethical: Generated content must respect intellectual property, cultural integrity, and avoid producing misleading or harmful outputs.
  use:human_augmentation: Assist or augment human decision-making processes (Support human choices without replacing them)
      technical: The AI supports people in making complex decisions by offering options, evaluations, or simulations  without taking over the final decision.
      ethical: Augmentation must strengthen human accountability, respect autonomy, and avoid undue influence that undermines free and fair decision-making.
  use:exploratory_agentic: Explore new ideas or opportunities autonomously (AI can pursue novel paths or generate new directions in research, innovation, or policy)
      technical: The AI can initiate novel directions in research, innovation, or strategy  for example, suggesting new policies, experiments, or business models on its own.
      ethical: Autonomous exploration must be bounded by human values and oversight to prevent unintended ethical, legal, or societal harms.

Q4 (E6): Which of the following best describes the primary data your system collects, uses, discloses, or stores?
  data:personal_sensitive: May contain Personal or Sensitive Personal Information (includes PII, health, biometric data, or other sensitive identifiers; even if embedded in operational records)
      technical: Data that identifies individuals or includes sensitive attributes such as health records, ID numbers, or biometrics.
      ethical: Handling personal or sensitive data raises privacy and autonomy concerns. Strong safeguards and minimisation are required to respect rights and prevent harm.
  data:internal_structured: Operational or Organisational Data (finance, HR, logistics, administrative records - may include incidental personal details such as names or roles, but not primarily sensitive)
      technical: Structured business data such as budgets, HR records, rosters, payroll, or performance metrics, which may include limited personal details.
      ethical: Even non-sensitive business data can create fairness and accountability issues if misused, misinterpreted, or repurposed without transparency.
  data:iot_sensor: Machine-Generated or Sensor Data (measurements, telemetry, device outputs - may sometimes include identifiers like device IDs or user-linked logs)
      technical: Data from sensors or automated devices such as telemetry, IoT logs, temperature readings, or camera footage.
      ethical: Telemetry and sensor data may indirectly identify people or environments; ethical use requires caution about surveillance, consent, and secondary harms.
  data:synthetic: Synthetic Data (artificially generated datasets designed to mimic real-world patterns without using the original data directly)
      technical: Artificially created datasets that simulate real-world data, often used for training, testing, or to avoid sensitive sources.
      ethical: While reducing privacy risks, synthetic data must be generated and validated responsibly to avoid embedding bias or creating misleading results.
  data:deidentified: Anonymised or De-identified Data (datasets where personal identifiers have been modified or removed)
      technical: Datasets that once related to individuals but have had identifiers removed or masked to lower privacy risk.
      ethical: De-identification reduces risk but is not foolproof; ethical use requires transparency about limits and avoiding re-identification risks.
  data:broad_access: Mixed or Unclassified Data (datasets containing a blend of personal, operational, sensor, or public data, maybe dynamically curated or uploaded into the AI system by users)
      technical: Blends of personal, operational, sensor, or public data, often dynamically curated or uploaded into the AI by users.
      ethical: Blended datasets can obscure risk; ethical responsibility requires clear governance, classification, and protection of the most sensitive elements.
  data:public: Open or Publicly Available Data (published datasets or information accessible without restriction - may overlap with operational or anonymised data that has been released publicly)
      technical: Information openly accessible, such as government websites, public datasets, social media, or published reports.
      ethical: Public data is not ethically “risk-free.” Use must still respect consent, context, and potential harms from repurposing or re-identifying individuals.

Q5 (E7): How is the AI system deployed within your organisation’s environment?
  deploy:vendor_saas: Vendor-Hosted SaaS (Managed by vendor on their infrastructure)
      technical: The system is delivered as a cloud-based service by an external provider (e.g. OpenAI, Microsoft, Google). You use it via the internet, and the vendor manages everything.
      ethical: Vendor-hosted systems raise issues of accountability, data sovereignty, and trust — organisations must ensure contractual safeguards for privacy, fairness, and security.
  deploy:external_hosted: Externally Hosted by Third-Party Provider (Hosted on third-party infrastructure but managed internally)
      technical: The system runs on a third-party cloud provider (e.g. AWS, Azure), but your organisation manages and controls it.
      ethical: External hosting requires ethical oversight of data handling and cross-border risks, ensuring internal governance is not diluted by reliance on third parties.
  deploy:hybrid: Hybrid Deployment (Mix of internal infrastructure and external cloud hosting)
      technical: The system runs across both internal servers and external cloud platforms. Some components may be hosted externally, while others are managed in-house.
      ethical: Hybrid hosting creates complex accountability chains; ethical use requires clarity on which party is responsible for safeguarding data, rights, and compliance.
  deploy:on_prem: Internally Hosted (Fully managed under organisational/government standards)
      technical: The entire system is hosted and managed on infrastructure controlled by your organisation, in accordance with required cyber security standards.
      ethical: Full internal hosting increases ethical responsibility — the organisation must ensure strong privacy, fairness, and oversight practices without relying on external controls.
  deploy:edge: Edge Deployment (Runs locally on distributed devices outside centralised infrastructure)
      technical: The system operates on local or distributed hardware such as mobile phones, sensors,  IoT devices or physical Robots  not in a central data centre or cloud.
      ethical: Edge systems raise unique risks to safety, consent, and oversight, especially when devices act autonomously in public or private spaces.

Q6 (E8): Who determines or controls the system’s logic or learning behaviour?
  logic:internal: Internal Developers (Designed and maintained internally)
      technical: Your team designed the system and controls how it works  including the logic, rules, or training methods.
      ethical: Full internal control creates direct ethical responsibility — design choices, training data, and updates must safeguard fairness, transparency, and accountability.
  logic:vendor: External Vendor (AI system from vendor)
      technical: A vendor built the system. They determined how it works and may still manage updates or behaviour.
      ethical: Vendor-controlled logic requires scrutiny of transparency, accountability, and contractual safeguards to ensure the system aligns with public values and legal obligations.
  logic:foundation_model: Derived from an External Foundation Model (Based on third-party foundational models such as GPT or Claude)
      technical: The system is based on a large, pre-trained model from a third party (e.g. OpenAI, Anthropic). You may have fine-tuned it, but the core logic isn’t yours.
      ethical: Reliance on third-party foundation models carries ethical risks of inherited bias, opacity, and misalignment — organisations must apply oversight and mitigation when adapting them.
  logic:open_source: Open-Source Community Model (Maintained by external contributors)
      technical: The system is built from a publicly available model maintained by an open-source community. You’ve implemented it internally but don’t control how it was trained.
      ethical: Open-source models may lack clear accountability for training practices; ethical use requires careful validation, monitoring, and governance over adoption.
  logic:end_user_config: End User or Customer (Configured via no-code/low-code platform)
      technical: The logic or behaviour is defined by the person using it  often via visual tools or form-based settings, not code.
      ethical: Delegating control to end users risks inconsistent or unsafe behaviour; guardrails are needed to prevent unethical outcomes or misuse.
  logic:self_learning: Automatic Self-Learning System (Adapts without reprogramming)
      technical: The system can learn and change its behaviour based on new data, without human intervention or reprogramming.
      ethical: Autonomous adaptation raises risks of unpredictable or harmful behaviour — human oversight and clear boundaries are essential to uphold safety and rights.
  logic:hybrid_config: Hybrid or Mixed Learning Configuration (Combines internal, external, and/or self-learning)
      technical: The system combines more than one of the above  for example, a vendor-built base that continues to adapt internally or uses end-user configuration.
      ethical: Hybrid control can blur accountability; ethical governance requires clarity on which party is responsible for risks, updates, and outcomes.

Q7 (E9): What types of decisions are influenced or made by the AI system?
  decision:informational: Provides Information or Data Only (No recommendations or actions. Purely informational.)
      technical: The system displays data such as dashboards, metrics, or reports. It does not interpret the data, personalise it, or suggest actions.
      ethical: While informational, data presentation can still embed bias or mislead if incomplete — ethical use requires accuracy, neutrality, and transparency.
  decision:recommendation: Offers Low-Impact Suggestions (Non-consequential recommendations such as spelling/grammar check, formatting, search ranking. Easily reversible, negligible impact.)
      technical: The system provides minor, easily reversible prompts such as spelling or grammar corrections, formatting suggestions, or search result rankings. These do not materially affect decisions or outcomes.
      ethical: Low-impact suggestions may seem trivial but can normalise reliance on AI; ethical use requires avoiding manipulation or hidden influence over user choices.
  decision:personalised: Provides General Insights or Contextual Recommendations (High-level interpretations where human discretion is expected, e.g. trend analysis, customer feedback summaries.)
      technical: The system interprets data and presents high-level insights, trends, or risk ratings. These are intended to inform but not direct decision-making, with final judgement left to the human user.
      ethical: Insights shape human judgement; ethical practice requires transparency about data sources, assumptions, and biases to support fair and accountable decisions.
  decision:suggestive: Suggests Specific Actions with Potential Consequences (Actionable guidance likely to shape decisions or behaviour, e.g. medical triage prompts, legal risk flags, financial advice.)
      technical: The system generates strong, actionable recommendations likely to shape decisions or behaviour. Examples include medical triage prompts, legal risk alerts, or operational step-by-step guidance.
      ethical: Consequential recommendations raise risks to rights, fairness, and wellbeing — strong safeguards, accountability, and human oversight are essential.
  decision:autonomous: Makes Autonomous Decisions (Executes without human approval; may be irreversible.)
      technical: The system executes actions without human approval. Its decisions may directly affect people, services, or resources — for example, approving applications, adjusting system controls, or issuing automated responses.
      ethical: Autonomy without human approval raises the highest ethical risks to rights, safety, and accountability. Strict governance, oversight, and contestability mechanisms are mandatory.

Q8 (E10): What is the worst credible harm to people or rights?
  impact:low: Low - Minimal impact (Minor inconvenience; reversible and low-risk)
      technical: Minor annoyance or inconvenience. No objective harm. Easily corrected.
      ethical: Even minor inconvenience can erode trust. Ethical use requires transparency and mechanisms to quickly correct errors.
  impact:moderate: Moderate - Noticeable but manageable (Reversible or containable)
      technical: Noticeable harm or disadvantage, such as delays or misinformation. Reversible with effort; may need staff support.
      ethical: Manageable harms still carry fairness and accountability duties. Systems must provide redress pathways and ensure affected people are supported.
  impact:high: High - Significant consequences (May be irreversible or hard to mitigate)
      technical: Significant harm, e.g. unfair treatment, loss of opportunity, financial loss, or privacy breach. Hard to correct; escalation likely.
      ethical: Significant harms engage core ethical principles of fairness, rights, and privacy. Strong governance, SME oversight, and escalation processes are required.
  impact:very_high: Very High - Serious or compounding harm (Safety risks, rights violations)
      technical: Safety risk or rights violation. Harm may be irreversible or compounding. Urgent intervention required.
      ethical: Risks to safety or rights demand the highest ethical scrutiny. Deployment is only justifiable with robust safeguards, human oversight, and urgent redress mechanisms.

Q9 (E11): To what extent does the AI system operate without human intervention?
  autonomy:static: No learning or adaptation. Same behaviour every time.
      technical: The system follows a fixed set of rules or logic. It doesn’t change or learn from experience  it always behaves the same way.
      ethical: Fixed-rule systems reduce unpredictability but still require transparency and accountability for how rules are set and enforced.
  autonomy:human_loop: People approve important actions.
      technical: The system helps inform decisions, but humans are always responsible for approving important actions or outcomes.
      ethical: Human-in-the-loop preserves accountability, but ethical safeguards must ensure people remain informed and not over-reliant on AI outputs.
  autonomy:managed: Acts on its own within strict limits. No self-learning.
      technical: The system can act on its own for certain tasks, but only within pre-defined boundaries or rules set by humans.
      ethical: Bounded autonomy must include clear limits, monitoring, and override mechanisms to ensure actions remain ethical and aligned with intent.
  autonomy:adaptive: Acts on its own and learns or adjusts over time.
      technical: The system changes how it behaves based on new data or experience  it improves or evolves over time without being explicitly reprogrammed.
      ethical: Self-learning introduces unpredictability and potential bias drift — ethical use requires continuous oversight, testing, and redress mechanisms.
  autonomy:agentic_self: Multiple AIs plan and act with limited or no human oversight.
      technical: The system is capable of setting its own goals, making plans, and taking action without being told exactly what to do like a self-directed agent.
      ethical: Agentic autonomy carries the highest ethical risk to safety, rights, and accountability. Strict governance, human override, and legal guardrails are mandatory.

Q10 (E12): What level of human oversight or governance is applied to system decisions and behaviour?
  oversight:continuous: Continuous (All significant decisions reviewed or approved by humans)
      technical: Humans are directly involved at all critical stages. Every key output or system action is reviewed, approved, or shaped by a person before being finalised.
      ethical: Strong human-in-the-loop oversight protects rights and accountability, but must avoid tokenistic review that undermines genuine responsibility.
  oversight:regular: Regular (Periodic review or sampling of outputs and behaviours)
      technical: The system runs without constant oversight, but its behaviour and outputs are regularly checked  for example, through audits or review cycles.
      ethical: Periodic checks reduce workload but risk missing harms between reviews; ethical governance requires robust sampling, audit trails, and escalation pathways.
  oversight:exception_only: Exception-Based (Humans review only anomalies or breaches)
      technical: Humans only intervene if something goes wrong  like an unusual output or system crossing a risk threshold. Otherwise, the system operates independently.
      ethical: Relying on exceptions assumes risks can be reliably detected — ethical safeguards must ensure anomalies are defined, monitored, and acted on effectively.
  oversight:none: None (No structured oversight during operation)
      technical: There is no routine or structured human involvement once the system is running  outputs and actions are not formally reviewed or monitored.
      ethical: Absence of oversight creates high ethical risk; without human accountability, harms may go undetected and unremedied. This requires justification and compensating safeguards.

Q11 (E13): Which stakeholder group is primarily impacted by the system’s outputs or actions?
  stakeholder:internal_only: Internal Staff Only (Affects only internal users)
      technical: Only employees or authorised internal personnel interact with the system or are affected by what it produces.
      ethical: Even internal use must uphold fairness, avoid undue monitoring, and ensure transparency about impacts on staff rights and roles.
  stakeholder:external: External Users or Customers (External individuals interact directly)
      technical: The system is used by or impacts people outside your organisation  such as customers, clients, or partners.
      ethical: External-facing systems carry ethical duties of fairness, accessibility, and respect for autonomy in all customer interactions.
  stakeholder:vulnerable_group: Priority or Vulnerable Community (Groups with heightened risk, e.g. children, CALD, disability)
      technical: The system interacts with or may affect individuals who face greater harm from errors, bias, or exclusion. This includes those with legal, social, or accessibility vulnerabilities.
      ethical: Impacts on vulnerable groups require heightened ethical scrutiny to prevent discrimination, exclusion, or harm, with inclusive design and safeguards built in.
  stakeholder:public: General Public (Broad impact, including unaware users)
      technical: The system is visible or impactful to the general public, including in ways that aren’t always obvious  such as automated moderation, surveillance, or public-facing algorithms.
      ethical: Broad societal impacts raise issues of transparency, trust, and accountability — systems must avoid hidden harms or unfair burdens on communities.
  stakeholder:agentic_public: Autonomous-to-Public Interaction (System initiates public interactions without prompting)
      technical: The system takes action on its own to engage external systems without a person initiating it.
      ethical: Systems that engage the public without prompting pose elevated risks to rights and safety, requiring strict oversight, safeguards, and redress mechanisms.

Q12 (E14): What is the potential operational impact if the system fails?
  failure:minor: Minor - Small service disruption. Easy fix.
      technical: Small service disruption. Example: typo in a report or a missed non-critical notification. No customer impact. Fixed quickly.
      ethical: Even minor errors can reduce confidence in government services; transparency and prompt correction are essential to maintain trust.
  failure:moderate: Moderate - Service degradation or delays. Staff intervention required.
      technical: Noticeable degradation or short outage. Some users or functions affected. Staff intervention required. No lasting effects.
      ethical: Moderate failures create fairness risks if some users are disproportionately affected; ethical duty requires timely support and equitable recovery.
  failure:severe: Major - Significant outage, data loss, or financial cost. Complex recovery.
      technical: Significant outage, data loss, or large backlog. Key services affected. Recovery is complex and time-consuming. Financial cost likely.
      ethical: Major failures risk harm to rights, privacy, or livelihoods; ethical responsibility requires accountability, remediation, and prevention of recurrence.
  failure:critical: Critical - System-wide failure or compliance breach. Irreversible or cascading effects.
      technical: System-wide failure or major data corruption. Risk of compliance breach. Recovery is uncertain or requires rebuild. Cascading impacts on dependent systems.
      ethical: Critical failures can cause systemic harm or rights violations; the highest ethical duty applies — rapid intervention, accountability, and redress are mandatory.

Q13 (E15): Are decisions or outputs from the system reversible or correctable?
  reversal:easy: Yes, Easily and immediately reversible (Corrected without delay, harm, or cost)
      technical: Mistakes can be quickly undone or corrected without causing harm, delays, or cost. The system’s outputs are low-risk and easily rolled back.
      ethical: Low-risk reversibility still requires transparency and accountability to ensure trust in correction processes.
  reversal:moderate: Yes, Reversible with effort or cost (Correction possible but requires time or resources)
      technical: Errors can be fixed, but it takes effort  such as redoing work, restoring data, or explaining issues to affected users.
      ethical: Corrective actions that consume time or resources raise fairness and accountability issues; ethical use requires support for those impacted.
  reversal:hard: Yes, but difficult or impractical to reverse (High effort or wide-reaching effects)
      technical: Reversing an error is possible but very disruptive  it might involve technical rollbacks, internal escalation, or coordination across systems or teams.
      ethical: When reversal is burdensome, errors can cause compounding harm; ethical responsibility requires prevention, monitoring, and escalation pathways.
  reversal:irreversible: No, Effectively irreversible (Permanent or time-critical harm)
      technical: Once the system acts, the consequences are locked in  such as publishing public information, denying entitlements, or failing to act in emergencies.
      ethical: Irreversible outcomes pose the highest ethical risk — systems must include safeguards, human oversight, and redress mechanisms before deployment.

Q14 (E16): Does this AI system have clear and timely mechanisms to correct errors or provide redress if harm occurs?
  redress:established: Yes - Clearly defined and accessible pathways exist (Formal redress process in place)
      technical: There’s a clear and built-in way for users or staff to report issues, request corrections, or challenge decisions. The process is timely, documented, and monitored.
      ethical: Strong redress mechanisms uphold fairness, accountability, and trust by ensuring people can challenge outcomes and have harms addressed.
  redress:partial: Partially - Informal, manual, or inconsistent process (Redress possible but not consistent)
      technical: Users can sometimes get help or corrections, but there’s no formal process. Outcomes may vary depending on who they talk to or how persistent they are.
      ethical: Inconsistent redress risks inequity, where only the persistent or informed succeed. Ethical responsibility requires formalising fair, transparent, and timely processes.
  redress:none: No - No clear or established process (Users may not know how to raise issues)
      technical: There’s no obvious way to challenge or correct the system’s outputs. Users may be unaware of how to escalate concerns or may be ignored when they try.
      ethical: Absence of redress undermines accountability and rights. Ethically, systems without correction pathways expose people to unmanaged and unjust harm.

Q15 (E17): Has your organisation assessed potential community or stakeholder impacts and implemented appropriate risk mitigations?
  impact_review:complete: Yes - Impacts assessed and mitigations in place (Risks evaluated and mitigations operational)
      technical: Your team has actively reviewed who might be affected and adjusted the system accordingly  for example through consultation, risk analysis, or design changes. You’re also monitoring for future impacts.
      ethical: Proactive engagement with stakeholders demonstrates accountability and fairness, ensuring potential harms are identified, mitigated, and monitored.
  impact_review:pending: Yes - Impacts assessed, mitigations identified but not fully implemented (Mitigations planned but incomplete)
      technical: Risks have been identified and plans are in place, but the changes haven’t been fully rolled out yet. Some safeguards may still be pending.
      ethical: Partial mitigation leaves communities exposed to risk; ethical responsibility requires timely completion of safeguards and transparent communication.
  impact_review:none: No - Risks not yet assessed or considered (No stakeholder impact assessment conducted)
      technical: There has been no structured effort to understand or address how the system could affect people, communities, or stakeholder groups.
      ethical: Failure to assess impacts disregards ethical duties to fairness, inclusivity, and accountability, leaving communities vulnerable to unmanaged harms.
  impact_review:not_applicable: Not Applicable - No identifiable impact (No effect on individuals, communities, or stakeholders)
      technical: The system operates entirely behind the scenes  such as testing code quality, running simulations, or managing infrastructure  and does not affect people or community outcomes.
      ethical: Even systems with no direct human impact require periodic validation to ensure assumptions remain correct and hidden risks do not emerge.

Q16 (E18): Does the system interact with or form part of a broader system ecosystem?
  integration:standalone: No - Standalone system (No data exchange or dependency on other systems)
      technical: The system functions on its own and does not share data with or depend on any other systems.
      ethical: Standalone systems minimise dependency risks, but ethical duty still applies to ensure outputs remain fair, accurate, and accountable.
  integration:internal: Yes - Integrates with internal systems only (e.g. CRM, HRIS, analytics platforms)
      technical: The system connects to other tools or platforms, but all integrations are within your organisation’s environment and under your control.
      ethical: Internal integrations concentrate responsibility within the organisation; ethical governance requires strong internal controls and oversight of data sharing.
  integration:multi_system: Yes - Integrated into a broader multi-system workflow (Includes external platforms or APIs)
      technical: The system is part of a wider process or workflow that includes systems outside your organisation  like vendor APIs, government services, or external platforms.
      ethical: External integrations create complex accountability chains; ethical use requires transparency about dependencies and safeguards against third-party risks.
  integration:dynamic: Yes - Dynamic or adaptive system connections (Can establish new connections during use)
      technical: The system can connect to or activate new tools or services on its own  such as selecting external APIs, downloading plugins, or interacting with unfamiliar systems during use.
      ethical: Dynamic connections raise the highest ethical risks of unpredictability, data leakage, and loss of control. Strong governance, oversight, and boundaries are essential.

```
