# VECTOR Authentication v1.1

**Status:** PROPOSED  
**Version:** 1.1  
**Authority Scope:** AUTH  
**Approved By:** pending project_owner approval  
**Supersedes:** none; consolidates current authentication rules and separates authentication from future Game Identity authority  
**Scope:** VECTOR sign-up, sign-in, password security, social authentication, MFA, sessions, login-identity linking/unlinking, recovery, redirect security, audit and privileged authentication requirements

## 1. Purpose

This specification defines the proposed authentication security baseline for VECTOR.

Authentication answers:

> How does a user prove access to a VECTOR account?

Authentication does not define Star Citizen account ownership or RSI/Citizen identity. Those belong to the separate Game Identity authority scope.

Until this proposal is approved and frozen, existing FROZEN VECTOR rules remain authoritative.

## 2. Security guidance and compliance posture

VECTOR uses the following as security design guidance:

- GDPR risk-appropriate security principles;
- BSI identity/access-management and multi-factor-authentication guidance;
- current security capabilities and requirements of the selected authentication provider;
- VECTOR global security, No-Guess, provenance and fail-closed rules.

This document does not claim BSI certification, NIS2 applicability, formal regulatory certification or independent compliance validation.

## 3. Identity boundary

### 3.1 Canonical internal user identity

`auth.users.id` remains the canonical internal VECTOR user identifier for authentication-linked ownership and RLS identity.

External provider identifiers must not replace the canonical internal user UUID.

### 3.2 Authentication identity is not Game Identity

VECTOR separates:

```text
Authentication Identity
!=
Star Citizen Game Identity
```

RSI / Citizen ID is not a required Primary Login provider in Auth v1.1.

RSI/Citizen linking, game-account verification, claims, primary game account and game-identity reconciliation belong to `GAME_IDENTITY_V1.md` or its approved successor.

### 3.3 Ownership survives login-method changes

Inventory, Fleet, Crew, Trading and other VECTOR ownership remain attached to the canonical internal user identity and must not be transferred, deleted or reassigned merely because a login provider is linked, unlinked or changed.

## 4. Supported authentication methods and priority

VECTOR v1.1 prioritizes authentication methods in this product/implementation order:

```text
1. Email + Password
2. Discord
3. Twitch
4. Google
5. Apple
6. Microsoft
```

This order expresses implementation/product priority, not greater security authority or ownership authority.

All enabled social providers are subject to the same VECTOR linking, callback, session, audit and security boundaries unless a provider requires a stricter rule.

Future providers require explicit review before enablement.

## 5. Email and password authentication

### 5.1 Email verification

Email verification is required before an email/password account is treated as fully verified for normal authenticated VECTOR use.

An unverified email address must not be treated as equivalent to a verified authentication identity for linking or security-sensitive account decisions.

### 5.2 Password baseline

VECTOR password policy:

```text
Minimum length:             12 characters
Mandatory character sets:  none
Passphrases:                allowed
Periodic forced rotation:   prohibited by default
Compromised-password check: required when supported by the active auth plan/provider
```

VECTOR must not require arbitrary uppercase/lowercase/number/symbol composition merely to satisfy a complexity checklist.

Long password-manager generated passwords and long passphrases must remain valid choices.

### 5.3 No routine forced password rotation

VECTOR does not require password changes on a fixed 30/60/90-day schedule.

A password change may instead be required or initiated because of:

- user request;
- account recovery;
- suspected compromise;
- confirmed security incident;
- another explicitly approved security response.

### 5.4 Compromised-password protection

When the active authentication provider/plan supports rejection of known compromised passwords, that protection must be enabled for VECTOR.

Lack of that provider feature must not be hidden by claiming the check occurred.

### 5.5 Password storage boundary

VECTOR application code must never store plaintext user passwords or create a parallel VECTOR password database outside the approved authentication provider.

Application logs, audit records, telemetry and support tooling must never record passwords.

## 6. Password change and reset

### 6.1 Authenticated password change

Changing an existing password is a security-sensitive action.

VECTOR requires a sufficiently fresh authenticated context and the approved provider's current-password or re-authentication mechanism where applicable.

A stale session alone must not be treated as sufficient assurance for a high-risk password change.

### 6.2 Forgotten-password recovery

Public password-reset behavior must not reveal whether an email address belongs to a VECTOR account.

The user-facing response must remain generic, for example:

```text
If an account exists for this email address, a recovery message has been sent.
```

The recovery link/flow must use an approved redirect target and provider-issued recovery state.

### 6.3 Recovery does not reassign ownership

Recovery of authentication access must not automatically:

- assign another user's VECTOR ownership;
- relink a conflicting social identity;
- promote an unverified Game Identity;
- bypass an existing identity conflict.

Ambiguous recovery is fail-closed and requires further verified recovery or review.

## 7. Multi-factor authentication

### 7.1 User policy

For normal VECTOR users:

```text
MFA enrollment: optional
MFA recommendation: strong
MFA after enrollment: enforced for subsequent authentication according to the provider flow
```

A user who has elected to protect the account with MFA must not be silently downgraded to password/social-login-only authentication merely for convenience.

### 7.2 SYSTEM_ADMIN policy

For `SYSTEM_ADMIN`:

```text
MFA: mandatory
Required assurance for privileged actions: AAL2 or approved stronger successor
```

Administrative authorization remains a separate server-side authorization decision. MFA alone does not grant `SYSTEM_ADMIN` authority.

### 7.3 MFA factor in v1.1

VECTOR v1.1 requires support for:

```text
TOTP Authenticator App
```

Phone/SMS MFA is not required for v1.1.

Future factors, including hardware-backed authenticators/passkeys, may be introduced through an approved successor/amendment.

### 7.4 Factor removal

Removing an MFA factor is a security-sensitive action and requires an appropriately elevated/current authenticated session.

If factor removal would violate the mandatory MFA policy for a privileged account, VECTOR must block completion until the account remains compliant.

## 8. Assurance and re-authentication

VECTOR distinguishes:

```text
Re-authentication
!=
AAL2
```

Re-authentication proves recent control of an accepted login method. AAL2 proves that the current session has satisfied an approved second-factor requirement.

### 8.1 AAL2-required operations

At minimum, VECTOR requires AAL2 for:

- privileged `SYSTEM_ADMIN` operations;
- removal of an enrolled MFA factor where elevated assurance is required;
- other operations explicitly classified as AAL2-required by an approved security rule.

### 8.2 Fresh-authentication operations

The following require fresh authentication and may additionally require AAL2 based on current account risk/policy:

- changing the account email;
- changing the password;
- linking a new login provider;
- unlinking a login provider;
- changing the preferred/primary login identity;
- high-risk account recovery.

The implementation must not treat a long-lived existing session as permanent proof of user presence for these operations.

## 9. Social authentication

### 9.1 Provider flow

Social authentication uses the approved authentication provider's OAuth/OIDC integration and VECTOR's canonical callback path.

Provider identity information used for account decisions must originate from the verified authentication flow/session, not from a freely editable client form.

### 9.2 Provider secrets

OAuth/OIDC client secrets, provider refresh tokens and other privileged credentials must not be exposed to the public frontend or committed to the repository.

### 9.3 Provider enablement

A listed provider becomes operational only when its configuration, callback/redirect behavior, required scopes and security gates are validated for the target environment.

A provider being listed in this policy does not authorize an incomplete or insecure Production configuration.

## 10. Login identity linking

### 10.1 Canonical VECTOR linking model

Manual, authenticated linking is the canonical VECTOR account-management flow:

```text
existing authenticated VECTOR account
-> user explicitly requests provider link
-> approved provider authentication flow
-> verified provider identity
-> link to same canonical auth.users identity
-> audit
```

### 10.2 Automatic provider linking

VECTOR must not rely on automatic same-email provider linking as its own authority for ownership/reconciliation decisions.

If the underlying authentication provider performs supported automatic linking, VECTOR must treat the resulting provider state as authentication-provider state and reconcile its own identity mirror accordingly.

An unverified email must never be accepted by VECTOR as sufficient evidence for cross-provider account ownership.

### 10.3 Uniqueness

A provider subject already bound to another canonical VECTOR user must not be silently reassigned.

Such a case is a conflict and must fail closed.

## 11. Login identity unlinking

### 11.1 Last-login protection

VECTOR must prevent unlinking when doing so would leave the user without a valid remaining authentication method.

### 11.2 Fresh assurance

Login identity unlinking requires fresh authentication and, where the account/risk policy requires it, AAL2.

### 11.3 Soft revoke and audit

VECTOR-side identity mirrors use revocation/history semantics rather than silently deleting security history.

A successful unlink is auditable.

### 11.4 Provider state is authentication truth

If provider unlink succeeds but VECTOR mirror finalization fails, the authentication provider remains authoritative for actual login capability and VECTOR must reconcile its mirror without pretending the provider link still functions.

## 12. Session and logout security

### 12.1 Approved session authority

VECTOR uses the authentication provider's session/tokens as the authentication source and must validate authentication server-side for protected operations.

Client UI state alone is never sufficient proof of authentication or privilege.

### 12.2 Logout

VECTOR must support normal logout of the active session.

Security-sensitive account workflows may require revocation or refresh of affected sessions when credentials, factors or linked identities materially change.

The exact global session lifetime and all-device logout behavior remain implementation/configuration decisions to be validated against the approved auth provider before FROZEN unless separately specified.

### 12.3 Session anomaly handling

Invalid, expired, revoked or inconsistent sessions fail closed.

VECTOR must not reconstruct authentication from stale local UI state.

## 13. Callback and redirect security

### 13.1 Canonical callback

VECTOR maintains one canonical authentication callback implementation per supported environment architecture rather than parallel competing callback implementations.

### 13.2 Production redirect allowlist

Production authentication redirects must use explicitly approved Production URL/path destinations.

Arbitrary user-controlled external redirect destinations are prohibited.

### 13.3 Preview and development redirects

Development and Vercel Preview redirects may use separately approved patterns needed for those environments but must not weaken the exact Production redirect policy.

### 13.4 Internal return path

Any post-authentication return/continue destination accepted by VECTOR must be validated as an allowed internal destination. It must not become an open redirect to arbitrary external origins.

### 13.5 Callback failure

Provider cancellation, invalid callback state, expired flow, session change or other callback failure must return a controlled authentication error and must not partially link an identity as if authentication had succeeded.

## 14. Security-sensitive data handling

VECTOR must never request, ingest or persist as application-owned secrets:

- RSI passwords;
- RSI 2FA codes;
- RSI session cookies;
- provider refresh tokens not required/managed by the approved auth integration;
- social-provider passwords;
- plaintext VECTOR passwords.

Browser-visible errors and logs must not expose tokens, secrets or callback credentials.

## 15. Audit

Security-sensitive authentication events are auditable where technically applicable.

Audit event families include at least:

```text
ACCOUNT_SIGNUP
EMAIL_VERIFIED
LOGIN_IDENTITY_LINKED
LOGIN_IDENTITY_UNLINKED
LOGIN_IDENTITY_PRIMARY_CHANGED
PASSWORD_CHANGED
PASSWORD_RECOVERY_COMPLETED
MFA_ENROLLED
MFA_UNENROLLED
AUTH_SECURITY_CONFLICT
```

Audit records must not contain raw passwords, MFA secrets, reusable tokens or provider secrets.

Routine successful sign-in telemetry may be handled separately from durable security audit if required by privacy/data-retention policy.

## 16. Reconciliation

VECTOR must be able to detect and reconcile inconsistencies between approved authentication-provider state and VECTOR's own identity mirror.

Relevant cases include:

- provider identity exists but VECTOR mirror is missing/inactive;
- VECTOR mirror claims an active provider identity that no longer exists;
- primary/preferred login references a revoked identity;
- provider subject conflicts with another VECTOR user;
- local state did not finalize after successful provider-side link/unlink.

Uncertain identity reassignment must never happen automatically.

Ambiguous cases transition to an explicit conflict/review state and fail closed for ownership-changing operations.

## 17. SYSTEM_ADMIN authentication boundary

`SYSTEM_ADMIN` is authorized server-side and is not derived from:

- display name;
- handle;
- email string alone;
- visible menu state;
- social-provider identity alone;
- client-side flags.

SYSTEM_ADMIN accounts require MFA and AAL2 for privileged operations.

Authentication and authorization remain separate controls.

## 18. Rate limiting and abuse controls

Public authentication endpoints and recovery flows must use the approved provider/platform rate-limiting and abuse-protection capabilities appropriate to the environment.

VECTOR must not weaken provider rate limits in Production merely to simplify testing.

Exact numeric limits are configuration/runtime policy and must be verified against the deployed auth provider before being frozen as constants.

## 19. Privacy and data minimization

Authentication collects and retains only information required for account access, security, linking, audit and the approved user experience.

Provider scopes should be minimized to what the authentication/linking use case requires.

Game-account claims and Star Citizen data are outside this AUTH authority scope except where a Game Identity relationship is referenced for separation or security boundaries.

Retention and deletion obligations remain subject to the applicable privacy/retention specification and law.

## 20. Error behavior

Authentication errors should be user-actionable without exposing security-sensitive internals.

Public flows must avoid account enumeration.

Security ambiguity fails closed.

Examples of internal error classes may include:

```text
AUTH_REAUTH_REQUIRED
AUTH_AAL2_REQUIRED
AUTH_LAST_IDENTITY_BLOCKED
AUTH_PROVIDER_CONFLICT
AUTH_CALLBACK_INVALID
AUTH_RECOVERY_CONFLICT
AUTH_SESSION_INVALID
```

Exact implementation error names may evolve as long as the security semantics are preserved.

## 21. Non-goals

AUTH v1.1 does not define:

- RSI/Citizen Game Identity verification;
- RSI Hangar ownership import;
- Star Citizen handle claims;
- Game Identity claim freshness;
- Crew authorization/RBAC beyond authentication boundaries;
- exact session timeout constants;
- exact provider-side rate-limit numbers;
- SMS MFA as a v1.1 requirement;
- passkeys/hardware security keys as a v1.1 requirement;
- a BSI certification or legal compliance certification.

## 22. External dependency assumptions

VECTOR v1.1 is designed around the approved Supabase Auth integration.

Before implementation/freeze, current provider documentation and deployed-project capabilities must be revalidated for:

- email/password behavior;
- email confirmation;
- identity linking/unlinking;
- MFA/TOTP and AAL behavior;
- password recovery/re-authentication;
- redirect/callback configuration;
- password-security options;
- provider availability and configuration for Discord, Twitch, Google, Apple and Microsoft.

If current provider behavior conflicts with this proposed specification, implementation is blocked until the policy/provider integration is reconciled rather than silently weakened.

## 23. Acceptance Criteria

AUTH v1.1 is ready to freeze only when VECTOR can demonstrate that:

- `auth.users.id` remains the canonical internal authenticated user/ownership identity;
- Authentication Identity and Game Identity remain separate;
- email/password registration requires verified email before normal verified use;
- password minimum length is 12 characters;
- arbitrary composition rules and periodic forced password rotation are not required;
- compromised-password rejection is enabled when supported by the active provider plan;
- public password recovery does not reveal account existence;
- normal users may opt into TOTP MFA and enrolled MFA is enforced;
- SYSTEM_ADMIN accounts require MFA and privileged operations require AAL2;
- password, email and identity-link changes require appropriate fresh authentication;
- linking uses verified provider/session identity rather than editable provider subjects;
- last-login removal is blocked;
- identity conflicts fail closed;
- Production redirects are explicitly allowlisted and arbitrary external redirects are impossible;
- audit records contain no passwords, MFA secrets or reusable provider secrets;
- Authentication and Game Identity responsibilities are not duplicated across specifications;
- Discord, Twitch, Google, Apple and Microsoft provider configurations are individually validated before Production enablement.

## 24. Open implementation decisions before FROZEN

The following are intentionally not guessed in this PROPOSED version and require environment/provider validation:

1. exact session lifetime and idle/absolute timeout policy;
2. exact global/all-device session revocation behavior after password recovery/change;
3. exact Supabase plan capability for compromised-password protection at Production launch;
4. exact approved Vercel Preview redirect pattern;
5. whether automatic provider linking is disabled in configuration or merely treated as non-authoritative by VECTOR reconciliation;
6. final UI/UX for MFA enrollment, recovery and factor removal;
7. whether stronger phishing-resistant factors/passkeys become required in a later auth version.

These decisions must be closed or explicitly deferred with safe defaults before FROZEN approval.

## 25. R2 remediation classification

For Rule Set Review finding R2:

```text
AUTH_V1_1.md
Classification: CONSOLIDATE + REQUIRED
Authority Scope: AUTH
Status: PROPOSED
```

This proposal consolidates the existing authentication rules into one intended normative home while deliberately leaving Star Citizen Game Identity to a separate specification.

R2 is not fully resolved until all other missing/referenced normative specifications have been classified and reconciled.

## 26. Proposed Decision

VECTOR Authentication v1.1 is **PROPOSED**.

It becomes eligible for FROZEN only after:

- open implementation decisions are closed or safely deferred;
- provider configuration/capabilities are validated;
- interaction with `GAME_IDENTITY_V1.md` is defined without duplicated authority;
- `RULE_INDEX.md` is updated to register AUTH v1.1 as PROPOSED and later FROZEN;
- review on `develop` is complete;
- applicable authentication/security tests pass;
- approval by `project_owner`;
- merge through the normal VECTOR governance process to `main`.
