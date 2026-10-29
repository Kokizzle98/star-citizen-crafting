# VECTOR Migration Test Contract v1

**Status:** PROPOSED  
**Version:** 1.0  
**Scope:** Database migrations, dynamically selected test suites, backup/restore gates, local validation, CI gates, production verification and evidence

## 1. Purpose

This contract defines the mandatory relationship between a VECTOR database migration and its verification.

The primary objective is to replace long, concentration-sensitive manual SQL sessions with repeatable, repository-based and automatically executed tests.

A migration is not complete merely because its SQL executed without an error. It is complete only when its applicable structural, behavioral, security, integrity and regression tests pass.

## 2. Core rule

Every database migration must be delivered as a reviewable migration package:

```text
Migration SQL
+ Migration manifest
+ Applicable automated tests
+ Required fixtures
+ Post-migration verification
+ Recovery strategy
```

For schema-, authorization-, ownership- or data-changing migrations, the migration and its tests belong to the same pull request.

## 3. Repository structure

Recommended structure:

```text
supabase/
  migrations/
    202610280001_platform_roles.sql

  migration-contracts/
    202610280001_platform_roles.yml

  tests/
    database/
      helpers/
        000_test_helpers.sql
      structure/
      constraints/
      rls/
      rpc/
      behavior/
      integrity/
      regression/

  fixtures/
    database/
      base.sql
      auth_users.sql
      crews.sql

  postchecks/
    202610280001_platform_roles_postcheck.sql
```

Exact directories may be adjusted during implementation, but migration, contract, tests and evidence must remain discoverable and versioned together.

## 4. Migration identifier

Every migration receives one immutable identifier.

Recommended format:

```text
YYYYMMDDHHMM_short_description
```

Example:

```text
202610280001_platform_roles
```

The same identifier is used for:

- migration SQL;
- migration contract;
- migration-specific tests;
- postcheck;
- CI evidence;
- release/change documentation.

## 5. Migration risk classification

Every migration declares one risk level.

### 5.1 NORMAL

Typical characteristics:

- additive, backward-compatible change;
- no destructive data transformation;
- no authorization or ownership change;
- no change to critical RPC behavior.

Minimum gate:

```text
local reset/apply
+ structure tests
+ applicable behavior tests
+ regression tests
+ CI PASS
```

### 5.2 ELEVATED

Typical characteristics:

- material schema change;
- RLS or RPC change;
- data backfill;
- ownership relationship change;
- significant constraint change.

Minimum gate:

```text
BACKUP_GATE = PASS
+ local reset/apply
+ structure/constraint tests
+ RLS/RPC/behavior tests
+ integrity tests
+ regression tests
+ preview validation
```

### 5.3 CRITICAL

Typical characteristics:

- destructive migration;
- identity/authentication model change;
- RBAC/RLS redesign;
- ownership transfer/transformation;
- large-scale data rewrite;
- platform-critical state change.

Minimum gate:

```text
BACKUP_GATE = PASS
+ RESTORE_READINESS = PASS
+ clean local migration rehearsal
+ complete applicable test matrix
+ security regression
+ preview/staging validation
+ explicit release approval
+ production postcheck
```

Risk may be increased during review. It must not be lowered merely to avoid a gate.

## 6. Migration contract manifest

Each migration has a machine-readable manifest that declares intent and dynamically selects required test families.

Recommended YAML example:

```yaml
contract_version: 1
migration_id: 202610280001_platform_roles
title: Add platform roles and permissions
risk: CRITICAL

changes:
  schemas: [public]
  tables:
    create:
      - platform_roles
      - platform_permissions
      - platform_role_permissions
      - platform_user_roles
    alter: []
    drop: []
  functions:
    create:
      - get_my_platform_permissions
  policies:
    create:
      - platform_roles_authenticated_read
  data_backfill: false
  destructive: false

security:
  changes_auth: true
  changes_rls: true
  changes_roles: true
  changes_ownership: false
  service_role_required: false

actors:
  - anon
  - authenticated_user
  - crew_owner
  - system_admin

required_test_families:
  - structure
  - constraints
  - rls
  - rpc
  - behavior
  - integrity
  - regression

backup:
  required: true
  restore_readiness_required: true

production_postcheck:
  required: true
  destructive_checks_allowed: false
```

The final schema may evolve, but the manifest must describe enough intent to determine required gates.

## 7. Dynamic test selection

The CI test planner parses the migration contract and selects tests dynamically.

### 7.1 Baseline tests

Always run:

- migrations apply successfully to a clean local database;
- all database regression tests;
- migration history consistency check;
- SQL/static linting when configured;
- application build/type generation checks affected by schema changes.

### 7.2 Rule-driven test expansion

Examples:

```text
creates/alters table
-> structure + constraints + integrity

changes RLS/policies
-> RLS positive + RLS negative + regression

creates/alters RPC/function
-> existence + signature + privilege + behavior + failure cases

changes auth/roles
-> actor matrix + privilege-escalation regression

changes ownership
-> owner/non-owner/crew/system-admin behavior

changes data
-> before/after invariants + row-count/control totals

destructive migration
-> backup + restore readiness + data-loss preview + explicit approval
```

### 7.3 Generated scaffolds

A generator may create test scaffolds from the manifest, such as:

- table/column existence tests;
- constraint existence tests;
- function signature tests;
- declared policy existence tests;
- empty placeholders for required actor behavior.

Generated scaffolds do not replace human-authored semantic tests. CI must fail if the contract requires semantic tests but only unresolved placeholders exist.

## 8. Test families

### 8.1 STRUCTURE

Verifies declared database objects:

- schemas;
- tables;
- columns and types;
- views/materialized views;
- functions/RPCs and signatures;
- triggers;
- policies;
- required extensions.

### 8.2 CONSTRAINTS

Verifies:

- primary and foreign keys;
- unique constraints;
- check constraints;
- nullability;
- cascade/restrict behavior where material;
- required indexes where contractually relevant.

### 8.3 RLS / SECURITY

Verifies both positive and negative cases for applicable actors.

Minimum principle:

> Every permission granted requires a corresponding denial test for at least one unauthorized actor when a denial boundary exists.

Typical actors:

```text
anon
authenticated owner
authenticated non-owner
Crew MEMBER
Crew ADMIN
Crew OWNER
functional role
SYSTEM_ADMIN
service-role/server path where applicable
```

Tests cover SELECT, INSERT, UPDATE and DELETE only where each operation is relevant.

### 8.4 RPC / FUNCTION

Verifies:

- function exists with expected signature;
- intended roles can execute;
- unintended roles cannot execute;
- successful behavior;
- invalid input rejection;
- ownership/authorization checks;
- expected idempotency where required;
- no unintended privilege escalation.

### 8.5 BEHAVIOR

Verifies business rules, not only object existence.

Examples:

- a user edits only their own inventory lot;
- Crew visibility does not grant modification rights;
- last OWNER protection is enforced;
- only an ACTIVE Fleet Plan produces official material targets;
- LIVE/PTU data never cross-fallback;
- unknown locations use `Unbekannt` rather than guessed mappings.

### 8.6 INTEGRITY

Verifies invariants across tables and transitions:

- no orphaned relations;
- no duplicate authoritative identities;
- valid status transitions;
- aggregate/control totals remain consistent;
- backfills map every required row or explicitly classify unresolved rows;
- no silent data loss.

### 8.7 REGRESSION

Runs all established FROZEN-rule tests relevant to the database.

A new migration may not pass by proving only its new capability while breaking prior behavior.

## 9. Test implementation

SQL database tests are stored in:

```text
supabase/tests/database/**/*.sql
```

Tests use transactions and roll back their test data wherever practical.

Recommended pattern:

```sql
begin;

select plan(<exact_test_count>);

-- setup fixtures
-- assertions

select * from finish();
rollback;
```

Database tests run through:

```text
supabase test db
```

Application-client integration tests may additionally test behavior through a Supabase client when SQL-level testing is insufficient.

## 10. Fixtures and actor contexts

Reusable fixtures create deterministic test users and domain state.

Fixtures must:

- use synthetic data only;
- never copy production personal data into the repository;
- create stable actor identities for authorization tests;
- remain isolated from production credentials;
- be safe to reset repeatedly.

Recommended actor fixtures:

```text
test_anon
test_user_a
test_user_b
test_crew_member
test_crew_admin
test_crew_owner
test_fleet_architect
test_system_admin
```

## 11. Local validation sequence

Before a migration PR is marked ready:

```text
1. start/reset clean local Supabase stack
2. apply all repository migrations from zero
3. load deterministic test fixtures
4. run dynamically selected tests
5. run full regression suite
6. generate machine-readable and human-readable result summary
```

The local gate must fail on migration or test failure.

## 12. GitHub Actions gate

A pull request that changes any of the following triggers the database gate:

```text
supabase/migrations/**
supabase/migration-contracts/**
supabase/tests/**
supabase/fixtures/**
supabase/postchecks/**
```

Recommended CI flow:

```text
checkout
-> setup pinned Supabase CLI version
-> start local Supabase database
-> validate migration contracts
-> apply migrations from zero
-> run selected migration tests
-> run full regression tests
-> publish test summary/artifacts
```

The workflow is a required status check for merging database-impacting changes.

## 13. Version pinning

CI must not silently use an unbounded `latest` toolchain for release-critical validation.

VECTOR should pin or control:

- Supabase CLI version;
- PostgreSQL/local stack version where practical;
- test tooling versions;
- application dependency lockfile.

Toolchain upgrades are deliberate changes and rerun the full applicable test suite.

## 14. Backup Gate

ELEVATED and CRITICAL Production migrations require a backup according to risk policy.

Backup evidence includes, where applicable:

```text
source project/environment
creation timestamp
roles dump
schema dump
data dump
private off-site location
SHA-256 for each artifact
backup command/tool version
result PASS/FAIL
public Git exposure NO
```

A database backup does not include actual Supabase Storage objects. If affected state depends on Storage objects, a separate Storage backup/recovery gate is required.

A failed Backup Gate blocks Production migration execution.

## 15. Restore Readiness

Restore Readiness is separate from successful backup creation.

Evidence includes:

- required backup artifacts exist;
- restore procedure is documented;
- required credentials/keys/extensions are identified;
- migration history restoration is considered;
- auth/storage customizations are considered;
- a restore rehearsal is completed when required by CRITICAL risk policy.

A successful dump without usable restoration material does not satisfy a required Restore Readiness gate.

## 16. Data migration controls

A migration that transforms existing rows declares before/after invariants.

Possible controls:

- source row count;
- successfully transformed count;
- explicitly unresolved count;
- rejected/error count;
- duplicate count;
- control totals for quantities/amounts;
- null/unmapped identifiers;
- reconciliation report.

The required equation is:

```text
source
=
transformed
+ explicitly unresolved
+ explicitly rejected
```

Any unexplained difference fails the migration gate.

## 17. Destructive migration controls

A destructive migration must declare:

- objects/data being removed;
- reason removal is necessary;
- dependency analysis;
- preview impact;
- backup and restore requirements;
- rollback or compensating strategy;
- post-migration verification;
- explicit approval requirement.

Unknown must never mean safe to delete.

## 18. Preview / staging validation

ELEVATED and CRITICAL migrations are validated in a non-Production environment representative enough to exercise runtime behavior.

The Preview gate checks:

- application starts/builds;
- affected routes load;
- affected RPCs execute as intended;
- authentication and authorization flows behave as expected;
- no migration-dependent runtime error is introduced;
- applicable smoke tests pass.

A local database PASS alone is insufficient when runtime behavior is affected.

## 19. Production execution

Production applies only the migration artifacts that passed the release gate.

Binding rules:

- no last-minute SQL editing in the Production SQL editor;
- changes after validation require another validation run;
- one logical migration step at a time where ordering matters;
- stop immediately on failure;
- do not continue with dependent migrations after failed postcheck or security test;
- execution evidence is retained.

## 20. Production postchecks

Production postchecks are non-destructive by default.

They verify applicable invariants such as:

- migration recorded/applied;
- required objects exist;
- relevant functions/RPCs exist;
- required policies/privileges are present;
- expected version/state metadata is correct;
- affected read paths respond;
- critical row/control totals are plausible and match expected migration evidence.

Production postchecks do not recreate the entire destructive test suite against real user data.

## 21. Manual SQL fallback

Manual SQL is permitted for diagnosis, emergency analysis or a one-time controlled step when automation is not yet available.

Binding rules:

- manual execution is documented;
- SQL is saved in the repository if it may be needed again;
- postchecks and security checks are recorded;
- for Supabase SQL Editor `Run selected`, instructions must include exact line numbers;
- any check used more than once should be converted into an automated repository test.

## 22. Evidence and reporting

The gate produces a concise result:

```text
VECTOR DATABASE GATE

Contract validation    PASS
Backup Gate            PASS / N/A
Restore Readiness      PASS / N/A
Migration apply        PASS
Structure              PASS
Constraints            PASS
RLS / Security         PASS
RPC                     PASS
Behavior                PASS
Integrity               PASS
Regression              PASS
Preview                 PASS / N/A
Production postcheck    PASS / PENDING / N/A

Decision                READY / BLOCKED
```

Detailed logs remain available as CI artifacts or controlled release evidence without publishing secrets or production data.

## 23. Fail-closed rules

The migration is BLOCKED if:

- the contract is missing or invalid;
- the risk classification is missing;
- a required test family is absent;
- a required semantic test remains a placeholder;
- Backup Gate fails;
- Restore Readiness fails when required;
- migration application fails;
- any required automated test fails;
- Preview fails when required;
- unexplained data control differences exist;
- Production postcheck fails.

No manual statement of "looks fine" overrides a required failed gate.

## 24. Exceptions

Emergency exceptions must be explicit, time-bound and auditable.

An exception declares:

- reason;
- approver;
- skipped control;
- compensating control;
- expiration/follow-up;
- required backlog item to restore normal coverage.

Exceptions must not become the normal migration process.

## 25. Dynamic generator responsibilities

The future VECTOR migration-test generator should:

1. create a migration contract template;
2. inspect declared changes and select required test families;
3. generate structural/constraint/function test scaffolds;
4. generate actor-matrix placeholders for RLS/RPC changes;
5. reject unresolved required placeholders in CI;
6. generate the GitHub Actions gate summary;
7. keep generated files deterministic;
8. never fabricate business expectations;
9. never connect to Production to invent fixtures;
10. never place secrets or production data into generated artifacts.

## 26. Human responsibilities

Automation cannot infer every business rule.

The author/reviewer must define:

- intended allowed behavior;
- intended denied behavior;
- ownership boundaries;
- semantic invariants;
- safe destructive scope;
- expected data transformations;
- applicable FROZEN rules.

Automation executes and enforces declared intent. It does not replace architectural judgment.

## 27. Acceptance criteria for the contract

The Migration Test Contract is successfully implemented when:

- every new database migration has a validated manifest;
- applicable test families are selected automatically;
- schema/RLS/RPC migrations cannot merge without required tests;
- positive and negative authorization tests exist;
- all migrations can be applied from zero in a clean local environment;
- regression tests run on every database-impacting PR;
- ELEVATED/CRITICAL gates enforce backup and restore requirements;
- test evidence is summarized automatically;
- Production execution uses the validated artifacts;
- post-migration verification is recorded;
- repeat manual checks are converted into repository tests.

## 28. Status decision

VECTOR Migration Test Contract v1 is **PROPOSED**.

It becomes FROZEN after review of:

- the manifest schema;
- risk thresholds;
- required actor matrix;
- backup/restore policy;
- generated-test boundaries;
- GitHub Actions enforcement model.

Implementation details may evolve after freezing, but the core rule remains: migration and verification are one versioned deliverable.
