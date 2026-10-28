# VECTOR Identity Link/Unlink Flows v1

**Archive Status:** LEGACY REFERENCE  
**Authority:** NON-BINDING  
**Original Role:** Early VECTOR concept for login-identity and Star Citizen game-account linking/unlinking  
**Current Direction:** Preserve as an OG architecture reference and migrate still-valid rules into current FROZEN specifications.

## Archive assessment

This document is not the current authoritative authentication specification. VECTOR Auth 1.1 has since established a broader primary-authentication model that includes direct E-mail/password authentication plus social login, while Citizen ID / RSI is treated as a linked Star Citizen game identity rather than the required primary login.

The original document nevertheless contains several strong security and identity rules that should be preserved and migrated into current FROZEN documentation.

## Rules recommended for migration into FROZEN specifications

### A. Internal user identity remains authoritative

**Recommended destination:** `AUTH_V1_1.md`, `PROFILE_IDENTITY_V1.md` and/or a future `GAME_IDENTITY_V1.md`.

Preserve the principle:

- `auth.users.id` remains the internal ownership and RLS identity.
- External provider identities and Star Citizen identities are linked identities and do not replace VECTOR's internal user identity.

**Why preserve it:** This keeps Inventory, Crew, Fleet and Trading ownership stable when an external identity is linked, unlinked, changed or revoked.

### B. Login identity and Star Citizen game identity are separate domains

**Recommended destination:** `AUTH_V1_1.md` and future `GAME_IDENTITY_V1.md`.

Preserve the principle:

- Authentication identities answer who may authenticate to the VECTOR account.
- Star Citizen / Citizen ID / RSI identity represents the linked game identity.
- Linking or unlinking a game identity must not transfer or delete VECTOR ownership.

**Why preserve it:** This directly supports the current Auth 1.1 model and prevents login-provider lifecycle from becoming a game-asset ownership mechanism.

### C. Provider verification is server-authoritative

**Recommended destination:** `AUTH_V1_1.md`, future `GAME_IDENTITY_V1.md`, and security architecture.

Preserve the principle:

- Provider verification is performed server-side.
- Provider subject/identity claims must be derived from a verified provider/session flow, not trusted from freely editable client input.
- Client input alone can never mark an identity or game account as verified.

**Why preserve it:** Verification status is a security assertion and must not be user-forgeable.

### D. Game-account linking uses a staged lifecycle

**Recommended destination:** future `GAME_IDENTITY_V1.md`.

Preserve the conceptual lifecycle:

```text
PENDING
-> VERIFIED
-> STALE / CONFLICT when verification becomes unreliable
-> REVOKED when unlinked
```

Preserve the principles:

- User input may request a link but cannot directly create `VERIFIED` state.
- Verification must use an approved server-side verification flow.
- Uncertain cases are not automatically reassigned.

**Why preserve it:** This aligns with VECTOR's No-Guess and provenance rules.

### E. Unlink is soft-revoke, not physical deletion

**Recommended destination:** future `GAME_IDENTITY_V1.md`, `PERSISTENCE_PROVENANCE_V1.md` and Auth security rules.

Preserve the principle:

- Link history and audit history remain available after unlink/revocation.
- Revocation changes the active relationship; it does not rewrite historical provenance.

**Why preserve it:** Identity history can matter for audit, reconciliation and ownership continuity.

### F. Ownership survives game-identity unlink

**Recommended destination:** future `GAME_IDENTITY_V1.md` plus ownership/domain specifications.

Preserve the principle:

- Inventory, Crew, Fleet and Trading ownership remains attached to VECTOR's internal user identity.
- Unlinking a Star Citizen game identity must not delete or transfer platform ownership.

**Why preserve it:** The external game identity is not VECTOR's ownership primary key.

### G. Prevent removal of the last viable authentication path

**Recommended destination:** `AUTH_V1_1.md` after adaptation to the current direct E-mail/password plus social-login model.

The legacy wording about keeping another linked login identity is too narrow. The modern rule should become:

> VECTOR must prevent an identity-unlink operation that would leave the user without any viable approved authentication/recovery path, taking all enabled authentication methods into account.

This includes, depending on the account:

- direct E-mail/password authentication;
- Discord;
- Google;
- Microsoft;
- Apple or other approved social identities;
- future recovery/MFA policy.

**Why update it:** A user may have a valid VECTOR password without another social identity, so social-identity count alone is no longer sufficient.

### H. Fresh reauthentication / step-up for sensitive unlink operations

**Recommended destination:** `AUTH_V1_1.md` and `PLATFORM_CRITICAL_ACTIONS_V1.md` where applicable.

Preserve the principle:

- Security-sensitive unlink/recovery operations may require fresh reauthentication or stronger assurance.
- The mechanism must match the user's actual authentication methods.
- Social-only users cannot be required to enter a nonexistent VECTOR password.

**Why preserve it:** Identity removal can affect account recoverability and therefore requires stronger assurance than ordinary profile editing.

### I. Reconciliation is mandatory for identity divergence

**Recommended destination:** future `GAME_IDENTITY_V1.md` and identity/auth architecture.

Preserve server-side reconciliation for states such as:

- provider identity exists but VECTOR mirror/reference is missing;
- VECTOR reference is active but provider identity has been removed/revoked;
- provider subject is inconsistent or conflicted;
- verified game identity has expired/missing verification evidence;
- primary identity/game-account pointer references a revoked record.

Preserve the rule:

> Uncertain identity cases are never automatically reassigned. They transition to a safe unresolved status such as `STALE` or `CONFLICT` and require renewed verification or authorized review.

**Why preserve it:** This is a direct application of VECTOR's No-Guess principle.

### J. Audit identity-link lifecycle events

**Recommended destination:** Auth/Game Identity specifications and audit architecture.

Preserve the requirement that material identity lifecycle events are auditable, including:

- login identity linked;
- login identity unlinked/revoked;
- game account verified;
- game account unlinked/revoked;
- reconciliation conflict where material.

Exact event names remain implementation details.

## Rules that are legacy implementation details, not FROZEN requirements

The following concepts are useful historical implementation sketches but should not be copied verbatim into current FROZEN rules:

- exact RPC names such as `identity_register_linked_login(...)`, `identity_set_primary_login(...)`, `identity_finalize_unlink(...)`, `identity_request_game_account_link(...)`, `identity_verify_game_account(...)` and `identity_unlink_game_account(...)`;
- exact table/mirror naming such as `user_identities`;
- exact callback/RPC sequencing where a newer Supabase/Auth implementation chooses an equivalent secure architecture;
- the assumption that all authentication methods are external/social identities;
- exact provider claim names beyond the security requirement to validate trustworthy provider assertions.

These remain useful implementation references, but they are not the binding product/security contract.

---

# Original legacy concept

## Sicherheitsgrundsätze
- auth.users.id bleibt die interne Ownership- und RLS-ID.
- VECTOR nimmt niemals RSI-Passwörter, 2FA-Codes, Session-Cookies oder Provider-Refresh-Tokens entgegen.
- Login-Identität und Star-Citizen-Spielkonto sind getrennte Objekte.
- Direkte Client-Schreibrechte auf Identity-Tabellen bleiben gesperrt.
- Provider-Verifikation ist ausschließlich serverseitig zulässig.
- Unlink ist ein Soft-Revoke. Historie und Audit bleiben erhalten.

## A. Externe Login-Identität verknüpfen
- Der Benutzer ist bereits mit mindestens einer Methode bei VECTOR angemeldet.
- VECTOR startet den offiziellen Supabase-Auth-Linking-Flow des gewünschten OAuth/OIDC-Providers.
- Der Provider authentifiziert den Benutzer und leitet zum registrierten Callback zurück.
- Supabase Auth verknüpft die externe Identität mit demselben auth.users-Datensatz.
- VECTOR liest die verifizierte Identität aus der aktuellen Auth-Session. provider und provider_subject dürfen nicht aus einem frei editierbaren Formular stammen.
- VECTOR ruft identity_register_linked_login(...) auf.
- Der RPC prüft Authentifizierung, Providerstatus und globale Eindeutigkeit des Provider-Subjects.
- VECTOR schreibt Audit LOGIN_IDENTITY_LINKED.
- Optional wird die neue Identität über identity_set_primary_login(...) zur bevorzugten Loginmethode.

Fehlerfälle: abgebrochener Provider-Flow, inaktiver Provider, Subject bereits einem anderen User zugeordnet, Sessionwechsel während des Flows.

## B. Login-Identität entfernen
- VECTOR lädt die bei Supabase Auth tatsächlich verknüpften Identitäten.
- VECTOR verhindert den Vorgang, wenn dadurch keine weitere Login-Identität verbleibt.
- VECTOR prüft, ob die Identität noch einen aktiven game_account trägt. Falls ja, muss zuerst dessen Bindung gelöst oder auf einen anderen Provider migriert werden.
- Der Benutzer führt eine frische Re-Authentifizierung durch. Empfehlung: MFA/AAL2 oder erneute Provider-Anmeldung.
- VECTOR ruft Supabase Auth unlinkIdentity() auf.
- Erst nach erfolgreichem Auth-Unlink ruft VECTOR identity_finalize_unlink(...) auf.
- Der VECTOR-Spiegel erhält REVOKED, revoked_at, is_primary=false.
- Audit LOGIN_IDENTITY_UNLINKED wird geschrieben.
- Falls ein Teilschritt scheitert, landet der Vorgang in einer Reconciliation Queue; der Auth-Provider ist die Wahrheit für Loginfähigkeit.

## C. Star-Citizen-Spielkonto verknüpfen
- Der angemeldete Benutzer trägt den gewünschten RSI-Handle ein oder startet direkt einen verifizierenden OIDC-Flow.
- identity_request_game_account_link(...) erzeugt ausschließlich einen PENDING-Datensatz. Benutzereingaben können niemals VERIFIED setzen.
- Ein serverseitiger Verifikationsdienst startet den freigegebenen Provider-Flow mit minimalen Scopes.
- Der Dienst validiert iss, aud, Signatur, exp, nonce/state und den stabilen Provider-Subject.
- Nach erfolgreicher Prüfung ruft ausschließlich service_role den RPC identity_verify_game_account(...) auf.
- Der RPC setzt Provider-Subject, Handle, Verifikationszeitpunkte und optionale consent-basierte Claims.
- Alte gleichnamige Claims werden STALE; neue Claims werden CURRENT.
- Optional wird das Konto primär und profiles.primary_game_account_id aktualisiert.
- Audit GAME_ACCOUNT_VERIFIED wird geschrieben.

## D. Star-Citizen-Spielkonto entfernen
- Benutzer wählt ein eigenes aktives game_account.
- VECTOR zeigt betroffene Bereiche an und verlangt explizite Bestätigung.
- Der RPC identity_unlink_game_account(...) prüft Ownership und aktive Domain-Referenzen.
- Bei blockierenden Referenzen wird mit GAME_ACCOUNT_HAS_ACTIVE_DOMAIN_REFERENCES abgebrochen.
- Der Primary-Link im Profil wird entfernt.
- Claims und Game Account werden REVOKED; nichts wird physisch gelöscht.
- Inventory-, Crew-, Fleet- und Trading-Eigentum bleibt bei auth.users.id und geht nicht verloren.
- Audit GAME_ACCOUNT_UNLINKED wird geschrieben.

## E. Reconciliation

Folgende Inkonsistenzen müssen regelmäßig serverseitig geprüft werden:
- Supabase Auth Identity vorhanden, aber kein aktiver user_identities-Spiegel.
- VECTOR-Spiegel aktiv, aber Auth Identity bereits entfernt.
- Provider-Subject gehört laut Provider zu einem anderen oder widerrufenen Kontext.
- VERIFIED Game Account hat abgelaufene oder fehlende Verifikation.
- Primary Identity oder Primary Game Account verweist auf einen widerrufenen Datensatz.

Unsichere Fälle werden niemals automatisch umgehängt. Sie wechseln auf STALE oder CONFLICT und benötigen erneute Verifikation beziehungsweise Admin-Review.
