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

- LIVE- und PTU-Referenzdaten sowie daraus abgeleitete kanalabhaengige Werte werden niemals in einer Berechnung gemischt.
- Eine PTU Preview darf den Production User State als separaten read-only Auswahl-/Eingabekontext verwenden; alle kanalabhaengigen Referenzdaten und daraus abgeleiteten Werte stammen ausschliesslich aus dem PTU Reference Dataset. Der Production User State ist kein LIVE-Referenzdatensatz und erlaubt keine LIVE/PTU-Referenzdatenmischung.
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

`PTU_PREVIEW` bezeichnet eine Berechnung mit genau einem PTU Reference Dataset. `PTU_NATIVE_STATE` waere ein separater persistenter PTU-Spielzustand und ist in v1 nicht aktiv.

Beispiele:

- Fabricator Preview mit kommenden PTU-Werten;
- Item-/Komponentenvergleich;
- Ship Build Preview;
- Hardpoint-/Loadout-Bewertung;
- FPS-Equipment-Vergleich;
- Blueprint-/Crafting-Vorschau;
- Darstellung kommender Balance-/Stat-Aenderungen.

VECTOR darf dabei den bestehenden persoenlichen Production User State als read-only Auswahl-/Eingabekontext verwenden und ihn gegen das PTU Reference Dataset auswerten, sofern die jeweilige Berechnung fachlich kompatibel ist. Die Preview verwendet keine LIVE-Referenzdaten als PTU-Ersatz.

Dabei gilt:

- Production-Besitz, Inventory-Mengen und konkrete User Assets bleiben Production User State;
- PTU-Werte duerfen fuer Preview, Vergleich und Berechnung verwendet werden;
- Production-Besitz darf nicht als verifizierter PTU-Besitz oder als PTU-Inventar, PTU-Wallet, PTU-Reputation oder anderer PTU-nativer Spielzustand dargestellt werden;
- eine PTU-Preview darf Production Actual Loadout, Inventory, Fleet oder andere Production-User-State-Daten nicht mutieren;
- Preview-Ergebnisse muessen den verwendeten PTU-Dataset-Kontext in ihrer Berechnungsprovenienz behalten.

Das erzeugt weder eine Kopie des persoenlichen Inventars fuer PTU noch einen PTU-Native-State. `PTU_PREVIEW` und `PTU_NATIVE_STATE` sind verschiedene Kontexte.

## 8. Production User State

VECTOR v1 besitzt genau eine primaere Basis fuer persoenlichen persistenten Spielzustand: den `Production User State`.

Der Production User State ist unabhaengig vom aktuell ausgewaehlten Dataset Context. Das Umschalten zwischen `LIVE` und `PTU` erzeugt, kopiert oder ersetzt keinen persoenlichen Besitzstand.

Der Production User State ist in v1 der einzige mutable Game-State-Kontext. Eine PTU Preview darf ihn als read-only Auswahl-/Eingabekontext verwenden, aber weder mutieren noch daraus PTU-native Besitz- oder Zustandsaussagen ableiten.

VECTOR v1 pflegt damit einen produktiven persoenlichen Game-State-Kontext fuer den normalen persistenten Spielerzustand.

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

Ein HOTFIX darf nur dann eine neue LIVE-Dataset-Revision ausloesen, wenn eine belastbare Aenderungserkennung nachweist, dass sich VECTOR-relevante Referenz-/Game-Data-Werte gegenueber der aktiven LIVE-Revision geaendert haben.

Binding Rules:

- reine Client-, Server-, Stabilitaets- oder Infrastrukturfixes erzeugen keine neue LIVE-Dataset-Revision, sofern sie keine relevanten Game-/Referenzdaten veraendern;
- die Entscheidung basiert auf nachweisbaren Datenunterschieden, nicht allein auf dem Vorhandensein eines HOTFIX-Builds;
- bei relevanten Datenunterschieden wird eine neue LIVE-Dataset-Revision mit HOTFIX-Quellprovenienz erzeugt und durch die normalen Extraction-, Normalization-, Completeness-, Resolver- und Activation-Gates gefuehrt;
- dafuer ist kein eigener `HOTFIX`-Runtime-Modus und kein dritter UI-Dataset-Schalter erforderlich;
- kann die Relevanz der Aenderung nicht eindeutig bestimmt werden, bleibt die aktive LIVE-Dataset-Revision unveraendert und der HOTFIX wird als Review-/Provenienzfall behandelt.

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

PTU-Observations duerfen nicht als Production User State umgedeutet werden. Persistente PTU-native User-State-Observations sind erst nach expliziter Einfuehrung und Governance von `PTU_NATIVE_STATE` zulaessig; sie sind keine Voraussetzung fuer v1.

## 13. Dataset Trigger versus Wipe Target

Ein Dataset Context und der davon betroffene User State sind getrennte Ziele.

Fuer VECTOR v1 gilt bei Build-triggered Game Wipes:

```text
Trigger:
validiertes und publishable LIVE-Dataset fuer einen exakt passenden Build

Wipe Target:
Production User State mit den explizit konfigurierten Wipe-Domaenen
```

Binding Rules:

- das LIVE-Dataset kann die Ausfuehrung eines passenden `ARMED` Wipe Plans ausloesen;
- das Dataset selbst ist nicht der persoenliche Zustand, der gewiped wird;
- der Wipe betrifft ausschliesslich die im Plan definierten Production-User-State-Domaenen;
- PTU-Dataset-Aktivierung loest in v1 keinen Production-User-State-Wipe aus;
- PTU Preview ist kein Wipe-Ziel; PTU-native Wipe-Operationen werden erst anwendbar, wenn `PTU_NATIVE_STATE` explizit implementiert und geregelt ist;
- HOTFIX-Erkennung loest keinen Wipe und keine neue Epoch aus, sofern kein ausdruecklich passender Wipe Plan alle regulaeren Gates besteht;
- ein neuer Build oder eine neue Dataset-Revision erzeugt ohne ausgefuehrten Wipe Plan keine neue Game-State Epoch.

## 14. Game-State Epoch

Eine Game-State Epoch bezeichnet eine relevante Persistenzperiode des Production User State zwischen Wipe-/Reset-Grenzen.

Eine neue Epoch entsteht nicht automatisch durch:

- normalen LIVE-Patch;
- HOTFIX;
- neue Dataset-Revision;
- VECTOR-Code-Release;
- Dataset-Rollback.

Ein explizit konfigurierter und ausgefuehrter relevanter Game Wipe kann eine neue Epoch erzeugen.

Partielle Wipes bleiben zusaetzlich ueber ihre expliziten Domain-Regeln nachvollziehbar.

## 15. Kein PTU_NATIVE_STATE in v1

VECTOR v1 enthaelt keinen persistenten `PTU_NATIVE_STATE` und damit kein separates PTU-Inventory, keine PTU-Fleet, PTU-Wallet oder PTU-Reputation.

Das verhindert unnoetige Komplexitaet und erhaelt den Nutzen des PTU-Datasets fuer read-only Vorschau und Berechnung kommender Spielwerte auf Basis von Production User State.

Eine spaetere Version darf `PTU_NATIVE_STATE` als eigenen, vom Production User State isolierten mutablen Spielzustandskontext einfuehren, wenn Watcher/Import und fachlicher Nutzen dies rechtfertigen und die Erweiterung explizit implementiert und durch VECTOR-Regeln geregelt ist. Production User State, PTU Preview und PTU-nativer Spielzustand bleiben getrennte Konzepte.

## 16. Provenienz

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

## 17. Architekturregel fuer Channel-Mapping

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
  PTU_PREVIEW: supported, read-only Production User State input
  PTU_NATIVE_STATE: not implemented in v1; future governed extension

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

## 18. Data Integrity Invariants

1. Aktive VECTOR-Dataset-Kontexte sind in v1 nur LIVE und PTU.
2. LIVE- und PTU-Referenzdaten sowie kanalabhaengige abgeleitete Werte werden nie gemischt; PTU Preview nutzt hoechstens Production User State als separaten read-only Eingabekontext.
3. PTU dient primaer als Preview-/Berechnungskontext und erfordert kein dupliziertes User Inventory.
4. Production User State ist der einzige mutable Game-State-Kontext in v1.
5. PTU_PREVIEW darf Production User State nur read-only als Auswahl-/Eingabekontext nutzen.
6. PTU_PREVIEW mutiert Production User State nicht und behauptet keinen PTU-nativen Besitz oder Spielzustand.
7. PTU_NATIVE_STATE ist eine zukuenftige, explizit implementierte und durch VECTOR-Regeln geregelte Erweiterung; PTU-Wipes setzen diese Erweiterung voraus.
8. HOTFIX ist bekannt, aber kein eigener UI-Dataset-Kontext.
9. Ein HOTFIX erzeugt nicht automatisch einen neuen Game-State-Kontext oder eine neue Epoch.
10. EPTU und TECH_PREVIEW werden erkannt, aber in v1 nicht aktiv berechnet/validiert.
11. UNKNOWN wird niemals als LIVE geraten.
12. Nicht unterstuetzte Watcher-Observations duerfen Production User State nicht mutieren.
13. Dataset Revision und Game-State Epoch sind getrennte Konzepte.
14. Dataset-Rollback oder Patch-Wechsel machen keinen Game Wipe rueckgaengig.
15. LIVE-Dataset ist bei Build-triggered Wipes der Triggerkontext; Wipe-Ziel ist der explizit konfigurierte Production User State.
16. Ein HOTFIX erzeugt nur bei nachgewiesenen VECTOR-relevanten Datenunterschieden eine neue LIVE-Dataset-Revision.

## 19. Non-Goals

v1 definiert bewusst nicht:

- vollstaendiges EPTU-Dataset Processing;
- TECH_PREVIEW Dataset Processing;
- PTU_NATIVE_STATE, einschliesslich persistentem PTU-Inventory/Fleet/Wallet/Reputation;
- persistente EPTU-/TECH_PREVIEW-User-State-Realms;
- automatischen HOTFIX-Dataset-Import;
- automatische Auswertung aller kuenftigen CIG-Channeltypen;
- eine komplexe Hierarchie mehrerer Persistence Realms.

Diese Faelle werden erst implementiert, wenn ein konkreter VECTOR-Nutzen entsteht.

## 20. Acceptance Criteria

Die v1-Spezifikation ist umgesetzt, wenn VECTOR nachweisen kann, dass:

- LIVE und PTU als getrennte Dataset-Kontexte funktionieren;
- ein Nutzer PTU-Werte fuer Fabricator/Items/Fleet-/Equipment-Preview verwenden kann, ohne sein Production Inventory zu duplizieren;
- PTU Preview Production User State read-only als Auswahl-/Eingabekontext nutzt und diesen nicht mutiert;
- PTU Preview keine PTU-native Ownership, Inventory-, Wallet-, Reputation- oder sonstige PTU-native Mutable-State-Aussage trifft;
- PTU_NATIVE_STATE und PTU-Wipes erst nach expliziter Implementierung und Governance verfuegbar sind;
- HOTFIX als Build-Metadatum erkannt werden kann, ohne einen dritten UI-Dataset-Modus zu erzeugen;
- EPTU/TECH_PREVIEW/UNKNOWN nicht irrtuemlich als LIVE importiert werden;
- ein zukuenftiger Watcher nicht unterstuetzte Channels sicher klassifizieren kann;
- ein normaler Patch/HOTFIX keine Game-State Epoch erzeugt;
- ein expliziter Wipe weiterhin die fuer User State relevante Epoch-/Historisierungslogik steuert.

## 21. Status Decision

VECTOR Data Context Model v1 ist **PROPOSED**.

Vor FROZEN sind insbesondere abzugleichen:

- bestehende Formulierungen in `PERSISTENCE_PROVENANCE_V1.md`;
- bestehende Formulierungen in `GAME_WIPE_MODEL_V1.md`;
- bestehende Dataset-Isolation in `VECTOR_VERSIONING_V1.md` und relevanten UX-Spezifikationen;
- die modernisierte Provider-Architecture-Nachfolgeentscheidung.

Ziel der v1 ist ausdruecklich ein schlankes Modell: volle Unterstuetzung fuer LIVE/PTU-Datasets, produktiver User State ohne PTU-Duplikationspflicht und sichere Kenntnis weiterer Build Channels fuer spaetere Watcher-/Provenienzfaelle.
