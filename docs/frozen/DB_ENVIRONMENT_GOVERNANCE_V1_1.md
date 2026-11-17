# VECTOR DB Environment Governance v1.1

**Status:** FROZEN\
**Version:** 1.1 (revision 2, 2026-11-17: conditions 7 and 8 of `DB-ENV-09` corrected before the first merge; correction base `bcd5333`)\
**Base Commit:** `e97f88f` (`develop` at the time of this change; merge of PR #89)\
**Authority Scope:** Supabase database environment identity, data classification, and the read and write gates for the VECTOR Supabase environments\
**Approved By:** project_owner (owner decision 2026-11-17; binding for development on `develop` from merge of this change set, part of the Production rule set once released to `main`)\
**Supersedes:** `DB_ENVIRONMENT_GOVERNANCE_V1.md` v1.0 in full

## 0. Change log (v1.0 to v1.1)

This document is the full-document successor to v1.0 (`VECTOR_GOVERNANCE_V1.md` §5). v1.0 remains physically unchanged and is registered `SUPERSEDED`.

Amendment of v1.1: **`DB-ENV-09` only.** `DB-ENV-01` to `DB-ENV-08` carry over from v1.0 with the consequential edits listed below and no other change.

| Item | Change | Authority |
|---|---|---|
| `DB-ENV-09` | Re-evaluated: from "separate staging or preview environment `DEFERRED`" to "a separate `DEVELOP` environment on the Free plan is allowed", with the conditions in `DB-ENV-09` (owner decisions 1 to 8 of 2026-11-17, recorded there) | Owner decision 2026-11-17 |
| `DB-ENV-01` (consequential) | The sentence that a separate Supabase preview or staging environment "remains `DEFERRED` (`DB-ENV-09`)" is replaced by a pointer to the re-evaluated `DB-ENV-09`. The deployment-binding statement itself (Vercel Preview and Vercel Production use the same Production database) is **unchanged and stays valid until G4 of `docs/architecture/DEV_DB_CONCEPT.md` is carried out** | Owner decision 2026-11-17, point 2 |
| `DB-ENV-01` (editorial) | The identity block (project reference, project name, organization) is not repeated in this document. v1.0 and the owner's private project archive keep it. Mapping, branch and environment lines are unchanged. The owner is asked to confirm this editorial omission when merging | Public-repository rule (`AI_OPERATING_MODEL` §5) |
| §2 (consequential) | The bullet on `PROPOSED` specifications that assume a staging environment no longer says "`DEFERRED` by `DB-ENV-09`"; it points to the re-evaluated rule | Follows `DB-ENV-09` |
| `DB-ENV-09`, condition 7 (correction) | Snapshot and application are done by the engineer through strictly read-only catalog queries and, after the G2 GO, applied to `DEVELOP`, verified by a drift fingerprint (any deviation is a stop); the owner runs no SQL and no terminal commands. Replaces the first entry, in which the owner applied the snapshot locally | Owner decision 2026-11-17 (correction) |
| `DB-ENV-09`, condition 8 (correction) | Target state and transition rule made precise: the engineer writes exclusively to the project named `DEVELOP`, verified by name before every write; `PRODUCTION` read-only | Owner decision 2026-11-17 (correction) |
| `DB-ENV-02` to `DB-ENV-08` | Unchanged | none |

No Production mutation results from this change. Creating the `DEVELOP` project (G1) is an owner account action and does not mutate Production.

## 1. Purpose

This document fixes which Supabase environment VECTOR uses, what kind of data it holds, and which operations against it are allowed with and without explicit owner approval.

It exists so that two separate properties are never conflated again:

1. **technical environment classification**: what role an environment plays (Production, staging, preview);
2. **data classification**: what the data in that environment is worth (real user data with retention value, or test data without it).

The following equations are wrong and must not be made:

```text
PRODUCTION  =  valuable production data        (wrong)
test data   =  staging                         (wrong)
```

An environment can be technically Production while holding only test data. Holding only test data does not make an environment staging, and it does not lower the gates that apply to Production.

## 2. Relationship to other rules

- `VECTOR_GOVERNANCE_V1.md` §7 maps the Git branches to the Vercel environments. It does not map Supabase environments. This document adds the Supabase mapping and does not change the Vercel mapping.
- `VECTOR_GOVERNANCE_V1.md` §10 ("validate in Preview before Production") refers, in its deployment context, to Vercel Preview and runtime validation (owner interpretation of 2026-11-11). It does not require a separate, paid Supabase preview or staging database. This clarifies the existing contract and does not change `VECTOR_GOVERNANCE_V1.md`. The two validation paths are:

  ```text
  APPLICATION / RUNTIME
  feature or change -> develop -> Vercel Preview -> runtime and release validation
                    -> main -> Vercel Production

  DATABASE
  versioned repository migration -> local and PGlite contract tests
                                 -> typecheck, lint, tests and review
                                 -> explicit owner production-migration gate
                                 -> VECTOR Supabase Production
                                 -> exact read-only postchecks
  ```
- `ROLLBACK_POLICY_V1.md` keeps its rules for database recovery and forward-fixes; this document adds the gates that apply before and after a migration.
- `PROPOSED` specifications that assume a staging or preview database (for example `MIGRATION_TEST_CONTRACT_V1.md` §18) do not override this document; a separate environment is governed by the re-evaluated `DB-ENV-09` (Production gates unchanged).
- Per `VECTOR_GOVERNANCE_V1.md` §5, this rule becomes Production-authoritative after merge into `main`. Until then the owner's decision of 2026-11-11 recorded here is the binding working rule on `develop`.

## 3. Rules

### DB-ENV-01 — Production identity

The current VECTOR Supabase Production environment is the existing single Supabase project (reference, project name and organization: see the owner's private project archive; not repeated here):

```text
branch:        main
environment:   PRODUCTION
```

It must not be called staging. The mapping was confirmed by the owner in the Supabase interface.

Current deployment binding: Vercel Preview and Vercel Production currently use this same VECTOR Supabase Production database. Vercel Preview isolates the application code and the deployment, not the database. A Preview deployment may therefore read current Production test data and, as far as the application allows, also write it. Preview status is not database isolation. This describes the current technical state and is not a rule that Preview and Production must always share one database. The Production write gates of this document apply unchanged. A separate `DEVELOP` environment is permitted by the re-evaluated `DB-ENV-09`; until it exists and the Vercel switch (G4 of `docs/architecture/DEV_DB_CONCEPT.md`) is done, the statement in this paragraph stays valid.

### DB-ENV-02 — Current data classification

The technical Production environment currently holds only VECTOR test data without retention value (inventory, crew, blueprint and other VECTOR user data).

This data classification does not remove the Production status of the technical environment. All Production gates in this document apply regardless of the data classification.

### DB-ENV-03 — Read access

Read-only access to VECTOR Supabase Production is allowed when it is needed for analysis, prechecks or postchecks. This includes:

- reading the schema, `information_schema` and `pg_catalog`;
- reading table and column definitions;
- reading primary keys, foreign keys and constraints;
- reading indexes;
- reading RLS status and policies;
- reading function and RPC definitions;
- counts and pure validation queries;
- explicit read-only postchecks.

The Supabase connector may be used for this. A query is read-only only if it changes no data, schema, configuration or session-persistent state; calling a function that writes is not a read.

### DB-ENV-04 — Production write gate

Every mutation against Supabase Production requires an explicit owner approval. Approval of a pull request or a work package is **not** approval of a Production mutation.

Without a separate explicit approval, the following are forbidden:

- `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`;
- DDL, including `CREATE`, `ALTER` and `DROP`;
- applying a migration;
- creating or changing a function or RPC;
- changing a trigger;
- changing RLS or policies;
- changing secrets;
- changing project configuration;
- creating Supabase branches or environments;
- any other persistent mutation.

A missing piece of information is never obtained through a mutation.

### DB-ENV-05 — Repository authority

Durable database schema changes must exist as versioned migrations in the repository (`database/migrations/`).

No parallel architecture may be created that exists only directly in Supabase. Connector access does not replace a repository migration.

### DB-ENV-06 — Predeployment validation

Before a Production migration, the following run as far as technically possible:

- local contract tests;
- PGlite tests;
- typecheck;
- lint;
- relevant unit and integration tests;
- `git diff --check`;
- GitHub CI;
- review.

A security-critical migration additionally passes its own architecture and security gate before approval.

### DB-ENV-07 — Production migration gate

Only after successful validation does the owner explicitly approve applying one concrete, named migration to VECTOR Supabase Production.

There is no silent migration after a merge. Merging a pull request that contains a migration does not apply it.

### DB-ENV-08 — Postdeployment verification

Every approved Production migration is followed by explicit read-only SQL postchecks. Their results are compared with the expected contract and recorded.

The primary place of evidence is the pull request that contains the migration. The evidence contains at least:

- the exact migration or migration file;
- the time or a clear execution context;
- the read-only postchecks that were run;
- their actual results;
- `PASS` or `FAIL` against the expected contract;
- the required follow-up action on `FAIL`.

If a migration is applied only after its pull request was merged and that pull request can no longer be amended sensibly, the evidence is recorded as a traceable comment on, or a linked GitHub record of, exactly that migration pull request. Postcheck evidence never remains only in a chat or a local document.

### DB-ENV-09 — Separate DEVELOP environment (re-evaluated in v1.1)

Status in v1.0: a separate staging or preview environment was `DEFERRED`.

Status in v1.1 (owner decision 2026-11-17): **re-evaluated. A separate `DEVELOP` environment on the Supabase Free plan is allowed.** The re-evaluation does not change `DB-ENV-01` to `DB-ENV-08`; those rules keep governing Production. The planning document is `docs/architecture/DEV_DB_CONCEPT.md`.

Owner decisions of 2026-11-17, recorded as the conditions of this rule:

1. **Shape.** One second, ordinary Supabase project named `DEVELOP` on the Free plan. Production and `DEVELOP` are the two active Free projects. No Supabase branching, no paid plan, no third project.
2. **Production stays the existing project** (`DB-ENV-01`). It is never called staging and never replaced by `DEVELOP`.
3. **GO for `DEVELOP`.** Each change to `DEVELOP` needs one explicit owner GO per work package. There is no standing GO. For Production, every change keeps its own named GO (`DB-ENV-04`, `DB-ENV-07`).
4. **No keep-alive for Production.** Production is not kept awake by a ping against the Free plan pausing. This is re-evaluated when more external testers join.
5. **Production database password.** The owner rotates it himself in the dashboard after the schema snapshot. That is a Production configuration change made by the owner.
6. **External auth providers on `DEVELOP`:** later, only together with the auth features.
7. **Snapshot and application (G2) are done by the engineer, not by the owner** (corrected by owner decision 2026-11-17; the first version of this condition had the owner apply the snapshot). The engineer reads the structure of `PRODUCTION` strictly read-only through the Supabase connection (read-only transaction, system catalog queries, method C of `docs/architecture/DEV_DB_CONCEPT.md`) and turns it into runnable, dependency-ordered schema SQL. After the GO for G2 the engineer applies it to `DEVELOP`. Afterwards a drift fingerprint (a count and a hash per object category, including grants and default privileges) is computed on both projects; **any deviation is a stop.** The schema SQL is delivered to the owner as a private attachment (private archive) and never enters the repository, a pull request or a public document. The owner runs no SQL and no terminal commands. The CLI dump method stays a fallback only.
8. **Connector rule** (made precise by owner decision 2026-11-17). Target state: one project-scoped connection per project; the `PRODUCTION` connection is read-only (`read_only=true`), the `DEVELOP` connection may write. Transition rule until then: the engineer writes **exclusively** to the project named `DEVELOP`; the project is verified by name and the target is checked before every write action. `PRODUCTION` is accessed read-only only (read-only transaction). Every Production mutation remains its own named owner GO (`DB-ENV-04`, `DB-ENV-07`). No account-wide access is used for write actions without that target check, so that the two projects cannot be confused. The exact display names of the projects are kept in the owner's private archive.

Carried over from v1.0 and clarified for the two-project setup:

- Production mutations need the explicit owner GO of `DB-ENV-04` and follow `DB-ENV-05` to `DB-ENV-08`;
- the migration flow becomes: repository migration, local and PGlite contract tests, review and CI, apply to `DEVELOP` (GO per work package), postchecks and application smoke test, then the named Production GO, Production apply and exact read-only postchecks;
- a migration that fails on `DEVELOP` does not go to Production;
- before G4 the deployment binding of `DB-ENV-01` stays as it is;
- the `DEVELOP` project is created by the owner (G1); the engineer does not create projects.

The other staging-related risk factors of v1.0 (real user data with retention value, substantially more real users, destructive migrations, automated database deployments, rising production criticality, approaching a real release operation) are still re-evaluated when they become relevant. Moving to a paid plan or a third project is not covered by this rule and needs its own governed change.

## 4. Frozen decision

VECTOR DB Environment Governance v1.1 is FROZEN with `DB-ENV-01` to `DB-ENV-09` as stated above. It supersedes v1.0 in full; `DB-ENV-09` is the only rule changed in substance.
