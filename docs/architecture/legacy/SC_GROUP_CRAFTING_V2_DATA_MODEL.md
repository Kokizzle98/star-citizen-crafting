Status: LEGACY ARCHITECTURE REFERENCE
Authority: Non-binding
Superseded by: docs/frozen/* and current architecture documents


# SC Group Crafting / Star Citizen Management Platform
## V2 Logical Data Model

Status: Architecture draft, not yet a production migration
Purpose: Central Star Citizen management platform for users, crews, crafting, inventory, ships, fleet planning, UEX, Discord, RSI hangar imports, watcher events, and configurable game wipes.

---

## 1. Binding design principles

1. Internal UUIDs are authoritative. SCMDB, UEX, RSI/CIG, Discord, Erkul-compatible and watcher identifiers are external identities only.
2. Master data, user assets, current game state, plans, and external publications are separate domains.
3. No UEX secret, Discord secret, RSI cookie, or privileged token is readable from the public frontend.
4. A concrete user-owned ship is always an individual record, even if a user owns the same ship model multiple times.
5. Current ship loadout, default ship loadout, saved loadout template, and target fleet loadout are separate records.
6. Star Citizen wipes never delete platform master data, user identity, crew membership, saved plans, or audit history.
7. Game wipes are data-driven and can affect domains partially or fully.
8. Wiped game assets are invalidated and historized, not blindly deleted.
9. Crew administration, functional crew duties, and platform administration are separate authorization layers.
10. Only an ACTIVE fleet plan produces official crew farming targets.

---

## 2. Domain overview

```text
IDENTITY AND AUTH
- auth.users
- profiles
- user_external_accounts
- user_preferences
- protected_provider_credentials
- user_devices

PLATFORM AUTHORIZATION
- platform_roles
- platform_permissions
- platform_role_permissions
- platform_user_roles
- platform_action_challenges
- platform_audit_log

CREWS AND CREW AUTHORIZATION
- groups
- group_members
- group_invites
- group_roles
- group_permissions
- group_role_permissions
- group_member_functional_roles
- group_external_integrations
- crew_audit_log

VERSIONING AND PROVIDERS
- game_versions
- game_epochs
- data_providers
- external_identities
- integration_sync_runs
- integration_raw_records
- integration_errors

MASTER DATA
- manufacturers
- items
- item_aliases
- item_media
- item_relations
- stat_definitions
- item_stats
- ships
- ship_stats
- ship_hardpoints
- ship_default_loadouts
- ship_default_loadout_items
- item_compatibility

CRAFTING
- blueprints
- blueprint_slots
- blueprint_slot_options
- blueprint_modifiers

USER GAME STATE
- inventory_lots
- owned_items
- owned_item_modifiers
- user_wallets
- wallet_snapshots
- user_progress_states
- refinery_jobs

HANGAR AND FLEETS
- hangar_assets
- fleets
- user_ships
- fleet_shares
- ship_loadouts
- ship_loadout_items
- user_ship_loadout_states
- user_ship_loadout_state_items

FLEET PLANNING
- build_profiles
- ship_build_recommendations
- ship_build_recommendation_items
- ship_upgrade_plans
- ship_upgrade_plan_items
- fleet_upgrade_plans
- fleet_upgrade_plan_versions
- fleet_upgrade_plan_ships
- crafting_requirements
- inventory_reservations

MARKETPLACE
- market_locations
- market_prices
- marketplace_listings
- marketplace_publications

WATCHER
- watcher_devices
- watcher_pairing_codes
- watcher_events
- watcher_import_runs

WIPES
- wipe_events
- wipe_event_rules
- wipe_dry_runs
- wipe_execution_jobs
- wipe_affected_records
```

---

## 3. Identity and external accounts

### profiles

```text
id uuid PK -> auth.users.id
nickname citext UNIQUE NOT NULL
avatar_url text NULL
locale text NOT NULL DEFAULT 'de-DE'
timezone text NULL
onboarding_status text NOT NULL
created_at timestamptz
updated_at timestamptz
```

### user_external_accounts

Links one internal user to external services.

```text
id uuid PK
user_id uuid FK -> profiles.id
provider_code text              -- DISCORD, UEX, RSI, CIG, SCMDB
external_user_id text NULL
external_username text NULL
external_display_name text NULL
external_avatar_url text NULL
link_status text                 -- PENDING, VERIFIED, REVOKED, ERROR
verified_at timestamptz NULL
last_synced_at timestamptz NULL
metadata jsonb
UNIQUE(provider_code, external_user_id)
```

### protected_provider_credentials

Logical server-side secret reference. The credential itself must not be exposed through normal SELECT access.

```text
id uuid PK
user_id uuid FK -> profiles.id
provider_code text              -- UEX
credential_type text            -- USER_SECRET_KEY
secret_reference text           -- reference to protected secret storage
encryption_version text NULL
status text                     -- ACTIVE, REVOKED, INVALID
last_verified_at timestamptz NULL
last_used_at timestamptz NULL
created_at timestamptz
updated_at timestamptz
```

UEX uses two credential layers:

```text
Platform UEX app Bearer token -> server-side platform secret
User UEX secret-key           -> protected per-user credential
```

Discord may be used as a Supabase authentication provider. UEX remains a linked external account unless UEX later offers a suitable third-party OAuth flow.

---

## 4. Authorization model

### Platform authorization

```text
platform_roles
- id
- code                         -- PLATFORM_ADMIN
- name
- description
- is_system

platform_permissions
- id
- code
- description
- risk_level                  -- NORMAL, ELEVATED, CRITICAL

platform_role_permissions
- role_id
- permission_id

platform_user_roles
- user_id
- platform_role_id
- granted_by_user_id
- granted_at
- revoked_at
```

Initial platform permissions:

```text
platform.users.view
platform.users.manage
platform.integrations.manage
platform.providers.manage
platform.game_versions.manage
platform.master_data.items.manage
platform.master_data.ships.manage
platform.game_wipes.create
platform.game_wipes.preview
platform.game_wipes.execute
platform.wipes.platform
platform.audit.view
```

Kokizzle98 receives `PLATFORM_ADMIN` through `platform_user_roles`; no nickname or email hardcoding is allowed.

### Crew hierarchy roles

```text
OWNER
ADMIN
MEMBER
```

### Crew functional roles

Functional roles are additive and independent from OWNER/ADMIN/MEMBER.

Initial functional role:

```text
FLEET_ARCHITECT
UI label: Flottenarchitekt
```

Core fleet permissions:

```text
fleet.view
fleet.ship.view_shared
fleet.plan.view
fleet.plan.create
fleet.plan.edit
fleet.plan.publish
fleet.plan.activate
fleet.target_loadout.set
fleet.target_quality.set
fleet.material_plan.generate
```

A normal MEMBER can view an active crew plan and manage their own ships, but cannot alter official target loadouts or farming goals.

---

## 5. Versioning, channels, and epochs

### game_versions

```text
id uuid PK
channel text                   -- LIVE, PTU, EPTU, HOTFIX, TECH_PREVIEW
semantic_version text NULL
build_number text NULL
full_version text NOT NULL
released_at timestamptz NULL
is_current boolean
provider_id uuid FK -> data_providers.id
```

### game_epochs

Represents a persistent game-state period between relevant resets.

```text
id uuid PK
channel text
name text
game_version_id uuid NULL
started_at timestamptz
ended_at timestamptz NULL
started_by_wipe_event_id uuid NULL
is_current boolean
```

There is one current epoch per channel.

---

## 6. Universal external identity model

### external_identities

```text
id uuid PK
entity_type text               -- ITEM, SHIP, BLUEPRINT, LOCATION, USER, etc.
entity_id uuid
provider_id uuid FK -> data_providers.id
external_id text NULL
external_uuid text NULL
external_code text NULL
external_slug text NULL
source_url text NULL
match_status text              -- AUTO_MATCHED, VERIFIED, CONFLICT, UNVERIFIED, REJECTED
match_method text NULL
match_confidence numeric NULL
last_verified_at timestamptz NULL
metadata jsonb
```

This maps internal entities to SCMDB, UEX, RSI/CIG and other providers without making provider IDs authoritative.

---

## 7. Item master data

### items

```text
id uuid PK
canonical_name text NOT NULL
normalized_name text NOT NULL
item_type text                 -- RESOURCE, COMMODITY, COMPONENT, WEAPON, ARMOR, etc.
category text NULL
subcategory text NULL
manufacturer_id uuid NULL
item_size integer NULL
measurement_type text          -- VOLUME, COUNT
default_unit text              -- SCU, COUNT
is_raw boolean
is_refined boolean
is_tradeable boolean
is_craftable boolean
status text                    -- ACTIVE, UNVERIFIED, ARCHIVED
created_at timestamptz
updated_at timestamptz
```

### item_media

Multiple provider images and local fallbacks per item.

```text
id uuid PK
item_id uuid FK -> items.id
provider_id uuid NULL
media_type text                -- ICON, THUMBNAIL, HERO, GALLERY, FALLBACK
source_url text NULL
storage_path text NULL
mime_type text NULL
width integer NULL
height integer NULL
is_primary boolean
sort_order integer
rights_status text
attribution text NULL
last_verified_at timestamptz NULL
```

### stat_definitions and item_stats

Stats are normalized, patch-aware, and provider-aware.

```text
stat_definitions
- id
- stat_key                     -- power.output, shield.hp, weapon.dps.sustained
- name
- category
- unit
- value_type
- aggregation_method
- format

item_stats
- item_id
- stat_definition_id
- game_version_id
- provider_id
- value_number
- value_text
- metadata
```

---

## 8. Ship catalog and individual user ships

### ships

Global ship model definition. An ARGO MOLE exists once here.

```text
id uuid PK
canonical_name text
manufacturer_id uuid
model text
variant text NULL
role text NULL
size text NULL
crew_min integer NULL
crew_max integer NULL
cargo_capacity numeric NULL
status text
created_at timestamptz
updated_at timestamptz
```

### user_ships

Every concrete user-owned ship has its own UUID. Kokizzle98 may therefore own multiple independently configured ARGO MOLE records.

```text
id uuid PK
owner_user_id uuid FK -> profiles.id
ship_id uuid FK -> ships.id
hangar_asset_id uuid NULL
nickname text NULL
ownership_type text            -- PLEDGE, INGAME, REWARD, LOANER, RENTAL, TEMPORARY
acquisition_source text        -- RSI_PLEDGE, INGAME_PURCHASE, REWARD, etc.
persistence_class text         -- PLEDGE, GAME, TEMPORARY
origin_game_epoch_id uuid NULL
asset_status text              -- ACTIVE, WIPED, ARCHIVED, REVOKED
current_location_id uuid NULL
active_actual_loadout_state_id uuid NULL
created_at timestamptz
updated_at timestamptz
invalidated_at timestamptz NULL
invalidated_by_wipe_event_id uuid NULL
```

A PLEDGE ship normally has no origin epoch. An INGAME ship belongs to the epoch in which it was acquired.

### fleet_shares

Privacy is crew-specific, not a single global boolean.

```text
id uuid PK
user_ship_id uuid FK -> user_ships.id
group_id uuid FK -> groups.id
share_status text              -- SHARED, HIDDEN, REVOKED
allow_fleet_planning boolean
shared_by_user_id uuid
shared_at timestamptz
revoked_at timestamptz NULL
UNIQUE(user_ship_id, group_id)
```

No `fleet_shares` row means private for that crew. HIDDEN/REVOKED ships do not appear in the crew fleet and do not contribute to crew material goals.

---

## 9. Default, actual, saved, and target loadouts

These four concepts must never be merged.

### Factory default

```text
ship_default_loadouts
- id
- ship_id
- game_version_id
- provider_id
- name
- is_current

ship_default_loadout_items
- default_loadout_id
- hardpoint_id
- item_id
- quantity
- configuration
```

### Saved loadout templates

```text
ship_loadouts
- id
- user_ship_id NULL            -- NULL permits reusable templates
- owner_user_id
- name
- description
- game_version_id
- loadout_kind                 -- PERSONAL_TEMPLATE, TARGET, RECOMMENDATION_COPY
- created_at
- updated_at

ship_loadout_items
- loadout_id
- hardpoint_id
- item_id
- owned_item_id NULL
- quantity
- configuration
```

### Actual loadout state

Represents what is believed to be installed in-game during one epoch.

```text
user_ship_loadout_states
- id
- user_ship_id
- game_epoch_id
- state_type                   -- DEFAULT, CUSTOM, UNKNOWN
- status                       -- CURRENT, OUTDATED, RESET_BY_WIPE, UNVERIFIED
- source_loadout_id NULL
- captured_at
- updated_at
- reset_by_wipe_event_id NULL

user_ship_loadout_state_items
- loadout_state_id
- hardpoint_id
- item_id
- owned_item_id NULL
- installation_status
```

### Target loadout

Stored through ship/fleet upgrade plans. It remains after a wipe unless explicitly configured otherwise.

---

## 10. Personal fleet and crew fleet

### fleets

```text
id uuid PK
fleet_type text                -- PERSONAL, CREW
owner_user_id uuid NULL
group_id uuid NULL
name text
description text NULL
is_primary boolean
created_at timestamptz
updated_at timestamptz
```

Rules:

```text
One primary PERSONAL fleet per user.
One primary CREW fleet per crew.
Crew fleet content is derived from active fleet_shares.
The shared ship remains owned by the user.
```

---

## 11. Fleet planning and farming goals

### ship_upgrade_plans

```text
id uuid PK
user_ship_id uuid
source_actual_loadout_state_id uuid NULL
target_loadout_id uuid
name text
target_mode text               -- QUALITY, STAT, MAXIMUM, CREW_AVAILABLE
default_target_quality integer NULL
status text                    -- DRAFT, PLANNED, COLLECTING, READY_TO_CRAFT,
                               -- IN_PROGRESS, COMPLETE, REVIEW_REQUIRED,
                               -- ORPHANED_BY_WIPE, ARCHIVED
created_by_user_id uuid
created_at timestamptz
updated_at timestamptz
```

### fleet_upgrade_plans

```text
id uuid PK
fleet_id uuid
name text
description text NULL
default_build_profile_id uuid NULL
default_target_mode text
default_target_quality integer NULL
status text                    -- DRAFT, PUBLISHED, ACTIVE, REVIEW_REQUIRED,
                               -- COMPLETED, ARCHIVED
active_version_id uuid NULL
created_by_user_id uuid
created_at timestamptz
updated_at timestamptz
```

### fleet_upgrade_plan_versions

```text
id uuid PK
fleet_upgrade_plan_id uuid
version_number integer
created_by_user_id uuid
created_at timestamptz
change_summary text NULL
snapshot jsonb
```

Only ACTIVE plan versions produce official crew farming targets. DRAFT and PUBLISHED versions do not alter active goals.

### crafting_requirements

```text
id uuid PK
source_type text               -- SHIP_UPGRADE, CREW_FLEET_UPGRADE, CRAFT_PROJECT
source_id uuid
item_id uuid
required_amount numeric
measurement_type text
target_quality_min integer NULL
target_quality_max integer NULL
target_stat_definition_id uuid NULL
target_stat_value numeric NULL
priority integer
calculation_version text
```

Aggregated material views must preserve quality/stat tiers when expanded.

---

## 12. User game state

### inventory_lots

```text
id uuid PK
owner_user_id uuid
item_id uuid
game_epoch_id uuid
acquisition_source text        -- MINED, PURCHASED_INGAME, LOOTED, CRAFTED_INPUT, etc.
persistence_class text         -- GAME, PLEDGE, TEMPORARY
amount numeric
measurement_type text
quality integer NULL
location_id uuid NULL
status text                    -- ACTIVE, RESERVED, CONSUMED, SOLD, WIPED, ARCHIVED
created_at timestamptz
updated_at timestamptz
invalidated_at timestamptz NULL
invalidated_by_wipe_event_id uuid NULL
```

### owned_items

Individual components and other non-fungible items.

```text
id uuid PK
owner_user_id uuid
item_id uuid
game_epoch_id uuid NULL
acquisition_source text        -- CRAFTED, PLEDGE, LOOTED, PURCHASED_INGAME
persistence_class text         -- PLEDGE, GAME, TEMPORARY
quality integer NULL
condition numeric NULL
location_id uuid NULL
status text                    -- ACTIVE, INSTALLED, RESERVED, WIPED, ARCHIVED
crafted_blueprint_id uuid NULL
crafted_at timestamptz NULL
created_at timestamptz
invalidated_at timestamptz NULL
invalidated_by_wipe_event_id uuid NULL
```

### user_wallets and wallet_snapshots

```text
user_wallets
- id
- user_id
- currency_code               -- aUEC
- game_epoch_id
- current_balance
- updated_at

wallet_snapshots
- id
- user_wallet_id
- game_epoch_id
- balance
- snapshot_reason
- created_at
```

Wallet state therefore can reset independently from ships, inventory, reputation, or blueprints.

### user_progress_states

Generic patch-aware user progression.

```text
id uuid PK
user_id uuid
game_epoch_id uuid
progress_domain text           -- REPUTATION, BLUEPRINT_OWNERSHIP, MISSIONS,
                               -- CHARACTER_STATE, STARTING_LOCATION, etc.
progress_key text
value jsonb
status text                    -- ACTIVE, RESET, WIPED, ARCHIVED
updated_at timestamptz
wipe_event_id uuid NULL
```

Frequently queried domains may later receive specialized tables without changing wipe semantics.

---

## 13. Configurable Star Citizen wipe engine

### wipe_events

```text
id uuid PK
name text
channel text
wipe_type text                 -- FULL, CUSTOM
description text NULL
source_game_version_id uuid NULL
target_game_version_id uuid NULL
announced_at timestamptz NULL
effective_at timestamptz NULL
status text                    -- DRAFT, PREVIEWED, APPROVED, EXECUTING,
                               -- COMPLETED, FAILED, CANCELLED
created_by_user_id uuid
approved_by_user_id uuid NULL
executed_by_user_id uuid NULL
created_at timestamptz
executed_at timestamptz NULL
```

### wipe_event_rules

Each affected domain has an explicit action and optional filter.

```text
id uuid PK
wipe_event_id uuid
domain_code text
action_code text
filter_definition jsonb
preserve_history boolean DEFAULT true
execution_order integer
```

Supported domains:

```text
WALLET
INVENTORY
OWNED_ITEMS
INGAME_SHIPS
PLEDGE_SHIPS
SHIP_LOADOUT_STATE
LOCATIONS
REFINERY_JOBS
REPUTATION
BLUEPRINT_OWNERSHIP
MISSIONS
CHARACTER_STATE
FLEET_PLANS
```

Supported actions:

```text
KEEP
RESET
INVALIDATE
RESET_TO_DEFAULT
PARTIAL_RESET
ARCHIVE
RECALCULATE
KEEP_AND_RECALCULATE
```

### Example full-wipe profile

```text
PLEDGE_SHIPS            KEEP
INGAME_SHIPS            INVALIDATE
SHIP_LOADOUT_STATE      RESET_TO_DEFAULT
INVENTORY               INVALIDATE
OWNED_ITEMS             INVALIDATE where persistence_class = GAME
WALLET                  RESET
LOCATIONS               RESET
REFINERY_JOBS           INVALIDATE
BLUEPRINT_OWNERSHIP     KEEP or RESET according to announcement
REPUTATION              KEEP or RESET according to announcement
FLEET_PLANS             KEEP_AND_RECALCULATE
```

The profile is a configurable template, not an assumption about every future Star Citizen wipe.

### Wipe execution semantics

1. Lock the wipe event configuration.
2. Create a dry run.
3. Display impact counts per domain and preserved data.
4. Create the next game epoch when required.
5. Invalidate affected game-state records; do not mass-delete them.
6. Keep Pledge ships active when configured.
7. For surviving ships affected by `RESET_TO_DEFAULT`, create a new actual loadout state from the applicable ship default loadout for the target game version.
8. Mark old custom actual states as `RESET_BY_WIPE`.
9. Invalidate lost crafted/ingame components.
10. Re-evaluate personal and crew upgrade plans.
11. Change affected ACTIVE fleet plans to `REVIEW_REQUIRED`.
12. Recalculate material requirements into a new plan version, but do not silently reactivate the revised plan.
13. Write full audit and affected-record logs.

### wipe_dry_runs

```text
id uuid PK
wipe_event_id uuid
created_by_user_id uuid
created_at timestamptz
impact_summary jsonb
configuration_hash text
expires_at timestamptz
```

### wipe_affected_records

```text
id uuid PK
wipe_event_id uuid
domain_code text
record_type text
record_id uuid
action_code text
before_snapshot jsonb NULL
after_snapshot jsonb NULL
processed_at timestamptz
status text
error_message text NULL
```

---

## 14. Platform wipe and critical administration

A platform wipe is not a Star Citizen game wipe and must use a different server operation.

Requirements before a platform wipe:

```text
1. Permission: platform.wipes.platform
2. Fresh step-up authentication using the user's current auth provider
3. Successful mandatory dry run
4. Impact preview
5. Typed confirmation phrase, e.g. WIPE PLATFORM
6. One-time server challenge
7. Backup reference / backup success gate
8. Audit log entry
9. Idempotency key
10. No direct client-side table deletes
```

### platform_action_challenges

```text
id uuid PK
user_id uuid
action_code text
challenge_hash text
required_phrase text
expires_at timestamptz
authenticated_at timestamptz NULL
confirmed_at timestamptz NULL
used_at timestamptz NULL
created_at timestamptz
```

A password-only confirmation is insufficient for Discord-only users. The requirement is fresh provider-appropriate step-up authentication plus typed confirmation.

---

## 15. Wipe examples

### Full wipe

```text
Pledge Polaris survives.
Actual custom Polaris loadout resets to factory default.
Crafted installed components are marked WIPED.
Target Combat BiS Q950 loadout remains.
Upgrade progress returns to unmet.
Material requirements are recalculated.
Ingame ARGO MOLE becomes WIPED and disappears from active personal/crew fleet views.
aUEC wallet starts a new epoch at the configured reset amount.
Inventory lots and commodities become WIPED.
Crew membership, Discord, UEX, RSI links, permissions, and platform settings remain.
```

### Partial wallet and inventory wipe

```text
WALLET                  RESET
INVENTORY               PARTIAL_RESET by item category/source
INGAME_SHIPS            KEEP
SHIP_LOADOUT_STATE      KEEP
REPUTATION              KEEP
BLUEPRINT_OWNERSHIP     KEEP
FLEET_PLANS             RECALCULATE only if required records were affected
```

### Loadout-only reset

```text
PLEDGE_SHIPS            KEEP
INGAME_SHIPS            KEEP
SHIP_LOADOUT_STATE      RESET_TO_DEFAULT
OWNED_ITEMS             INVALIDATE only selected installed game items
FLEET_PLANS             KEEP_AND_RECALCULATE
```

---

## 16. Required indexes and constraints

At minimum:

```text
UNIQUE current game epoch per channel
UNIQUE primary personal fleet per user
UNIQUE primary crew fleet per group
UNIQUE fleet share per user_ship + group
UNIQUE external identity per provider + entity type + provider identifier
INDEX active inventory by user + epoch + status
INDEX active ships by owner + status
INDEX active shared ships by group
INDEX actual loadout state by user_ship + epoch + status
INDEX wipe rules by event + execution_order
INDEX marketplace publication by provider + external_listing_id
```

Database checks must prevent:

```text
PERSONAL fleet without owner_user_id
CREW fleet without group_id
PLEDGE user ship with persistence_class GAME
INGAME ship without origin_game_epoch_id
ACTIVE fleet plan without active_version_id
Multiple CURRENT actual loadout states for the same ship and epoch
Platform wipe execution without a valid one-time challenge
```

---

## 17. Migration strategy from V1.3.2

No direct big-bang migration.

Recommended phases:

```text
Phase 1: game_versions, data_providers, items, external_identities
Phase 2: map existing inventory material strings to item UUIDs
Phase 3: owned_items and crafted component instances
Phase 4: ships, hardpoints, defaults, user_ships, personal fleets
Phase 5: fleet_shares, FLEET_ARCHITECT permissions, crew fleet plans
Phase 6: actual/default/target loadout separation
Phase 7: game_epochs, wallets, progress state, wipe engine
Phase 8: UEX identities, secure user secret handling, read-only sync
Phase 9: UEX marketplace publications
Phase 10: Discord onboarding and optional crew integration
Phase 11: RSI hangar import and watcher integration
```

Each phase requires migration SQL, rollback or compensating strategy, dry-run validation, and RLS tests.

---

## 18. Decisions now considered fixed for V2

- Every item and ship master record has an internal UUID.
- Every concrete user-owned ship has its own UUID.
- Duplicate ship models per user are supported.
- Ship privacy is managed per crew through `fleet_shares`.
- Crew fleet is a view of shared personal ships, not copied ownership.
- `FLEET_ARCHITECT` is a functional crew role, not a hierarchy level.
- Only ACTIVE fleet plans generate official material goals.
- Default, actual, saved and target loadouts are separate.
- Pledge, ingame, crafted, temporary and platform data have separate persistence/provenance semantics.
- Wipes are configurable by domain and action.
- Surviving ships can be reset to a version-correct factory default.
- Ingame ships, inventory lots, wallets and progression can be reset independently.
- Wiped records are historized instead of blindly deleted.
- Affected active fleet plans require review after recalculation.
- Platform administration is separate from crew administration.
- Platform wipes require critical permission, dry run, step-up authentication, typed confirmation, one-time challenge, backup gate and audit.

---

## 19. Next design step

Before writing production SQL:

1. Convert this logical model into an entity relationship diagram.
2. Define PostgreSQL enums versus lookup tables.
3. Define RLS matrices for platform, personal, crew and public/provider data.
4. Define secret storage and Edge Function boundaries.
5. Define the first migration slice: `game_versions`, `data_providers`, `items`, `external_identities`.
