# Supabase Runtime Overview

- **Version:** v1.0
- **Status:** READ-ONLY SNAPSHOT, dokumentarisch, nicht normativ, keine Migration
- **Erfassungsdatum:** 2026-11-13
- **Basis-Commit:** `210cb07b4c23fcd003b1b12d01ee3655b7f44519` (`develop`)
- **Quelle:** Supabase Production (`main`), ausschliesslich Katalog-SELECTs (`pg_proc`, `pg_class`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_trigger`, `pg_policies`, `pg_roles`). Keine Tabellenzeilen gelesen, keine Mutation.
- **Zweck:** Alles, was nur in Supabase existiert (Inventory-Read-RPC, Crew-RPCs, Profil-/Crew-/Identity-Tabellen, RLS), fuer Fleet Commander und Reviewer im Repository lesbar machen.

Bei Widerspruch zwischen diesem Dokument und dem Live-System gilt das Live-System (Runtime-Zustand) und dieses Dokument ist veraltet. Bei Widerspruch zu `docs/frozen/` gilt FROZEN. Die Snapshots werden nicht automatisch aktualisiert.

## 1. Dateien

| Datei | Inhalt |
|---|---|
| `database/snapshots/02_functions.sql` | 37 Funktionsdefinitionen (`pg_get_functiondef`), CRLF zu LF normalisiert |
| `database/snapshots/03_tables_columns.sql` | 24 Tabellen mit Spalten, Typen, NOT NULL, DEFAULT, Identity, Generated |
| `database/snapshots/04_constraints_indexes_triggers.sql` | 178 Constraints, 27 Indizes (ohne PK/UNIQUE-Indizes), 7 Trigger |
| `database/snapshots/05_rls_policies_grants.sql` | RLS-Status, 28 Policies, Tabellen-ACL, Funktions-ACL und -Security-Modus |

Jede Datei beginnt mit `READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN`, nennt Erfassungsdatum und Basis-Commit und enthaelt direkt nach dem Kopf einen `DO`-Block, der beim versehentlichen Ausfuehren mit einer Exception abbricht. Die Dateien liegen bewusst ausserhalb von `database/migrations/`.

**Qualitaetspruefung der Erfassung:** Nach dem Schreiben wurde jeder Inhalt per MD5 gegen eine im Katalog berechnete Referenz verglichen: Funktionen 37 von 37, Tabellen 24 von 24 (Spalten), Constraints, Indizes, Trigger, Policies, Tabellen-ACL und Funktions-ACL jeweils identisch. Die Verifikation der Funktions-`proconfig` (search_path) erfolgte nicht per Hash, sondern durch Abgleich mit der Katalogausgabe.

## 2. Tabellen (Schema `public`, 24)

Alle 24 Tabellen haben RLS aktiv, keine mit `FORCE`. `anon` hat auf keiner Tabelle ein Grant. Rollen: `service_role` und `postgres` haben `BYPASSRLS`, `anon` und `authenticated` nicht (`pg_roles`).

| Tabelle | Bereich | CREATE im Repo? | Policies |
|---|---|---|---|
| `inventory` | Inventory | nein (nur ALTER/Constraint in `inventory/001`, `database/legacy`) | read/insert/update/delete eigene Zeilen |
| `inventory_locations` | Inventory | nein (nur Grant/Referenzen in `scmdb/002`, `003`) | read fuer authenticated |
| `scmdb_location_datasets` | SCMDB | ja (`scmdb/001`) | read fuer authenticated |
| `scmdb_location_catalog` | SCMDB | ja (`scmdb/001`) | read fuer authenticated |
| `scmdb_location_mappings` | SCMDB | ja (`scmdb/003`) | read fuer authenticated, service_role |
| `blueprints` | Blueprint | ja (`blueprints/001`) | read fuer authenticated |
| `scmdb_blueprint_datasets` | Blueprint | ja (`blueprints/001`) | read fuer authenticated |
| `scmdb_blueprint_catalog` | Blueprint | ja (`blueprints/001`) | read fuer authenticated |
| `scmdb_blueprint_reward_sources` | Blueprint | ja (`blueprints/001`) | read fuer authenticated |
| `user_blueprint_ownership` | Blueprint | ja (`blueprints/001`) | read eigene Zeilen |
| `profiles` | Profil/Crew | nein | read alle (authenticated), update eigene |
| `groups` | Crew | nein | read Mitglieder, update Admin |
| `group_members` | Crew | nein | read Mitglieder |
| `group_invites` | Crew | nein | read eingeladen oder Admin |
| `crew_audit_log` | Crew | nein | read Owner/Admin |
| `user_settings` | Crew/Profil | nein | read/insert/update eigene |
| `user_app_roles` | Rollen | nein | keine (RLS an, nur Funktionen und service_role) |
| `games` | Identity | nein | read (ACTIVE, DEPRECATED) |
| `identity_providers` | Identity | nein | read (ACTIVE, DEPRECATED) |
| `user_identities` | Identity | nein | read eigene Zeilen |
| `game_accounts` | Identity | nein | read eigene Zeilen |
| `game_account_claims` | Identity | nein | read ueber eigenes game_account |
| `identity_audit_log` | Identity | nein | keine |
| `identity_oauth_flows` | Identity | nein | keine |

Schreibzugriff fuer `authenticated` direkt auf Tabellen besteht laut ACL nur bei `inventory` (`arwd`). Alle uebrigen Tabellen sind fuer `authenticated` hoechstens lesbar; Schreiben laeuft ueber die Funktionen unten. Das ist eine Beobachtung aus dem Katalog, keine Bewertung.

## 3. Funktionen (Schema `public`, 37)

Security-Modus, Volatilitaet, `search_path` und ACL stehen vollstaendig in `05_rls_policies_grants.sql`. Alle Funktionen gehoeren `postgres`.

| Funktion | Modus | EXECUTE | Repo-Migration | Aufrufer im Repo |
|---|---|---|---|---|
| `get_active_group_inventory()` | DEFINER, STABLE | authenticated | nein | `lib/inventory/inventory-read.ts:10` |
| `add_or_merge_inventory_lot(...)` | INVOKER | authenticated | `inventory/001`, `002` | `lib/inventory/inventory-write.ts:285` |
| `update_or_merge_inventory_lot(...)` | INVOKER | authenticated | `inventory/003`, `004` | `lib/inventory/inventory-update-write.ts:80` |
| `get_my_app_role()` | DEFINER, STABLE | authenticated | nein | `lib/auth/authorization.ts:13`, `components/layout/HeaderAccountMenu.tsx:41`, `components/layout/VectorTopbar.tsx:47` |
| `set_active_group(uuid)` | DEFINER | authenticated | nein | `lib/groups/set-active-crew.ts:20` |
| `get_active_crew_blueprint_status()` | DEFINER, STABLE | authenticated | `blueprints/001` | `lib/blueprints/blueprint-catalog-read.ts:79` |
| `mark_blueprint_owned(uuid)` | DEFINER | authenticated | `blueprints/001` | `lib/blueprints/blueprint-ownership-write.ts:28` |
| `unmark_blueprint_owned(uuid)` | DEFINER | authenticated | `blueprints/001` | `lib/blueprints/blueprint-ownership-write.ts:28` |
| `sync_scmdb_blueprint_catalog(...)` | INVOKER | service_role | `blueprints/001` | `scripts/sync-scmdb-blueprint-catalog.mjs:26,240` |
| `sync_scmdb_location_catalog(...)` | DEFINER | service_role | `scmdb/001`, `007` | kein `.rpc()`-Aufruf gefunden |
| `promote_active_scmdb_locations(text)` | DEFINER | service_role | `scmdb/005` | kein `.rpc()`-Aufruf gefunden |
| `bind_scmdb_legacy_location(text, uuid)` | DEFINER | service_role | `scmdb/006` | kein `.rpc()`-Aufruf gefunden |
| `upsert_my_profile(text)` | DEFINER | authenticated | nein | kein Aufruf gefunden (nur in `docs/architecture/legacy/` erwaehnt) |
| `create_group(text, text)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `update_group_details(uuid, text, text)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `archive_group(uuid)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `restore_group(uuid)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `invite_group_member(uuid, text)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `revoke_group_invite(uuid)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `respond_group_invite(uuid, boolean)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `change_member_role(uuid, uuid, text)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `remove_group_member(uuid, uuid)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `leave_group(uuid)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `transfer_group_ownership(uuid, uuid, boolean)` | DEFINER | authenticated | nein | kein Aufruf gefunden (legacy-Doc) |
| `write_crew_audit(uuid, text, uuid, jsonb)` | DEFINER | nur postgres | nein | intern, von Crew-RPCs aufgerufen |
| `is_group_owner / is_group_admin / is_group_member(uuid, uuid)` | DEFINER, STABLE | authenticated | nein | RLS-Policies, Crew-/Inventory-RPCs |
| `users_share_group(uuid, uuid)` | DEFINER, STABLE | authenticated | nein | kein Aufruf im Repo gefunden |
| `is_current_user_admin()` | DEFINER, STABLE | authenticated | nein | kein Aufruf im Repo gefunden |
| Trigger-Funktionen: `set_updated_at`, `validate_profile_primary_game_account`, `validate_scmdb_location_mapping`, `apply_scmdb_location_lifecycle`, `lock_scmdb_location_dataset_lifecycle`, `validate_scmdb_active_dataset_mappings` | siehe Datei 05 | Trigger-Funktionen, nicht per RPC aufrufbar | teils (`scmdb/003`, `004`, `007`) | n/a |
| Event-Trigger-Funktion: `rls_auto_enable` | DEFINER | Event-Trigger | nein | n/a |

Die Spalte "Aufrufer" beruht auf einer Textsuche nach `.rpc(` und den Funktionsnamen in `lib/`, `app/`, `components/`, `src/`, `scripts/`, `middleware.ts`. "Kein Aufruf gefunden" heisst: kein Treffer in diesen Pfaden, nicht, dass die Funktion ungenutzt ist.

## 4. RPCs, die der Code aufruft (lib/, app/, components/, scripts/)

Jede im Code aufgerufene RPC ist entweder oben dokumentiert oder hier gelistet:

| RPC | Aufrufer | Stand |
|---|---|---|
| `get_active_group_inventory`, `add_or_merge_inventory_lot`, `update_or_merge_inventory_lot`, `get_my_app_role`, `set_active_group`, `get_active_crew_blueprint_status`, `mark_blueprint_owned`, `unmark_blueprint_owned`, `sync_scmdb_blueprint_catalog` | siehe Tabelle Abschnitt 3 | dokumentiert (`02_functions.sql`) |
| `identity_finalize_link_server` | `app/auth/callback/route.ts:4` (Aufruf mit `service_role`-Admin-Client) | **NICHT ERMITTELT**: im Katalog existiert keine Funktion dieses Namens, weder in `public` noch in einem anderen Schema. Definition kann nicht dokumentiert werden. Siehe Drift D5. |

## 5. Drift (benannt, nicht korrigiert)

- **D1: Keine Migrationshistorie in Supabase.** `list_migrations` liefert eine leere Liste. Anwendung der Repo-Migrationen (Blueprint PR #39 ist laut `PROJECT_STATE.md` per Owner-GO angewendet) ist deshalb nicht ueber Supabase-Metadaten nachweisbar, nur ueber den Objektabgleich in diesem Dokument.
- **D2: 16 von 24 Tabellen haben kein CREATE im Repo.** Es fehlt ein Baseline-Schema fuer `inventory`, `inventory_locations`, `profiles`, `groups`, `group_members`, `group_invites`, `crew_audit_log`, `user_settings`, `user_app_roles`, `games`, `identity_providers`, `user_identities`, `game_accounts`, `game_account_claims`, `identity_audit_log`, `identity_oauth_flows`. Repo-Migrationen setzen `inventory` und `inventory_locations` als bestehend voraus (`database/legacy/MIGRATION_v1_2.sql`, `inventory/001`, `scmdb/002`, `scmdb/003`). Wie diese Tabellen angelegt wurden, ist **NICHT ERMITTELT**.
- **D3: 24 von 37 Funktionen existieren nur in Supabase.** Alle Crew-RPCs, `upsert_my_profile`, `get_active_group_inventory`, `get_my_app_role`, die Helfer `is_*`, `users_share_group`, `write_crew_audit`, `set_updated_at`, `validate_profile_primary_game_account`, `rls_auto_enable`. Fuer diese gibt es keine Repo-Migration; ihre einzige Textquelle ist jetzt `02_functions.sql`.
- **D4: Dieselben Funktionen in Repo und Supabase sind inhaltlich gleich.** Fuer alle 13 Funktionen, die Repo-Migrationen definieren (letzte Fassung je Funktion), stimmt der Funktionskoerper nach Whitespace-/Kommentar-Normalisierung mit dem Live-Stand ueberein (13 von 13). Abgeglichen wurden nur Funktionskoerper. Spalten, Constraints, Indizes, Policies und Grants der im Repo angelegten Tabellen wurden **nicht systematisch** gegen die Repo-DDL verglichen.
- **D5: Identity-Objekte ohne Repo-DDL, Code ruft nicht vorhandene RPC.** `database/migrations/identity/` enthaelt nur eine README ("STAGING ONLY", Quelle: `VECTOR_PREFLIGHT_V1.zip`, keine SQL-Dateien). In Production existieren trotzdem die Tabellen `identity_*`, `games`, `user_identities`, `game_accounts`, `game_account_claims` samt Constraints, Indizes und Policies, dazu `profiles.primary_game_account_id` mit Trigger. Herkunft: **NICHT ERMITTELT**. `app/auth/callback/route.ts` ruft `identity_finalize_link_server`, die es nicht gibt (siehe Abschnitt 4). `AGENTS.md` nennt `CITIZEN_ID_ENABLED=false` als Default; ob dieser Pfad in Production erreichbar ist, wurde nicht geprueft.
- **D6: Leichen/Reste.** `validate_scmdb_active_dataset_mappings()` existiert ohne Trigger. Das ist konsistent mit `scmdb/007` (dort `DROP TRIGGER scmdb_active_dataset_mapping_validate`); die Funktion bleibt als ungenutztes Objekt bestehen. `inventory.location` (text, nullable) existiert neben `location_id`; eine Repo-Migration, die sie anlegt oder entfernt, wurde nicht gefunden.
- **D7: Funktionen mit Standard-ACL.** `rls_auto_enable`, `set_updated_at` und `validate_profile_primary_game_account` haben keine explizite ACL (`proacl` NULL). Alle drei sind Trigger-/Event-Trigger-Funktionen und per RPC nicht aufrufbar. Nur als Beobachtung festgehalten.

## 6. NICHT ERMITTELT

- Definition von `identity_finalize_link_server` (existiert im Katalog nicht).
- Herkunft/Anwendungsweg der Tabellen und Funktionen aus D2, D3, D5 (Supabase fuehrt keine Migrationshistorie, Repo enthaelt keine Quelle).
- Auth-Schema (`auth.*`) und Storage/Realtime/Edge Functions: nicht Teil dieses Snapshots.
- Tabelleninhalte, Zeilenanzahlen und Statistiken: bewusst nicht erfasst.

## 7. Aktualisierung

Neu erzeugen bei jeder Aenderung am Production-Schema (Migration mit Owner-GO) oder bei Drift-Verdacht. Dabei Version hochzaehlen (v1.1, ...), Basis-Commit und Erfassungsdatum im Kopf aller vier Snapshot-Dateien und hier aktualisieren. Ein Snapshot ersetzt weder `docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md` noch Migrationen.
