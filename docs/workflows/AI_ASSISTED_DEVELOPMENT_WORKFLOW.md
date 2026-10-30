# VECTOR AI-Assisted Development Workflow v1

## 1. Scope and authority

- This document is operational and non-normative.
- It does not override FROZEN or applicable governed specifications.
- It describes how AI assistance is used, not product behavior.
- Repository evidence is preferred over conversational memory.

## 2. Goals

- Preserve engineering quality.
- Make work restart-safe.
- Minimize unnecessary repeated AI analysis.
- Use the smallest sufficient model, context and review effort.
- Keep important decisions durable in repository evidence.
- Prevent chat history from becoming the only record.

Quality first, efficiency through scope discipline.

Cost reduction is never more important than correctness.

## 3. Source-of-truth hierarchy

1. Applicable FROZEN governed specifications.
2. Applicable repository lifecycle/index information, according to its own authority status.
3. PROPOSED specifications, for proposal work only.
4. Review and owner-decision evidence.
5. Handover / current checkpoint.
6. Chat history.

- Lower levels never override higher-authority repository rules.
- Chat history is contextual assistance only.
- When authority is ambiguous, stop and identify the conflict rather than guessing.

## 4. Work-package model

Work package
→ focused analysis
→ grouped implementation
→ local validation
→ stable review gate
→ findings collected
→ grouped remediation
→ revalidation
→ critical review only when justified
→ checkpoint

Related findings should normally be grouped before re-review.

Avoid `Patch → review → patch → review → patch → review` unless a critical issue genuinely requires immediate re-review.

## 5. Tier 0: deterministic work

No AI agent is required for operations such as:

- `git status`
- `git diff`
- `git add`
- `git commit`
- `git push --dry-run`
- `git push`
- simple `gh pr view` state inspection
- deterministic file/path checks

Do not spend AI credits on deterministic operations that require no semantic reasoning. AI may still explain commands when the user needs guidance.

## 6. Tier 1: routine AI work

Default working profile:

- model class: capable general coding/reasoning model;
- current preferred profile from the 2026-10-30 experiment: Claude Sonnet 5.5;
- reasoning: Medium;
- context: 328K.

Use for:

- exact patch application;
- focused documentation changes;
- isolated review findings;
- citation fixes;
- small evidence corrections;
- bounded file comparisons.

Model names may change over time. The durable rule is to choose the smallest sufficient capability.

## 7. Tier 2: focused semantic reasoning

Default:

- 328K context;
- higher reasoning only when an actual semantic or authority problem requires it.

Examples:

- authority conflict;
- lifecycle ambiguity;
- tightly coupled rule semantics;
- ambiguous cross-document interpretation.

Before escalating, narrow the source set.

## 8. Tier 3: large-context analysis

Use expanded context such as 1.1M only when the relevant evidence genuinely cannot fit comfortably in the normal context, or a repository-wide/cross-spec audit is actually required.

`1.1M is capacity, not a quality level.`

Before using large context, the operator must answer:

1. What exact question requires the larger source set?
2. Which files are actually relevant?
3. Can a focused query answer the same question?
4. Has this question already been audited?

## 9. Review effort routing

### Lite

- documentation-only changes;
- small remediation;
- citation/evidence corrections;
- mechanical low-risk changes.

### Balanced

- grouped semantic changes;
- new rule blocks;
- meaningful cross-specification changes;
- normal important review gates.

### Max

Reserve for:

- critical freeze gates;
- security/authentication;
- difficult-to-reverse governance transitions;
- major architecture or data-model changes;
- situations where multiple independent review perspectives have a concrete expected benefit.

Max is not the default. Do not automatically run Max after every finding from Max. Re-review only when changed material justifies it.

## 10. Review-gate policy

### Stable Gate

A review should normally be requested only after:

- related implementation is grouped;
- the working tree is clean;
- local validation passes;
- scope is understood;
- no known trivial follow-up remains.

### Remediation

When a review produces findings:

- classify findings;
- group compatible fixes;
- validate locally;
- avoid one complete new review per trivial fix.

### Stop Condition

A review cycle may stop when:

- no concrete actionable issue remains;
- later human-assessment wording has been explicitly assessed;
- any final mechanical correction is locally verified;
- another full review is unlikely to add proportional value.

Critical governance or security work may impose stricter requirements.

## 11. Evidence anti-recursion

An AI review is evidence for the exact implementation commit it reviewed.

If a later evidence-only commit records that review:

- the evidence-only commit does not retroactively alter the scope of the earlier review;
- the earlier review remains attached to the implementation commit;
- a later review does not need to be written recursively into another evidence commit merely to prove that the prior evidence commit recorded the earlier review;
- later review IDs are added only when an actual governance or traceability requirement needs them.

Example:

Implementation commit A
→ Review R
→ Evidence-only commit B

Review R remains evidence for A.

## 12. Checkpoint policy

The current checkpoint lives in `docs/handover/VECTOR_RESTART_HANDOVER.md`. This document reproduces only the policy logic.

`CHECKPOINT_REQUIRED`:

- owner decision;
- completed review gate;
- work-package completion;
- merge;
- freeze;
- lifecycle transition;
- branch change for a materially different work package;
- long interruption;
- before beginning a materially different high-risk work package.

`NO_CHECKPOINT_REQUIRED`:

- typo fix;
- citation-only correction;
- push dry-run;
- routine Git command;
- metadata-only maintenance;
- trivial mechanical commit without a state transition.

Avoid checkpoint churn.

## 13. Recovery and drift handling

See `docs/handover/VECTOR_RESTART_HANDOVER.md`.

- Recovery starts from repository + handover.
- Chat replay is not the primary mechanism.
- Drift detection is mandatory before continuing.
- Never resolve drift by assumption.

## 14. AI Usage Baseline: 2026-10-29 to 2026-10-30

This section is non-normative measurement evidence from the GitHub AI Usage Report.

Measurement period:

- 2026-10-29
- 2026-10-30

Total:

- AI Credits: `5518.01317375`
- gross usage value: `$55.180131713`
- net charged amount in the report: `$0`

Major credit consumers:

- Code Review model: `2927.6540565` AI Credits, approximately `53.06%`
- Claude Sonnet 5.5: `2442.58118` AI Credits, approximately `44.27%`
- Auto: Claude Sonnet 5.5: `90.678627` AI Credits, approximately `1.64%`
- all other reported models combined: approximately `57.10` AI Credits, approximately `1.03%`

Total token categories:

- input: `52607`
- output: `1166713`
- cache read: `101897382`
- cache write: `11255084`

Observations:

- Approximately 97.3% of the reported AI Credits came from the Code Review model plus Claude Sonnet 5.5.
- This is an observation from this specific cleanup period, not a general GitHub usage claim.
- Large cache-read volume is measurement data and is not by itself proof of waste.
- The baseline exists to compare later work packages against a repeatable measured reference.

The raw billing CSV is not committed to the repository.

## 15. Measurement loop

After a later comparable major work package, compare against the baseline using:

- total AI Credits;
- Code Review credits;
- primary reasoning-model credits;
- input;
- output;
- cache read;
- cache write;
- number of major AI review gates where durable evidence exists;
- number of remediation loops where reasonably measurable.

Do not invent unavailable counts. Use the comparison to refine routing policy. Do not change policy solely because one metric increased; consider project complexity and quality outcome.

## 16. Credit escalation checklist

Before High / large-context / Max usage, ask:

1. What concrete risk is being checked?
2. What is the minimum relevant source set?
3. Can Medium / 328K answer it?
4. Has the same question already been answered?
5. Is this a real gate?
6. What decision will change based on the result?

If these cannot be answered, do not escalate yet.

## 17. Definition of Done for an AI-assisted work package

- Intended scope implemented.
- Local deterministic validation complete.
- Required review gate complete.
- Actionable findings handled.
- Statuses preserved, or intentionally changed through governed process.
- Checkpoint updated when `CHECKPOINT_REQUIRED` applies.
- `NEXT STEP` updated.
- No unresolved recovery drift.
- No unnecessary recursive review evidence.
