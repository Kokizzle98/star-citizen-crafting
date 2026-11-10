# VECTOR DB Environment Governance v1

**Status:** FROZEN  
**Version:** 1.0  
**Authority Scope:** Supabase database environment identity, data classification, and the read and write gates for the VECTOR Supabase environment  
**Approved By:** project_owner (2026-11-11)  
**Supersedes:** none

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
- `ROLLBACK_POLICY_V1.md` keeps its rules for database recovery and forward-fixes; this document adds the gates that apply before and after a migration.
- `PROPOSED` specifications that assume a staging or preview database (for example `MIGRATION_TEST_CONTRACT_V1.md` §18) do not override this document; a separate staging environment is `DEFERRED` by `DB-ENV-09`.
- Per `VECTOR_GOVERNANCE_V1.md` §5, this rule becomes Production-authoritative after merge into `main`. Until then the owner's decision of 2026-11-11 recorded here is the binding working rule on `develop`.

## 3. Rules

### DB-ENV-01 — Production identity

The current VECTOR Supabase Production environment is:

```text
project_ref:   qpbgtzjtwgkwlgpbataq
project:       Kokizzle98's Project
organization:  Star Citizen Group Crafting
branch:        main
environment:   PRODUCTION
```

It must not be called staging. The mapping was confirmed by the owner in the Supabase interface.

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

### DB-ENV-09 — Separate staging or preview environment

An additional Supabase staging or preview environment is currently `DEFERRED` and is not a prerequisite for the current VECTOR alpha development. No paid Supabase plan is taken out for it at this time.

The decision is re-evaluated when at least one of these risk factors becomes relevant:

- real user data with retention value;
- substantially more real users;
- more complex or destructive data migrations;
- automated database deployments;
- rising production criticality;
- VECTOR approaching a real production or release operation.

Until then the database workflow is:

```text
repository migration
  -> local and PGlite contract tests
  -> review and CI
  -> explicit, named production-migration GO
  -> migration
  -> exact read-only postchecks
```

## 4. Frozen decision

VECTOR DB Environment Governance v1 is FROZEN with `DB-ENV-01` to `DB-ENV-09` as stated above.
