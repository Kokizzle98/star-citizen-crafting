# VECTOR Rollback Policy v1

**Status:** FROZEN  
**Version:** 1.0  
**Scope:** Application rollback, database recovery boundaries, dataset rollback, compatibility gates, verification, provenance and rollback evidence

## 1. Purpose

This document defines the binding rollback policy for VECTOR.

A rollback restores one or more VECTOR runtime axes to a previously explicitly verified state. A rollback must not guess prior state, silently reverse persistent data changes, mix dataset revisions, bypass authorization or destroy provenance.

Rollback is a recovery operation. It is not a Star Citizen game wipe and it is not a VECTOR platform wipe.

## 2. Core principles

1. Restore only explicitly verified states.
2. Never reconstruct a prior release manually from individual files when a verified Git revision or release artifact exists.
3. Application, database and dataset state are separate rollback axes.
4. Database migrations are not automatically reversed because application code is rolled back.
5. A rollback is blocked when the requested target cannot operate safely with the remaining database or dataset state.
6. User data, audit data, migration history, game-state epochs and provenance are preserved unless a separately authorized recovery operation explicitly changes them.
7. LIVE and PTU remain strictly isolated during rollback.
8. Missing or uncertain values are never guessed and are never replaced with implicit zero values.
9. Every completed rollback is verified and recorded.

## 3. Rollback axes

VECTOR distinguishes at least three rollback axes:

```text
APPLICATION
DATABASE
DATASET
```

A rollback may affect one axis without changing the others, provided the resulting state is compatible and passes the required gates.

Example:

```text
Application      1.4.1 -> 1.4.0
Database         unchanged
LIVE Dataset     unchanged
```

or:

```text
Application      unchanged
Database         unchanged
LIVE Dataset     revision 7 -> revision 6
```

No axis is implicitly rolled back merely because another axis changes.

## 4. Rollback triggers

A rollback should be considered when a Production release or dataset activation introduces a blocking regression such as:

- application startup or runtime failure;
- authentication failure;
- authorization or RLS regression;
- `SYSTEM_ADMIN` isolation failure;
- critical navigation/security route failure;
- destructive or incorrect database behavior;
- database/application compatibility failure;
- SCMDB dataset integrity failure;
- build or dataset mismatch;
- Completeness regression that makes required calculations unsafe;
- severe data corruption;
- exposure of secrets or privileged credentials.

A rollback candidate is not automatically a rollback decision. A safe forward-fix may be preferable when rollback itself would create greater incompatibility or data risk.

## 5. Target selection

A rollback target must be explicitly identifiable and previously verified.

For application rollback, prefer:

```text
verified Git commit
or
verified release tag/artifact
```

For dataset rollback, prefer:

```text
verified dataset revision
+ exact source/build metadata
+ integrity/hash evidence
```

Do not assemble a rollback target manually from unrelated files, manifests or dataset fragments.

## 6. Compatibility Gate

Before rollback execution, VECTOR must determine whether the target state is compatible with the state that will remain active.

Applicable checks include:

```text
Target Application
-> compatible with current database schema/migration head?
-> compatible with active dataset revision/build?
-> compatible with required authentication/provider configuration?
```

and:

```text
Target Dataset Revision
-> compatible with current VECTOR application/engine?
-> valid for the intended channel/build?
```

If compatibility cannot be established safely:

```text
ROLLBACK = BLOCKED
```

A blocked rollback requires a reviewed forward-fix, separately reviewed database recovery operation, compatible dataset change or another explicit recovery plan.

## 7. Application rollback

Application rollback follows the GitHub/Vercel Production model.

Binding rules:

- stop promotion/deployment of the affected release where still possible;
- identify the last compatible explicitly verified Production revision;
- redeploy that exact application revision;
- do not recreate the previous state manually from individual files;
- do not automatically reverse database migrations;
- retain the current dataset unless a separate dataset rollback is required;
- run the applicable Production smoke/verification suite before declaring service restored.

The standard deployment governance remains:

```text
develop -> Vercel Preview -> Release Gates -> main -> Production
```

Rollback execution may restore an earlier verified Production revision, but it does not make `develop` or an unvalidated preview state the Production source of truth.

## 8. Authentication and provider rollback

Rollback must use provider-neutral rules.

- An authentication or identity provider may remain enabled only if the restored application state supports it and its required gates/configuration are valid.
- VECTOR must not use a Citizen-ID-specific feature flag as the universal rollback rule.
- Direct E-mail/password, Discord, Google, Microsoft, Apple and future approved providers are evaluated according to the restored Auth capability set.
- Citizen ID / RSI remains a linked game identity according to current Auth/Game Identity rules, not an implicit Primary Login requirement.
- Sensitive provider state must not be repaired by exposing or copying secrets into the client or repository.

## 9. Database rollback boundary

Database migrations are not automatically reversed.

Binding rules:

- do not execute a destructive down migration merely to make the schema resemble an older application release;
- preserve Production user data;
- preserve audit data;
- preserve migration history;
- if the rolled-back application is incompatible with the current database schema, stop and mark the application rollback `BLOCKED`;
- any corrective database change requires an explicit reviewed forward-fix or a separately reviewed rollback migration;
- database recovery follows the applicable Migration Test Contract and migration-safety gates;
- before a corrective Production database operation, capture the current schema/migration state and satisfy the applicable Backup Gate and Restore Readiness requirements.

## 10. Forward-fix preference

For persistent database state, a reviewed forward-fix is preferred when it can restore compatibility more safely than reversing an already-applied migration.

This is not an unconditional rule that rollback migrations are prohibited. A rollback migration may be used when it is explicitly designed, reviewed, tested and passes the same risk-based migration gates as another Production migration.

## 11. Dataset rollback

A dataset rollback restores a complete previously verified dataset revision.

Example:

```text
LIVE dataset revision 7
-> LIVE dataset revision 6
```

Binding rules:

- restore the manifest/metadata and all referenced dataset content as one coherent revision;
- never combine a manifest from one revision with data from another;
- verify build/channel identity;
- verify JSON/data integrity where applicable;
- verify recorded content hashes/checksums where available;
- rerun the Completeness Filter;
- rerun required dataset validation;
- activate the restored revision only after the dataset activation gate passes;
- record the dataset rollback event/reason.

Dataset rollback does not automatically change the VECTOR application version.

## 12. Dataset and application version independence

VECTOR code version, Star Citizen LIVE build and dataset revision remain separate axes.

A dataset rollback such as:

```text
Vector 1.4.0
LIVE 4.10.2 dataset revision 7 -> 6
```

may leave VECTOR `1.4.0` unchanged.

An application rollback such as:

```text
Vector 1.4.1 -> 1.4.0
```

may leave the active LIVE dataset unchanged.

Every resulting combination must pass compatibility validation.

## 13. LIVE/PTU isolation

Rollback respects strict dataset-channel isolation.

- LIVE rollback affects LIVE only unless another explicit operation is authorized.
- PTU rollback affects PTU only.
- PTU data may not fill missing LIVE values during rollback.
- LIVE data may not fill missing PTU values during rollback.
- no mixed runtime dataset may be created.
- the active UI labels continue to identify the selected dataset context, for example `LIVE 4.10.2` or `PTU 4.10.3`.

## 14. Completeness after dataset rollback

A historically valid file set is not activated solely because it exists.

The restored dataset must pass the current applicable validation path:

```text
Restore revision
-> Build/channel match
-> Integrity/hash validation
-> Normalization compatibility where applicable
-> Completeness Filter
-> Activation Gate
```

If the restored dataset no longer satisfies mandatory current engine requirements, activation is `BLOCKED` until a compatible state is established.

## 15. SCMDB provenance

SCMDB rollback must preserve source provenance.

Where available, retain:

- channel;
- full Star Citizen build;
- dataset revision;
- source revision;
- content hash;
- extraction/import timestamp;
- validation evidence;
- activation history.

SCMDB content is external/master-data input, not user-owned application state. Restoring master data must not silently create, delete or transfer user ownership.

## 16. Game wipe is not rollback

A Dataset/Application rollback is not a Star Citizen game wipe and does not reverse a previously executed game wipe by implication.

Example:

```text
LIVE 5.0 published
-> configured Full Game Wipe executed
-> new game-state epoch created
-> later LIVE dataset revision rolled back for data-quality reasons
```

The dataset rollback must not automatically restore the prior game-state epoch, aUEC, reputation, material inventory, in-game ships or other wiped state.

Game-state recovery requires its own explicit reviewed operation under the applicable Game Wipe / Persistence & Provenance rules.

## 17. Provenance and epoch preservation

Rollback restores operational state without rewriting history.

It must preserve, where applicable:

- ownership provenance;
- provider/source provenance;
- dataset revision history;
- migration history;
- game-state epochs;
- wipe history;
- audit history;
- reconciliation history.

A previous event is not erased just because the runtime returns to an earlier compatible state.

## 18. User-owned game state

Application or dataset rollback must not silently delete or revert user-owned/game-state data.

Examples include:

- inventory quantities/lots;
- in-game ships;
- wallet/aUEC;
- reputation;
- refinery jobs;
- actual loadout state;
- blueprint progression.

Changes to those domains require their own explicit migration, reconciliation or game-state recovery operation.

## 19. Rollback and reservations/transactions

Where a domain uses reservations, ledgers, marketplace transactions or other transactional state, rollback must not reconstruct or delete transactions merely from presentation state.

Any transactional recovery must preserve auditability and follow domain-specific consistency rules.

A code rollback is never authorization to rewrite financial/trading/ownership history.

## 20. Rollback verification

Rollback is complete only after all applicable dynamically selected checks pass.

Possible verification families include:

```text
Application startup/runtime
Authentication
Authorization / RLS
SYSTEM_ADMIN isolation
Database compatibility
RPC compatibility
Dataset integrity
Dataset completeness
LIVE/PTU isolation
Critical application routes
Secret scan
Smoke tests
```

Not every rollback requires every test. The rollback type and affected domains determine the required verification set.

## 21. Application smoke verification

After application rollback, verify at least the affected user journeys and security boundaries.

Where applicable:

- application starts successfully;
- public routes load;
- normal USER authentication succeeds;
- authorization remains enforced;
- `SYSTEM_ADMIN` protections remain enforced;
- critical account/security routes load;
- affected functional routes load;
- runtime logs show no blocking regression.

## 22. Database verification

When a rollback or forward-fix touches database state, apply the current database migration safety/test process.

Applicable verification may include:

- migration head/state;
- structural checks;
- constraints;
- RLS/security tests;
- RPC/function tests;
- behavior tests;
- integrity checks;
- regression tests;
- Production postchecks.

A failed mandatory database check blocks closure of the rollback incident.

## 23. Dataset verification

After dataset rollback verify applicable conditions including:

- exact requested channel/build/revision;
- no mixed revision files;
- hash/checksum evidence where available;
- normalization validity;
- Completeness result;
- activation status;
- expected application compatibility.

No guessed or `0` fallback may be used to make incomplete data appear valid.

## 24. Secret exposure rollback

If rollback is triggered by secret/credential exposure, redeploying older code alone is not sufficient when the exposed credential may still be valid.

The recovery process must separately handle the credential/security incident according to security policy. Rollback verification must confirm that the restored application does not continue to expose the secret or privileged credential.

Never record raw secret material in rollback evidence.

## 25. Rollback evidence

Every material Production rollback records sufficient evidence to reconstruct the decision.

Recommended fields:

```text
Rollback ID
Reason
Initiated by
Started at
Completed at
Status

Source state:
  VECTOR version
  Git commit/release
  Database migration head
  LIVE dataset build/revision
  PTU dataset build/revision where relevant

Target state:
  VECTOR version
  Git commit/release
  Database migration head
  LIVE dataset build/revision
  PTU dataset build/revision where relevant

Affected rollback axes
Compatibility Gate result
Verification results
Follow-up actions
```

Final status values should distinguish at least:

```text
RESTORED
BLOCKED
FAILED
CANCELLED
```

## 26. Auditability

Rollback evidence is retained with release/operational history where appropriate.

Audit data must not contain:

- passwords;
- MFA secrets;
- reusable provider tokens;
- service-role credentials;
- raw sensitive authentication material.

## 27. Fail-closed behavior

Rollback is `BLOCKED` or `FAILED` when:

- the target revision cannot be identified reliably;
- compatibility cannot be established;
- required backup/recovery prerequisites fail;
- required migration/recovery tests fail;
- target dataset integrity fails;
- Completeness blocks required dataset behavior;
- channel/build/revision identity is ambiguous;
- security boundaries cannot be verified.

Unknown must never be interpreted as safe to restore.

## 28. Manual emergency actions

Manual emergency actions may be necessary, but they do not waive evidence or validation requirements.

- document the exact action;
- avoid ad-hoc destructive SQL where a safer reviewed procedure exists;
- if Supabase SQL Editor `Run selected` is necessary, provide exact line numbers;
- save reusable SQL/checks into the repository;
- convert repeated manual verification into automated tests.

## 29. Relationship to Git branches

- `main` remains the approved Production baseline branch.
- `develop` remains the next development state.
- rollback does not redefine `develop` as Production.
- branch/release history should preserve the failed release and the restored release for traceability.
- a later corrected release returns through the normal `develop -> Preview -> PR -> main -> Production` gate.

## 30. Relationship to release documentation

A Production rollback updates the appropriate release/incident history.

The record must identify:

- affected release;
- reason for rollback;
- restored revision;
- active dataset revision/build after recovery;
- compatibility/verification outcome.

Rollback does not erase the failed release from CHANGELOG/audit history where release documentation policy requires preserving it.

## 31. Non-goals

This document does not authorize:

- deletion of Production user data;
- automatic reversal of Supabase migrations;
- bypassing RLS or authorization checks;
- replacing missing data with guessed/zero values;
- undoing a Star Citizen game wipe by implication;
- VECTOR platform wipe;
- secret exposure remediation solely by redeployment;
- mixing LIVE and PTU datasets.

## 32. Data integrity invariants

A conforming rollback preserves at least these invariants:

1. Target states are explicitly verified states.
2. Application rollback does not automatically reverse database state.
3. Dataset rollback restores one coherent revision.
4. Code and dataset rollbacks are independent but compatibility-gated.
5. LIVE and PTU never mix.
6. Completeness is re-evaluated before dataset reactivation.
7. Game wipes and game-state epochs are not silently reversed.
8. User-owned state is not deleted by application/dataset rollback.
9. Migration and audit history remain traceable.
10. Unknown values are not guessed.
11. Security/provider state remains compatible with the restored application.
12. Rollback closure requires successful applicable verification.

## 33. Acceptance criteria

VECTOR Rollback Policy v1 is satisfied when the platform can demonstrate that:

- an application can be restored to an exact previously validated Git/release revision;
- an application rollback is blocked if incompatible with the current database/dataset;
- a database migration is not automatically reversed during application rollback;
- database recovery requires its own reviewed/tested change path;
- a complete previous dataset revision can be restored without mixing revisions;
- Completeness and integrity are checked before dataset activation;
- LIVE and PTU remain isolated;
- a previously executed game wipe/epoch transition is not implicitly undone;
- rollback preserves provenance and audit history;
- applicable verification results are recorded;
- failed/blocked rollback states are distinguishable from successful restoration.

## 34. Supersession of legacy runbook

This policy modernizes the former `VECTOR 1.2.0 Rollback Runbook`.

Preserved principles include:

- restore an exact verified application revision;
- do not reconstruct prior state manually;
- do not automatically reverse database migrations;
- preserve user/audit/migration data;
- prefer reviewed forward-fix or separately reviewed rollback migration;
- restore coherent SCMDB dataset/manifest state;
- verify after rollback;
- never guess missing SCMDB values.

Superseded legacy details include:

- release-specific `1.2.0` wording;
- PreFlight/RC-specific workflow language;
- the Citizen-ID-specific rollback feature-flag rule.

## 35. Frozen decision

VECTOR Rollback Policy v1 is **FROZEN**.

Material amendments require a successor version and the normal VECTOR Governance process.
