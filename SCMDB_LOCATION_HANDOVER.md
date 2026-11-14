# SCMDB Location Pipeline – Handover

Status: **FROZEN / DONE**

## Restart Baseline

- Branch: `develop`
- Baseline: `f041116d2ada506f6a9e70b93d0f41ff8888506c`
- Working tree at final seal: clean
- Final repository gate: **153/153 tests PASS**
- Typecheck: PASS
- `git diff --check`: PASS

For a restart, begin from this document and the current `develop` branch.

## Completed Scope

The SCMDB location pipeline is operational end to end:

1. SCMDB extraction, normalization and classification
2. LIVE/PTU dataset persistence and versioning
3. deterministic `source_key` identity
4. promotability classification
5. SCMDB-to-VECTOR mapping foundation
6. atomic LIVE promotion
7. explicit legacy binding
8. Inventory location integration
9. archive/reactivate lifecycle
10. PostgreSQL runtime, rollback and idempotency validation

## Production State at Final Seal

ACTIVE LIVE dataset:

- Catalog rows: **959**
- VALID: **918**
- QUARANTINED: **15**
- REJECTED_TECHNICAL: **26**

VECTOR:

- `inventory_locations`: **266**
- active LIVE SCMDB mappings: **265**
- `AUTO_CREATED`: **263**
- `LEGACY_CONFIRMED`: **2**
- Inventory Lots: **13**
- Lots with `location_id`: **13/13**
- active system fallback `Unbekannt`: **1**
- system-location SCMDB mappings: **0**

## Legacy Bindings

Levski:

- SCMDB `source_key`: `8e0e5a8ab2b1`
- VECTOR UUID: `98a57fa1-be28-4cae-8d58-4758df6195f7`

New Babbage:

- SCMDB `source_key`: `7e8f8b436c21`
- VECTOR UUID: `69f77d46-503a-45ff-baea-6a8bf841d51d`

Both are `LEGACY_CONFIRMED`.

## FROZEN Contracts

- SCMDB identity = `source_key`
- VECTOR location identity = `inventory_locations.id`
- names are never identities
- `LOT_IDENTITY_V1 = user_id + material + quality + location_id`
- `Unbekannt` remains the persistent SCMDB-independent system fallback
- SCMDB lifecycle never deletes VECTOR locations
- SCMDB lifecycle never automatically relocates Inventory Lots
- retired mapped locations are archived, not deleted
- returning sources reactivate the same mapping and VECTOR UUID
- archived locations are not valid new Add/Edit targets
- an existing Lot may retain its unchanged archived location
- PTU must not mutate productive LIVE location lifecycle

## Remaining SCMDB Conflicts

After production promotion:

- Promotable: **294**
- Already mapped: **265**
- New created on repeated run: **0**
- Unresolved conflicts: **29**

These conflicts are intentionally unresolved.

Do not introduce:
- first-one-wins mapping
- name-based identity
- automatic renaming/suffixing
- heuristic legacy binding

Treat future conflict resolution as a separate explicit work package.

## Relevant Migrations

SCMDB:

- `001` catalog/dataset foundation
- `002` runtime read grants
- `003` mapping foundation
- `004` active-dataset mapping guard
- `005` atomic location promotion
- `006` explicit legacy binding
- `007` archive/reactivate lifecycle

Inventory:

- `004_edit_retain_archived_location.sql`

Migration 007 supersedes the old migration-004 activation-blocker behavior at runtime without rewriting historical migrations.

## Runtime Guarantees Verified

Real PostgreSQL/Supabase runtime gates verified:

- promotion security and LIVE-only boundary
- promotion rollback
- production promotion
- promotion idempotency
- legacy binding and idempotency
- conflicting legacy bindings fail closed
- unchanged archived Inventory location edit
- changed active Inventory target
- changed archived target rejection
- atomic Edit Identity Conflict merge
- lifecycle STILL_ACTIVE
- lifecycle RETIRE
- lifecycle REACTIVATE
- lifecycle idempotency
- lifecycle rollback
- UUID stability
- Inventory Lot reference stability
- Unbekannt protection

## Known Evidence Limitation

The server-side Inventory read-RPC definition is not present in the repository.

Do not fabricate or reconstruct it from assumptions.

Client-side archived-assignment handling and the relevant Inventory write boundaries are covered by tests and runtime validation.

## Next Work

Do not reopen SCMDB Location work without a concrete defect or explicit new requirement.

Next planned product area:

**Blueprint Ownership / Tracking**

After that, continue toward linking Crafting with Crew Inventory.

## Restart Rule

When resuming VECTOR:

1. read this file;
2. verify `develop` and `origin/develop`;
3. inspect current HEAD before assuming the baseline above is still current;
4. preserve all FROZEN contracts above;
5. start new work on a dedicated feature branch;
6. keep unrelated SCMDB Location changes out of new work packages.
