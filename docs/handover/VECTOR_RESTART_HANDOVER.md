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
- Checkpoint date: `2026-10-30`
- Work-package base (historical): `c768aa6`
- Active checkpoint anchor: `28ff61406111edb61597ac1addd018817ef25c92`
- Working-tree expectation: `CLEAN`
- Active PR: `#10`
- PR state: `OPEN / DRAFT`
- PR base: `develop`

The work-package base is the historical branch origin and is not the active recovery comparison anchor. The active checkpoint anchor is the verified repository state produced by the previous recovery-control remediation. Current HEAD is the actual branch tip.

Allowed scope after the active checkpoint anchor (exactly these paths):

- `docs/handover/VECTOR_RESTART_HANDOVER.md`
- `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`

Recovery control block:

- checkpoint date;
- active work package;
- expected branch;
- base branch;
- work-package base;
- active checkpoint anchor;
- allowed path set;
- working-tree expectation;
- active PR expectations;
- `NEXT STEP`.

The control block is trusted only from the LVCR copy (see LVCR trust model in the recovery procedure), never from the working tree or the current HEAD copy.

The anchor is intentionally not an exact expected HEAD. The current committed HEAD may legitimately advance beyond the active checkpoint anchor only when all recovery invariants pass. Any unexpected changed path produces `RECOVERY_STATE = DRIFT_DETECTED`.

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

### LVCR trust model

The Last Verified Control Revision (LVCR) is the trusted revision containing the owner-validated recovery control block.

- Merged checkpoint: the LVCR is the verified commit on `origin/develop`.
- Unmerged PR checkpoint: the LVCR is the exact owner-confirmed commit recorded in the active PR description under `Checkpoint control revision`.
- The active PR description is the durable LVCR source for an unmerged checkpoint. Chat history and restart prompts may repeat the LVCR for convenience but are not authoritative LVCR sources.
- This handover must not contain its own current commit as the durable trust source.
- A modified handover must not authorize its own changed control fields or changed allowlist.

Fail-closed: recovery produces `RECOVERY_STATE = DRIFT_DETECTED` when the LVCR cannot be determined, the active PR description has no checkpoint control revision for an unmerged checkpoint, the recorded LVCR is not an ancestor of HEAD, the LVCR handover copy cannot be read, the HEAD control block differs from the LVCR control block, or the current handover attempts to widen its own allowlist without owner revalidation and LVCR rotation.

### Procedure

1. Read this handover.
2. Read `CURRENT CHECKPOINT`.
3. Read `NEXT STEP`.
4. Verify the repository root.
5. Run `git status --short`.
6. Run `git branch --show-current`.
7. Run `git rev-parse HEAD` (informational; HEAD is not compared literally).
8. Run `git fetch origin`.
9. Verify the expected branch.
10. Determine the LVCR: merged checkpoint, verified `origin/develop`; unmerged checkpoint, the exact owner-confirmed commit from the active PR description.
11. If the LVCR cannot be determined, emit `RECOVERY_STATE = DRIFT_DETECTED`.
12. Run `git merge-base --is-ancestor <LVCR> HEAD` and require exit code `0`.
13. Read the trusted handover with `git show <LVCR>:docs/handover/VECTOR_RESTART_HANDOVER.md`.
14. Compare the HEAD recovery control block with the LVCR control block.
15. Any control-block difference is `RECOVERY_STATE = DRIFT_DETECTED` until owner revalidation and LVCR rotation have occurred.
16. Using the trusted LVCR control block, run `git merge-base --is-ancestor <anchor> HEAD` and require exit code `0`.
17. Run `git diff --name-only <anchor> HEAD`.
18. Compare every returned path against the allowed scope obtained from the trusted LVCR copy.
19. Any unexpected path is `RECOVERY_STATE = DRIFT_DETECTED`.
20. Verify the working-tree expectation.
21. Verify upstream and remote state when applicable.
22. Verify active PR head, draft state and checks when applicable.
23. Emit exactly one recovery result:

`RECOVERY_STATE = MATCH`

or

`RECOVERY_STATE = DRIFT_DETECTED`

### MATCH behavior

`RECOVERY_STATE = MATCH` requires every applicable invariant to pass:

- expected branch matches;
- the LVCR can be determined;
- the LVCR is an ancestor of HEAD;
- the HEAD control block equals the trusted LVCR control block;
- the active anchor is an ancestor of HEAD;
- every anchor-to-HEAD path is inside the trusted allowed scope;
- the working-tree expectation matches;
- applicable upstream, remote and PR expectations match.

When MATCH:

- do not reconstruct old chat history;
- continue directly at `NEXT STEP`.

### DRIFT_DETECTED behavior

`RECOVERY_STATE = DRIFT_DETECTED` includes at least:

- wrong branch;
- LVCR missing or undeterminable;
- LVCR not an ancestor of HEAD;
- unreadable LVCR handover;
- unverified recovery-control-field change;
- mutable allowlist attempting to authorize its own new scope;
- active anchor not an ancestor of HEAD;
- unexpected path after the anchor;
- unexpected dirty working tree;
- material upstream or remote mismatch;
- material PR mismatch.

Later commits alone are not drift when all invariants above still pass.

When drift is detected:

- STOP;
- show expected versus actual;
- do not guess which state is correct;
- reconstruct only the delta necessary to explain the mismatch;
- do not continue at `NEXT STEP` until the drift is reconciled;
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

### Anchor rotation

Distinct concepts:

- Work-package base: the historical branch origin of the current work package. It does not change during that work package and is not the active recovery comparison anchor.
- Active checkpoint anchor: the verified repository state used by the current checkpoint.
- Current HEAD: the actual branch tip.
- Allowed scope: the path set permitted after the current active checkpoint anchor.
- LVCR: the trusted revision containing the owner-validated recovery control block.

These fields rotate together as one coherent checkpoint and must not be updated independently:

- checkpoint date;
- active work package;
- expected branch;
- base branch;
- work-package base (when a new package begins);
- active checkpoint anchor;
- allowed scope;
- working-tree expectation;
- PR expectations;
- LVCR;
- `NEXT STEP`.

Rotation is required after:

- work-package completion;
- beginning a new major work package;
- a merge establishing a new stable base;
- a lifecycle or freeze transition;
- a material scope change;
- any recovery-control-field change;
- any owner-approved allowlist change.

Routine in-scope implementation commits do not rotate the checkpoint merely because HEAD advances.

A recovery-control-field change remains drift until:

1. it is committed and pushed;
2. deterministic validation passes;
3. the repository owner confirms the new control revision;
4. the active PR description is updated to the new LVCR.

Rotation occurs only after the actual repository state has been verified. The old base, anchor and LVCR remain available through Git history but are no longer active after rotation. A checkpoint must never silently inherit an outdated anchor or allowed path set.

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

NEXT STEP: Run one Lite re-review of the current PR #10 head after deterministic validation. Do not modify PR #9.
