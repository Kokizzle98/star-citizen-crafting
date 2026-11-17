# VECTOR DEVELOP Database Concept

- **Status:** ACCEPTED (owner decisions of 2026-11-17 recorded in sections 2, 7 and 11; the binding rule is `DB-ENV-09` in `docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1_1.md`; this document stays a planning document and is not FROZEN)
- **Version:** 1.1 (counted up from 1.0; base commit `e97f88f`, correction base `bcd5333`, WP DEV-DB-G0-FIX: owner decisions 7 and 8 corrected on 2026-11-17)
- **Work package:** WP DEV-DB-KONZEPT (read-only analysis and planning), accepted and updated by WP DEV-DB-G0 (documentation only; nothing was created or changed)
- **Scope:** a second, separate Supabase project `DEVELOP` next to the existing Production project: how to build it, fill it, wire it to Vercel and operate it
- **Out of scope:** separate Supabase contexts for `LIVE` and `PTU` (still future work, see section 9), Supabase branching, any paid plan, any change to Production

This document is public. It deliberately contains no project references, URLs, keys, account data, concrete policy, function or grant details, and no findings about open security issues. The concrete read-only inventory of the current Production database is kept privately by the owner.

## 1. Goal

Today the only Supabase environment is Production (`DB_ENVIRONMENT_GOVERNANCE_V1_1`, `DB-ENV-01`; `DEVELOP` does not exist before G1). It holds test data only, but it is still Production, and Vercel Preview shares it. That means:

- every database change is tested for the first time on Production;
- Preview deployments are not write-safe;
- a large part of the database structure exists only in the live database, not as migrations in the repository, so an empty database cannot be rebuilt from the repository alone (the existing repository migrations check for objects that only exist live and stop otherwise).

The goal is a second, ordinary Supabase project `DEVELOP` that

1. has the same structure as Production;
2. holds only reproducible catalog data and synthetic test data;
3. is the database for Vercel Preview and local development;
4. is the first place every migration (starting with the hardening package H2) is applied and tested before Production.

## 2. Relationship to current rules

| Rule | Effect on this concept |
|---|---|
| `DB-ENV-01` Production identity | Unchanged. Production stays the existing project. The sentence "Vercel Preview and Production use the same database" stays valid until G4 is carried out; updating it after G4 is a governed change of its own. |
| `DB-ENV-03` Read access | The inventory for this concept used only read-only catalog queries in a read-only transaction. |
| `DB-ENV-04` Production write gate | Nothing in G1 to G5 touches Production. G6 is a Production mutation and needs its own named owner GO. |
| `DB-ENV-05` Repository authority | DEVELOP must not become a second, undocumented architecture. The schema snapshot is a bootstrap, not a source of truth; it is replaced by public baseline migrations (G7). |
| `DB-ENV-07` / `DB-ENV-08` | Stay as they are for Production. This concept adds a DEVELOP step in front of them. |
| `DB-ENV-09` DEVELOP environment | Re-evaluated by the owner on 2026-11-17 and recorded as a governed change: `DB_ENVIRONMENT_GOVERNANCE_V1_1` supersedes v1.0 and changes only this rule. `DEVELOP` on the Free plan is allowed (no branching, no paid plan, no third project). G0 is done with that change; G1 is possible after its merge. |
| `VECTOR_GOVERNANCE_V1` §7 | Unchanged: Preview = `develop` and other non-production branches, Production = `main`. This concept only decides which database each Vercel environment uses. |
| `ROLLBACK_POLICY_V1` | Applies unchanged. Every gate below names its fallback; for Production a reviewed forward-fix stays the preferred path. |

## 3. Target picture and order

```text
Supabase organization (Free plan, exactly 2 active projects)
├── PRODUCTION   existing project, test data, Vercel Production (main)
└── DEVELOP      new project, catalog + synthetic data, Vercel Preview + local
```

Order (each step is a gate in section 8):

```text
G0  record the governance decision (DB-ENV-09 re-evaluated)   <- done: DB_ENVIRONMENT_GOVERNANCE_V1_1
G1  owner creates the DEVELOP project
G2  engineer builds schema SQL from read-only catalog queries of Production (structure only),
    applies it to DEVELOP after the G2 GO, drift fingerprint on both projects (deviation = stop),
    plus the non-SQL configuration rebuilt (owner decisions in the dashboard, engineer guides)
G3  catalog data and synthetic test data seeded into DEVELOP
G4  Vercel Preview and local development switched to DEVELOP
G5  hardening H2 applied and tested on DEVELOP first
G6  H2 applied to Production (separate named GO)
G7  public baseline migrations in the repository (DEVELOP can then be rebuilt from Git)
```

Auth feature work happens on DEVELOP after G4.

## 4. What has to be rebuilt

### 4.1 Inside the SQL schema (covered by a schema snapshot)

Checklist for the snapshot and for the later drift comparison:

- schemas owned by VECTOR (today `public`; Supabase-managed schemas are not copied);
- tables, columns, defaults, identity / sequences;
- primary keys, foreign keys (including those to `auth.users`), unique and check constraints;
- indexes;
- RLS enable / force state and all policies;
- table, sequence and function grants, and **default privileges** (they decide what new objects get automatically and are easy to forget);
- functions / RPCs including `SECURITY DEFINER`, `search_path` and owner;
- triggers and event triggers created by the project;
- extensions that are actually installed (most available extensions are not);
- comments.

### 4.2 Outside the SQL schema (must be rebuilt by hand or by API)

| Area | What to carry over | How |
|---|---|---|
| Auth: URLs | Site URL, redirect allow list (localhost, Preview pattern) | Dashboard, DEVELOP-specific values, not copied from Production |
| Auth: providers | Which sign-in methods are on; external providers stay off on DEVELOP until the auth features need them (owner decision 2026-11-17) | Dashboard; provider secrets are new and DEVELOP-only |
| Auth: email | Templates, SMTP (or the built-in sender with its low rate limit), confirmation setting | Dashboard; templates may be copied as text, SMTP credentials are not shared |
| Auth: passwords and abuse | Minimum length / complexity, leaked-password protection, rate limits, MFA, session / JWT lifetimes | Dashboard; document the chosen values privately, then compare with Production |
| API settings | Exposed schemas, max rows | Dashboard |
| Storage | Buckets and storage policies (buckets are rows, not schema) | Only if used; dashboard or SQL |
| Edge Functions and their secrets | Code and secrets | Only if used; deploy from repository, new secrets |
| Vault secrets | Encrypted values | Never copied; new values if needed |
| Scheduled jobs, HTTP extension, database webhooks | Jobs and hooks | Only if used |
| Realtime | Publication membership, settings | Only if used |
| Network restrictions, SSL enforcement | Project settings | Dashboard |
| Platform defaults | Objects Supabase installs when a project is created (for example automatic RLS on new tables, depending on the creation options) | Check after G1 which ones exist, before applying the snapshot, to avoid duplicates |

The private inventory (owner archive) records which of these areas Production actually uses today. Areas not in use are only noted, not built.

## 5. Snapshot methods

| Method | Prerequisites | Credentials needed (named only, not requested) | Completeness | Repeatability | Risks |
|---|---|---|---|---|---|
| A. Supabase CLI `supabase db dump` (schema only, default mode) **(fallback only)** | Supabase CLI, Docker Desktop (the CLI runs `pg_dump` in a container), a terminal on the owner machine | Production database connection string including the database password (via `--db-url`), **or** a personal access token plus the database password for `supabase link` | High for project schemas: tables, constraints, indexes, policies, grants, functions, triggers, comments. Supabase-managed schemas are filtered out on purpose; objects added to managed schemas need explicit `--schema` flags | High: one command, same output format each time, diffable | The database password is a high-privilege secret on the owner machine; the output contains the full security model and must stay private; Docker / CLI version drift |
| B. Plain `pg_dump --schema-only` | PostgreSQL 17 client tools | Same connection string with database password | High, but unfiltered: includes Supabase-managed schemas and internal role grants, which fail or conflict on a fresh project | Medium: needs manual cleanup each time | Same secret risk as A, plus error-prone manual filtering |
| **C. SQL catalog queries (strictly read-only, through the Supabase connection), converted by the engineer into dependency-ordered schema SQL (standard method)** | Supabase connection to `PRODUCTION`, used only in read-only transactions | None beyond the existing connection authorization; no database password, no access token, no terminal and no Docker on the owner machine | High when generated systematically (tables, columns, defaults, sequences, constraints, indexes, policies, grants, default privileges, functions, triggers, extensions, comments in dependency order) and proven by the fingerprint; gaps are caught as deviations | High: the same generation and the same fingerprint every time, diffable | The generated SQL is a full description of the security model: it goes only into the private archive, never into the repository; hand-assembled DDL can miss objects, so the fingerprint is mandatory and any deviation stops the work; the SQL passes through the engineer's working context (accepted by the owner decision) |
| D. Dashboard export (copying definitions in the SQL editor / table view) | Dashboard login | Dashboard login | Low: object by object, policies and grants easy to miss | Low | Manual mistakes; the Free plan offers no downloadable backups |
| E. `supabase db pull` | CLI, Docker, link | Access token, database password | High | High | **Not allowed against Production:** it offers to write the remote migration history table, which is a Production mutation |
| F. Supabase branching | Paid plan | n/a | n/a | n/a | Excluded by owner decision |

**Recommendation (owner decision 2026-11-17): C is the standard method for the bootstrap and for the verification; A stays a documented fallback.** The owner does not run SQL or terminal commands.

- C: the engineer reads the structure of `PRODUCTION` with catalog queries inside read-only transactions and writes runnable schema SQL in dependency order (extensions, types, sequences, tables, constraints, indexes, functions, triggers, RLS and policies, grants, default privileges, comments). The SQL is delivered to the owner as a private attachment (05_Security_Private) and is never committed, attached to a pull request or quoted in public documents.
- Verification: a drift fingerprint (a count and a hash per object category, including grants and default privileges) is computed on both projects before and after G2 (section 7.2). Any deviation is a stop; it is fixed in the schema SQL, not by hand on one side.
- Fallback A: only if C cannot reproduce the structure completely. It needs Docker and a terminal and a database credential for `PRODUCTION`; because that would be a terminal step on the owner side, it needs its own owner decision before use.
- Rotating the Production database password after the snapshot stays the owner's decision 5 (done by the owner in the dashboard, no terminal); with method C no database password is used for the snapshot itself.

## 6. Filling DEVELOP

### 6.1 Catalog and reference data (reproducible, not personal)

| Data | Loaded today by | Path for DEVELOP |
|---|---|---|
| SCMDB blueprint catalog and reward sources (per dataset version) | `scripts/sync-scmdb-blueprint-catalog.mjs --apply --expect-version <version>`, one RPC call with the secret key, from the repository-pinned `data/scmdb/` mirror | Same runner, pointed at DEVELOP through a separate env file (section 6.3). One run per dataset version. |
| SCMDB location catalog, promotion to inventory locations | Builder in `lib/scmdb/` and the location RPCs; there is **no** owner-side runner script in the repository yet | Gap: a small runner analogous to the blueprint runner is needed (its own work package), or a one-time offline-generated payload. |
| Legacy location bindings | One-time owner decisions on Production | Not reproduced by default; DEVELOP starts with automatic mappings only. Replay only if a test needs it. |
| System fallback location (`Unbekannt`) | Repository migration | Comes with the schema / migrations. |
| Small configuration tables (identity provider list, game list) | Only in the live database, no seed in the repository | Must become part of the seed (non-personal rows). The exact rows are listed privately. |

### 6.2 Synthetic test data (never copied from Production)

No row from personal tables and no `auth.*` data is copied from Production. All test data is created fresh:

- 3 to 5 synthetic users with fixed names (for example `vector-dev-01` to `vector-dev-05`) and addresses under a reserved example domain (RFC 2606), created through the Auth admin API with automatic confirmation, so no real mail is sent;
- passwords generated locally, kept only in the owner's password manager / local env file, never in the repository;
- profile, active crew, crew membership, invitation, inventory lots and blueprint ownership created **through the same RPCs the app uses**, signed in as each synthetic user. That way the seed also exercises RLS and the RPC checks;
- only bootstrap rows that no user can create (for example an application role for one test admin, the small configuration tables) are inserted with the secret key.

Suggested fixture shape: one crew with owner, admin and member; one user without a crew (empty states); one pending invitation; inventory lots across several locations including `Unbekannt`; a few owned blueprints for the crew view.

### 6.3 Repeatable seed (later work package, not built here)

- a seed runner in the repository (for example `scripts/seed-develop.mjs`) plus data fixtures, reviewed like code;
- idempotent: a reset removes the synthetic users (personal rows cascade) and reseeds; catalog data is loaded only if the expected dataset version is missing;
- hard target guard: the runner refuses to run unless an explicit flag is given **and** the target URL equals a DEVELOP URL kept in the owner's local env file. It never contains a Production reference;
- env file naming: `.gitignore` currently ignores only `.env.local`. Before any additional env file (for example `.env.develop.local`) is introduced, `.gitignore` must cover `.env*.local`. Avoid `.env.production.local` and `.env.development.local` for runner credentials, because Next.js loads those automatically.

## 7. Operations

### 7.1 Migration flow

```text
repository migration (PR)
  -> local and PGlite contract tests, typecheck, lint, tests, review
  -> DEVELOP apply (gate decided by the owner, see below)
  -> read-only postchecks on DEVELOP + app smoke test on a Preview deployment
  -> explicit named Production GO (DB-ENV-07)
  -> Production apply
  -> read-only postchecks on Production (DB-ENV-08)
  -> drift check DEVELOP vs. Production
```

Rules:

- the byte-identical migration file is applied to both projects, in the same order, with the same mechanism;
- a migration that fails on DEVELOP never goes to Production; it is fixed in a new PR;
- owner decision 2026-11-17: one GO per work package for changes to DEVELOP, no standing GO. Production keeps its own named GO per change in every case;
- migration history: Production has no platform migration history today. From the baseline (G7) on, both projects should record applied migrations the same way; marking the baseline as applied on Production is a Production mutation and belongs to the G7 package.

### 7.2 Drift detection

- one read-only fingerprint query, run on both projects: per object category (tables / columns, constraints, indexes, policies, grants and default privileges, functions, triggers, extensions) a count and a hash of the normalized definitions;
- expected result: identical structure; data differs by design;
- run after every migration (both sides) and before every release; record only `PASS` / `FAIL` and counts in pull requests, keep the object-level output private;
- any difference is a stop: reconcile through a migration, never by editing one side by hand.

### 7.3 Pausing (Free plan)

- Free projects are paused after about one week of low activity; this applies to Production as well. A paused project can be resumed from the dashboard for about 90 days with data and configuration intact (per Supabase documentation at the time of writing; re-check before relying on it);
- DEVELOP pausing is harmless: resume before a work session, then check `ACTIVE_HEALTHY` before running tools;
- Production pausing is an outage for testers. Owner decision 2026-11-17: Production is not kept awake by a ping for now (no extra secret in another system); this is re-evaluated when more external testers join. Until then the owner resumes it from the dashboard if needed.

### 7.4 Size limit (0.5 GB per project)

- both databases are far below the limit today (tens of MB);
- growth drivers are catalog datasets: each new LIVE / PTU version adds a full catalog; archived datasets stay;
- DEVELOP keeps at most the active plus one previous dataset per channel; a retention rule for Production is a later decision;
- if a project exceeds the limit it can become read-only; check the size in the dashboard before each dataset load.

### 7.5 Cost and limit risks

- exactly 2 active Free projects per organization: no third project (for example a separate PTU project) without pausing one or paying;
- no backups on the Free plan: DEVELOP is reproducible (snapshot / baseline + seed), Production data is not; the structure snapshot also serves as a structure backup, a data backup stays part of the separate Backup Gate;
- the built-in auth mail sender is heavily rate-limited; seed users must not depend on mail.

### 7.6 What a later Pro upgrade would remove or change

- no automatic pausing;
- daily backups (point-in-time recovery as a paid add-on);
- larger database size per project;
- branching becomes possible (not planned);
- each project then costs compute; check current pricing before deciding.

## 8. Environment wiring

### 8.1 Variables that differ between Production and DEVELOP (names only)

| Variable | Differs? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Public value, but per project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Public by design, per project |
| `SUPABASE_SECRET_KEY` | yes | Secret, server only; never shared between projects |
| `APP_ORIGIN` | yes | Per Vercel environment (production domain, Preview origin, localhost) |
| `CITIZEN_ID_ENABLED` | may differ | Stays `false` by default; DEVELOP may enable it for auth feature work |

GitHub Actions currently use no Supabase credentials; nothing changes there.

### 8.2 Target mapping

| Where | Database |
|---|---|
| Vercel Production (`main`) | PRODUCTION |
| Vercel Preview (`develop` and other branches) | DEVELOP |
| Vercel Development / `vercel env pull` | DEVELOP |
| Local `.env.local` | DEVELOP (default) |
| Owner-side Production runners (catalog sync, postchecks) | PRODUCTION, only through a separate local env file and only with a GO |

### 8.3 Switch order (G4) and fallback

1. DEVELOP is built, seeded and its drift check against Production is `PASS`.
2. DEVELOP auth URLs allow localhost and the Preview pattern.
3. In Vercel, split any variable that is shared across scopes into scope-specific entries; set the Preview and Development entries to DEVELOP values. Production entries stay untouched.
4. Redeploy one Preview (variables apply only to new deployments) and run a smoke test: sign in as a synthetic user, read catalog, add and edit a lot, crew view.
5. The owner switches the local `.env.local`.

Fallback: set the Preview / Development entries back to the Production values (still present in the Production scope) and redeploy the Preview. No database change is involved.

## 9. Later: LIVE / PTU

The Free plan does not allow separate projects for `LIVE` and `PTU` in addition to Production and DEVELOP. Until a plan change, channel isolation stays inside each database (the existing channel columns and the no-fallback rule of `VECTOR_VERSIONING_V1_1`). Separate channel contexts remain a future infrastructure work package.

## 10. GO points

| GO | Step | Who | Change type | Touches Production | Risk | Fallback |
|---|---|---|---|---|---|---|
| G0 | Record the decision to re-evaluate `DB-ENV-09` as a governed change (`DB_ENVIRONMENT_GOVERNANCE_V1_1`, v1.0 superseded) | Owner decides, engineer drafted the PR | Documentation (FROZEN change process) | No | Low | Revert the PR; DEVELOP stays unbuilt |
| G1 | Create the project `DEVELOP` in the same organization: same region and Postgres major version as Production, strong database password stored in the password manager, note platform defaults installed at creation | Owner (account action) | New project | No | Low; uses the second and last Free slot | Pause or delete the project |
| G2 | (a) Engineer reads the structure of `PRODUCTION` strictly read-only (catalog queries, read-only transactions, method C) and builds dependency-ordered schema SQL; (b) after the G2 GO the engineer applies it to `DEVELOP` (target verified by name before every write, single transaction where possible, stop on first error) and computes the drift fingerprint (count and hash per object category incl. grants and default privileges) on both projects; any deviation is a stop; (c) the non-SQL configuration (section 4.2) is rebuilt, the owner decides values in the dashboard, the engineer guides step by step. The schema SQL goes to the owner as a private attachment, never into the repository or a PR | Engineer (a, b); owner gives the G2 GO and makes the dashboard settings (c); the owner runs no SQL or terminal commands | Read on `PRODUCTION`; DDL on `DEVELOP`; `DEVELOP` settings | Read only | Medium: wrong target project, missing objects, duplicates with platform defaults | Reset `DEVELOP` (drop the project schema and reapply, or recreate the project) |
| G3 | Load catalog datasets and the synthetic seed into DEVELOP | Engineer after the GO for that work package (owner provides DEVELOP keys locally) | Data on DEVELOP | No | Low to medium: wrong env file pointing at Production | Target guard in the runner; reset synthetic users and reseed |
| G4 | Switch Vercel Preview / Development and local env to DEVELOP | Owner GO; owner or engineer with explicit approval performs it | Vercel configuration | No (Production scope unchanged) | Medium: Preview login or data broken; auth redirect mismatch | Restore Preview / Development entries to the Production values, redeploy Preview |
| G5 | Apply hardening H2 (reviewed migration from the repository) to DEVELOP, run postchecks, RLS / RPC tests and the Preview smoke test | Engineer after the GO for that work package | DDL on DEVELOP | No | Low for Production; findings may require migration changes | Reviewed reverse migration on DEVELOP, or reset DEVELOP from snapshot + seed |
| G6 | Apply the same H2 migration to Production, then `DB-ENV-08` postchecks and drift check | Owner: separate named Production GO; engineer applies | DDL on Production | **Yes** | Medium: app paths may break on Production | Prepared and reviewed forward-fix or reverse migration (`ROLLBACK_POLICY_V1`); Vercel rollback for app code if needed |
| G7 | Public baseline migrations in the repository (security-neutral form), DEVELOP rebuilt from Git as proof, baseline marked as applied on Production | Engineer drafts; owner GO for the Production marking | Repository; DEVELOP rebuild; Production migration history | Yes (history only) | Medium: baseline must not reveal unfixed issues, so it follows G6 | Revert the PR; DEVELOP can still be rebuilt from the private snapshot |

## 11. Owner decisions (2026-11-17) and what is still open

Decided by the owner on 2026-11-17 (recorded as conditions of `DB-ENV-09` in `DB_ENVIRONMENT_GOVERNANCE_V1_1`):

1. One second, ordinary Supabase project `DEVELOP` on the Free plan. Production and DEVELOP are the two active Free projects; no branching, no paid plan, no third project.
2. `DB-ENV-09` is re-evaluated (from `DEFERRED` to "DEVELOP on the Free plan is allowed"). All other `DB-ENV` rules stay. Production stays the existing project. The deployment-binding sentence of `DB-ENV-01` stays valid until G4.
3. GO for DEVELOP: one GO per work package, no standing GO. Production: its own named GO per change (`DB-ENV-04`, `DB-ENV-07`).
4. Production is not kept awake by a ping for now; re-evaluated when more external testers join.
5. The owner rotates the Production database password himself in the dashboard after the snapshot.
6. External auth providers on DEVELOP: later, only with the auth features.
7. Snapshot and application (G2) are done by the engineer: strictly read-only catalog queries of `PRODUCTION`, runnable dependency-ordered schema SQL, applied to `DEVELOP` after the G2 GO, drift fingerprint on both projects (any deviation is a stop); the SQL is a private attachment for the owner and never enters the repository. The owner runs no SQL and no terminal commands. The CLI dump stays a fallback only. *(Corrected 2026-11-17, owner decision: the first version of this entry had the owner apply the snapshot locally.)*
8. Connector rule (section 12), made precise on 2026-11-17 (owner decision).

Still open (none blocks G1):

- exact format of the drift fingerprint query (own small work package, before the drift check in G2);
- the missing location catalog runner (section 6.1) and the seed runner (section 6.3), each its own work package under its own GO;
- registration of this document in `docs/RULE_INDEX.md` as an architecture reference, if the owner wants it there.

## 12. Connector rule

Owner decision 2026-11-17 (made precise):

- **Target state:** one project-scoped connection per project (configured outside this repository). The `PRODUCTION` connection is read-only (`read_only=true`); the `DEVELOP` connection may write, and only inside a work package that has its GO.
- **Transition rule until then:** the engineer writes **exclusively** to the project named `DEVELOP`. The project is verified by name before the first write and the target is checked before every write action. `PRODUCTION` is accessed read-only only, in read-only transactions.
- Every Production mutation remains its own named owner GO (`DB-ENV-04`, `DB-ENV-07`).
- An account-wide connection is not used for write actions without that target check, so that the two projects cannot be confused.
- Agents name the project by its name (`PRODUCTION` or `DEVELOP`), never by posting a project reference or URL into a chat, pull request or document. The exact display names are kept in the owner's private archive.
- This document contains no references, URLs, keys or passwords and makes no statement about integration or dashboard settings of `PRODUCTION`.
