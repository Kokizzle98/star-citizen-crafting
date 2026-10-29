# VECTOR Platform Critical Actions v1

**Status:** FROZEN  
**Version:** 1.0  
**Scope:** Security and execution rules for destructive, irreversible or platform-wide administrative actions in VECTOR

## 1. Purpose

This document defines the binding safety model for VECTOR platform-critical actions.

Platform-critical actions are operations that can materially alter or destroy platform state, security state, ownership relationships, large data domains or administrative configuration. They require safeguards beyond normal authenticated CRUD.

This document freezes domain and security invariants. It does not freeze the final UI implementation, SQL schema, RPC names or challenge-token storage mechanism.

## 2. Platform action versus Star Citizen game wipe

VECTOR strictly separates:

```text
VECTOR PLATFORM CRITICAL ACTION
!=
STAR CITIZEN GAME WIPE
```

A Star Citizen game wipe is governed by `GAME_WIPE_MODEL_V1.md` and changes configured game-state domains.

A platform-critical action may affect VECTOR-owned platform state and therefore requires its own explicit authorization and security flow.

Game-wipe authorization must never implicitly grant platform-wipe or platform-destructive authority.

## 3. Critical-action classification

An operation is platform-critical when failure, misuse or accidental execution could cause material security or data loss impact.

Examples include:

- platform-wide wipe/reset;
- destructive bulk deletion;
- irreversible administrative migration;
- mass ownership/state mutation;
- destructive reconciliation override;
- security-policy reset;
- bulk credential/provider revocation where material;
- critical authorization/role mutation;
- other explicitly classified high-impact administrative operations.

Not every administrative action is automatically platform-critical. Classification is based on impact and reversibility.

## 4. Dedicated permission boundary

Platform-critical actions require an explicit dedicated authorization capability.

Binding rules:

- ordinary authentication is insufficient by itself;
- ordinary Crew roles are insufficient;
- ownership of a Crew is insufficient;
- a functional Crew role is insufficient;
- game-wipe administration is insufficient;
- platform-critical permission must be evaluated server-side;
- frontend visibility is not the security boundary.

The exact permission code/name may evolve, but a distinct critical-action authorization boundary is mandatory.

## 5. Mandatory safety chain

A destructive platform-critical action must follow the applicable safety chain:

```text
Authorize
-> Define scope
-> Dry Run / Impact Preview
-> Validate prerequisites
-> Step-up authentication
-> Typed confirmation
-> One-time server challenge
-> Backup gate where required
-> Execute server-side
-> Audit result
```

No normal browser CRUD interaction may bypass this chain for an action classified as platform-critical.

## 6. Dry run and impact preview

A non-mutating dry run is mandatory before destructive execution.

The dry run must provide enough information to understand the intended impact, where applicable including:

- action type;
- selected scope;
- affected domains;
- estimated/identified affected records;
- preserved domains or exclusions;
- validation failures;
- dependencies/blockers;
- configuration/request identity or equivalent immutable fingerprint.

The dry run must not itself perform the destructive action.

## 7. Scope locking

The action executed must match the action reviewed.

Binding rules:

- scope must not silently change between preview and execution;
- security-sensitive execution parameters must be integrity-protected or compared against the approved request;
- if the requested scope changes materially, a new preview/approval flow is required;
- stale or mismatched challenges must be rejected.

## 8. Step-up authentication

Platform-critical execution requires fresh step-up authentication appropriate to the user's actual authentication methods.

Binding rules:

- being logged in is not sufficient;
- step-up must establish recent/fresh proof of user control;
- the mechanism must work for users whose account is authenticated exclusively through a social/provider identity;
- the system must not require a password confirmation from a user who has no VECTOR password credential;
- provider-based accounts require an appropriate provider/re-authentication or MFA-based step-up flow;
- direct E-mail/password accounts may use an appropriate password/MFA step-up flow according to Auth policy;
- when MFA/AAL policy requires stronger assurance, the critical action must enforce it server-side.

The detailed E-mail/password and 2FA/MFA design belongs to the Auth specification.

## 9. Typed confirmation phrase

Destructive platform-critical actions require an explicit typed confirmation phrase where applicable.

Binding rules:

- confirmation text must be action-specific enough to reduce accidental execution;
- a generic OK/Yes click is insufficient for high-impact destructive actions;
- native browser `confirm()` or `prompt()` dialogs must not be used;
- confirmation is part of the application-owned critical-action flow;
- typing the phrase does not replace authorization or step-up authentication.

## 10. One-time server challenge

Execution requires a server-issued one-time challenge/token or equivalent one-time authorization mechanism.

Binding properties:

- issued only after required preconditions are met;
- short-lived;
- single use;
- bound to the requesting authenticated user;
- bound to the intended action and scope;
- verified server-side during execution;
- invalidated after successful use or expiry;
- must not be reusable for a different critical action.

Exact token format and storage implementation are not frozen.

## 11. Backup gate

Where the affected platform state is recoverable through backup, critical destructive execution requires a backup gate.

The gate must verify the applicable recovery prerequisite before destructive execution proceeds.

Depending on the operation, this may require evidence that:

- an acceptable backup/snapshot exists;
- the backup is sufficiently recent for the operation;
- the backup process completed successfully;
- recovery metadata/reference is recorded with the action.

Exact backup technology and acceptable freshness policy remain implementation/security-policy details.

If an operation is inherently non-restorable, the UI and audit trail must explicitly communicate that characteristic rather than pretending backup recovery exists.

## 12. Server-side execution boundary

Platform-critical mutations are executed through controlled server-side operations.

Prohibited patterns include:

- unrestricted client-side mass deletion;
- exposing privileged service credentials to the browser;
- direct browser access to admin/service-role keys;
- trusting client-provided authorization assertions without server verification;
- using UI state as proof of permission.

The server operation must independently validate authorization, challenge, scope and other required gates.

## 13. Privileged credentials

Service-role/admin credentials and provider secrets are server-only.

Binding rules:

- privileged secrets must never be embedded in public client bundles;
- secrets must not be written into public Git history;
- client requests may identify the desired action but may not receive backend master credentials;
- credential rotation/revocation is handled separately from action audit history.

## 14. Idempotency

State-changing critical actions require an idempotency strategy when retries are possible.

Binding principle:

> Repeating the same authorized request must not unpredictably multiply destructive effects.

The final mechanism may use an idempotency key, execution identifier or equivalent server-side approach.

Execution state must allow the system/operator to distinguish a new request from a retry of an existing request.

## 15. Audit logging

Every attempted platform-critical action must produce an auditable event appropriate to its sensitivity.

The audit trail must be able to establish, where applicable:

- requesting actor/internal user identity;
- action type;
- scope/reference;
- request/execution identifier;
- time of request/execution;
- dry-run/preview reference;
- step-up/challenge result without storing secret material;
- backup-gate result/reference where required;
- execution result;
- failure reason/status;
- relevant before/after summary or snapshot references when policy requires them.

Audit history must not contain raw passwords, MFA secrets, provider secrets or reusable privileged tokens.

## 16. Failure handling

A critical action must fail closed.

If a mandatory prerequisite cannot be verified:

- execution is blocked;
- the system must not guess or bypass the missing requirement;
- failure is surfaced to the authorized operator;
- the failed attempt remains auditable where appropriate.

If execution partially fails:

- it must not be reported as fully successful;
- completed and failed work must remain distinguishable;
- retry/compensation must use controlled server-side logic;
- operators must not be instructed to perform ad-hoc destructive database edits as the normal recovery path.

## 17. Concurrency and duplicate execution

The system must protect critical actions from accidental parallel or duplicate execution where concurrent runs could produce inconsistent state.

An implementation may use locking, execution-state checks, concurrency keys or equivalent mechanisms.

The exact technology is not frozen.

## 18. Reversibility classification

Critical actions should be classified by reversibility, for example:

```text
REVERSIBLE
RESTORABLE_FROM_BACKUP
IRREVERSIBLE
```

The classification controls user/operator warnings and applicable gates.

A reversible action must not be described as irreversible, and an irreversible action must not be presented as safely reversible.

## 19. Platform wipe

A VECTOR platform wipe is one of the highest-risk critical actions.

Binding rules:

- requires dedicated critical permission;
- requires dry run/impact preview;
- requires fresh step-up authentication;
- requires typed confirmation;
- requires one-time server challenge;
- requires backup gate where recovery is expected/possible;
- requires idempotency/execution identity;
- requires audit logging;
- is executed server-side;
- must never be triggered by ordinary Star Citizen game-wipe processing.

## 20. Critical role and permission changes

Mutations that could grant or remove platform-wide critical authority may themselves be classified as critical.

Binding principles:

- privilege escalation must be server-authorized;
- a user must not be able to grant a permission that the authorization model does not allow that user to administer;
- self-escalation is prohibited unless explicitly defined by a higher-trust bootstrap procedure;
- critical permission mutation must be audited.

Exact role hierarchy and bootstrap process remain separate security architecture concerns.

## 21. Provider/account actions

Provider linking/unlinking may be security-sensitive but is not automatically equivalent to a platform wipe.

For critical cases, security policy may require step-up authentication before:

- removing the last viable authentication identity;
- changing primary recovery/authentication state;
- revoking a privileged provider relationship;
- performing other account-security mutations classified as critical.

Primary Auth and Game Identity remain separate concepts according to `AUTH_V1_1.md`.

## 22. Social-only users

Critical-action design must explicitly support users without a local password.

Binding rule:

> "Enter your current VECTOR password" cannot be the universal security gate.

For social-only/provider-only accounts, the system must use an applicable reauthentication or MFA/assurance flow that can prove recent control without inventing a nonexistent password credential.

## 23. MFA/AAL integration

VECTOR's direct E-mail/password authentication requires a separate mini-design including 2FA/MFA before implementation.

Platform-critical actions must be compatible with that future policy.

Once an action or administrative role requires stronger assurance, authorization checks must enforce the required assurance server-side, not merely display an MFA prompt in the UI.

## 24. Session freshness

A long-lived authenticated session alone must not authorize a critical destructive action indefinitely.

The implementation must apply a freshness requirement to step-up proof/challenge issuance.

Exact acceptable age is a security-policy implementation detail and is intentionally not frozen in v1.

## 25. User experience

The critical-action UI must make destructive scope explicit.

Binding UX principles:

- clear action title and impact summary;
- clear distinction between preview and execution;
- no misleading primary-action labels;
- typed confirmation where required;
- visible failure/blocking prerequisite messages;
- keyboard accessibility and VECTOR focus rules;
- no native browser prompt/confirm workflow;
- cancellation must remain available until execution begins where technically safe.

## 26. LIVE/PTU and dataset isolation

Dataset-dependent critical actions must respect strict channel isolation.

- LIVE and PTU records must not be mixed in one dataset-scoped destructive operation unless the operation is explicitly platform-wide and separately enumerates both scopes.
- Cross-channel fallback is prohibited.
- Any dataset/build scope shown in preview must match execution scope.
- Dataset incompleteness must fail closed where completeness is required to determine safe impact.

## 27. No-guess rule

VECTOR's global No-Guess principle applies with heightened importance to critical actions.

If identity, scope, ownership, affected-record classification, backup readiness or required security state is uncertain, execution is blocked or the uncertainty is explicitly resolved before proceeding.

Unknown must never be interpreted as safe-to-delete.

## 28. Separation from normal CRUD

Normal CRUD and platform-critical actions follow different risk flows.

A normal authorized edit may use standard application mutation patterns.

A critical action must not be downgraded to ordinary CRUD merely for implementation convenience.

Conversely, not every normal edit should be forced through the complete critical-action flow.

## 29. Automation

Automation may initiate or prepare critical-action workflows only if all required authorization/safety properties remain satisfied.

A scheduled job, GitHub Action, worker or external integration must not bypass:

- required authorization;
- scope validation;
- backup gate;
- execution safety;
- audit requirements.

Human step-up/typed confirmation requirements may make some critical actions intentionally non-automatable.

## 30. Notifications

Security policy may add out-of-band notifications for critical actions.

Notification delivery is a supporting control and never substitutes for authorization, step-up authentication, one-time challenge or audit logging.

Exact notification channels are not frozen by this document.

## 31. Data integrity invariants

A conforming implementation preserves at least these invariants:

1. Critical permission is distinct from ordinary Crew/application authorization.
2. A game-wipe permission never implies platform-wipe permission.
3. Destructive critical actions have a non-mutating preview before execution.
4. Reviewed scope and executed scope cannot silently diverge.
5. Step-up authentication is fresh and compatible with the user's actual authentication identities.
6. Social-only users are not required to prove possession of a nonexistent VECTOR password.
7. One-time challenges cannot be replayed for another action.
8. Backup prerequisites are validated where recovery depends on backup.
9. Critical mutations execute server-side.
10. Privileged credentials are never exposed to the browser/public repository.
11. Duplicate/retry execution is controlled through idempotency/equivalent protection.
12. Every critical attempt/result is auditable without logging secret material.
13. Mandatory prerequisite uncertainty blocks execution.
14. Platform wipes cannot be triggered as a side effect of Star Citizen game wipes.

## 32. Non-goals

This specification does not freeze:

- exact permission names;
- final admin-role hierarchy;
- exact challenge-token encoding;
- exact step-up provider API calls;
- MFA factor type or exact assurance threshold;
- backup vendor/technology;
- backup freshness duration;
- final PostgreSQL/RPC schema;
- final admin UI layout;
- notification channels;
- exact locking/idempotency technology.

These are implemented under this frozen safety model and may receive separate FROZEN specifications.

## 33. Acceptance criteria

An implementation conforms to Platform Critical Actions v1 when it can demonstrate that:

- an ordinary authenticated user cannot execute a platform wipe;
- a Crew OWNER cannot execute a platform wipe based only on Crew ownership;
- a game-wipe operator cannot execute a platform wipe based only on game-wipe authority;
- a dry run shows the proposed destructive scope without mutating state;
- changed scope invalidates or requires regeneration of the critical execution challenge;
- stale/reused challenges are rejected;
- a social-only user can complete an appropriate step-up without a fake password requirement;
- failed backup validation blocks backup-dependent destructive execution;
- privileged execution credentials are server-only;
- duplicate execution is safely detected/controlled;
- critical failures remain observable and auditable;
- audit records omit passwords and reusable secret material;
- Star Citizen game-wipe execution cannot invoke platform wipe logic implicitly.

## 34. Frozen decision

VECTOR Platform Critical Actions v1 is **FROZEN**.

This document modernizes the critical-action security principles from the legacy V2 architecture and aligns them with current VECTOR Auth, Governance, Persistence & Provenance, Game Wipe, Dataset Isolation and No-Guess rules.

Where legacy drafts conflict with newer VECTOR-wide FROZEN rules, the newer FROZEN rules take precedence.

Material amendments require a successor version and the normal VECTOR Governance process.
