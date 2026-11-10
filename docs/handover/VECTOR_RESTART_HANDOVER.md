# VECTOR Restart Handover

This document is operational and non-normative.

- Governed repository specifications remain authoritative according to their lifecycle and authority status.
- This handover exists only to recover the current working state and to locate authoritative evidence.
- Chat history must not be the sole source for a project decision.
- When this document conflicts with authoritative repository state, repository state wins and recovery must stop for drift reconciliation.

## 1. CURRENT CHECKPOINT

### Current work package

- Work package: `Blueprint Ownership / Tracking`
- Branch: `feat/blueprint-ownership`
- Base: `develop`
- Checkpoint date: `2026-11-10`
- Work-package base (historical): `1ee9efa90abd7f6c75c6fb620f642a96290b877f`
- Active checkpoint anchor: `1ee9efa90abd7f6c75c6fb620f642a96290b877f`
- Working-tree expectation: `CLEAN`
- Active PR: the work-package pull request for `Blueprint Ownership / Tracking` against `develop`; its branch `feat/blueprint-ownership` is the expected branch for the whole work package
- PR base: `develop`

The work-package base and anchor are the verified `develop` head after PR #35 (`AGENTS.md` token hygiene and rotation to the idle baseline). The work package is delivered in four sequential pull requests from the same branch family; the allowed scope below is the union for the whole package and does not widen per pull request. Current HEAD may advance beyond that anchor only when all recovery invariants pass.

Allowed scope after the active checkpoint anchor (exactly these paths):

- `docs/handover/VECTOR_RESTART_HANDOVER.md`
- `lib/blueprints/**`
- `tests/blueprint-*.test.mjs`
- `database/migrations/blueprints/**`
- `app/admin/blueprints/**`
- `app/vector/blueprints/**`
- `app/vector/page.tsx`
- `components/layout/VectorSidebar.tsx`

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

### Previous checkpoints (historical, all merged)

- PR `#9` (Versioning v1.1 freeze-readiness remediation): merged into `develop` on 2026-10-30.
- PR `#10` (Restart Safety + AI Efficiency v1): merged into `develop` on 2026-10-30.
- PR `#11` (Versioning v1.1 freeze transition): merged into `main` on 2026-10-30.
- PRs `#27` to `#33` (SCMDB location pipeline and its handover): merged into `develop`.
- PR `#34` (Repository Cleanup and Baseline v1: lockfile, handover, dashboard text, `AGENTS.md`/`CLAUDE.md`): merged into `develop` on 2026-11-10.
- PR `#35` (`AGENTS.md` token hygiene and checkpoint rotation to the idle baseline): merged into `develop` on 2026-11-10.

No earlier PR is active. Do not reopen or modify them.

## 2. AUTHORITATIVE STATE POINTERS

These are compact status pointers only. The repository documents themselves must be read for substantive meaning.

- `VECTOR_VERSIONING_V1` = `SUPERSEDED` (file intentionally unchanged for traceability; see `docs/RULE_INDEX.md`)
- `VECTOR_VERSIONING_V1_1` = `FROZEN`
- `DATA_CONTEXT_MODEL_V1` = `PROPOSED`
- R2 = `IN_PROGRESS`
- R3 = `RESOLVED`
- R6 = `RESOLVED` (root `AGENTS.md` and `CLAUDE.md` exist on `develop` since PR #34)
- supersession = `EFFECTIVE`
- freeze transition = `EXECUTED` (PR #11, merged into `main` on 2026-10-30)

## 3. OWNER DECISIONS

Compact pointers only. Do not reinterpret these decisions.

- V11-PF-01 = option 1B: Versioning v1.1 before Data Context Model; DCM stays `PROPOSED` and follows later.
- V11-PF-02 = option 2C: Canonical Data Model remains a non-binding forward reference with strict fail-closed interim behavior.
- V11-PF-03 = option 3A: future R3 state is `RESOLVED`, but only during a successfully completed governed freeze transition.
- V11-PF-04: Governance v1 §5.5 is not triggered for the Versioning v1.1 promotion; ADR not required.

The durable rationale and evidence belong in the repository's decision and review records, not in this handover.

## 4. REVIEW STATE

Historical review evidence for the Versioning v1.1 work (PRs #9 to #11, all merged):

- Substantive owner-decision implementation commit: `1e363a2`
- Direct implementation review: Copilot review `5707029494` on `1e363a2`; result: `Approval recommended`; no active/open issues for that reviewed implementation
- Evidence bookkeeping commit: `2da66c9`
- Final known Versioning branch head: `0127581`

No open review finding is tracked in this handover and no review is pending.

Review evidence must always be associated with the exact commit actually reviewed. Later review IDs are not added recursively merely because they reviewed evidence bookkeeping.

## 5. ACTIVE WORK PACKAGE

`Blueprint Ownership / Tracking`. Owner-approved scope and decisions are recorded in the work-package pull requests; this section is a pointer, not the decision record.

Fixed package boundaries confirmed by the owner:

- blueprint definitions are global SCMDB-derived catalog data, readable by authenticated VECTOR users only; there is no anonymous catalog;
- blueprint ownership is personal VECTOR user state (`auth.users` / `profiles.id`), never crew-owned; active-crew members may see each other's known ownership as a derived aggregation only;
- ownership must not require a verified RSI or Star Citizen account; `profiles.primary_game_account_id` is not an ownership precondition;
- a missing ownership row means `ownership not known`, never `not owned`;
- ownership provenance is modelled as `MANUAL` (writable now), `GAME_LOG` and `COMPANION` (prepared, not writable in this package);
- SCMDB `isDefault` is preserved as a raw catalog value only; it is not personal ownership and must not create an ownership rule. SCMDB marks exactly eight blueprints this way and describes them as starter blueprints in its own changelog; that is a source statement, not a rule derived from CIG data;
- ownership model `A` is approved: one current row per user and blueprint, `UNIQUE(user_id, blueprint_id)`; manual removal deletes the row and returns the state to `not known`. Historization is deliberately deferred and becomes mandatory with wipe execution or automatic detection;
- mission and reward relations may be normalized as data in the import package; the `where do I get this?` feature stays `DEFERRED` and out of scope.

Sequential pull requests inside this package:

- PR 1: checkpoint rotation and the `lib/blueprints/` catalog and reward readers with tests; no database, no UI.
- PR 2: `database/migrations/blueprints/001` with the five tables, RLS and the four functions, plus contract tests; owner validates in staging before production promotion.
- PR 3: the admin synchronization of the LIVE catalog and reward relations into the database; LIVE only, no PTU import, no end-user UI.
- PR 4: `/vector/blueprints` with the LIVE catalog, search, filters, the personal manual ownership toggle, the non-colour-only status display, the review hint, the sidebar link and the dashboard text.

Out of scope for the whole package: the `where do I get this?` and mission UI, automatic blueprint detection, Game Log, Companion, RSI linking, Pledge Hangar, an `isDefault` ownership rule, the crafting link, wipe logic and any PTU ownership UI.

Known open items, none of them started:

- after this package: linking Crafting with Crew Inventory (see `SCMDB_LOCATION_HANDOVER.md`);
- older audit scripts `vector_item_data_audit_v2` to `v5` and the `data/audit*` folders: archive or remove only after a separate, explicit decision;
- Rule Index items R2, R4 and R5 remain as listed in `docs/RULE_INDEX.md`.

Completed packages: `Restart Safety + AI Efficiency v1` (PR #10) and `Repository Cleanup and Baseline v1` (PR #34).

## 6. DO NOT DO

- Do not infer authoritative project state from chat history alone.
- Do not silently continue when Git/PR state differs from the checkpoint.
- Do not change FROZEN rules as part of recovery.
- Do not reopen or modify merged PRs of earlier work packages (#9, #10, #11, #27 to #34).
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
22. For an active unmerged PR, obtain its current remote head as an exact 40-character commit OID from the hosting service and require local `HEAD` to equal that remote PR head. If the remote PR head cannot be determined or differs from local `HEAD`, emit `RECOVERY_STATE = DRIFT_DETECTED`. Then verify draft state and checks when applicable.
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
- for an active unmerged PR, its remote head can be determined and exactly equals local `HEAD`; applicable draft-state, check, upstream and other remote expectations match.

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
- active remote PR head missing, undeterminable or different from local `HEAD`, or another material PR mismatch.

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

NEXT STEP: Review and merge PR 1 of `Blueprint Ownership / Tracking` (owner approval required; the checkpoint control revision belongs in that pull request description).

PR 2 is blocked until the following read-only staging prechecks are supplied, because the crew and profile contracts they describe are not in the repository and must not be assumed:

1. the definitions of `is_group_member`, `is_group_admin`, `set_active_group`, `get_active_group_inventory` and `get_my_app_role`;
2. the existing primary keys, foreign keys and constraints of `groups`, `group_members`, `user_settings` and `profiles`;
3. the existing indexes of those four tables;
4. the RLS status of those four tables plus the complete RLS policies of `profiles`.

Answered already: every `auth.users` row currently has a matching `profiles` row, so `profiles.nickname` is the display identity and no substitute name is required for the current scope. The implementation must still stay defensive: a missing profile must never widen data access, never replace crew membership and never cause an alternative identity to be derived from e-mail, game account or any other field.

Do not implement PR 2 or `get_active_crew_blueprint_status()` before those prechecks exist. Do not reopen SCMDB Location work without a concrete defect, and do not reopen merged PRs.
