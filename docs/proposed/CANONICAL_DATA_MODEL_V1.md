# VECTOR Canonical Data Model v1

**Status:** PROPOSED  
**Version:** 1.0  
**Authority Scope:** CANONICAL_DATA_MODEL  
**Approved By:** pending project_owner approval  
**Supersedes:** none  
**Scope:** canonical entity identity, source mappings, taxonomy, facets, relations, variants, revision properties, retrieval contracts and game-state reference boundaries

## 1. Purpose

This specification defines the canonical VECTOR data model used after source extraction and before application-facing retrieval.

It answers four core questions:

```text
Canonical Entity -> What concrete concept is this?
Taxonomy         -> What kind of thing is it?
Facets           -> Which structured characteristics describe/filter it?
Relations        -> How is it related to other entities?
```

Build- and channel-dependent technical values are stored separately as Revision Properties.

The model is source-aware but not source-shaped. SCMDB source structures remain preserved as provenance while VECTOR exposes a stable application model.

## 2. Design goals

The canonical model optimizes for:

- stable VECTOR-owned identities;
- strict provenance and No-Guess behavior;
- low duplication across LIVE/PTU;
- deterministic source-to-canonical resolution;
- fast bounded queries;
- small API and AI payloads;
- reusable catalog data across Inventory, Fleet, Fabricator and Trading;
- explicit base/variant relationships;
- targeted wipes without reference-data crawling;
- independent dataset revisions;
- future source expansion without redefining application identity.

## 3. Canonical Entity Identity

### 3.1 VECTOR-owned identity

Each concrete catalog entity receives one stable VECTOR identifier:

```text
vector_entity_id
```

`vector_entity_id` is canonical inside VECTOR.

It must not be derived solely from:

- display name;
- catalog path;
- manufacturer + name string;
- one specific dataset revision;
- one external source identifier.

### 3.2 External source identifiers

External source IDs are mappings to the canonical entity, not the canonical VECTOR primary identity.

Conceptual mapping:

```text
canonical_entity
    vector_entity_id

source_identity
    vector_entity_id
    source_system
    source_entity_id
    first_seen_revision_id
    last_seen_revision_id
    mapping_status
```

A stable SCMDB/CIG UUID may be strong source identity evidence, but VECTOR preserves an independent internal identity boundary.

### 3.3 Cross-build identity

When the same verified source identity appears across builds/channels, revisions may map to the same canonical entity.

If an upstream identifier changes, automatic remapping is allowed only when deterministic evidence proves continuity.

Otherwise:

```text
REVIEW_REQUIRED
```

No fuzzy name-only merge is authoritative.

### 3.4 Identity states

Canonical/source identity resolution may use:

```text
SOURCE_EXACT
RULE_RESOLVED
REVIEW_REQUIRED
SOURCE_DATA_MISSING
QUARANTINED
```

## 4. Entity kinds

`entity_kind` identifies the broad canonical object class and is not equivalent to the full taxonomy path.

Initial conceptual kinds may include:

```text
ITEM
SHIP
BLUEPRINT
MATERIAL
MANUFACTURER
LOCATION
PRODUCT_FAMILY
```

The exact enum remains extensible until the normalized SQL model is approved.

Entity kinds must remain coarse enough that new catalog branches do not require identity redesign.

## 5. Product Families and Concrete Entities

A Product Family groups related concrete entities without replacing their individual identities.

Example:

```text
Product Family: Killshot Rifle
    |
    +-- Entity: Killshot Rifle
    +-- Entity: Killshot "Dominion Camo" Rifle
```

Inventory and ownership state reference the concrete entity actually represented by the state record.

Product-family membership is used for:

- grouping;
- variant navigation;
- comparisons;
- search;
- shared presentation metadata where appropriate.

A product family must not be substituted for a concrete entity where exact identity matters.

## 6. Variants

A named/color/edition/skin-like item is a variant only when supported by explicit source evidence or a deterministic resolver rule.

Examples of labels alone are insufficient proof:

```text
DefaultSkin
Payback
SecondWind
Woodland
Collector
Edition
Camo
```

Variant resolution uses a relation instead of encoding identity only in text:

```text
VARIANT_OF
```

A variant remains a concrete canonical entity with its own source mappings and revisions.

Variant-specific differences are not copied to the product family unless explicitly modeled as shared family metadata.

## 7. Taxonomy

### 7.1 Purpose

Taxonomy answers:

> What kind of entity is this?

Taxonomy is designed for stable application navigation and broad domain filtering.

It is intentionally not a direct mirror of every upstream source path.

### 7.2 Hierarchical categories

Conceptual category structure:

```text
catalog_category_id
parent_category_id
category_code
catalog_path
depth
status
```

Example branches:

```text
fps_item
fps_item.weapon
fps_item.weapon.rifle
fps_item.weapon.pistol
fps_item.weapon.smg
fps_item.armor
fps_item.armor.helmet
fps_item.armor.core
fps_item.armor.arms
fps_item.armor.legs

ship
ship.component
ship.component.quantum_drive
ship.component.shield
ship.component.power_plant
ship.component.cooler
ship.component.radar
ship.weapon

crafting
crafting.blueprint
crafting.material
```

### 7.3 Taxonomy stability

Stable application concepts belong in taxonomy.

High-cardinality or frequently changing values generally do not.

For example:

```text
Quantum Drive -> taxonomy
Size 3        -> facet
Wei-Tek       -> manufacturer relation/facet
TS-2          -> canonical entity
```

This prevents taxonomy explosion.

### 7.4 Primary and secondary assignments

An entity may have multiple category assignments.

Conceptual assignment:

```text
catalog_assignment
    vector_entity_id
    catalog_category_id
    assignment_role
    assignment_source
    resolution_status
    rule_version
```

Supported conceptual roles:

```text
PRIMARY
SECONDARY
FUNCTIONAL
```

Variant and compatibility relationships belong primarily in Relations rather than being forced into taxonomy.

## 8. Source Classification

Source classification remains separate from VECTOR taxonomy.

Source evidence may include:

- source class/entity path;
- source item family;
- attach type;
- attach subtype;
- source category/group;
- source filename conventions;
- localization metadata.

VECTOR stores this evidence without silently replacing it.

A resolved VECTOR category may coexist with contradictory source classification for provenance and review.

## 9. Facets

### 9.1 Purpose

Facets answer:

> Which structured characteristics can be filtered, grouped or compared?

Facets are not taxonomy nodes and are not free-form tags.

### 9.2 Initial facet families

Representative facets include:

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

Additional facets may be introduced only when they represent a stable, useful structured dimension.

### 9.3 Facet schema

Conceptually:

```text
facet_definition
    facet_code
    value_type
    allowed_scope
    cardinality
    index_policy

entity_facet_value
    vector_entity_id
    dataset_revision_id? 
    facet_code
    value
    source/provenance
    resolution_status
```

### 9.4 Revision-independent vs revision-dependent facets

A facet may be canonical when it is stable across builds, or revision-dependent when the source value can change.

VECTOR must not duplicate a stable canonical value per dataset revision without a reason.

Conversely, a historically variable value must not be promoted to canonical merely to save storage.

### 9.5 Facets versus stats

Facets primarily support retrieval and categorization.

Stats/properties primarily describe technical values.

Examples:

```text
Facet:
size = 3
manufacturer = Wei-Tek
attach_type = QuantumDrive

Revision Properties:
quantum_speed = ...
quantum_fuelrequirement = ...
health_maxhealth = ...
```

A technical property may be indexed for comparison without becoming taxonomy.

## 10. Relations

Relations model semantic links that are neither taxonomy nor ordinary scalar facets.

Conceptual relation:

```text
entity_relation
    subject_entity_id
    relation_type
    object_entity_id
    dataset_revision_id?
    source/provenance
    resolution_status
    rule_version
```

Initial relation types may include:

```text
VARIANT_OF
MANUFACTURED_BY
PRODUCES
REQUIRES_MATERIAL
COMPATIBLE_WITH
DEFAULT_COMPONENT_OF
EQUIPPED_ON
REPLACES
SUPERSEDES
```

Exact relation types are finalized with the domain model.

Relations that vary by build require dataset revision context.

## 11. Manufacturers

Manufacturers are canonical entities or controlled canonical references, not repeated display strings where a resolved manufacturer identity exists.

An item-to-manufacturer relationship should be queryable without scanning item payload JSON.

Unknown manufacturer values remain explicit:

```text
UNKNOWN / unresolved
```

VECTOR does not manufacture a company identity from a code unless deterministically mapped.

## 12. Dataset Revisions

Build/channel-specific representations are associated with an explicit dataset revision.

Conceptual revision identity:

```text
dataset_revision_id
channel
sc_build
upstream_revision
vector_dataset_version
pipeline_version
resolver_version
taxonomy_version
status
published_at
```

Each normal application data context resolves to exactly one active dataset revision per channel.

## 13. Revision Properties

Technical values that may change between builds are revision-scoped.

Conceptual form:

```text
entity_revision_property
    vector_entity_id
    dataset_revision_id
    property_code
    typed_value
    unit
    resolution_status
    source_path
    provenance
```

Representative property families:

```text
weapon_damage
weapon_firerate
quantum_speed
quantum_fuelrequirement
shield_maxhealth
health_maxhealth
armor_damagemitigation
```

Structured values remain structured where required.

No zero fallback converts missing values into valid stats.

## 14. Property definitions

Property semantics are defined centrally.

Conceptual definition:

```text
property_definition
    property_code
    display_name
    value_type
    unit_family
    allowed_entity_scope
    comparison_behavior
```

This allows UI and AI layers to request known property projections without understanding raw SCMDB paths.

## 15. No-Guess and resolver behavior

Every inferred identity, taxonomy assignment, facet, relation or revision property must be supported by:

```text
SOURCE_EXACT
or
RULE_RESOLVED
```

Ambiguous candidates use:

```text
REVIEW_REQUIRED
```

Missing required evidence uses:

```text
SOURCE_DATA_MISSING
```

Known conflicting/unsafe records may use:

```text
QUARANTINED
```

Frontend/API layers must be able to distinguish unavailable data from verified zero values.

## 16. Representative mapping: TS-2

A representative normalized result may be conceptually expressed as:

```text
Canonical Entity
    name = TS-2
    kind = ITEM

Taxonomy
    primary = ship.component.quantum_drive

Facets / Relations
    size = 3
    MANUFACTURED_BY -> Wei-Tek

LIVE Revision
    dataset = LIVE 4.10.2
    quantum_speed = <resolved value when present>
    quantum_fuelrequirement = <resolved value when present>
    health_maxhealth = <resolved value when present>

PTU Revision
    dataset = active PTU revision
    independent technical property values
```

A presentation path such as:

```text
Ship.Component.QuantumDrive.Size3.TS-2
```

may be generated for navigation/debugging, but is not the canonical identity.

## 17. Representative mapping: Killshot family

Conceptually:

```text
Product Family
    Killshot Rifle

Concrete Entities
    Killshot Rifle
    Killshot "Dominion Camo" Rifle

Taxonomy
    fps_item.weapon.rifle

Relation
    Dominion Camo entity VARIANT_OF base/family relationship

Facets
    weapon family / source attach classification
    manufacturer when resolved
```

Names alone do not authorize additional variant inference.

## 18. Mutable Game State references

Inventory, ownership and Actual Loadout state references canonical entities instead of embedding complete item definitions.

Conceptual inventory row:

```text
inventory_lot
    user/crew owner
    channel/context
    canonical_entity_id
    quantity
    quality
    location_id
    game-state metadata
```

Reference stats are resolved from the selected active dataset revision when needed.

This avoids repeating full reference payloads in every inventory record.

## 19. Wipe boundary

Canonical entities, taxonomy, facets, relations and reference revision properties are not normal Star Citizen wipe targets.

Game wipes target mutable channel-scoped state domains.

Examples:

```text
PTU INVENTORY_ONLY
-> PTU inventory state only

LIVE FULL_GAME_STATE
-> approved LIVE mutable state domains
```

A wipe does not crawl the complete reference catalog to decide what can be removed. Wipe scope is defined by state-domain ownership and channel keys.

## 20. Query contract

Application modules request bounded projections.

Example:

```text
Category: ship.component.quantum_drive
Facet: size = 3
Facet/Relation: manufacturer = Wei-Tek
Dataset Context: LIVE active
Projection:
- entity ID
- display name
- manufacturer
- size
- quantum speed
- fuel requirement
```

The query must not require raw SCMDB traversal at request time.

## 21. Read models

The canonical model supports optimized application read surfaces such as:

```text
catalog_item_summary
inventory_item_view
ship_component_catalog_view
weapon_comparison_view
crafting_blueprint_view
```

These are derived access surfaces, not independent authorities.

Every derived row must remain traceable to canonical/revision data.

## 22. AI retrieval contract

AI retrieval follows the same bounded model:

```text
user intent
-> domain/taxonomy
-> facets/relations
-> entity IDs
-> active dataset revision
-> selected properties
-> compact DTO
```

Raw source trees are not included unless a debugging/review workflow explicitly requires them.

Token optimization must not remove provenance or uncertainty indicators required to interpret the result safely.

## 23. Indexing principles

Exact SQL indexes are not frozen here.

The model requires indexable access paths for frequently used keys such as:

```text
vector_entity_id
dataset_revision_id
catalog_category_id
facet_code/value
relation subject/type/object
channel/context
owner + channel for mutable state
```

Final indexes are selected after representative query plans are measured.

No positive performance claim is made until query plans/tests exist.

## 24. Data duplication policy

VECTOR avoids duplication when a foreign-key/reference is sufficient.

Duplicate/cached values are allowed only when used intentionally for a read model, immutable snapshot, audit evidence or measured performance optimization.

Cached/derived copies must identify their authority and refresh/invalidation contract.

## 25. Source evolution

When a source schema changes:

```text
Raw Source
-> new adapter/resolver
-> canonical model remains stable where semantics remain stable
```

Source changes must not force frontend modules to understand every new raw schema shape.

If semantics actually change, the canonical model may require a reviewed version change.

## 26. Taxonomy and resolver versioning

Taxonomy/resolver changes that can alter canonical classification must be versioned.

A new taxonomy/resolver version may trigger controlled reprocessing without an SCMDB upstream revision change.

Reprocessing must preserve historical dataset provenance.

## 27. Acceptance Criteria

CANONICAL_DATA_MODEL_V1 is ready to freeze only when VECTOR demonstrates that:

- every published source entity maps to a canonical identity or explicit unresolved/quarantine state;
- canonical IDs do not depend solely on names or paths;
- source IDs remain preserved as mappings/provenance;
- cross-build identity changes never merge by fuzzy name alone;
- Product Families do not replace concrete entity identity;
- variants use explicit/deterministic evidence;
- taxonomy and facets remain separate concepts;
- high-cardinality properties such as manufacturer/size do not unnecessarily explode taxonomy;
- source classification remains preserved separately from VECTOR classification;
- multi-category assignments are supported;
- facets are typed and scoped;
- build-variable facets/properties remain dataset-revisioned;
- Relations model semantic links without forcing them into taxonomy;
- technical stats are revision-scoped;
- missing and ambiguous data remain distinguishable from zero;
- mutable game state references canonical entities rather than duplicating full definitions;
- game wipes target state domains rather than the reference catalog;
- bounded queries can serve representative Inventory, Fleet, Fabricator and comparison use cases;
- AI retrieval can produce compact projections without raw-dataset crawling;
- derived read models remain traceable to canonical authority;
- taxonomy/resolver rule changes are versioned and reprocessable.

## 28. Open implementation decisions before FROZEN

1. Canonical VECTOR entity ID generation method.
2. Exact cross-build identity matching rules.
3. Final `entity_kind` dictionary.
4. Initial taxonomy tree and governance for taxonomy changes.
5. Exact Product Family creation rules.
6. Skin/edition/color/default/base variant resolver rules.
7. Final facet dictionary, value types and cardinality.
8. Which facets are canonical versus revision-scoped.
9. Final relation-type dictionary and direction semantics.
10. Manufacturer canonicalization rules.
11. Property definition dictionary and typed storage model.
12. Physical PostgreSQL table design.
13. RLS/RPC boundaries.
14. Measured index strategy.
15. Read-model selection and refresh contracts.
16. Historical canonical split/merge procedure after a resolver correction.

These decisions must be closed or safely deferred before FROZEN approval.

## 29. Relationship to other rules

This specification defines the canonical data shape.

`DATASET_PIPELINE_V1.md` defines how source data is processed and published into this model.

The Game Wipe specification defines which mutable state domains may be cleared.

Data Context and Versioning rules define which dataset revision is active/visible for a request.

Provider Authority rules define which external source is authoritative for a given fact where multiple providers exist.

## 30. R2 remediation classification

```text
CANONICAL_DATA_MODEL_V1.md
Classification: NEW REQUIRED SUPPORTING SPEC
Authority Scope: CANONICAL_DATA_MODEL
Status: PROPOSED
```

This document prevents catalog identity, taxonomy, facets, relations and revision properties from being duplicated across individual feature specifications.

## 31. Proposed Decision

VECTOR Canonical Data Model v1 is **PROPOSED**.

It becomes eligible for FROZEN only after:

- representative SCMDB families validate the identity/taxonomy/facet/relation model;
- canonical identity rules are deterministic;
- initial taxonomy and facet dictionaries are reviewed;
- variant resolution rules are validated;
- normalized database implementation is designed;
- bounded query performance is tested;
- wipe/state references are verified;
- interactions with Dataset Pipeline, Data Context, Versioning and Provider Authority are reconciled;
- `RULE_INDEX.md` is updated;
- review on `develop` is complete;
- approval by `project_owner`;
- merge through the normal VECTOR governance process to `main`.
