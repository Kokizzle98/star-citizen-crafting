# SCMDB Schema / Catalog Profiling v1

**Status:** REVIEW RECORD  
**Purpose:** Read-only evidence record for the proposed VECTOR catalog and dataset architecture  
**Source scope:** Current SCMDB mirror and existing VECTOR read-only audit outputs  
**Mutation performed:** none

## 1. Executive result

The available SCMDB/VECTOR evidence supports a normalized catalog architecture.

The source provides enough structure for:

- stable source entity identifiers;
- channel and Star Citizen build separation;
- broad item-domain classification;
- attach type and subtype classification;
- manufacturer and size facets;
- base-item and named-variant grouping;
- dataset-revisioned stat values;
- source-path provenance;
- LIVE/PTU comparison by shared entity identity.

The source does not support treating one generated textual path as complete and infallible truth.

VECTOR should therefore maintain:

1. immutable source identity/provenance;
2. canonical VECTOR entities;
3. source classification;
4. VECTOR catalog taxonomy;
5. structured facets;
6. dataset-revisioned values;
7. explicit resolver/confidence states.

## 2. Evidence inspected

The profiling used read-only evidence from:

- SCMDB mirror metadata and build-specific JSON inventory;
- existing VECTOR V4/V5 audit outputs;
- existing LIVE/PTU source-file summaries;
- crafting item and blueprint audit rows;
- resolver candidate/path outputs;
- known CIG/SCMDB issue annotations.

Observed channel/build examples:

```text
LIVE 4.10.2-live.12913470
PTU  4.10.3-ptu.12999338
```

Observed source families include:

```text
crafting_items
crafting_blueprints
merged
mining_data
mining_equipment
mission_history
cig_data_issues
deltas-live
deltas-ptu
latest
game-versions
versions
```

## 3. Observed catalog-capable fields

Existing VECTOR audit outputs demonstrate records containing or resolving the following concepts:

```text
channel
version/build
entity UUID
product/display name
item family/type
attach type
attach subtype
manufacturer
size
catalog/grouping key
base name
variant name
property keys
resolver status
source path
```

This is sufficient to build a catalog without loading or parsing the complete raw JSON for every website request.

## 4. Direct example: TS-2

Observed TS-2 evidence:

```text
entity UUID: 8ea47c7e-f70f-469d-abc2-911cc5013854
name: TS-2
item family: shipcomponent
attach type: QuantumDrive
attach subtype: UNDEFINED
manufacturer: Wei-Tek
size: 3
catalog-like key: shipcomponent|QuantumDrive|UNDEFINED|WETK|ts-2
resolved property families:
- health_maxhealth
- quantum_fuelrequirement
- quantum_speed
```

A crafting association also exposes:

```text
item group: vehiclegear
category: quantumdrive
size class: size3
```

Conclusion:

```text
Ship.Component.QuantumDrive.Size3.TS-2
```

is supportable as a VECTOR presentation/catalog path, but should be generated from structured fields and canonical relations rather than stored as the sole identity.

Recommended representation:

```text
canonical entity: TS-2 UUID/entity relation
primary category: ship.component.quantum_drive
facets:
- size = 3
- manufacturer = Wei-Tek
source classifications:
- item family = shipcomponent
- attach type = QuantumDrive
- source subtype = UNDEFINED
```

## 5. Direct example: Killshot Rifle variants

Observed records distinguish:

```text
Killshot Rifle
Killshot "Dominion Camo" Rifle
```

The records use different UUIDs while exposing a shared base label and an explicit variant label in existing VECTOR audit output:

```text
base name: Killshot Rifle
variant name: Dominion Camo
```

LIVE and PTU audit rows also show the same entity identifiers for the observed Killshot base/variant records.

Conclusion:

A model separating base product family from sellable/usable variant is supported:

```text
canonical product family: Killshot Rifle
item variant: base/default
item variant: Dominion Camo
```

However, the evidence reviewed does not establish that every source token such as `Payback` or `DefaultSkin` is always explicitly typed as a skin/variant. Such labels require deterministic rules or a review state.

Recommended path behavior:

```text
fps_item.weapon.rifle.killshot
fps_item.weapon.rifle.killshot.variant.dominion_camo
```

Do not make a display path the entity primary key.

## 6. Source quality constraints

Known source issue annotations show that source type/classification can conflict with filenames, entity-class names or localization keys.

Therefore:

```text
source_attach_type
source_attach_subtype
```

must be preserved even when VECTOR resolves a different catalog category.

Recommended classification states:

```text
SOURCE_EXACT
RULE_RESOLVED
REVIEW_REQUIRED
SOURCE_DATA_MISSING
QUARANTINED
```

VECTOR must never silently overwrite source classification with an inferred value.

## 7. Recommended canonical catalog layers

### 7.1 Raw source layer

Stores immutable mirrored source payloads and provenance.

```text
source_record_id
source_name
source_revision
source_entity_id
source_class_path
raw_payload / artifact reference
content_hash
```

### 7.2 Canonical entity layer

Represents stable VECTOR concepts independent from a particular dataset revision.

```text
canonical_entity_id
entity_kind
preferred_name
base_entity_id / product_family_id
identity_status
```

### 7.3 Dataset revision layer

Stores build/channel-dependent values.

```text
canonical_entity_id
dataset_revision_id
source_entity_id
source_type
source_subtype
manufacturer_id
size_value
revision_properties
resolution_status
```

### 7.4 Taxonomy layer

Provides stable VECTOR navigation categories.

```text
catalog_category_id
parent_category_id
category_code
catalog_path
depth
```

### 7.5 Category assignments

Allows more than one useful category per entity.

```text
canonical_entity_id
catalog_category_id
assignment_role
assignment_source
confidence / resolution_status
rule_version
```

Suggested assignment roles:

```text
PRIMARY
SECONDARY
VARIANT
COMPATIBILITY
FUNCTIONAL
```

### 7.6 Facets

Stores structured filters separately from hierarchy.

Examples:

```text
size
manufacturer
attach_type
attach_subtype
grade
class
weapon_family
armor_slot
material_family
```

## 8. Physical database recommendation

The evidence favors one PostgreSQL/Supabase database with normalized tables and strong logical isolation over two entirely duplicated physical databases.

Recommended boundaries:

```text
shared canonical catalog
+ dataset revisions tagged by channel/build
+ channel-scoped mutable game state
+ persistent VECTOR state
```

LIVE/PTU reference values are separated through `dataset_revision_id`.
LIVE/PTU mutable state is separated through an explicit channel/context key and channel-specific foreign-key boundaries.

Physical partitioning may be added after query-volume measurements. The logical model must not depend on a full-database scan.

## 9. Performance and token optimization

Website modules should query purpose-built projections rather than raw SCMDB payloads.

Recommended read models:

```text
catalog_item_summary
inventory_item_view
ship_component_catalog_view
weapon_comparison_view
crafting_blueprint_view
```

Example TS-2 query projection:

```text
canonical_item_id
name
manufacturer
size
quantum_speed
quantum_fuel_requirement
health
active_dataset_revision
```

The response should not include unrelated crafting, inventory, fleet or raw source trees.

AI retrieval should use:

```text
intent/domain
-> category/facets
-> bounded entity IDs
-> bounded field projection
-> compact DTO
```

## 10. Wipe implications

Catalog and reference tables are not normal game-wipe targets.

Wipe targets are channel-scoped mutable state tables such as:

```text
inventory_positions
inventory_lots
game_item_instances
in_game_owned_ships
actual_loadouts
game_derived_ownership
```

These rows reference canonical entities and active dataset context.

A PTU wipe can target PTU state without deleting:

- LIVE state;
- canonical catalog;
- LIVE/PTU reference revisions;
- persistent VECTOR state.

## 11. Profiling conclusion

### Supported with current evidence

```text
stable UUID-based source identity
LIVE/PTU build separation
canonical item layer
base/variant grouping
hierarchical VECTOR catalog
structured facets
revisioned stats/properties
query-specific read models
channel-specific game-state wipes
```

### Requires deterministic resolver rules

```text
skin versus named variant classification
missing/UNDEFINED subtype completion
conflicting source type versus semantic intent
source-path-only classification
cross-build canonical identity changes
```

### Must remain blocked or reviewed

```text
ambiguous category assignment
conflicting identifiers
missing mandatory identity
unverified inferred type
cross-channel mismatch
```

## 12. Required changes to DATASET_PIPELINE_V1

The next revision of `docs/proposed/DATASET_PIPELINE_V1.md` should add:

1. canonical catalog layer;
2. raw source identity preservation;
3. source classification versus VECTOR taxonomy separation;
4. base-product and variant relationships;
5. multi-category assignments;
6. faceted classification;
7. dataset-revisioned entity values;
8. normalized single-database logical model as preferred baseline;
9. channel-scoped mutable state;
10. query/token-optimized read models;
11. classification confidence/resolution states;
12. explicit catalog exclusion from normal wipe scope.

## 13. Decision recommendation

Proceed with the catalog architecture.

Do not freeze exact SQL tables/indexes yet.

First update the Dataset Pipeline specification, then create a separate proposed canonical data-model specification and validate the model against representative source families:

```text
FPS weapon base + variant
ship quantum drive
armor base + color/edition variant
crafting blueprint output
mining equipment
known source-classification conflict
```
