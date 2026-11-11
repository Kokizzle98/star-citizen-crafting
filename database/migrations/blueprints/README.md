# Blueprint migrations

Status of `001_blueprint_ownership_foundation.sql`: **repository only, not applied to Production.**
Applying it needs a separate, explicit, named owner GO (`DB-ENV-04`, `DB-ENV-07` in
`docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md`), followed by read-only postchecks recorded on the
migration pull request (`DB-ENV-08`). Merging the pull request does not apply it, and neither does a
Vercel or Supabase preview.

This file records the Blueprint Ownership / Tracking PR 2 contracts next to the migration. The owner
decisions behind them are in `docs/handover/VECTOR_RESTART_HANDOVER.md`, section 5. The technical
evidence is the migration itself and the contract tests listed at the end.

## 001 — catalog, personal ownership, derived crew view

The migration creates objects only. It imports no data, changes no existing table, policy or function,
and fails instead of adapting when a blueprint table already exists, any `public` function with one of
the four function names below exists (any argument list, so overloads included), or the verified crew
and profile columns are missing. Existing objects are never dropped or replaced.

### Catalog (global SCMDB data, signed-in users only)

| Table | Purpose | Identity |
| --- | --- | --- |
| `scmdb_blueprint_datasets` | one imported dataset per channel and version; source files, counts, `duplicate_source_rows`, lifecycle `STAGING` / `ACTIVE` / `FAILED` / `SUPERSEDED` | `UNIQUE (source, channel, version)`; at most one `ACTIVE` per channel |
| `blueprints` | stable VECTOR identity across dataset revisions | VECTOR UUID; `UNIQUE (source, source_guid)`, `source = 'SCMDB'` |
| `scmdb_blueprint_catalog` | dataset-specific content: tag, names, gear, type, manufacturer, recipe, `scmdb_is_default`, `cig_data_error`, `review_state`, `issues` | `PRIMARY KEY (dataset_id, blueprint_id)` |
| `scmdb_blueprint_reward_sources` | one reward source occurrence inside one dataset | see below |

`scmdb_is_default` is a raw SCMDB value only. It never creates ownership and says nothing about a user.

Reward source-occurrence identity (owner-approved):

```
UNIQUE (dataset_id, source_contract_id, source_reward_index, source_pool_guid, source_pool_entry_index)
```

- `source_reward_index`: 0-based position in `contracts[].blueprintRewards`;
  `source_pool_entry_index`: 0-based position in `blueprintPools[pool].blueprints`. Both are emitted by
  `lib/blueprints/blueprint-reward-extractor.ts`.
- `blueprint_id` is stored but not part of the key, so a wrong mapping conflicts instead of adding a row.
  A composite foreign key to the catalog of the same dataset makes an unresolved reference impossible.
- Duplicate business references stay separate rows. `duplicate_source_rows` (4 per channel in the
  mirrored data) is declared by the caller, recomputed by the sync and rejected on mismatch.
- No reward row identity is claimed across dataset revisions.

### Personal ownership

`user_blueprint_ownership`: `PRIMARY KEY (user_id, blueprint_id)`, `user_id` references `auth.users`,
`blueprint_id` references the stable `blueprints` identity (never a dataset row). A row means VECTOR
knows the blueprint as owned by this user; no row means *not known*, never *not owned*. No game account,
RSI account, crew or dataset is required. Provenance `MANUAL` is writable; `GAME_LOG` and `COMPANION`
are allowed values only and are not written by any function in this migration. No history: removing
ownership deletes the row.

### Functions

| Function | Caller | Behaviour |
| --- | --- | --- |
| `sync_scmdb_blueprint_catalog(...)` | `service_role` only (`SECURITY INVOKER`) | intended catalog write path; LIVE only; validates everything before writing; idempotent for an identical dataset; one transaction; fails closed on count, classification, duplicate-row, occurrence or unresolved-reference mismatches |
| `mark_blueprint_owned(blueprint_id)` | `authenticated` | acts for `auth.uid()` only, writes `MANUAL`, idempotent |
| `unmark_blueprint_owned(blueprint_id)` | `authenticated` | removes only the caller's own row |
| `get_active_crew_blueprint_status()` | `authenticated` | derived view of the active crew; same error contract as `get_active_group_inventory()`: `AUTH_REQUIRED`, `ACTIVE_GROUP_REQUIRED`, `ACTIVE_GROUP_NOT_ALLOWED`; no self-only fallback; status `SELF` before `CREW`; lists other members' `profiles.nickname` only; blueprints without known ownership are not returned |

The crew never owns blueprints. Own ownership is read directly from `user_blueprint_ownership`
(own rows only), so a later UI can show *Du* and *Nicht bekannt* without a valid crew.

### Access model

- Catalog tables: `SELECT` for `authenticated`; no access for `anon`; no write privilege for `anon` or
  `authenticated`.
- `service_role` is the privileged trusted-server path and technically holds direct write privileges on
  the catalog tables. Its intended application path is `sync_scmdb_blueprint_catalog()`, which enforces
  the LIVE-only, classification and count checks. These checks are not a database boundary against a
  deliberate direct `service_role` write. `service_role` credentials stay server-side only.
- Ownership table: own rows readable by `authenticated`; no direct insert, update or delete for
  application users; other members' ownership only through the crew function.
- Grants and revokes are explicit for every application role, independent of default privileges.
- Functions that need definer rights run with `search_path = ''` and fully qualified names; `EXECUTE`
  is revoked from `PUBLIC` and `anon`.

### Tests

PGlite contract tests (the crew and profile tables are reproduced as a fixture from the recorded
read-only Production prechecks, not as a baseline of the Production schema):

- `tests/blueprint-database-schema.test.mjs` — schema, catalog access, function security, migration hygiene
- `tests/blueprint-ownership-security.test.mjs` — personal ownership and crew view
- `tests/blueprint-catalog-sync.test.mjs` — sync and reward source occurrence with the real LIVE dataset
- `tests/blueprint-reward-source-occurrence.test.mjs` — extractor indices for LIVE and PTU
- shared fixture: `tests/blueprint-db-fixture.mjs`
