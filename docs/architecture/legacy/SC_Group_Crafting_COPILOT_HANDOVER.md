# Legacy Notice

**Archive Status:** LEGACY_REFERENCE  
**Authority:** NON_BINDING  
**Original Role:** SC Group Crafting Copilot restart and project handover baseline  
**Current Role:** Historical architecture, UX, security and migration reference  
**Superseded as active handover:** YES

## Historical context

This document is the original SC Group Crafting Copilot handover and
represents an important historical baseline in the evolution from
SC Group Crafting to VECTOR.

The original content below is intentionally preserved unchanged for
historical traceability.

This document must no longer be used as the active restart point,
technical source of truth, release procedure or NEXT STEP instruction
for current VECTOR development.

## Current authority

Current VECTOR development follows the repository-based governance model.

In case of conflict, authority is:

1. Current rules in `docs/frozen/`
2. Current GitHub repository and approved Production state
3. Current architecture and ADR documentation
4. Current proposed specifications where explicitly applicable
5. This legacy handover
6. Older ZIP snapshots, prototypes and recovery packages

The instructions in this legacy document must not authorize current
Production deployments, database migrations or direct changes to `main`.

## Rules already migrated or superseded by current VECTOR specifications

Important concepts from this handover have been or are being transferred
into dedicated VECTOR specifications, including:

- Personal Inventory UX and lot handling
- persistent `Unbekannt` location behavior
- inline Inventory CRUD
- keyboard and focus behavior
- strict LIVE/PTU dataset isolation
- internal user ownership identity
- Fleet and ownership semantics
- persistence and provenance
- configurable Star Citizen game wipes
- rollback and recovery behavior
- VECTOR governance and versioning

Current dedicated specifications take precedence over conflicting
statements in this document.

## Important legacy conflicts

The following legacy behaviors are explicitly non-authoritative:

### Source of Truth

Legacy:
- OneDrive handover plus the latest repository ZIP was used as the
  restart/source baseline.

Current:
- GitHub is the primary technical Source of Truth.
- OneDrive is backup, historical reference, handover and recovery material.

### Deployment

Legacy:
- The V1.3.2 NEXT STEP instructed deployment of selected files directly
  toward the then-current `main` / GitHub Pages workflow.

Current:
- VECTOR follows the current branch, Preview, validation and Production
  governance defined by the current FROZEN rules.

The original `NEXT STEP` section below is historical only and must not
be executed as a current task list.

### `Unbekannt`

Legacy:
- `Unbekannt` could be represented as a virtual UI interpretation of an
  empty/NULL location.

Current:
- `Unbekannt` is a persistent VECTOR system location and the mandatory
  fallback when a location cannot be determined unambiguously.

The current FROZEN location and Inventory rules take precedence.

### LIVE / PTU

Legacy:
- LIVE/PTU behavior reflected the earlier SC Group Crafting implementation.

Current:
- LIVE and PTU are strictly isolated dataset contexts.
- Cross-channel data mixing and fallback are prohibited.
- The global dataset selector controls the complete active dataset context.

### Fabricator simulation fallback

The historical Fabricator specification contains a simulation fallback
for missing Crew material.

This behavior is not automatically authoritative for current VECTOR.
It must be reviewed against the current Completeness, No-Guess and
Stat Resolver rules before reuse.

## Still valuable for controlled extraction

The following parts remain important historical design input and should
not be discarded merely because this handover is archived:

- Crew model and Crew permission concepts
- Crew Inventory UX
- Fabricator workspace and interaction design
- Fabricator search and ranking behavior
- Blueprint Browser behavior
- component-image resolver ideas
- quality-slider interaction
- historical Fabricator reference tests
- design-system colors and status semantics
- historical RPC and RLS hardening context
- navigation and interaction conventions

These concepts may be migrated into dedicated current FROZEN or
architecture specifications after review.

## Archival rule

Do not silently edit the historical content below to make it appear
current.

When a legacy rule is still valuable:

1. extract it into the appropriate current specification;
2. review it against current VECTOR FROZEN rules;
3. resolve conflicts explicitly;
4. freeze the modern rule in the appropriate successor document;
5. leave the historical source below unchanged.

---

# Original historical content
# SC Group Crafting - Copilot Handover

## Zweck
Diese Datei ist der Neustartpunkt fuer einen neuen Microsoft Copilot Chat. Sie dokumentiert den vereinbarten Projektstand, die Architektur, UI-Regeln, Datenbankregeln und den naechsten Arbeitsschritt.

## Neustart-Prompt
In einem neuen Chat verwenden:

> Wir setzen SC Group Crafting fort. Suche in meinem OneDrive-Ordner `Kokizzle98 - Group Crafting` nach `SC_Group_Crafting_COPILOT_HANDOVER.md` und nach dem aktuellsten `star-citizen-crafting-main.zip`. Lies zuerst den Handover, pruefe danach den aktuellen Repository-Snapshot und fahre ab `NEXT STEP` fort. Vor Code-Aenderungen immer den aktuellen Snapshot verwenden.

## Projekt
- Name: SC Group Crafting
- Ziel: Star-Citizen-inspiriertes Crafting-, Blueprint- und Crew-Inventory-Terminal als PWA.
- Aktueller Entwicklungsstand: V1.3.2 in Vorbereitung / Full UI Build erstellt, Live-Deployment und Smoke-Test stehen noch aus.
- UI-Sprache: Mischung aus englischen Navigationsbegriffen und deutschen Bedien-/Statusinformationen.
- UI-Begriff: `Crew`.
- Technisches Backend: `groups`, `group_members`, `group_id`.

## Datenquellen
- SCMDB Mirror wird lokal unter `data/scmdb/` gehalten.
- GitHub Workflow: `.github/workflows/sync-scmdb-data.yml`.
- LIVE/PTU werden aus dem lokalen SCMDB-Mirror abgeleitet.
- UEX ist fuer V2.0 vorgesehen, V1.3.2 enthaelt keine UEX-Liveabfragen.
- SC Deutsch Launcher Connector ist fuer eine deutlich spaetere Version vorgesehen.

## Navigation V1.3.2
1. Dashboard
2. Fabricator
3. My Inventory
4. Crew Inventory
5. Blueprints

Aktive Navigation:
- Cyan `#19D8ED`
- heller Text `#EAFBFF`
- Active Background `#0C2936`
- 3 px Cyan-Marker links
- dezenter Glow

Hover:
- Background `#0B202C`
- Text `#D6EEF3`

Keyboard Focus:
- `#54E5F5`
- 2 px outline, 2 px offset

Statusfarben:
- Cyan = Auswahl / Interaktion
- Gruen = herstellbar / erfolgreich
- Gelb = teilweise / Warnung
- Rot = Fehler / negativ
- Violett = PRIME
- Gold = PERFECT

## Header
Rechts oben:
- CREW selector
- DATA LIVE/PTU
- UNIT AUTO/SCU/cSCU/mSCU/µSCU
- User-Menue mit Nickname

Crew und Data/Unit stehen links vom User-Menue.
User/Crew-Menue umfasst konzeptionell:
- Mein Profil
- My Inventory
- Meine Crews
- Crew erstellen
- Crew-Einladungen
- Abmelden

## Profile und Benutzer
- Login bleibt ueber Supabase Auth.
- Eigentum wird ueber bestehende `inventory.user_id` UUID gespeichert.
- Keine dauerhaften E-Mail->Nickname-Hardcodings im Frontend.
- `profiles.id` entspricht `auth.users.id`.
- `profiles.nickname` ist die sichtbare Identitaet.
- Nickname-Regel: 3-24 Zeichen, A-Z/a-z/0-9/_/-.
- Nicknames sind case-insensitive eindeutig.
- E-Mail-Adressen werden nicht in `profiles` gespeichert.

Bekannte Profile:
- Kokizzle98
- MadurLaub
- AccaliaAyame

## Crew-Modell
Initiale Crew:
- Levski Crafting Crew
- Kokizzle98 = OWNER
- AccaliaAyame = MEMBER
- MadurLaub hat ein Profil, ist initial nicht Mitglied dieser Crew.

Ein Spieler kann mehreren Crews angehoeren.
Das persoenliche Inventory wird NICHT pro Crew kopiert.
Crew Inventory ist eine aggregierte berechtigte Sicht auf die persoenlichen Lager der Crew-Mitglieder.

Rollen:
- OWNER
- ADMIN
- MEMBER

Inventory-Rechte:
- eigenes Inventory: lesen, anlegen, bearbeiten, loeschen
- fremdes Inventory bei gemeinsamer Crew: lesen
- fremdes Inventory bearbeiten/loeschen: niemals allein durch OWNER/ADMIN-Rolle
- ohne gemeinsame Crew: kein Zugriff

Crew-Rechte:
- OWNER: Crew verwalten, Mitglieder/Rollen verwalten, archivieren
- ADMIN: Mitglieder einladen, normale Member verwalten, Crew-Details verwalten
- MEMBER: Crew lesen, Crew Inventory lesen, Fabricator nutzen, eigenes Lager verwalten
- letzte OWNER-Rolle ist geschuetzt

## Installierte/entworfene Crew RPCs
- upsert_my_profile
- create_group
- update_group_details
- archive_group
- restore_group
- set_active_group
- invite_group_member
- revoke_group_invite
- respond_group_invite
- change_member_role
- remove_group_member
- leave_group
- transfer_group_ownership

Direkte Tabellenrechte fuer `groups`, `group_members`, `group_invites`, `profiles`, `user_settings`, `crew_audit_log` wurden in der finalen Haertung auf SELECT fuer `authenticated` reduziert. Crew-Mutationen sollen ueber RPCs laufen.

## My Inventory - eingefrorene UX-Spezifikation
Zweck: persoenliches Lager schnell pflegen.

Quick Add:
- Material
- Menge
- Einheit
- Qualitaet
- Lagerort
- Einlagern

Technische Einheiten:
- VOLUME bleibt technisch volumenbasiert.
- COUNT bleibt technisch COUNT.
- UI zeigt COUNT als `Stueck`.
- Bei COUNT ist Einheit sichtbar, aber auf Stueck fixiert.

Lagerort:
- leer/NULL wird im UI als `Unbekannt` dargestellt.
- `Unbekannt` wird nicht als Text in die DB geschrieben.
- `Unbekannt` ist filterbar und wird in Location View wie eine virtuelle Location gruppiert.

Merge-Regel Quick Add / Edit:
- gleicher User + gleiches Material + gleiche Qualitaet + gleicher Lagerort = vorhandene Menge erhoehen statt neues Lot.
- unterschiedliche Qualitaeten bleiben getrennt.
- unterschiedliche Lagerorte bleiben intern getrennt.

Global / Location Toggle:
- GLOBAL ist Default.
- GLOBAL aggregiert Locations und beantwortet: Wie viel besitze ich insgesamt?
- LOCATION gruppiert Material nach Lagerort.

Kompakte Materialdarstellung:
- standardmaessig ALLE Materialien eingeklappt.
- eine kompakte Materialzeile zeigt Bild, Material, Gesamtmenge, gewichtete Durchschnittsqualitaet, Range, Lots.
- Einzelpositionen erscheinen erst nach aktivem Aufklappen.
- GLOBAL: Material -> Lots.
- LOCATION: Material -> Location -> Lots.
- Bearbeiten/Loeschen nur auf Lot-Ebene.

Durchschnittsqualitaet:
- immer mengengewichtet.
- VOLUME nach internem µSCU-Gewicht.
- COUNT nach Stueckzahl.

Filter My Inventory:
- Suche
- Typ
- Qualitaet
- Lagerort inkl. Unbekannt
- Sortierung
- AND-Verknuepfung
- erst filtern, dann gruppieren/aggregieren, dann Durchschnitt/Statistik, dann sortieren.
- Filter arbeiten auf Lots, nicht auf dem ungeschnittenen Materialdurchschnitt.

Sortierung:
- Material A-Z Default
- Material Z-A
- Gesamtmenge auf/ab
- Durchschnittsqualitaet auf/ab
- beste/niedrigste Qualitaet
- zuletzt geaendert
- VOLUME und COUNT duerfen bei Mengensortierung nicht als gleiche Dimension verglichen werden.

## Crew Inventory - eingefrorene UX-Spezifikation
Design folgt dem bestaetigten dunklen Cyan-Terminal-Mockup.

Global View Default:
- kompakte eingeklappte Materialzeilen
- Gesamtbestand
- gewichtete Durchschnittsqualitaet
- Quality Range
- Lots
- beteiligte Spieler
- Quality Distribution

Filter:
- Suche
- Player
- Typ
- Qualitaet
- Lagerort
- Sortierung
- aktive Filterchips
- Global/Location Toggle

GLOBAL Hierarchie:
- Material -> Spieler -> Lots

LOCATION Hierarchie:
- Material -> Location -> Spieler -> Lots

Eigene Lots:
- Bearbeiten
- Loeschen

Fremde Lots:
- View only

Crew-Seitenleiste:
- Crew-Name
- Mitgliederzahl
- Shared Storage
- Mitglieder + Rolle + Lot-Umfang
- Member einladen
- Crew verwalten

Quick Actions:
- Zu My Inventory wechseln
- Fabricator oeffnen
- Crew wechseln

Crew Inventory hat KEIN Quick Add. Einlagerung erfolgt immer ueber My Inventory.

## Fabricator - V1.3.2 Zielbild
Der alte Full-Width Blueprint Grid wird ersetzt durch einen zweispaltigen Workspace.

Links:
- ca. 330-380 px
- unabhaengig scrollbare Blueprint Results
- Thumbnail
- Produktname
- Kategorie
- Size
- Hersteller
- Craftability Status
- Cyan = selected
- Gruen = craftable
- Gelb = partial
- Grau = unavailable

Rechts:
- Komponenten Hero Bild
- Produktname / Hersteller / Kategorie / Size
- Product Stats
- Strategy
- Material Slots
- Crew Material Allocation

Echtzeitsuche:
- reagiert beim Tippen ohne Suchbutton
- sucht Name, Hersteller, Kategorie, Unterkategorie, Size
- case-insensitive
- kurze UI-Debounce-Phase ca. 60 ms
- Ergebnis-Ranking: exakt > startsWith > Wortanfang > Name enthaelt > sonstige Felder
- Tastatur: Arrow Up/Down in Trefferliste, Enter zur Auswahl

Fabricator Filter:
- Search
- Category
- Size
- Availability
- Reset
- Ergebniszaehler

Size-Werte sollen sich aus den aktuell sinnvollen Datensaetzen ableiten.

Component Images:
Resolver Prioritaet:
1. echtes Item-/Blueprint-Bild aus Daten
2. productEntityClass/Item-Mapping
3. lokales Asset
4. Kategorie-Fallback
5. utility placeholder
Kein kaputtes Browserbild anzeigen.

Craftability:
- basiert auf ALLEN persoenlichen Lots der aktiven Crew.
- zeigt pro Materialspieler, Menge, Q und Location.
- Fabricator aendert V1.3.2 noch keine Lagerdaten und reserviert nichts.

Strategien:
- SMART
- MAX
- SAVE PREMIUM
- MANUAL

Slider:
- Q0-1000
- input event live
- Range-Element wird waehrend Drag nicht neu erzeugt
- Zahleneingabe und Range synchron
- Product Stats werden live aktualisiert
- MANUAL frei
- bei fehlendem Crew-Material Simulation-Fallback

Product Stats:
- Base
- Crafted
- absolutes Delta
- prozentuales Delta

Referenztest JS-400 MANUAL Q750:
- Integrity 980 -> 1078, +98, +10.00%
- Power Output 21 -> 23, +2, +9.52%

Weitere Testobjekte:
- FR-66
- CQ7
- Parallax
- Helix II

## Blueprint Browser
- gleiche zentrale Search/Category/Size-Logik wie Fabricator
- groessere Browseransicht erlaubt
- Bild, Kategorie, Size, Hersteller
- LIVE/PTU dynamisch

## Designsystem
Grundfarben:
- bg #040B10
- panel #071B25
- line #18495B
- cyan #19D8ED
- focus #54E5F5
- text #EAFAFF
- muted #82A6B4
- success #55E29D
- warning #FFCC45
- error #FF6679

Quality:
- LOW grau
- STANDARD silber
- CRAFT blau
- TARGET cyan
- PRIME violett
- PERFECT gold

## Tastatur
Global:
- Tab / Shift+Tab
- Enter aktivieren
- Space Toggle/Button
- Esc Dropdown/Modal schliessen
- Arrow Keys Menues/Listen

Fabricator Quality Slider:
- Arrow +/-1
- Page Up/Down +/-10
- Home Q0
- End Q1000

Modals spaeter mit Focus Trap.

## Zukunft / V2.0
UEX vorbereitete Architekturrichtung:
- ExternalIdentity
- provider/source abstraction
- Commodity/Item price models
- Market Locations
- Marketplace Listings
- Crafting Valuation
- Token niemals in oeffentliches GitHub Pages Frontend

Noch NICHT in V1.3.2:
- UEX API Calls
- Marketplace Management
- Reservations / automatische Abbuchung
- SC Deutsch Launcher Connector

## Dateien / Deployment
Aktueller OneDrive-Projektbereich:
- Ordner: `Kokizzle98 - Group Crafting`
- Aktueller Repository-Snapshot sollte als `star-citizen-crafting-main.zip` vorhanden sein.

Der zuletzt erzeugte V1.3.2 UI-Update-Build ersetzt nur:
- app.js
- styles.css
- index.html
- sw.js
- src/model.js
- src/engine.js

Nicht ersetzen/loeschen:
- .github/workflows/
- data/scmdb/
- supabase-config.js
- manifest.webmanifest
- icon-192.png
- icon-512.png
- armor.png
- cooler.png
- powerplant.png
- quantumdrive.png
- shield.png
- utility.png
- weapon.png

Service Worker Zielcache:
- sc-crafting-v1-3-2

## Datenbankstatus
Basis-Migration fuer Profiles/Crews/RLS wurde erfolgreich Schritt fuer Schritt ausgefuehrt und validiert.
Secure Crew Management RPC Migration wurde ausgefuehrt.
Abschliessende Rechtepruefung zeigte fuer Crew-Tabellen nur direkten SELECT-Zugriff fuer authenticated.
Die 13 vorgesehenen RPCs wurden in Supabase gefunden.

## NEXT STEP
1. Aktuellsten `star-citizen-crafting-main.zip` als Source of Truth oeffnen und gegen dieses Handover vergleichen.
2. Den V1.3.2 Full UI Build bzw. die sechs geaenderten Dateien in GitHub main deployen.
3. GitHub Pages Deployment pruefen.
4. Im privaten Browserfenster Smoke-Test:
   - Login/Nickname
   - Levski Crafting Crew selector
   - My Inventory nur eigenes Lager
   - Crew Inventory zeigt Crew-Lager, fremde Lots read-only
   - Fabricator Echtzeitsuche
   - JS-400 MANUAL Q750
   - Slider Drag ohne DOM-Neuaufbau
   - LIVE/PTU Switch
5. Fehler zuerst beheben, erst danach V1.3.2 als stabil markieren.
6. Nach jedem stabilen Release dieses Handover aktualisieren.
