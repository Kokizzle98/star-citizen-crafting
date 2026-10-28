# Legacy Notice

**Archive Status:** LEGACY_REFERENCE  
**Authority:** NON-BINDING  
**Original Decision Status:** ACCEPTED in the former SC Group Crafting / Star Citizen Management Platform V2 architecture  
**Current Role:** Historical provider-authority and integration architecture reference  
**Superseded as current ADR:** YES, pending a modern VECTOR successor ADR / provider authority policy

## Historical context

This document is the original accepted Provider-, Authority- and Integration Architecture decision from the SC Group Crafting / early VECTOR V2 design.

The original content below is intentionally preserved unchanged. The document contains several architecture principles that remain valuable, but it must not be treated as the current authoritative VECTOR provider contract because later VECTOR FROZEN rules changed or refined parts of the dataset, authentication, persistence and integration model.

## High-value principles to preserve for the successor design

The following concepts remain important inputs for the modern VECTOR provider architecture and should be reviewed for migration into current ADR/FROZEN specifications:

- internal VECTOR UUIDs remain authoritative over provider identifiers;
- provider **Direction**, **Authority** and **Capability** are separate dimensions;
- write capability does not imply authority over the same domain;
- external provider payloads must not directly and uncontrolled overwrite canonical domain state;
- SCMDB remains a read-only Star Citizen reference/game-data provider and is never authority for personal ownership;
- non-authoritative/local inputs should generally become observations/import candidates before domain mutations;
- OCR-derived state defaults to review/suggestion behavior until sufficiently reliable automatic acceptance is explicitly defined;
- external marketplace publication is separate from actual in-game consumption;
- protected provider credentials remain server-side;
- external writes should use a resilient outbox/delivery model where applicable;
- provider adapters normalize into canonical VECTOR resources rather than making provider payload formats the stable domain API;
- imported data retains provenance, authority and confidence context where applicable;
- uncertain provider observations follow VECTOR No-Guess/Reconciliation rules.

## Areas requiring modernization before reuse

### Product naming and current authority

The original document uses SCGC / SC Group Crafting terminology. Current successor specifications must use VECTOR terminology and current FROZEN governance.

### Persistence Realm / LIVE / HOTFIX / PTU: REVIEW REQUIRED

The original ADR maps:

```text
LIVE    -> PU_PRODUCTION
HOTFIX  -> PU_PRODUCTION
PTU     -> ignored
EPTU    -> ignored
TECH_PREVIEW -> ignored
UNKNOWN -> ignored
```

This section must **not** be discarded as simply obsolete. It captures an important distinction between:

1. **game-state persistence realms** such as player ownership, inventory, ships, progression and related persistent state; and
2. **game-data/build dataset contexts** used by VECTOR to resolve gameplay/reference values.

Current VECTOR FROZEN rules already establish strict `LIVE | PTU` dataset isolation for game/reference data. That does not by itself prove that LIVE and HOTFIX need independent ownership/inventory persistence realms.

The project owner has specifically identified the following behavior that must be reconciled in the successor architecture:

- LIVE and HOTFIX have historically represented the same Persistent Universe player-state realm for the relevant ownership/inventory context;
- switching between LIVE and HOTFIX has not, in the observed project context, implied separate player inventory/ship ownership state;
- HOTFIX data is not intended to become a separate active VECTOR gameplay/reference dataset unless a future HOTFIX actually changes relevant game values;
- PTU remains relevant as a separate VECTOR dataset context for game/reference values and must not cross-fallback with LIVE;
- the successor architecture therefore needs separate concepts for **Dataset Channel** and **Persistence Realm** rather than assuming that each build/channel automatically owns a separate player-state realm.

This distinction requires explicit review and a modern successor decision. Do not implement either the legacy `PTU -> ignored` rule or a one-channel-equals-one-persistence-realm assumption without that review.

### HOTFIX data relevance

HOTFIX should not automatically become a first-class VECTOR runtime dataset simply because a HOTFIX build exists.

The successor design should define when a HOTFIX is:

- merely an operational/server/client fix sharing the current LIVE player-state realm and not changing VECTOR-relevant game values; or
- a data-changing build that requires a new dataset revision/build context.

The exact rule is not frozen by this legacy document.

### SCDL integration priority

The legacy ADR describes SCDL as a preferred source for certain Blueprint/Game-State inputs. Current VECTOR planning treats the SC Deutsch Launcher integration as a later/future integration. Preserve the general rule to prefer documented interfaces/exports and avoid undocumented reverse engineering, but re-evaluate provider priority before implementation.

### RSI Hangar authority

The legacy ADR treats verified RSI Hangar data as authoritative for pledge ownership. This remains a strong design candidate, but the modern VECTOR RSI/Citizen/Game Identity and Hangar integration must be specified under the current Auth, Fleet and Provenance policies before this legacy statement is treated as current implementation authority.

### Concrete database names

Legacy table names such as `provider_capabilities`, `provider_endpoints`, `source_authority_rules`, `game_state_observations`, `integration_outbox` and `integration_deliveries` are architecture references, not a frozen Production SQL schema.

## Current-authority rule

In case of conflict, use this precedence:

```text
current docs/frozen rules
> current approved Git/Production state
> current ADR / architecture specifications
> current proposed specifications where explicitly applicable
> this legacy ADR
> older drafts/prototypes
```

This legacy ADR must not independently authorize database migrations, provider enablement, secrets handling, Production mutations or a change to the current LIVE/PTU dataset-isolation policy.

## Follow-up after archival

After this archival step, return specifically to the **Persistence Realm / LIVE-HOTFIX-PTU** topic before writing the successor provider ADR or freezing `PROVIDER_AUTHORITY_V1.md`.

The successor review should model at least these concepts independently:

```text
Provider
Provider Capability
Provider Authority
Dataset Channel / Build Context
Dataset Revision
Persistence Realm / Game-State Epoch
Observation / Mutation Authority
```

The goal is to preserve the legacy insight that game build/channel and persistent player-state realm are not necessarily the same thing, while retaining VECTOR's current strict LIVE/PTU data-isolation rules.

---

# Original historical content
# ADR-001: Provider-, Authority- und Integration Architecture

- **Status:** Accepted
- **Projekt:** SC Group Crafting / Star Citizen Management Platform V2
- **Decision Type:** Architecture / Data Governance / Integrations

## Context

SC Group Crafting verbindet mehrere Datenquellen mit sehr unterschiedlichen Vertrauens-, Persistenz- und Schreibmodellen. Der Kern des Systems benötigt interne UUIDs und ein kanonisches Datenmodell, während externe Systeme ausschließlich über klar begrenzte Provider-Adapter integriert werden.

Die Architektur muss insbesondere verhindern, dass eine Community-Quelle vermeintlichen Pledge-Besitz erzeugt oder veraltete externe Daten einen maßgeblichen RSI-Hangar-Zustand überschreiben. Gleichzeitig müssen gezielte Schreibvorgänge zu UEX möglich sein, etwa das Publizieren eines Marketplace-Angebots aus dem persönlichen SCGC-Inventar.

LIVE und HOTFIX werden für SCGC als ein gemeinsamer persistenter Produktionszustand behandelt. PTU, EPTU, TECH-PREVIEW und UNKNOWN gehören nicht zum persistenten SCGC-Spielstand.

## Decision

### 1. Canonical internal model

Interne SCGC-UUIDs sind die einzigen kanonischen Identitäten. Provider-IDs werden ausschließlich über `external_identities` beziehungsweise providerbezogene Mappingtabellen angebunden.

Provider-Payloads dürfen Domain-Tabellen nicht unkontrolliert direkt überschreiben. Änderungen laufen über Snapshot-, Observation-, Normalization-, Review- oder Publication-Prozesse.

### 2. Provider dimensions are separate

Für jeden Provider werden mindestens drei unabhängige Dimensionen gespeichert:

- **Direction:** `READ_ONLY`, `READ_WRITE`, `IMPORT_ONLY`
- **Authority:** `AUTHORITATIVE`, `AUTHORITATIVE_EVENT`, `SUPPLEMENTAL`, `SUGGESTION_ONLY`, `DISABLED`
- **Capability:** konkrete Funktion wie `PLEDGE_OWNERSHIP_READ`, `BLUEPRINT_CATALOG_READ`, `MARKETPLACE_PUBLISH`

Schreibfähigkeit bedeutet ausdrücklich nicht, dass ein Provider für denselben Datentyp maßgeblich ist.

### 3. RSI My Hangar

Für **Pledge Ownership und Pledge Entitlements** ist ausschließlich der verifizierte RSI-Hangar-Snapshot maßgeblich.

- Direction: `READ_ONLY`
- Authority für Pledge Ownership: `AUTHORITATIVE`
- Andere Quellen dürfen Pledge-Besitz ausschließlich als `SUGGESTION_ONLY` melden.
- Konflikte werden zugunsten des aktuellen verifizierten RSI-Hangar-Zustands entschieden.
- Fehlende Assets werden zunächst als `MISSING/PENDING_REVIEW` behandelt, wenn die Ursache nicht eindeutig belegt ist.
- Reclaim, Gift, Upgrade und Buyback werden über den Hangar-Lifecycle historisiert.
- Neue Pledges werden nicht automatisch mit einer Crew geteilt.

### 4. SCMDB

SCMDB ist **strikt read-only**.

SCGC sendet keinerlei Spieler-, Besitz-, Blueprint-, Inventory-, Mission- oder Watcher-Daten an SCMDB zurück.

Vorgesehene Capabilities:

- `BLUEPRINT_CATALOG_READ`
- `CRAFTING_DATA_READ`
- `ITEM_REFERENCE_READ`
- `MISSION_REFERENCE_READ`
- `MINING_REFERENCE_READ`

Direction: `READ_ONLY`.

SCMDB kann je Datendomäne `AUTHORITATIVE` oder `SUPPLEMENTAL` für Referenz-/Katalogdaten sein, niemals für persönlichen Besitz.

Der bestehende lokale SCMDB-Mirror bleibt ein eigener Transport/Provider-Endpunkt. Eine spätere SCMDB-API kann dieselben kanonischen Capabilities bedienen, ohne Domainlogik zu ändern.

### 5. SCDL / SC Deutsch Launcher

SCDL ist die bevorzugte Integrationsquelle für bereits zuverlässig lokal erfasste Blueprint- und ausgewählte Game-State-Daten, sofern eine saubere Read-Integration verfügbar ist.

Öffentlich dokumentierte Fähigkeiten umfassen das Lesen erspielter Blueprints aus `Game.log` oder JSON, Blueprint-Tracking während des Spiels, Daten aus `Game.log`, OCR-basierte Werte und das Starten eigener Programme/Skripte zusammen mit Star Citizen.

Transport-Priorität für SCGC:

1. `LOCAL_READ_API` oder vergleichbare offiziell abgestimmte lokale Read-Schnittstelle, falls zukünftig verfügbar.
2. `JSON_IMPORT` für dokumentiert exportierbare Daten.
3. `GAME_LOG` über den eigenen SCGC Companion als ergänzender Fallback.

Das SCDL-Scanintervall ist eine Benutzer-/SCDL-Konfiguration und wird in SCGC **nicht hartcodiert**. SCGC behandelt eingehende Daten zeitpunktbezogen und idempotent.

SCGC setzt keine Abhängigkeit voraus, für die undokumentierte interne SCDL-Dateien reverse-engineered oder manipuliert werden müssten.

### 6. SCGC Companion Client

Der eigene Client bleibt Bestandteil der Architektur und wird durch SCDL nicht ersetzt.

Aufgaben:

- sicherer lokaler Collector/Bridge
- Start zusammen mit Star Citizen über SCDL möglich
- ergänzendes Game.log-Watching
- lokale JSON-Imports
- zukünftige offiziell abgestimmte SCDL-Integration
- OCR für Daten, die nicht zuverlässig strukturiert verfügbar sind
- Offline Queue und idempotenter Upload
- Device Pairing

OCR-Ergebnisse werden standardmäßig als `SUGGESTION_ONLY` beziehungsweise `NEEDS_REVIEW` behandelt und verändern Bestände erst nach Review/Bestätigung, solange keine ausreichend sichere automatische Erkennung definiert wurde.

### 7. UEX

UEX ist der bewusst **bidirektionale** Provider.

Read Capabilities können insbesondere Markt-, Preis-, Item-, Vehicle-, Location- und weitere von der dokumentierten UEX API bereitgestellte Ressourcen umfassen.

Write Capabilities werden explizit pro Endpoint freigeschaltet. Erste verbindliche Write Capability:

- `MARKETPLACE_PUBLISH`

UEX ist dadurch `READ_WRITE`, aber **nicht authoritative für SCGC Inventory oder RSI Pledge Ownership**.

Marketplace-Workflow:

1. SCGC Inventory Item/Lot auswählen.
2. Lokales `marketplace_listing` als Draft anlegen.
3. Menge im SCGC Inventory reservieren, nicht konsumieren.
4. Nutzer prüft UEX-Publikationsvorschau.
5. Serverseitiger UEX Connector publiziert über die UEX API.
6. `marketplace_publications` speichert externe Listing-ID und Status.
7. Cancel/Expire löst die Reservation.
8. Ein UEX-Publish allein darf niemals den realen SCGC-Ingame-Bestand abbuchen.
9. Consumption erfolgt erst über einen separat verifizierten Ingame-Vorgang oder eine bestätigte Bestandsänderung.

UEX Bearer/API Credentials und der persönliche UEX Secret Key bleiben ausschließlich serverseitig geschützt.

### 8. Warchest and third-party inventory scanners

Funktionale Ideen wie OCR-/Inventory-/Refinery-Erfassung dürfen unabhängig nachgebaut werden.

Kein undokumentiertes Anzapfen, Reverse Engineering oder Übernehmen proprietärer Implementierungsdetails. Eine spätere Integration benötigt eine dokumentierte Schnittstelle, einen dokumentierten Export oder ausdrückliche Zustimmung des jeweiligen Projekts.

### 9. Persistence Realm

SCGC verwendet genau einen relevanten produktiven Persistenzraum:

`PU_PRODUCTION`

Channel-Mapping:

- `LIVE` -> `PU_PRODUCTION`, import enabled
- `HOTFIX` -> `PU_PRODUCTION`, import enabled
- `PTU` -> ignored
- `EPTU` -> ignored
- `TECH_PREVIEW` -> ignored
- `UNKNOWN` -> ignored

Game Build und Persistenzzustand sind getrennte Konzepte. Ein LIVE- und ein HOTFIX-Build können unterschiedliche `game_versions` darstellen, greifen in SCGC aber auf denselben `PU_PRODUCTION` Besitz-/Progresszustand zu.

### 10. Observations before mutations

Lokale oder nicht autoritative Datenquellen erzeugen bevorzugt `game_state_observations` beziehungsweise Importkandidaten.

Observation Status:

- `RECEIVED`
- `AUTO_ACCEPTED`
- `NEEDS_REVIEW`
- `ACCEPTED`
- `REJECTED`
- `SUPERSEDED`

Mutation von Inventory, Blueprint Ownership, Wallet oder anderem User Game State erfolgt nur entsprechend der für den Observation Type definierten Authority-/Confidence-Regel.

### 11. Provider capability registry

Die Datenbank erhält ein Capability Registry Modell:

- `provider_capabilities`
- `provider_endpoints`
- `source_authority_rules`
- optional `provider_transport_profiles`

Beispiel:

```text
RSI_HANGAR  PLEDGE_OWNERSHIP_READ   READ_ONLY   AUTHORITATIVE
SCMDB       BLUEPRINT_CATALOG_READ  READ_ONLY   AUTHORITATIVE/SUPPLEMENTAL
SCDL        BLUEPRINT_OWNERSHIP     IMPORT_ONLY AUTHORITATIVE_EVENT
SCGC_CLIENT GAME_OBSERVATIONS       IMPORT_ONLY AUTHORITATIVE_EVENT/CONFIRMABLE
UEX         MARKET_DATA_READ        READ_ONLY   SUPPLEMENTAL
UEX         MARKETPLACE_PUBLISH     WRITE       PUBLICATION_TARGET
```

### 12. Outbox for write integrations

Externe Writes werden nicht innerhalb einer normalen Domaintransaktion synchron erzwungen.

SCGC verwendet:

- `integration_outbox`
- `integration_deliveries`

Ablauf:

`Domain Commit -> Outbox -> Provider Worker/Edge Function -> Partner -> Delivery State`

Dadurch bleiben SCGC-Domainänderungen robust, wenn UEX temporär nicht verfügbar ist.

### 13. Public/partner API boundary

Die stabile SCGC API verwendet kanonische Ressourcen, nicht Provider-Strukturen.

Beispiele:

- `/api/v1/items`
- `/api/v1/ships`
- `/api/v1/blueprints`
- `/api/v1/me/fleet`
- `/api/v1/me/inventory`

Provider-spezifische Endpoints befinden sich hinter Connector-/Integration-Services und sind kein Bestandteil des stabilen öffentlichen Domain-Vertrags.

### 14. Provenance

Jeder relevante importierte Wert muss nach Möglichkeit folgenden Kontext tragen:

- `provider_id`
- `external_identity`
- `observed_at` / `source_updated_at`
- `game_version_id`, wenn anwendbar
- `persistence_realm_id`, bei User Game State
- `authority_level`
- `confidence`, wenn die Quelle nicht authoritative ist
- Raw-/Snapshot-Referenz, wenn vorhanden

## Provider authority matrix

| Domain | Primary Provider | Direction | Authority / Effect |
|---|---|---|---|
| Pledge ownership | RSI Hangar | Read | AUTHORITATIVE |
| Pledge entitlements | RSI Hangar | Read | AUTHORITATIVE |
| Blueprint catalog | SCMDB | Read | authoritative/supplemental reference |
| Crafting reference | SCMDB | Read | authoritative/supplemental reference |
| Earned blueprint ownership | SCDL / approved local observation | Import | AUTHORITATIVE_EVENT after validation |
| Mission/game observations | SCDL + SCGC Companion | Import | observation/event |
| Material inventory | SCGC Companion / OCR/import | Import | CONFIRMABLE / NEEDS_REVIEW |
| RSI Store Credit | RSI source when available | Read | separate account snapshot |
| Market and price data | UEX | Read | SUPPLEMENTAL market source |
| UEX marketplace listing | UEX | Write | PUBLICATION_TARGET |
| SCGC inventory quantity | SCGC | Internal | CANONICAL internal state |
| Crew/fleet planning | SCGC | Internal | CANONICAL internal state |

## Consequences

### Positive

- Pledge ownership cannot be silently corrupted by stale community data.
- SCMDB integration remains simple and privacy-preserving.
- SCDL can be used where it already solves Blueprint/Game.log tracking well.
- A future direct SCDL integration can replace JSON imports without redesigning domain tables.
- UEX Write-Back is possible without making UEX the inventory authority.
- LIVE/HOTFIX do not create duplicate inventories.
- Every imported value has explicit provenance and authority.
- Provider outages do not block core SCGC transactions when Outbox delivery is used.

### Trade-offs

- More tables and explicit state transitions are required.
- Provider adapters require normalization code.
- Ambiguous RSI changes and OCR observations may require user review.
- External publication state and actual Ingame state must be reconciled separately.

## Rejected alternatives

1. **Treat every provider equally.** Rejected because stale or crowdsourced data could overwrite authoritative ownership.
2. **Use UEX/other fleet data as Pledge truth.** Rejected; only RSI Hangar is authoritative for Pledge ownership.
3. **Write player data back to SCMDB.** Rejected; SCMDB integration is read-only by project decision.
4. **Duplicate LIVE and HOTFIX inventory.** Rejected; both belong to `PU_PRODUCTION` for SCGC.
5. **Make SCDL a hard runtime dependency.** Rejected; SCDL is preferred where useful, but SCGC Companion and import fallbacks remain.
6. **Direct UEX calls from the browser.** Rejected because protected credentials and publication control belong server-side.
7. **Immediately deduct inventory when publishing on UEX.** Rejected; publication creates a reservation, not an Ingame consumption event.

## Follow-up implementation

1. Add `persistence_realms` and map LIVE/HOTFIX to `PU_PRODUCTION`.
2. Replace channel ownership of game-state epochs with `persistence_realm_id`.
3. Add `provider_capabilities`, `provider_endpoints`, `source_authority_rules`.
4. Add `game_state_observations` and observation acceptance rules.
5. Add `integration_outbox` and `integration_deliveries`.
6. Extend inventory reservations with `MARKETPLACE_LISTING` source type.
7. Implement UEX Marketplace server connector first as controlled Write-Back path.
8. Retain SCMDB mirror as read-only provider and prepare optional read API transport.
9. Implement SCDL JSON Blueprint importer.
10. If contact with the SCDL project becomes possible, propose an official local read-only integration contract rather than relying on internal implementation details.

## Notes

The SCDL website documents Blueprint ownership reading from Game.log or a JSON file, Game.log-derived live values, OCR-assisted readings, per-installation handling, and launching programs/scripts with RSI Launcher or Star Citizen. The exact scan interval is treated by this ADR as externally configurable and is not part of the SCGC contract.

UEX API 2.0 documents GET/POST/DELETE resources and a `marketplace_advertise` POST endpoint that uses Bearer authentication plus a required user secret key. SCGC limits write capabilities to explicitly approved provider actions rather than granting a generic outbound-write ability.
