# VECTOR Data Context Model v1

**Status:** PROPOSED  
**Version:** 1.0  
**Scope:** Build-Klassifikation, aktive VECTOR-Datasets, persoenlicher Spielzustand und Game-State Epochs

## 1. Zweck

Diese Spezifikation definiert ein bewusst schlankes v1-Modell fuer Star-Citizen-Builds und Datenkontexte in VECTOR.

VECTOR verarbeitet in v1 genau zwei aktive Game-Data-Kontexte: `LIVE` und `PTU`. Weitere bekannte Star-Citizen-Build-Kanaele werden erkannt und fuer Provenienz/Watcher-Zuordnung klassifiziert, loesen aber keine eigene vollstaendige Dataset-Pipeline oder einen eigenen User-State-Modus aus.

## 2. Leitprinzip

VECTOR trennt drei Dinge:

```text
Build Channel
= Woher stammt ein Build/Event/Log?

Dataset Context
= Mit welchen Game-/Referenzdaten rechnet VECTOR?

Production User State
= Welcher persistente persoenliche Spielzustand wird in VECTOR gepflegt?
```

Eine `Game-State Epoch` versioniert relevante Zustandsperioden des Production User State ueber Wipe-Grenzen hinweg.

## 3. Known Build Channels

VECTOR kennt mindestens folgende Build-Klassifikationen:

```text
LIVE
HOTFIX
PTU
EPTU
TECH_PREVIEW
UNKNOWN
```

Diese Liste dient primaer zur korrekten Zuordnung von Build-Metadaten, Imports, Logs und zukuenftigen Watcher-Observations.

Das Vorhandensein eines bekannten Build Channels bedeutet nicht automatisch, dass VECTOR fuer diesen Channel ein aktives Dataset berechnet oder User State pflegt.

## 4. Active Dataset Contexts

VECTOR v1 unterstuetzt genau zwei aktive Dataset-Kontexte:

```text
LIVE
PTU
```

Fuer beide duerfen die fuer VECTOR relevanten Game-/Referenzdaten verarbeitet werden, z. B.:

- Items und Komponenten;
- Blueprint-/Crafting-Daten;
- Stats und Resolver-Eingaben;
- Ship Models;
- Hardpoints und Loadouts;
- FPS Equipment;
- weitere fuer Preview/Berechnung erforderliche Referenzdaten.

LIVE und PTU werden getrennt extrahiert, normalisiert, validiert, versioniert und aktiviert.

## 5. LIVE/PTU Isolation

Binding Rules:

- LIVE und PTU werden niemals in einer Berechnung gemischt.
- Kein Cross-Channel-Fallback.
- Fehlende LIVE-Daten werden nicht aus PTU ergaenzt.
- Fehlende PTU-Daten werden nicht aus LIVE ergaenzt.
- Completeness und Resolver Validation gelten fuer beide aktiven Dataset-Kontexte.
- Jede Dataset-Revision gehoert eindeutig zu genau einem aktiven Dataset-Kontext.

## 6. Bedeutung des UI-Schalters

Der globale VECTOR-Schalter bleibt:

```text
DATA [ LIVE | PTU ]
```

Er bestimmt den aktiven **Game-Data-/Berechnungskontext**.

Er bedeutet in v1 nicht automatisch, dass persoenliche Besitz-/Inventory-Daten zwischen zwei vollstaendigen User-State-Welten wechseln.

## 7. PTU als Preview-Kontext

PTU wird in v1 primaer fuer Vorschau und Vergleich genutzt.

Beispiele:

- Fabricator Preview mit kommenden PTU-Werten;
- Item-/Komponentenvergleich;
- Ship Build Preview;
- Hardpoint-/Loadout-Bewertung;
- FPS-Equipment-Vergleich;
- Blueprint-/Crafting-Vorschau;
- Darstellung kommender Balance-/Stat-Aenderungen.

VECTOR darf dabei den bestehenden persoenlichen Production User State als Auswahl-/Besitzkontext verwenden und diesen gegen das PTU-Dataset auswerten, sofern die jeweilige Berechnung fachlich kompatibel ist.

Das erzeugt keine Kopie des persoenlichen Inventars fuer PTU.

## 8. Production User State

VECTOR v1 pflegt primaer einen produktiven persoenlichen Game-State-Kontext fuer den normalen persistenten Spielerzustand.

Dazu koennen gehoeren:

- Inventory/Lots;
- Materialbestaende;
- Ingame-Schiffe;
- Actual Loadouts;
- aUEC/Wallet;
- Reputation;
- Blueprint Ownership/Progression;
- Refinery Jobs;
- aktuelle Locations und weitere persistente User-State-Domaenen.

Dieser Zustand wird nicht pro Dataset-Revision kopiert.

## 9. LIVE und HOTFIX

VECTOR behandelt `HOTFIX` als bekannten Build Channel, aber nicht als eigenen aktiven Dataset-Schalter.

In v1 gilt:

```text
UI Dataset Contexts:
LIVE | PTU

HOTFIX:
known build metadata only by default
```

Ein HOTFIX erzeugt nicht automatisch:

- ein eigenes User Inventory;
- eine eigene Fleet;
- eine eigene Wallet/Reputation;
- einen eigenen UI-Dataset-Kontext;
- eine neue Game-State Epoch.

Wenn spaeter belastbar festgestellt wird, dass ein HOTFIX VECTOR-relevante Referenz-/Game-Data-Werte veraendert, kann daraus eine neue LIVE-Dataset-Revision entstehen. Dafuer ist kein eigener `HOTFIX`-Runtime-Modus erforderlich.

## 10. EPTU und TECH_PREVIEW

`EPTU` und `TECH_PREVIEW` sind in v1 bekannte Build Channels, aber keine aktiv berechneten VECTOR-Dataset-Kontexte.

VECTOR muss in v1 fuer diese Channels nicht bereitstellen:

- vollstaendige Extraction/Normalization;
- Completeness-Aktivierung;
- Fabricator-Berechnung;
- Fleet-/Item-Preview;
- persistentes User-State-Tracking.

Ihre Klassifikation bleibt trotzdem wichtig fuer zukuenftige Logs, Watcher und Provenienz.

## 11. UNKNOWN

`UNKNOWN` ist eine sichere Build-/Source-Klassifikation, wenn ein eingehendes Event keinem bekannten Build Channel eindeutig zugeordnet werden kann.

Binding Rule:

> `UNKNOWN` darf niemals automatisch als `LIVE` interpretiert werden.

Unbekannte Build-Zuordnung darf keine ungepruefte Mutation des Production User State ausloesen.

## 12. Watcher-/Log-Zukunftssicherheit

Ein zukuenftiger Watcher darf Build-/Channel-Metadaten fuer alle bekannten Build Channels erkennen und speichern.

Wenn ein Observation-Event aus einem in v1 nicht unterstuetzten User-State-Channel stammt, z. B. `EPTU` oder `TECH_PREVIEW`:

```text
Channel erkennen
-> Observation/Provenienz erhalten, sofern sinnvoll
-> nicht als LIVE umdeuten
-> keine Production-User-State-Mutation
```

PTU User-State-Observations koennen spaeter ergaenzt werden, falls eine belastbare fachliche Nutzung entsteht. Sie sind keine Voraussetzung fuer v1.

## 13. Game-State Epoch

Eine Game-State Epoch bezeichnet eine relevante Persistenzperiode des Production User State zwischen Wipe-/Reset-Grenzen.

Eine neue Epoch entsteht nicht automatisch durch:

- normalen LIVE-Patch;
- HOTFIX;
- neue Dataset-Revision;
- VECTOR-Code-Release;
- Dataset-Rollback.

Ein explizit konfigurierter und ausgefuehrter relevanter Game Wipe kann eine neue Epoch erzeugen.

Partielle Wipes bleiben zusaetzlich ueber ihre expliziten Domain-Regeln nachvollziehbar.

## 14. Kein paralleles PTU-Inventory in v1

VECTOR v1 verlangt kein zweites persistentes PTU-Inventory/Fleet/Wallet/Reputation-Modell.

Das verhindert unnoetige Komplexitaet und erhaelt trotzdem den Hauptnutzen des PTU-Datasets: Vorschau und Berechnung kommender Spielwerte.

Eine spaetere Version darf PTU User State einfuehren, wenn Watcher/Import und fachlicher Nutzen dies rechtfertigen.

## 15. Provenienz

Build-/Dataset-abhaengige Daten sollten, soweit relevant, mindestens nachvollziehbar machen:

```text
build_channel
dataset_context
game_build
dataset_revision
source/provider
observed/extracted timestamp
```

Fuer Production User State bleibt zusaetzlich die relevante Game-State Epoch nachvollziehbar, wo sie fachlich erforderlich ist.

## 16. Architekturregel fuer Channel-Mapping

Das Mapping bleibt in v1 bewusst klein:

```text
LIVE
  Build Channel: supported
  Dataset Context: LIVE
  Production User State: supported

HOTFIX
  Build Channel: known
  Dataset Context: no dedicated context
  Production User State: same production context by default

PTU
  Build Channel: supported
  Dataset Context: PTU
  Persistent PTU User State: not required in v1

EPTU
  Build Channel: known
  Dataset Context: unsupported in v1
  Persistent User State: unsupported in v1

TECH_PREVIEW
  Build Channel: known
  Dataset Context: unsupported in v1
  Persistent User State: unsupported in v1

UNKNOWN
  Build Channel: safe fallback classification
  Dataset Context: none
  Production mutation: prohibited without resolution
```

## 17. Data Integrity Invariants

1. Aktive VECTOR-Dataset-Kontexte sind in v1 nur LIVE und PTU.
2. LIVE und PTU werden nie gemischt.
3. PTU dient primaer als Preview-/Berechnungskontext und erfordert kein dupliziertes User Inventory.
4. HOTFIX ist bekannt, aber kein eigener UI-Dataset-Kontext.
5. Ein HOTFIX erzeugt nicht automatisch einen neuen Game-State-Kontext oder eine neue Epoch.
6. EPTU und TECH_PREVIEW werden erkannt, aber in v1 nicht aktiv berechnet/validiert.
7. UNKNOWN wird niemals als LIVE geraten.
8. Nicht unterstuetzte Watcher-Observations duerfen Production User State nicht mutieren.
9. Dataset Revision und Game-State Epoch sind getrennte Konzepte.
10. Dataset-Rollback oder Patch-Wechsel machen keinen Game Wipe rueckgaengig.

## 18. Non-Goals

v1 definiert bewusst nicht:

- vollstaendiges EPTU-Dataset Processing;
- TECH_PREVIEW Dataset Processing;
- persistentes PTU-Inventory;
- persistente EPTU-/TECH_PREVIEW-User-State-Realms;
- automatischen HOTFIX-Dataset-Import;
- automatische Auswertung aller kuenftigen CIG-Channeltypen;
- eine komplexe Hierarchie mehrerer Persistence Realms.

Diese Faelle werden erst implementiert, wenn ein konkreter VECTOR-Nutzen entsteht.

## 19. Acceptance Criteria

Die v1-Spezifikation ist umgesetzt, wenn VECTOR nachweisen kann, dass:

- LIVE und PTU als getrennte Dataset-Kontexte funktionieren;
- ein Nutzer PTU-Werte fuer Fabricator/Items/Fleet-/Equipment-Preview verwenden kann, ohne sein Production Inventory zu duplizieren;
- HOTFIX als Build-Metadatum erkannt werden kann, ohne einen dritten UI-Dataset-Modus zu erzeugen;
- EPTU/TECH_PREVIEW/UNKNOWN nicht irrtuemlich als LIVE importiert werden;
- ein zukuenftiger Watcher nicht unterstuetzte Channels sicher klassifizieren kann;
- ein normaler Patch/HOTFIX keine Game-State Epoch erzeugt;
- ein expliziter Wipe weiterhin die fuer User State relevante Epoch-/Historisierungslogik steuert.

## 20. Status Decision

VECTOR Data Context Model v1 ist **PROPOSED**.

Vor FROZEN sind insbesondere abzugleichen:

- bestehende Formulierungen in `PERSISTENCE_PROVENANCE_V1.md`;
- bestehende Formulierungen in `GAME_WIPE_MODEL_V1.md`;
- bestehende Dataset-Isolation in `VECTOR_VERSIONING_V1.md` und relevanten UX-Spezifikationen;
- die modernisierte Provider-Architecture-Nachfolgeentscheidung.

Ziel der v1 ist ausdruecklich ein schlankes Modell: volle Unterstuetzung fuer LIVE/PTU-Datasets, produktiver User State ohne PTU-Duplikationspflicht und sichere Kenntnis weiterer Build Channels fuer spaetere Watcher-/Provenienzfaelle.
