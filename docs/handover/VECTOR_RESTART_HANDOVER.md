# VECTOR Restart Handover

This document is operational and non-normative.

- Governed repository specifications remain authoritative according to their lifecycle and authority status.
- This handover exists only to recover the current working state and to locate authoritative evidence.
- Chat history must not be the sole source for a project decision.
- When this document conflicts with authoritative repository state, repository state wins and recovery must stop for drift reconciliation.

## 1. CURRENT CHECKPOINT

### Current work package

- Work package: `Restart Safety + AI Efficiency v1`
- Branch: `docs/restart-safety-ai-efficiency-v1`
- Base: `develop`
- Branch baseline: `c768aa6`
- Working-tree expectation at work-package start: `CLEAN`

### Previous stable Versioning checkpoint

- PR: `#9`
- Versioning branch: `docs/versioning-v1-1-freeze-readiness-remediation`
- Versioning head: `0127581`
- PR base: `develop`
- PR state: `OPEN / DRAFT`
- Commits: `11`
- Changed files: `6`
- Diff: `+719 / -116`
- Mergeable: `MERGEABLE`
- Merge state: `CLEAN`
- Normal checks: passed

PR #9 is not the active branch for this work package.

## 2. AUTHORITATIVE STATE POINTERS

These are compact status pointers only. The repository documents themselves must be read for substantive meaning.

- `VECTOR_VERSIONING_V1` = `FROZEN`
- `VECTOR_VERSIONING_V1_1` = `PROPOSED`
- `DATA_CONTEXT_MODEL_V1` = `PROPOSED`
- R2 = `IN_PROGRESS`
- R3 = `OPEN`
- supersession = `NOT EFFECTIVE`
- freeze transition = `NOT_EXECUTED`

## 3. OWNER DECISIONS

Compact pointers only. Do not reinterpret these decisions.

- V11-PF-01 = option 1B: Versioning v1.1 before Data Context Model; DCM stays `PROPOSED` and follows later.
- V11-PF-02 = option 2C: Canonical Data Model remains a non-binding forward reference with strict fail-closed interim behavior.
- V11-PF-03 = option 3A: future R3 state is `RESOLVED`, but only during a successfully completed governed freeze transition.
- V11-PF-04: Governance v1 §5.5 is not triggered for the Versioning v1.1 promotion; ADR not required.

The durable rationale and evidence belong in the repository's decision and review records, not in this handover.

## 4. REVIEW STATE

- Substantive owner-decision implementation commit: `1e363a2`
- Direct implementation review: Copilot review `5707029494` on `1e363a2`; result: `Approval recommended`; no active/open issues for that reviewed implementation
- Evidence bookkeeping commit: `2da66c9`
- Later dependency-completeness and governance remediation continued after that checkpoint
- Final known Versioning branch head: `0127581`
- No concrete open inline finding remains at the handover checkpoint

Review evidence must always be associated with the exact commit actually reviewed. Later review IDs are not added recursively merely because they reviewed evidence bookkeeping.

## 5. ACTIVE WORK PACKAGE

`Restart Safety + AI Efficiency v1`

Objective:

- make VECTOR recovery deterministic after a new chat/session;
- minimize dependence on chat memory;
- reduce unnecessary AI-credit consumption;
- replace repeated review loops with explicit stable gates.

Scope:

- active restart handover;
- recovery protocol;
- drift detection;
- checkpoint policy;
- AI model/context routing;
- review-gate policy;
- evidence anti-recursion;
- usage measurement baseline.

Out of scope:

- resolving R2;
- resolving R3;
- freezing Versioning v1.1;
- supersession;
- merging PR #9;
- implementation of new product functionality.

## 6. DO NOT DO

- Do not infer authoritative project state from chat history alone.
- Do not silently continue when Git/PR state differs from the checkpoint.
- Do not change FROZEN rules as part of recovery.
- Do not merge or modify PR #9 from this work package.
- Do not change R2/R3 merely to make a workflow checkpoint look complete.
- Do not create recursive review-evidence commits.
- Do not run repository-wide AI audits when a bounded check can answer the question.
- Do not use Max review by default.

## 7. RECOVERY PROCEDURE

1. Read this handover.
2. Read `CURRENT CHECKPOINT`.
3. Read `NEXT STEP`.
4. Verify the current repository root.
5. Run `git status --short`.
6. Run `git branch --show-current`.
7. Run `git rev-parse --short HEAD`.
8. Run `git fetch origin`.
9. Compare the expected branch and HEAD with the actual state.
10. Verify upstream/remote state when applicable.
11. If an active PR is referenced, verify PR head, draft state and checks.
12. Compare EXPECTED versus ACTUAL.
13. Produce exactly one recovery result:

`RECOVERY_STATE = MATCH`

or

`RECOVERY_STATE = DRIFT_DETECTED`

### MATCH behavior

When all relevant state matches:

- do not reconstruct old chat history;
- continue directly at `NEXT STEP`.

### DRIFT_DETECTED behavior

When any material state differs:

- STOP;
- show expected versus actual;
- do not guess which state is correct;
- reconstruct only the delta necessary to explain the drift;
- update the handover only after the actual state has been reconciled.

## 8. CHECKPOINT POLICY

### CHECKPOINT_REQUIRED

- owner decision;
- completed review gate;
- work-package completion;
- merge;
- freeze;
- lifecycle transition;
- branch change for a materially different work package;
- long interruption;
- before beginning a materially different high-risk work package.

### NO_CHECKPOINT_REQUIRED

- typo fix;
- citation-only correction;
- push dry-run;
- routine Git command;
- metadata-only maintenance;
- trivial mechanical commit without a state transition.

Avoid checkpoint churn.

## 9. AI WORK MODE

See `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`. Compact summary:

- Tier 0: deterministic Git/CLI work, no agent
- Tier 1: routine AI work, Medium / 328K
- Tier 2: focused semantic reasoning, High / 328K only when justified
- Tier 3: large context only when evidence genuinely requires it
- Lite/Balanced for normal review gates according to risk
- Max only for a justified critical gate

1.1M is capacity, not a quality level.

## 10. NEXT STEP

NEXT STEP: Commit and publish the validated Restart Safety + AI Efficiency v1 documentation on branch docs/restart-safety-ai-efficiency-v1. Do not modify PR #9.
