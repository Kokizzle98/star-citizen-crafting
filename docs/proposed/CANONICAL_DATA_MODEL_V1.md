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
    identity_namespace
    source_entity_id
    entity_kind_evidence
    first_seen_revision_id
    last_seen_revision_id
    mapping_status
```

A conceptual uniqueness constraint is:

```text
UNIQUE(source_system, identity_namespace, source_entity_id)
```

`entity_kind` must be compatible with the resolved canonical identity, but is conflict evidence rather than part of the exact source identity key. A stable SCMDB/CIG UUID may be strong source identity evidence, but VECTOR preserves an independent internal identity boundary.

### 3.3 Cross-build identity

Cross-build identity resolution is conservative and evidence-driven. A shared display name, manufacturer name, catalog path or statistical similarity is never sufficient by itself to merge two source records into one canonical entity.

The resolver process is ordered:

```text
Exact Source Identity
-> Explicit Authoritative Identity Relation
-> Deterministic Composite Candidate Resolution
-> Review Candidate Generation
-> New Entity or Review
```

### 3.4 Match level 1: exact source identity

The strongest automatic rule is:

```text
same source_system
+
same identity_namespace
+
same source_entity_id
=
SOURCE_EXACT
```

When the exact identity is unique and its evidence is compatible, LIVE/PTU/build representations map to the same canonical entity while retaining independent Dataset Revision values. `entity_kind` compatibility is checked before accepting the mapping.

#### Exact identity collision/conflict path

If the same exact source identity is already mapped inconsistently, or the incoming record has a contradictory `entity_kind` or other incompatible identity evidence, VECTOR must:

- preserve the source record and conflicting evidence with provenance;
- not create a second authoritative identity for that exact source key;
- not auto-merge or silently remap either canonical entity;
- return `REVIEW_REQUIRED` or `QUARANTINED`, according to the conflict severity;
- record the non-trivial decision and candidates/conflicts in the Identity Resolution Event Ledger.

This is an identity collision/conflict, not permission to extend the uniqueness key with `entity_kind`.

### 3.5 Match level 2: explicit source identity continuity

An explicit trusted-source statement may resolve continuity across changed source identifiers when that statement means the records represent the same identity.

Semantic relations such as `REPLACES`, `SUPERSEDES` or `VARIANT_OF` do not by themselves mean same identity. They normally relate separate canonical entities.

A deterministic identity-continuity rule records:

```text
RULE_RESOLVED
```

with its source evidence and rule version.

### 3.6 Match level 3: deterministic composite matching

When no exact source identity exists, VECTOR may create a bounded candidate set from independent strong attributes such as:

```text
entity kind / source item family
attach type
attach subtype where meaningful
manufacturer identity
size
exact entity/source class
product family
other source-stable identifiers
```

A composite resolver may map automatically only when:

- its rule is explicitly versioned;
- required attributes agree;
- exactly one valid candidate remains;
- no blocking negative evidence exists;
- the rule is approved for that entity scope.

Otherwise the result is `REVIEW_REQUIRED`.

### 3.7 Match level 4: fuzzy candidate discovery

Fuzzy or similarity-based signals may be used only to reduce/manual-review candidate search. Examples include similar names, descriptions, source paths or technical profiles.

Fuzzy evidence never authorizes an automatic canonical merge in v1.

```text
FUZZY CANDIDATE
-> REVIEW_REQUIRED
```

### 3.8 Negative evidence

Identity resolution evaluates conflicts as well as matches.

Blocking negative evidence may include scope-dependent contradictions such as:

```text
incompatible entity kind
incompatible item / attach type
incompatible size where size defines identity
contradictory explicit source identity
channel/build evidence proving separate entities
```

A matching name cannot override blocking negative evidence.

### 3.9 Candidate blocking

VECTOR must not compare every unresolved source record against every canonical entity.

Candidate discovery first narrows the search using stable, indexed dimensions appropriate to the entity scope.

Representative component block:

```text
entity_kind = ITEM
item_family = shipcomponent
attach_type = QuantumDrive
size = 3
```

Only candidates inside the bounded block proceed to more expensive deterministic resolution.

Candidate blocking is an optimization and never identity proof by itself.

### 3.10 Identity resolution outcomes

The resolver supports explicit outcomes:

```text
MATCH_EXISTING
NEW_ENTITY
REVIEW_REQUIRED
QUARANTINED
SOURCE_DATA_MISSING
```

`NEW_ENTITY` creates a new VECTOR canonical identity only after the resolver determines that no approved existing identity can be safely reused.

### 3.11 Canonical merge

If two existing canonical entities are later proven to represent the same entity, VECTOR performs an audited canonical merge rather than silently deleting history.

Conceptually:

```text
canonical_entity_merge
    source_vector_entity_id
    target_vector_entity_id
    reason
    resolution_method
    rule_version
    evidence
    approved_by
    effective_at
```

The retired identity becomes non-authoritative and redirects/reconciles to the surviving canonical entity according to the approved migration procedure. Historical provenance remains inspectable.

### 3.12 Canonical split

If one canonical entity is later proven to contain multiple real entities, correction uses an audited split procedure.

Historical source/revision mappings are reassigned only where evidence is deterministic. Ambiguous historical mutable state is never guessed into one of the new identities and instead becomes `REVIEW_REQUIRED`.

### 3.13 Identity Resolution Event Ledger

Every non-trivial identity decision is explainable through an immutable/auditable resolution event.

Conceptually:

```text
identity_resolution_event
    source_identity_id
    candidate_vector_entity_id
    decision
    resolution_method
    rule_version
    supporting_evidence
    conflicting_evidence
    decided_at
    decided_by
```

Typical resolution methods include:

```text
EXACT_SOURCE_ID
EXPLICIT_IDENTITY_RELATION
DETERMINISTIC_COMPOSITE
MANUAL_REVIEW
```

### 3.14 Canonical ID generation contract

`vector_entity_id` uses the PostgreSQL `uuid` data type and is:

```text
opaque
immutable
VECTOR-owned
non-semantic
```

The exact generation algorithm remains an implementation decision until the deployed PostgreSQL/Supabase capabilities are verified. UUIDv4 and UUIDv7 are acceptable candidates if supported by the approved implementation.

The generation algorithm must not encode source system, channel, build, taxonomy or user-visible meaning.

### 3.15 Product family is not identity merge

Membership in the same Product Family never means concrete entities are merged.

For example, a base weapon and a verified named variant may share one Product Family while retaining separate canonical identities, inventory references and revision properties.


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

The v1 taxonomy/category assignment roles are exactly:

```text
PRIMARY
SECONDARY
FUNCTIONAL
```

These are the complete v1 taxonomy/category assignment roles. The Canonical Data Model is authoritative for their semantics. Variant and compatibility semantics belong in Relations (for example, `VARIANT_OF` and `COMPATIBLE_WITH`) and must not be encoded as taxonomy/category assignment roles. The Dataset Pipeline may process and publish these assignments and relations but does not define their semantic authority.

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
    state_context
    canonical_entity_id
    quantity
    quality
    location_id
    game-state metadata
```

In v1, mutable game state is the Production User State. Reference stats are resolved from exactly one selected active dataset revision when needed. A PTU Preview may use Production User State as a read-only selection/input context alongside PTU reference data, but cannot mutate it or assert PTU-native ownership, inventory, wallet, reputation or other PTU-native mutable state.

This avoids repeating full reference payloads in every inventory record.

`PTU_PREVIEW` and `PTU_NATIVE_STATE` are distinct. PTU-native mutable state is not an active v1 assumption; it is a future extension requiring explicit implementation and governance under VECTOR rules. The model permits that extension to use an independently channel-isolated state context without changing canonical entity identity or revision-scoped reference data.

## 19. Wipe boundary

Canonical entities, taxonomy, facets, relations and reference revision properties are not normal Star Citizen wipe targets.

In v1, game wipes target explicitly approved Production User State domains. A PTU Preview is read-only and is not a wipe target.

Examples:

```text
LIVE FULL_GAME_STATE
-> approved Production User State domains
```

A PTU-native wipe becomes applicable only if `PTU_NATIVE_STATE` is explicitly implemented and governed under VECTOR rules; it may then target only its approved PTU-native state domains, independently of Production User State. A wipe does not crawl the complete reference catalog to decide what can be removed. Wipe scope is defined by state-domain ownership and context.

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
- the source identity uniqueness boundary is `(source_system, identity_namespace, source_entity_id)`;
- an exact source identity is not split into a second authoritative identity because `entity_kind` conflicts;
- contradictory entity-kind or identity evidence follows an explicit `REVIEW_REQUIRED`/`QUARANTINED` collision path without auto-merge;
- cross-build identity changes never merge by fuzzy name alone;
- exact source-system + namespace + source-ID matches resolve to the same canonical entity only when identity evidence is compatible;
- fuzzy matching can produce review candidates but never auto-merge in v1;
- negative evidence can block otherwise similar identity candidates;
- candidate blocking narrows comparison scope without acting as identity proof;
- identity resolution returns explicit MATCH_EXISTING, NEW_ENTITY, REVIEW_REQUIRED, QUARANTINED or SOURCE_DATA_MISSING outcomes;
- canonical merges and splits preserve historical provenance and are auditable;
- non-trivial identity decisions are represented in the Identity Resolution Event Ledger;
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
- v1 mutable game state is Production User State and references canonical entities rather than duplicating full definitions;
- PTU Preview may read Production User State with PTU reference data but does not mutate or assert PTU-native state;
- PTU-native state and PTU-specific wipes are future extensions requiring explicit implementation and governance;
- game wipes target state domains rather than the reference catalog;
- bounded queries can serve representative Inventory, Fleet, Fabricator and comparison use cases;
- AI retrieval can produce compact projections without raw-dataset crawling;
- derived read models remain traceable to canonical authority;
- taxonomy/resolver rule changes are versioned and reprocessable.

## 28. Open implementation decisions before FROZEN

1. Exact deployed UUID generation method after PostgreSQL/Supabase capability verification.
2. Exact approved deterministic composite rules per entity scope.
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
