# VECTOR Stat Resolver Policy v1

**Status:** PROPOSED  
**Version:** 1.0  
**Scope:** Aufloesung, Verifikation, Transformation und produktive Verwendung von SCMDB-Statistiken und Blueprint-Properties in VECTOR

## 1. Zweck

Diese Policy definiert die verbindlichen fachlichen Regeln fuer Stat Resolver in VECTOR.

Ein Stat darf nur dann produktiv berechnet oder als verlaesslicher abgeleiteter Wert dargestellt werden, wenn der benoetigte Datenpfad, die Resolver-Semantik und die erforderliche Transformation fuer den aktiven Dataset-Kontext hinreichend verifiziert sind.

Die Policy friert Resolver-Grundsaetze ein. Konkrete SCMDB-Pfade, einzelne Property-Mappings und deren aktueller Verifikationsstatus bleiben versionierbare Daten und duerfen sich zwischen Dataset-Revisionen aendern.

## 2. Grundprinzipien

1. Fehlende Baselines sind niemals `0`.
2. Unbekannte oder unaufgeloeste Werte werden niemals geraten.
3. Rohwert, Resolver und Transformation sind getrennte Konzepte.
4. Nur explizit freigegebene Resolver duerfen produktive Berechnungen erzeugen.
5. Resolver sind Dataset-, Build- und Channel-abhaengig nachpruefbar.
6. Additive und multiplikative Modifier bleiben getrennte Berechnungspfade.
7. Spezialfaelle werden ueber explizite Resolver geloest, nicht ueber stillschweigende Heuristiken.
8. Item-spezifische Overrides sind Ausnahmefaelle und kein Ersatz fuer strukturelles Mapping.
9. Resolver-Provenienz muss nachvollziehbar bleiben.
10. Ein vormals verifizierter Resolver kann durch neue Evidenz heruntergestuft werden.

## 3. Begriffe

### 3.1 Property Key

Der von SCMDB gelieferte Blueprint-`property_key` ist der externe Import-Key.

VECTOR darf denselben Key als kanonischen Import-Key verwenden, solange kein ausdruecklich benoetigtes internes Alias eingefuehrt wird.

Ein internes Alias darf die externe Herkunft nicht unkenntlich machen.

### 3.2 Baseline

Die Baseline ist der fuer eine Berechnung benoetigte Ausgangswert eines Stats im aktiven Dataset-Kontext.

Eine Blueprint-Property ohne belastbar aufloesbare Baseline ist nicht produktiv berechenbar.

### 3.3 Resolver

Ein Resolver beschreibt, wie VECTOR aus dem kanonischen Datenbestand den benoetigten Rohwert fuer eine Property bestimmt.

Beispiele fuer Resolverklassen koennen sein:

```text
DIRECT
PRIMARY_FIRE_MODE
DAMAGE_RESISTANCE
WEAPON_DAMAGE
TRACTOR_BEAM
SALVAGE
ARMOR_TEMPERATURE
SHIP_RESOURCE
SHIELD
QUANTUM_DRIVE
RADAR
CRAFT_TIME
INTEGRITY
```

Die konkrete Liste ist versionierbar und nicht abschliessend FROZEN.

### 3.4 Transformation

Die Transformation beschreibt die fachliche Umrechnung vom aufgeloesten Rohwert zum von VECTOR verwendeten Stat-Wert.

Beispiele:

```text
identity
unit normalization
aggregate damage channels
inverse semantic mapping
explicit calibration formula
```

Ein gefundener Rohwert bedeutet nicht automatisch, dass eine fachlich korrekte Transformationsformel existiert.

## 4. Resolver-Statusmodell

VECTOR trennt mindestens folgende fachliche Zustaende:

```text
VERIFIED
CANDIDATE
REVIEW_REQUIRED
BLOCKED
UNRESOLVED
UNUSED
```

Implementierungen duerfen zusaetzliche diagnostische Unterzustaende verwenden, z. B. `RESOLVER_BUG`, `BLOCKED_BY_PATH`, `VERIFIED_UNUSED` oder `UNUSED_REVIEW`, solange deren produktive Bedeutung eindeutig auf die obigen Kategorien abgebildet wird.

### 4.1 VERIFIED

`VERIFIED` bedeutet, dass der erforderliche Datenpfad/Poolbezug und die fuer die produktive Verwendung benoetigte fachliche Semantik ausreichend belegt sind.

Nur `VERIFIED` ist standardmaessig fuer produktive Stat-Berechnungen zugelassen.

### 4.2 CANDIDATE

`CANDIDATE` bedeutet, dass ein plausibler Resolver/Pfad identifiziert wurde, die erforderliche Verifikation aber noch nicht abgeschlossen ist.

`CANDIDATE` darf diagnostisch sichtbar sein, aber keinen scheinbar verifizierten Produktivwert erzeugen.

### 4.3 REVIEW_REQUIRED

`REVIEW_REQUIRED` bedeutet, dass Property oder Rohdaten belegt sind, aber Pfad, Transformation, Kalibrierung oder Semantik noch nicht hinreichend freigegeben sind.

Der Rohwert darf fuer Analyse/Diagnose erhalten bleiben. Eine ungesicherte abgeleitete Prozent-/Anzeigesemantik darf nicht als verifizierter Produktivwert dargestellt werden.

### 4.4 BLOCKED

`BLOCKED` bedeutet, dass produktive Aufloesung derzeit durch einen bekannten Fehler, fehlenden Pfad, Widerspruch oder eine andere erforderliche Vorbedingung verhindert wird.

### 4.5 UNRESOLVED

`UNRESOLVED` bedeutet, dass keine hinreichend verifizierte Baseline/Resolverkette vorhanden ist.

`UNRESOLVED` wird niemals als `0` gespeichert oder als Nullwert ausgegeben.

### 4.6 UNUSED

`UNUSED` bedeutet, dass die Property im Katalog vorhanden sein kann, im aktuellen relevanten Datensatz/Anwendungsfall aber keinen produktiven Einsatz hat.

`UNUSED` darf nicht automatisch geloescht oder als fachlich ungueltig interpretiert werden.

## 5. Produktives Status-Gate

Die produktive Stat Engine folgt dem Gate:

```text
Property
-> Mapping vorhanden?
-> Resolverstatus pruefen
-> Baseline aufloesen
-> Transformation pruefen
-> Completeness pruefen
-> produktive Berechnung nur bei Freigabe
```

Binding Rules:

- `VERIFIED` darf produktiv berechnen, sofern die restlichen Dataset-/Completeness-Gates bestehen.
- `CANDIDATE`, `REVIEW_REQUIRED`, `BLOCKED` und `UNRESOLVED` erzeugen keinen als verifiziert dargestellten Produktivwert.
- Diagnose-/Admin-Oberflaechen duerfen Rohwerte und Status anzeigen, muessen den nicht-verifizierten Zustand aber eindeutig kennzeichnen.
- Ein Fehler darf nicht durch einen Defaultwert kaschiert werden.

## 6. Missing-Baseline-Regel

Fehlt die erforderliche Baseline, gilt sinngemaess:

```text
CRAFT_STAT_BASELINE_MISSING
```

Binding Rules:

- fehlend != 0;
- `NULL`, missing oder unresolved darf nicht implizit zu `0` normalisiert werden;
- fehlende Baseline darf keine scheinbar gueltige Delta-/Prozentberechnung erzeugen;
- die betroffene Berechnung wird durch Completeness/Resolver-Gate blockiert oder als unvollstaendig markiert.

## 7. No-Guess-Regel

VECTOR darf nicht raten:

- welcher SCMDB-Pfad gemeint ist;
- welcher Fire Mode zu verwenden ist;
- welche Recoil-Achse stellvertretend verwendet wird;
- welche Einheit stillschweigend gilt;
- welche Transformationsformel fachlich korrekt ist;
- ob zwei semantisch aehnliche Stats identisch sind.

Wenn die Evidenz nicht ausreicht, bleibt der Resolver in einem nicht-produktiven Status.

## 8. Additive und multiplikative Modifier

Additive und multiplikative Blueprint-Modifikatoren werden als getrennte Operationstypen behandelt.

Sie duerfen nicht ohne explizit definierte fachliche Regel zu einem einzigen generischen Prozentpfad zusammengezogen werden.

Die Berechnungs-Engine muss den Modifier-Typ bis zur Anwendung der Transformation nachvollziehen koennen.

## 9. Fire-Mode-Regel

Mehrere Fire Modes werden nicht pauschal gemittelt.

Wenn ein Stat Fire-Mode-abhaengig ist, verwendet VECTOR einen expliziten Resolver, z. B. `PRIMARY_FIRE_MODE`.

Binding Rules:

- die Auswahlregel des Fire Modes muss deterministisch und dokumentiert sein;
- fehlende eindeutige Auswahl blockiert die produktive Berechnung;
- unterschiedliche Fire Modes duerfen diagnostisch erhalten/dargestellt werden;
- ein Mittelwert ist nur zulaessig, wenn eine gesonderte fachliche Regel ihn fuer genau diesen Stat explizit definiert.

## 10. Strukturierte Werte

Strukturierte Rohwerte duerfen nicht vorschnell zu einem einzelnen Skalar reduziert werden.

Beispiele:

- Spread kann mehrere Teilwerte/Phasen enthalten;
- Recoil kann mehrere Achsen und Zeitwerte enthalten;
- Damage kann mehrere Kanaele enthalten.

Die Rohstruktur bleibt erhalten, bis eine verifizierte kanonische Transformation definiert wurde.

## 11. Recoil-Regel

Recoil-Daten werden als Rohdaten erhalten, solange keine freigegebene Kalibrierungs-/Transformationsformel existiert.

Insbesondere duerfen Werte wie:

```text
smoothTime
maxFireTime
pitchMaxDeg
yawMaxDeg
rollMaxDeg
```

nicht ohne verifizierte Semantik als Prozentwerte ausgegeben werden.

Eine einzelne Recoil-Achse darf nicht stillschweigend als gesamter Recoil-Wert verwendet werden.

## 12. Einheiten und Normalisierung

Einheiten sind Teil der Resolver-Semantik.

Binding Rules:

- Roh-Einheit und Ziel-Einheit muessen bekannt sein, bevor produktiv normalisiert wird;
- Umrechnungsfaktoren werden explizit definiert;
- unbekannte Einheit blockiert eine Einheitenumrechnung;
- Display-Formatierung darf die technische Einheit nicht veraendern;
- gleiche Anzeigenamen mit unterschiedlichen Einheiten duerfen nicht als gleicher Stat behandelt werden.

## 13. Item-spezifische Overrides

Item-spezifische Overrides sind nur zulaessig, wenn ein strukturelles/kanonisches Mapping fuer einen belegten Sonderfall nicht ausreicht.

Jeder Override muss mindestens dokumentieren:

- betroffene Property;
- betroffene Entitaet/Itemklasse;
- Grund fuer den Override;
- Dataset-/Build-Kontext;
- Evidenz/Provenienz;
- Verifikationsstatus.

Overrides duerfen niemals als bequemer Ersatz fuer einen fehlenden generischen Resolver verwendet werden.

## 14. Spezialquellen

Spezialisierte SCMDB-Datenquellen duerfen zusaetzliche fachliche Informationen liefern, ersetzen aber nicht automatisch die kanonische Crafting-/Itemquelle.

Beispiel: Mining Equipment kann spezialisierte Werte liefern, darf aber nur nach expliziter Resolver-Regel in Crafting-Berechnungen einfliessen.

## 15. Dataset- und Build-Awareness

Resolver-Mappings und ihr Status sind nicht zeitlos.

Jeder produktive Resolver muss im Kontext des aktiven Datasets bewertbar sein.

Binding Rules:

- Resolverstatus kann zwischen SC-Builds/Dataset-Revisionen variieren;
- ein frueher `VERIFIED`-Resolver darf bei neuer widerspruechlicher Evidenz herabgestuft werden;
- ein Pfad darf nicht allein aufgrund historischer Gueltigkeit fuer einen neuen Build als `VERIFIED` angenommen werden;
- Resolver-Audits werden gegen einen konkreten Channel/Build/Dataset-Kontext ausgefuehrt.

## 16. LIVE/PTU-Isolation

Resolver folgen der globalen Dataset-Isolation.

- LIVE Resolver-Evidenz gilt nicht automatisch fuer PTU.
- PTU Resolver-Evidenz gilt nicht automatisch fuer LIVE.
- Kein Cross-Channel-Fallback.
- Eine fehlende LIVE-Baseline wird nicht aus PTU ergaenzt.
- Eine fehlende PTU-Baseline wird nicht aus LIVE ergaenzt.
- Gemeinsame Resolverdefinitionen duerfen verwendet werden, wenn sie fuer beide Channels separat validiert werden oder die Dataset-Pipeline ihre Gueltigkeit deterministisch bestaetigt.

## 17. Resolver-Provenienz

Fuer einen Resolver sollen, soweit anwendbar, nachvollziehbar bleiben:

```text
property_key
provider/source
source dataset
source path/pool relationship
resolver type
transformation
unit
verification status
channel
full game build
dataset revision
verification/audit reference
validated_at
notes
```

Die physische Speicherung ist nicht durch diese Policy festgelegt.

## 18. Status-Herabstufung

Ein Resolverstatus darf nicht nur hochgestuft werden.

Beispiele fuer Herabstufungsgruende:

- Datenpfad ist im neuen Dataset nicht mehr vorhanden;
- Resolver liefert fuer relevante Items keine Baseline;
- Audit findet widerspruechliche Item-/Pool-Beziehungen;
- Transformationsformel erweist sich als fachlich falsch;
- Einheit oder Semantik wurde falsch interpretiert;
- Implementierungsfehler verhindert die korrekte Aufloesung.

Ein heruntergestufter Resolver verliert die produktive Freigabe, bis die Verifikation erneut besteht.

## 19. Resolver-Bug versus Datenluecke

VECTOR unterscheidet mindestens:

```text
SOURCE_DATA_MISSING
RESOLVER_UNRESOLVED
RESOLVER_BUG
TRANSFORMATION_UNVERIFIED
```

Ein Resolver-Bug darf nicht als fehlender SCMDB-Wert maskiert werden. Ebenso darf eine echte Datenluecke nicht durch eine Codeaenderung scheinbar 'repariert' werden.

## 20. Completeness-Integration

Der Completeness Filter beruecksichtigt Resolver-Verfuegbarkeit und Resolverstatus fuer benoetigte Berechnungen.

Wenn ein notwendiger Stat keinen produktiv freigegebenen Resolver besitzt:

- wird die betroffene Berechnung nicht als valide ausgegeben;
- wird der konkrete Grund diagnostizierbar gemacht;
- duerfen unabhaengige, vollstaendige Berechnungen weiterhin funktionieren.

Completeness ist damit stat-/berechnungsbezogen und nicht zwingend ein globales Alles-oder-Nichts fuer das gesamte Dataset.

## 21. Priorisierung ist kein Verifikationsstatus

Arbeitsprioritaet und fachlicher Status sind getrennte Konzepte.

Beispiel:

```text
P0 + CANDIDATE
```

bedeutet dringend zu untersuchen, aber nicht produktiv freigegeben.

```text
P4 + VERIFIED_UNUSED
```

kann fachlich verifiziert, aber aktuell nicht produktiv relevant sein.

Prioritaet darf niemals eine fehlende Verifikation ueberstimmen.

## 22. Mapping-Daten versus Policy

Diese Policy ist die normative Regelquelle fuer Resolver-Verhalten.

Konkrete Mapping-Daten sind versionierbare Datenartefakte, z. B.:

```text
data/resolvers/stat-resolvers.json
```

CSV/XLSX-Dateien duerfen als Analyse-, Import- oder Review-Artefakte dienen, sollen aber langfristig nicht mehrere konkurrierende Runtime-Sources-of-Truth bilden.

## 23. Kanonisches Mapping-Artefakt

Langfristig soll genau ein maschinenlesbares Resolver-Mapping als kanonische Runtime-Quelle verwendet werden.

Dieses Artefakt muss gegen ein definiertes Schema validierbar sein und mindestens die fuer Runtime und Audit erforderlichen Felder enthalten.

Andere CSV/XLSX/Legacy-Dateien koennen daraus erzeugt oder als historische Arbeitsunterlagen archiviert werden.

## 24. Resolver-Audit

Ein Resolver-Audit prueft mindestens die fuer den betreffenden Mapping-Typ relevanten Punkte:

- Property vorhanden;
- Source Dataset vorhanden;
- Source Path/Pool-Beziehung aufloesbar;
- benoetigte Einheit vorhanden/verifiziert;
- Transformation vorhanden und freigegeben;
- relevante Stichprobe oder vollstaendige betroffene Menge erfolgreich aufloesbar;
- keine stillen Null-/Fallbackwerte;
- Channel/Build/Dataset-Kontext dokumentiert.

Die genaue Teststrategie darf je Resolverklasse variieren.

## 25. Automatisierte Tests

Resolver-Tests sollen in die Dataset-/CI-Pipeline integriert werden.

Moegliche Testklassen:

```text
Mapping schema validation
Source-path existence
Pool-reference integrity
Unit validation
Transformation tests
Known-reference cases
No-zero-fallback regression
Status-gate tests
LIVE/PTU isolation tests
Completeness integration tests
```

Ein Resolver darf nicht allein deshalb `VERIFIED` werden, weil ein Test technisch keinen Fehler wirft. Die fachliche Semantik muss ebenfalls freigegeben sein.

## 26. Referenzfaelle

Verifizierte Referenzfaelle duerfen als Regressionstests erhalten werden.

Sie muessen angeben, fuer welchen Channel/Build/Dataset-Stand sie gelten.

Wenn ein neuer Dataset-Stand legitimerweise ein anderes Ergebnis liefert, muss der Referenzfall geprueft und versioniert werden; das erwartete Ergebnis darf nicht stillschweigend angepasst werden.

## 27. Runtime-Fehlerverhalten

Wenn eine produktive Berechnung einen erforderlichen Stat nicht aufloesen kann:

```text
Resolver pruefen
-> kein freigegebener Wert
-> Berechnung als INCOMPLETE/BLOCKED behandeln
-> diagnostischen Fehlercode bereitstellen
```

Moegliche Fehlerklassen:

```text
CRAFT_STAT_BASELINE_MISSING
CRAFT_STAT_RESOLVER_UNVERIFIED
CRAFT_STAT_RESOLVER_BUG
CRAFT_STAT_TRANSFORMATION_UNVERIFIED
```

Die konkreten Fehlercodes koennen implementierungsseitig angepasst werden, solange der Fehlergrund erhalten bleibt.

## 28. UI-Verhalten

Normale Nutzeroberflaechen duerfen ungepruefte Resolverwerte nicht wie verifizierte Produktivwerte darstellen.

Diagnose-/Admin-UIs duerfen anzeigen:

- Rohwert;
- Resolverstatus;
- Source Path;
- Dataset-/Build-Kontext;
- Block-/Review-Grund.

Nicht-verifizierte Werte muessen eindeutig von produktiv freigegebenen Werten unterscheidbar sein.

## 29. Data Integrity Invariants

Eine konforme Implementierung wahrt mindestens:

1. Missing baseline != zero.
2. Nur freigegebene Resolver erzeugen produktive Werte.
3. Rohwert und Transformation bleiben unterscheidbar.
4. Additive und multiplikative Modifier werden nicht vermischt.
5. Fire Modes werden nicht pauschal gemittelt.
6. Recoil wird ohne verifizierte Formel nicht zu einer erfundenen Prozentzahl reduziert.
7. Item Overrides bleiben Ausnahmefaelle.
8. Resolverstatus ist build-/dataset-aware und kann herabgestuft werden.
9. LIVE und PTU werden nicht gemischt.
10. Resolver-Bugs und Source-Datenluecken werden unterschieden.
11. Completeness blockiert nur die abhaengigen unvollstaendigen Berechnungen, soweit fachlich moeglich.
12. Prioritaet ersetzt niemals Verifikation.

## 30. Nicht-Ziele

Diese Policy friert nicht ein:

- konkrete SCMDB-Feldpfade fuer alle Properties;
- den aktuellen Status jedes einzelnen Property Keys;
- die konkrete P0-P4-Priorisierung;
- die finale Recoil-Kalibrierungsformel;
- die finale Damage-Aggregationsformel;
- konkrete UI-Komponenten;
- physische Datenbanktabellen;
- die exakte JSON-Schema-Struktur des zukuenftigen Resolver-Katalogs.

Diese Inhalte duerfen nach Evidenz, Dataset und Implementierungsfortschritt versioniert werden.

## 31. Acceptance Criteria

Die Policy ist implementiert, wenn VECTOR nachweisen kann, dass:

- ein fehlender Stat niemals automatisch als `0` berechnet wird;
- nicht-verifizierte Resolver keine produktiven Crafting-/Stat-Ergebnisse erzeugen;
- Rohwerte fuer ungepruefte Transformationen erhalten bleiben;
- Fire-Mode-abhaengige Stats deterministisch aufgeloest werden;
- LIVE/PTU nicht cross-fallbacken;
- Resolverstatus zusammen mit Dataset-/Build-Provenienz nachvollziehbar ist;
- ein veralteter/fehlerhafter `VERIFIED`-Resolver herabgestuft und produktiv blockiert werden kann;
- Resolver-Audits und Regressionstests automatisierbar sind;
- Completeness fehlerhafte abhaengige Berechnungen blockiert, ohne unabhaengige valide Berechnungen unnoetig zu verlieren;
- konkrete Mapping-Daten getrennt von dieser normativen Policy versioniert werden.

## 32. Legacy-Migration

Die folgenden bisherigen Artefakte bleiben historische/analytische Quellen fuer die Entwicklung des kanonischen Resolver-Katalogs:

```text
VECTOR_GLOBAL_STAT_MAPPING_V1.md
VECTOR_GLOBAL_STAT_MAPPING_V1.csv
VECTOR_GLOBAL_STAT_MAPPING_V1.json
VECTOR_RESOLVER_MAPPING_V2.csv
VECTOR_RESOLVER_MAPPING_V2.xlsx
```

Die V1-Artefakte dokumentieren die urspruenglichen Resolver-Grundregeln. Das V2-Mapping enthaelt einen spaeteren Arbeitsstand mit Status/Priorisierung und kann fruehere `VERIFIED`-Annahmen durch neuere Audit-Evidenz relativieren.

Keines dieser Arbeitsartefakte soll langfristig parallel als konkurrierende Runtime-Source-of-Truth verwendet werden.

## 33. Status Decision

VECTOR Stat Resolver Policy v1 ist **PROPOSED**.

Vor FROZEN sollten gemeinsam bestaetigt werden:

- produktive Statusmenge und Bedeutung von `VERIFIED`;
- Umgang mit `VERIFIED_UNUSED` und `UNUSED_REVIEW`;
- ob einzelne Resolverklassen eine zweistufige technische/fachliche Verifikation benoetigen;
- kanonische Runtime-Mapping-Datei und deren Schema;
- Resolver-Audit-Gate innerhalb der Dataset Pipeline.

Nach FROZEN werden materielle Regelveraenderungen ueber eine Nachfolgeversion und den normalen VECTOR-Governance-Prozess vorgenommen.
