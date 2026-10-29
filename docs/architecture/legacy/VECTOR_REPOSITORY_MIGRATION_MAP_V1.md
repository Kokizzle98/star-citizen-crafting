# VECTOR Repository-Migrationskarte v1

**Archive Status:** LEGACY REFERENCE  
**Authority:** NON-BINDING  
**Original Stand:** 27.10.2026  
**Original Purpose:** Kontrollierte Migration von SC Group Crafting zu einem versionierten und deploybaren VECTOR-Repository.  
**Current Purpose:** Historische OG-Konzeptdatei zur Nachvollziehbarkeit der Repository-Konvergenz. Nicht als aktuelle Schritt-fuer-Schritt-Migrationsanweisung verwenden.

## Archivbewertung

Die Repository-Migrationskarte war ein wichtiger Zwischenstand beim Uebergang von SC Group Crafting zu VECTOR. Viele Grundprinzipien bleiben wertvoll, die konkrete Reihenfolge, Source-of-Truth-Hierarchie und der damalige Release-Prozess wurden jedoch durch spaetere VECTOR-FROZEN-Regeln und die inzwischen etablierte GitHub/Vercel-Architektur ersetzt.

### Weiterhin gueltige bzw. zu bewahrende Prinzipien

- Bestehende Git-Historie erhalten; kein unnoetiger Repository-Neuaufbau.
- `develop` als Entwicklungszweig und `main` als Production-Zweig beibehalten.
- Secrets, personenbezogene Dumps, Game Logs und privilegierte Tokens gehoeren nicht in das oeffentliche Repository.
- Historische Artefakte klassifizieren und archivieren statt unkontrolliert zu loeschen.
- SCMDB Mirror als wichtige Game-Data-Quelle erhalten und Dataset-Channels getrennt behandeln.
- Monolithische Alt-Migrationen nicht ungeprueft ausfuehren; Migrationen in kontrollierte, testbare Deltas zerlegen.
- Datenbankaenderungen benoetigen Precheck, Migration, Postcheck, Tests und eine dokumentierte Recovery-/Restore-Strategie.
- Bestehende Regressionstests und historische Referenzfaelle erhalten.
- Production darf nur aus einem zuvor geprueften und freigegebenen Zustand entstehen.

### Durch aktuelle FROZEN-Regeln ersetzt oder ueberholt

1. **Source of Truth**
   - Alt: OneDrive-ZIP/Handover plus GitHub als kombinierte Code-Baseline.
   - Neu: GitHub ist die primaere technische Source of Truth fuer Code, FROZEN-Regeln, Architektur, Workflows und Releases. OneDrive ist Backup/Handover/Fallback.

2. **Release-Prozess**
   - Alt: PreFlight -> RC -> Production und Promotion eines RC-Artefakts.
   - Neu: `develop` -> Vercel Preview -> Release Gates -> Pull Request `develop` -> `main` -> Vercel Production -> Production Smoke Test.
   - Weiterhin gueltiges Prinzip: Was Production erreicht, muss dem validierten Zustand entsprechen; Aenderungen nach Validierung erfordern eine neue Validierung.

3. **GitHub Pages**
   - Alt: fuer VECTOR Full-Stack superseded und nur Legacy-V1-Kontext.
   - Neu: GitHub Pages bleibt kein VECTOR Full-Stack-Host, dient aber als Legacy-Production-Gateway und darf ausschliesslich auf die aktuelle `main`/Production-Instanz weiterleiten.

4. **Release Schema v1**
   - Alt: `VECTOR_RELEASE_SCHEMA_V1.json` als kanonisches Release-Schema.
   - Neu: V1 ist `LEGACY_REFERENCE / NON_BINDING`. Ein zukuenftiges V2-Schema muss die aktuellen FROZEN-Regeln zu Versionierung, Dataset-Revisionen, LIVE/PTU-Isolation, Completeness, Git/Vercel-Governance, Migration Gates und Build-triggered Wipes abbilden.

5. **Build Generator / RC-Autoritaet**
   - Alt: Build Generator, PreFlight/RC-Checklisten und RC-Promotion als Release-Autoritaet.
   - Neu: GitHub-basierte Governance, Vercel Preview/Production und automatisierte Release-/Migration-Gates bilden den Zielprozess. Historische Build-Generator-Prinzipien bleiben Referenz, konkrete alte Commands/RC-Stufen sind nicht bindend.

6. **Feste Datenbank-Migrationsreihenfolge**
   - Alt: fest vorgegebene Wellen Identity -> RBAC -> Locations -> Inventory -> Fabricator -> Fleet -> Trading -> Watcher/Wipe.
   - Neu: Reihenfolge wird aus aktuellem Production-Schema, Abhaengigkeiten, Risiko und Migration Test Contract bestimmt. Keine alte Reihenfolge darf ungeprueft als Ausfuehrungsplan verwendet werden.

7. **Manuelle Migration-Gates**
   - Alt: viele explizite manuelle Pre-/Postchecks.
   - Neu: Ziel ist ein versionierter Migration Test Contract mit Risk Classification, Backup Gate, Restore Readiness, dynamisch ausgewaehlten Structure/RLS/RPC/Behavior/Integrity/Regression Tests, CI-Gate und Production Postcheck. Manuelle SQL-Schritte bleiben nur kontrollierter Fallback.

8. **SCMDB / Dataset Channels**
   - Alt: LIVE, PTU, HOTFIX und TECH-PREVIEW wurden als moegliche Ordner/Channels gefuehrt.
   - Neu: Der aktuelle FROZEN Runtime-Kontext ist strikt `LIVE | PTU`. Weitere Quell-Channels duerfen architektonisch spaeter existieren, werden aber nicht aufgrund dieser Legacy-Datei aktive VECTOR-Runtime-Channels. LIVE und PTU duerfen niemals gemischt werden.

9. **Versionierung und Dataset-Baseline**
   - Alt: Release Schema v1 verband Release und SCMDB-LIVE-Dataset.
   - Neu: kanonische interne Kennung `Vector_{VersionNumber}_SC_{LIVEBuild}`; VECTOR-Codeversion, LIVE-Build und Dataset-Revision sind eigenstaendige Achsen. Dataset-Updates koennen ohne neue VECTOR-Version aktiviert werden.

10. **Wipe-/Publishing-Integration**
    - Alt: Watcher/Wipe-Konvergenz als spaetere Migrationswelle.
    - Neu: Game Wipes sind explizite, domainbasierte, vorab definierbare Wipe Plans. Ein ARMED LIVE-Wipe darf erst an ein exakt passendes, normalisiertes, Completeness-validiertes und publishable SCMDB-Dataset gekoppelt werden.

### Noch aus dieser Datei zu pruefende historische Artefakte

Die folgenden Hinweise bleiben fuer Repository-Aufraeumung und spaetere Migration wertvoll, muessen aber gegen den aktuellen Git-/Production-Stand geprueft werden:

- vorhandene SCMDB-Sync-Workflows;
- vorhandene Regressionstests;
- OAuth-/Callback-Security-Specs und Referenzimplementierungen;
- alte Identity/RBAC/Location/Inventory/Fabricator/Fleet/Trading SQL-Candidates;
- Secret-Scan- und `.gitignore`-Regeln;
- Legacy-Assets und PWA-Ressourcen;
- historische Production-Schema-Baselines, sofern sie keine personenbezogenen Daten/Secrets enthalten.

### Archivregel

Diese Datei darf als historische Architektur- und Migrationsreferenz konsultiert werden. Bei Konflikten gilt folgende Prioritaet:

```text
aktuelle FROZEN-Regel in docs/frozen/
> aktueller GitHub-/Production-Ist-Stand
> aktuelle Architecture/ADR-Dokumentation
> diese Legacy-Migrationskarte
> aeltere Prototypen/ZIPs
```

Diese Datei selbst darf keine aktuelle Migration, keinen Production-Deploy und keine Datenbankveraenderung autorisieren.

---

# Originaler historischer Inhalt

# VECTOR Repository-Migrationskarte v1

**Stand:** 27.10.2026  
**Zweck:** Verbindliche Einordnung der vorhandenen Code-, Datenbank-, SCMDB-, Build- und Dokumentationsartefakte für den kontrollierten Umbau von `Kokizzle98/star-citizen-crafting` zu einem sauber versionierten und deploybaren VECTOR-Repository.

## 1. Statuslegende

| Status | Bedeutung | Aktion |
|---|---|---|
| **BASELINE** | Verbindlicher Ist-Stand | Unverändert sichern, niemals als Migration ausführen |
| **KEEP** | Aktuell und weiterhin gültig | In die neue Struktur übernehmen |
| **MERGE** | Inhalt bleibt relevant, muss aber mit neueren Artefakten zusammengeführt werden | Konflikte auflösen, eine kanonische Fassung erzeugen |
| **MIGRATE** | Fachlich relevant, technisch in neue Architektur zu überführen | Neu implementieren oder kontrolliert anpassen |
| **DELTA-CANDIDATE** | Potenzielle DB-Migration | Gegen Production-Baseline prüfen, Staging testen |
| **REFERENCE** | Architektur- oder Fachreferenz | Unter `docs/` ablegen, nicht ungeprüft ausführen |
| **SUPERSEDED** | Durch neueren Stand ersetzt | Nur im Archiv behalten |
| **ARCHIVE** | Historisch wertvoll, nicht Teil des neuen Runtime-Standes | Legacy-Branch oder `docs/archive/` |
| **BLOCKED** | Noch nicht freigabefähig | Nicht deployen oder ausführen |
| **DO NOT COMMIT** | Sensible oder lokale Daten | Nicht in das öffentliche GitHub-Repository übernehmen |

## 2. Source-of-Truth-Hierarchie

1. **Datenbank-Ist-Stand:** `VECTOR_V2_CURRENT_PRODUCTION_SCHEMA_2026-10-27.sql`
2. **Code-Ist-Stand:** aktuellster `star-citizen-crafting-main.zip` plus aktueller GitHub-Stand
3. **Projekt-/UX-Baseline:** `SC_Group_Crafting_COPILOT_HANDOVER.md`
4. **V2-Fachbaseline:** aktueller VECTOR-V2-Recovery-/Handover-Stand
5. **SCMDB-Daten:** bestehender Mirror unter `data/scmdb/`, getrennt nach Channel
6. **Release-Identität:** `RELEASE.json` nach `VECTOR_RELEASE_SCHEMA_V1.json`
7. **Build-/Deployment-Freigabe:** VECTOR Build Generator und Checklisten

Bei Widersprüchen gilt: Production-Dump vor Schemaentwurf, aktueller Repository-Snapshot vor älterem ZIP, FROZEN-Fachregel vor älterem Prototypcode.

## 3. GitHub- und Branch-Migration

| Objekt | Status | Ziel | Entscheidung |
|---|---|---|---|
| Bestehendes Repository `Kokizzle98/star-citizen-crafting` | KEEP | bestehendes GitHub-Repository | Nicht löschen und nicht forken |
| Aktueller `main`-Stand | ARCHIVE + MIGRATE | Tag `legacy-v1.3.2`, Branch `legacy/sc-group-crafting-v1` | Vor Umbau vollständig sichern |
| Neuer VECTOR-Arbeitsstand | MIGRATE | Branch `develop` | Erst nach lokaler Konsolidierung pushen |
| Neuer Production-Stand | BLOCKED | Branch `main` | Erst nach PreFlight, RC und Freigabe |
| GitHub Pages Deployment | SUPERSEDED für Full-Stack | Legacy-Branch/alte Releases | Für statische V1 erhalten, nicht als VECTOR-V2-Ziel verwenden |
| Git-Historie | KEEP | Repository-Historie | Keine History-Neuschreibung erforderlich |

## 4. Code- und UI-Artefakte

| Artefakt | Status | Zielpfad | Behandlung |
|---|---|---|---|
| `star-citizen-crafting-main.zip` | BASELINE | Arbeitskopie / Importquelle | Aktuellsten Snapshot entpacken und vollständig inventarisieren |
| `index.html`, `app.js`, `styles.css`, `sw.js` | MIGRATE | `legacy/static-v1/` und fachlich nach `app/`, `components/`, `lib/` | Nicht direkt in Next.js übernehmen; UI/Logik selektiv portieren |
| `src/model.js`, `src/engine.js` | MIGRATE | `lib/domain/`, `lib/crafting/` | Regressionsfälle erhalten; TypeScript-Portierung |
| `src/` | MERGE | `lib/` bzw. `components/` | Dateiweise klassifizieren |
| `tests/` | MERGE | `tests/unit`, `tests/integration`, `tests/e2e` | Bestehende Regressionstests übernehmen und auf neue Imports umstellen |
| Komponentenbilder (`armor.png`, `cooler.png`, `powerplant.png`, `quantumdrive.png`, `shield.png`, `utility.png`, `weapon.png`) | KEEP | `public/assets/components/` | Pfade vereinheitlichen, AssetResolver beibehalten |
| `manifest.webmanifest`, Icons | MERGE | `public/` | PWA-Metadaten mit Next.js-App abstimmen |
| `supabase-config.js` | MIGRATE | `lib/supabase/` | Keine Secrets übernehmen; server/client strikt trennen |
| `VECTOR_PREFLIGHT_V1.zip` | MERGE | `app/`, `components/`, `lib/`, `database/migrations/identity/` | Nur nach Konfliktprüfung mit Bestand integrieren |
| Next.js Account/Admin/OAuth-Komponenten | DELTA-CANDIDATE | App Router-Struktur | Typecheck, Auth-Negativtests und Next-14-Kompatibilität erforderlich |
| `VECTOR_NEXT14_ACCOUNT_ADMIN_UI_V1.zip` | MERGE | `app/admin`, `components/account` | Gegen PreFlight-Paket deduplizieren |
| `VECTOR_NEXT14_OAUTH_CALLBACK_V1.zip` | MERGE | `app/auth`, `app/api/auth`, `lib/auth` | Ein kanonischer Callback-Flow, keine Doppelimplementierung |
| `VECTOR_OAUTH_CALLBACK_REFERENCE_V1.ts` | REFERENCE | `docs/security/oauth/` | Referenz, nicht automatisch Runtime-Code |
| `VECTOR_OAUTH_CALLBACK_SECURITY_SPEC_V1.md` | KEEP | `docs/security/oauth/` | Verbindliche Prüfreferenz |

## 5. Datenbankartefakte

| Artefakt | Status | Zielpfad | Behandlung |
|---|---|---|---|
| `VECTOR_V2_CURRENT_PRODUCTION_SCHEMA_2026-10-27.sql` | **BASELINE** | `database/baseline/` | Schema-only, bereinigt; niemals als Migration ausführen |
| Vollständiger Supabase-Dump mit Daten | DO NOT COMMIT | OneDrive/private Sicherung | Nicht in öffentliches GitHub; nur verschlüsselte/private Sicherung |
| `SC_Group_Crafting_V2_SCHEMA.sql` | REFERENCE | `docs/database/drafts/` | Architekturentwurf, keine Production-Migration |
| `SC_Group_Crafting_V2_RLS_POLICIES.sql` | REFERENCE / DELTA-CANDIDATE | `database/candidates/rls/` | Policy für Policy gegen Baseline prüfen |
| `SC_Group_Crafting_V2_SECURE_RPCS.sql` | REFERENCE / DELTA-CANDIDATE | `database/candidates/rpc/` | Signaturen, Grants und Search Path prüfen |
| `SC_Group_Crafting_V2_SQL_COMPLETE.zip` | SUPERSEDED als Gesamtmigration | `docs/archive/sql-drafts/` | Nicht als Komplettpaket ausführen |
| `SC_Group_Crafting_V2_SQL_WITH_RLS.zip` | SUPERSEDED als Gesamtmigration | `docs/archive/sql-drafts/` | Inhalte nur als Referenz extrahieren |
| `MIGRATION_v1_2.sql` | ARCHIVE / REVIEW | `database/legacy/` | Gegen Production-Dump feststellen, ob bereits angewendet |
| `VECTOR_V2_DATABASE_CONVERGENCE_PACKAGE_PHASE1.zip` | KEEP / REFERENCE | `docs/database/convergence/` | Konfliktmatrix und Dependency Map als Migrationsplanung verwenden |
| `VECTOR_V2_LOCATION_INVENTORY_COMMON_DELTA.zip` | DELTA-CANDIDATE | `database/migrations/030_location_inventory/` | Precheck aktualisieren, gegen Baseline testen, dann nummerieren |
| `VECTOR_V2_INVENTORY_FABRICATOR_DB_PACKAGE.zip` | DELTA-CANDIDATE | `database/migrations/040_fabricator/` | Erst nach Location/Inventory-Delta; RLS/RPC/Regression erforderlich |
| `VECTOR_IDENTITY_GAME_ACCOUNT_MODEL_V1.sql` | DELTA-CANDIDATE | `database/migrations/010_identity/` | Mit Production-Identitymodell und Auth-FKs abgleichen |
| `VECTOR_IDENTITY_RLS_RPCS_V1.sql` | DELTA-CANDIDATE | `database/migrations/010_identity/` | Grants/RLS/RPCs gegen Baseline prüfen |
| `VECTOR_ADMIN_ROLE_UUID_PINNED_V1.sql` | DELTA-CANDIDATE | `database/migrations/020_rbac/` | UUID-Pinning und Wiederholbarkeit prüfen |
| `VECTOR_ADMIN_BOOTSTRAP_READONLY_PRECHECK_V1*.sql` | KEEP | `database/preflight/rbac/` | Read-only Precheck, Ergebnis archivieren |
| Classification/Capability Model, RLS und RPC Pakete | DELTA-CANDIDATE | `database/migrations/020_rbac/` | Reihenfolge Model → RLS → RPC → Tests |
| Inventory Capability Seed | DELTA-CANDIDATE | `database/seeds/` | Idempotenz, Environment-Scoping und FK-Abhängigkeiten prüfen |
| Inventory Domain Model V2.1 | REFERENCE / DELTA-CANDIDATE | `database/candidates/inventory/` | Nicht als Monolith; in kleine Deltas zerlegen |
| Fleet Drafts/RLS/RPCs und Requirements RPC | REFERENCE / BLOCKED | `docs/database/fleet/` | Fachkonzept FROZEN, Umsetzung erst nach Core-Konvergenz |
| Trading/Marketplace SQL-Entwürfe | REFERENCE / BLOCKED | `docs/database/trading/` | Nicht deployen, bis Inventory/Reservation/Provider-Modelle konvergiert sind |

## 6. Verbindliche Datenbank-Reihenfolge

1. Baseline sichern und Hash erfassen.
2. Read-only Prechecks gegen Staging-Klon ausführen.
3. Identity/Profile/Game Accounts konsolidieren.
4. Platform RBAC, Classification und Capabilities konsolidieren.
5. Locations und Pflicht-Fallback `Unbekannt` migrieren.
6. Inventory Lifecycle, Reservations, Availability und Ledger migrieren.
7. Blueprint Resolver und Fabricator Calculation Layer migrieren.
8. Fleet Draft/Published/Active integrieren.
9. Trading, Provider Connection, Outbox und Reconciliation integrieren.
10. Watcher/Wipe-Konvergenz durchführen.
11. Finale RLS-/Grant-Härtung und Secure RPCs anwenden.
12. Schema-, RLS-, RPC-, Regression- und Rollback-Tests ausführen.

Jeder Schritt benötigt `precheck`, `migration`, `postcheck`, `tests` und dokumentierte Rollback-/Restore-Strategie.

## 7. SCMDB- und Datenartefakte

| Artefakt | Status | Zielpfad | Behandlung |
|---|---|---|---|
| bestehender `data/scmdb/` Mirror | KEEP | `data/scmdb/` | Nicht durch zweiten Mirror ersetzen |
| `.github/workflows/sync-scmdb-data.yml` | KEEP / MERGE | `.github/workflows/` | Mit neuen CI-Workflows konfliktfrei zusammenführen |
| SCMDB LIVE-Dataset | BASELINE je Release | `data/scmdb/live/` | Quelle der `_SC_{BuildNumber}`-Versionierung |
| SCMDB PTU/HOTFIX/TECH-PREVIEW | KEEP, getrennt | `data/scmdb/{ptu,hotfix,tech-preview}/` | Darf Production-Identifier nicht bestimmen |
| `scmdb-import-*.json` | REFERENCE / INPUT | privater Importbereich oder `data/scmdb/imports/` | Rohdaten nur committen, wenn Datenschutz und Größe passen |
| Game Logs | DO NOT COMMIT standardmäßig | OneDrive/private Rohdaten | Nur abgeleitete, bereinigte Metadaten in Git |
| SCMDB Watcher-Binaries/ZIPs | REFERENCE / RELEASE-ASSET | separates Tool/Release | Nicht ungeprüft in Web-Runtime einbetten |

## 8. Build-, Release- und CI-Artefakte

| Artefakt | Status | Zielpfad | Behandlung |
|---|---|---|---|
| `VECTOR_BUILD_GENERATOR_V1.zip` | MERGE | `build/`, `.github/workflows/` | In echtes Repository integrieren, danach realen Build testen |
| `VECTOR_RELEASE_SCHEMA_V1.json` | KEEP | `build/schemas/` | Kanonisches Schema für `RELEASE.json` |
| `RELEASE.example.json` | KEEP | `build/templates/` | Nur Vorlage, keine Production-Metadaten |
| `VECTOR_PREFLIGHT_BUILD_CHECK_V1.ps1` | KEEP / EXTEND | `build/scripts/` | Release-Schema, SCMDB-Konsistenz, Secret Scan und DB-Checks ergänzen |
| Bash Build Check | KEEP / EXTEND | `build/scripts/` | Parität zur PowerShell-Version sichern |
| `RELEASE.json` | GENERATE | Repository-Root und Artefakt | Nicht manuell widersprüchlich pflegen |
| `VERSION` | GENERATE | Repository-Root und Artefakt | Aus SemVer ableiten |
| `CHANGELOG.md` | KEEP | Repository-Root | Pro Release aktualisieren |
| `.github/workflows/vector-preflight.yml` | MERGE | `.github/workflows/` | Bestehende Workflows erhalten und deduplizieren |
| `.github/workflows/vector-production.yml` | BLOCKED bis Deploymentziel feststeht | `.github/workflows/` | Nur validiertes RC-Artefakt promoten |
| Build Reports und Checksums | GENERATE | `build/reports/`, Release-Artefakt | Reports nicht als Source-of-Truth behandeln |

## 9. Dokumentation und Handovers

| Artefakt | Status | Zielpfad | Behandlung |
|---|---|---|---|
| `SC_Group_Crafting_COPILOT_HANDOVER.md` | KEEP / MERGE | `docs/handover/LEGACY_HANDOVER.md` | Inhalte in neuen VECTOR-Handover überführen |
| `SC_Group_Crafting_Copilot_Recovery_Pack.zip` | ARCHIVE | OneDrive / GitHub Release Asset | Nicht als Runtime-Quelle verwenden |
| `SC_Group_Crafting_V1.3.2_CHECKPOINT.md` | ARCHIVE / REFERENCE | `docs/archive/v1.3.2/` | Historischer Release-Gate-Stand |
| `SC_Group_Crafting_V2_DATA_MODEL.md` | KEEP / REFERENCE | `docs/architecture/VECTOR_V2_DATA_MODEL.md` | Architekturprinzipien erhalten |
| `SC_Group_Crafting_Restart_Prompts_Fast_and_Secure.txt` | MERGE | `docs/handover/START_HERE.md` | Auf neue Baselines und Repository-Pfade aktualisieren |
| VECTOR V2 Recovery Baseline | KEEP / MERGE | `docs/handover/` | FROZEN-Flotte/Trading/Location-Regeln übernehmen |
| Einzelne README_START_HERE-Dateien | MERGE | modulbezogene `README.md` | Veraltete Aussagen kennzeichnen oder entfernen |

## 10. Zielstruktur des neuen Repository

```text
star-citizen-crafting/
├── .github/workflows/
├── app/
├── components/
├── lib/
├── public/
├── database/
│   ├── baseline/
│   ├── migrations/
│   ├── seeds/
│   ├── preflight/
│   ├── postflight/
│   ├── tests/
│   ├── candidates/
│   └── legacy/
├── data/scmdb/
│   ├── live/
│   ├── ptu/
│   ├── hotfix/
│   ├── tech-preview/
│   └── metadata/
├── build/
│   ├── config/
│   ├── schemas/
│   ├── scripts/
│   ├── checklists/
│   ├── templates/
│   └── reports/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── docs/
│   ├── architecture/
│   ├── database/
│   ├── security/
│   ├── releases/
│   ├── handover/
│   └── archive/
├── RELEASE.json
├── VERSION
├── CHANGELOG.md
├── package.json
├── tsconfig.json
├── middleware.ts
├── .gitignore
├── .env.example
└── README.md
```

## 11. Migrationswellen

### Welle 0: Sicherung
- Legacy-Branch und Tag erzeugen.
- GitHub-Stand und Production-Schema-Dump hashen.
- Vollständigen DB-Dump privat sichern.
- Keine Production-Änderung.

### Welle 1: Repository-Hygiene
- Neuen `develop`-Branch anlegen.
- Zielstruktur erzeugen.
- Altcodes nach `legacy/` oder Archiv verschieben.
- `.gitignore`, Secret Scan und Environment-Trennung härten.

### Welle 2: Runtime-Konvergenz
- Next.js-App-Grundgerüst konsolidieren.
- Supabase Server/Client/Middleware vereinheitlichen.
- Identity/Admin/OAuth integrieren.
- Bestehende V1-Funktionalität selektiv portieren.

### Welle 3: Datenkonvergenz
- Baseline-Analyse automatisieren.
- Deltas in Abhängigkeitsreihenfolge erstellen.
- Staging-Klon migrieren und testen.

### Welle 4: SCMDB und Release
- Kanonisches LIVE-Dataset erzeugen.
- `RELEASE.json` generieren.
- PreFlight-Artefakt bauen und prüfen.

### Welle 5: Preview/RC
- Preview-Deployment aus geprüftem Artefakt.
- Smoke-, Auth-, RLS- und E2E-Tests.
- RC nur ohne Code-/Dataset-Änderung promoten.

### Welle 6: Production
- Manuelle Freigabe.
- Backup und Restore-Punkt.
- Geprüftes RC-Artefakt deployen.
- Post-Deployment-Smoke-Test und Release-Dokumentation.

## 12. Harter Freigabeentscheid

### Sofort zulässig
- Legacy-Branch/Tag erstellen.
- Repository lokal clonen.
- Zielordnerstruktur auf `develop` anlegen.
- Dokumentation, Build Generator und Schema-Validator integrieren.
- Production-Dump als bereinigte Schema-Baseline ablegen.

### Vorherige Prüfung erforderlich
- Bestehende Dateien löschen oder verschieben.
- `package.json`, Middleware und Supabase-Clients ersetzen.
- Identity-/RBAC-Migrationen anwenden.
- SCMDB-Workflow verändern.

### Derzeit blockiert
- Production-Datenbankmigration.
- Direkter Production-Deploy von `main`.
- Veröffentlichung eines vollständigen Dumps.
- Ausführung monolithischer V2-Schema-ZIPs.
- Aktivierung externer Provider ohne Staging-Negativtests.

## 13. Definition of Done für die Repository-Migration

- Legacy-Stand ist tag- und branchgesichert.
- `develop` enthält nur die kanonische Zielstruktur.
- Jede Bestandsdatei ist KEEP, MERGE, MIGRATE, REFERENCE, SUPERSEDED, ARCHIVE, BLOCKED oder DO NOT COMMIT zugeordnet.
- Production-Schema ist als Baseline dokumentiert und gehasht.
- Keine Secrets oder personenbezogenen Dumps liegen im öffentlichen Repository.
- SCMDB besitzt genau eine kanonische LIVE-Releasequelle.
- `RELEASE.json` validiert gegen das Release-Schema.
- TypeScript, Lint, Tests und Build bestehen.
- Staging-Migration, RLS/RPC-Tests und Smoke-Test bestehen.
- Production verwendet exakt das validierte RC-Artefakt.
