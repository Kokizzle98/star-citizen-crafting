# Archive Notice

**Archive Status:** REVIEW_RECORD  
**Authority:** NON_BINDING  
**Review Date:** 2026-10-29  
**Reviewed Baseline:** `main (c8a4ff8)` and `develop (76cc990)`  
**Review Type:** Static rule/documentation review  
**Current Role:** Historical review evidence and remediation input

## Purpose of this archived review

This document preserves the original independent rule-set review unchanged. It is evidence of the findings identified against the stated repository baseline and must not itself be treated as a VECTOR FROZEN specification.

The findings are remediation inputs. A finding becomes resolved only when the applicable current VECTOR specification, governance rule, rule index, repository instruction entry point, or migration contract is updated and reviewed through the normal governance process.

## Planned remediation track

The review identified six areas to address:

1. deterministic precedence and conflict resolution for FROZEN rules;
2. discoverable status for referenced but absent specifications;
3. explicit LIVE/PTU preview boundaries between Dataset Context, Production User State and Preview Result;
4. reconciliation of migration gates with README requirements and actual repository paths;
5. a lightweight but explicit FROZEN approval/lifecycle model and ADR location;
6. a concise contributor/coding-agent entry point linked to the rule index.

## Authority rule

Current `docs/frozen/` specifications and the current VECTOR governance rules remain authoritative. This review does not override them. `docs/proposed/` remains non-binding until explicitly approved and frozen. Legacy material remains historical unless a current authoritative specification explicitly incorporates a rule.

## Preservation rule

The original review below is preserved unchanged. Do not rewrite historical findings after remediation. Instead, record remediation in current specifications and, if useful, create a later follow-up review against the new repository baseline.

---

# Original review

# VECTOR Rule Set Review

**Review date:** 2026-10-29  
**Reviewed baseline:** `main` (`c8a4ff8`) and `develop` (`76cc990`)  
**Review type:** Static review of project rules and their documentation; runtime behavior was not audited.

## Executive summary

VECTOR has a strong foundation: the FROZEN specifications consistently protect provenance, distinguish game state from platform state, prohibit guessed or cross-channel data, and define acceptance criteria. The legacy handover is explicitly marked non-binding, and the proposed documents are clearly labeled as proposals.

The rules are not yet a complete, self-resolving rule set. The main risks are that there is no defined precedence among conflicting FROZEN documents, several FROZEN documents depend on specifications that are absent, and the LIVE/PTU model leaves an important calculation boundary ambiguous. The migration proposal also needs alignment with the repository's actual migration layout and the README's staging rule before it can become binding.

No policy or implementation files were changed as part of this review. The only change is this report.

## Findings

### R1 — No deterministic precedence between conflicting FROZEN rules

**Priority:** High  
**Type:** Governance gap

Governance says FROZEN rules in `main` are the approved Production rules and defines how a material change is versioned, but it does not say how to resolve a conflict between two simultaneously FROZEN specifications. Several documents refer to “newer” rules taking precedence without defining whether “newer” means document version, freeze date, merge order, or an explicit supersession relationship.

**Evidence:** `docs/frozen/VECTOR_GOVERNANCE_V1.md:45-48,129-140`; `docs/frozen/PERSISTENCE_PROVENANCE_V1.md:408`; `docs/frozen/FLEET_DATA_MODEL_V1.md:311`; `docs/frozen/GAME_WIPE_MODEL_V1.md:504`.

**Impact:** A contributor can follow two individually binding rules and still produce incompatible behavior. The result may depend on which file the reader happens to find first.

**Recommendation:** Add a canonical rule index and a conflict-resolution clause. Require each FROZEN specification to declare its authority scope and any superseded rules by document/version/section. Do not rely on document recency as an implicit override.

### R2 — Binding specifications refer to absent policies

**Priority:** High  
**Type:** Coverage and traceability gap

The FROZEN rule set references policies that are not present in the repository's current `docs/frozen/` or `docs/proposed/` sets. Examples include `AUTH_V1_1.md`, `DATASET_PIPELINE_V1.md`, `LOCATION_RULES_V1.md`, and `FLEET_PLANNING_V1.md`. Other references use “Dataset Isolation” and “No-Guess” as if they were global policies, but there is no standalone normative document defining their scope and precedence.

**Evidence:** `docs/frozen/VECTOR_GOVERNANCE_V1.md:93-96`; `docs/frozen/FLEET_DATA_MODEL_V1.md:223`; `docs/frozen/PLATFORM_CRITICAL_ACTIONS_V1.md:312,366`; `docs/frozen/PERSISTENCE_PROVENANCE_V1.md:408`.

**Impact:** Important decisions—especially auth/game identity, location fallback, dataset activation, fleet-plan status, and shared invariants—lack a discoverable authoritative home. Readers cannot reliably determine whether an unresolved point is intentionally deferred or accidentally undocumented.

**Recommendation:** Add a rule index with `present / proposed / planned / retired` status for every referenced specification. For each absent policy, either create the normative document or replace the reference with the currently binding rule and mark unresolved behavior explicitly as blocked/deferred.

### R3 — LIVE/PTU calculation boundary is ambiguous

**Priority:** High before freezing the proposed model  
**Type:** Cross-document semantic conflict

Versioning v1 says LIVE and PTU records, derived values, and calculation inputs must never be mixed in one active dataset context, and that switching channels changes all channel-dependent calculations. The proposed Data Context Model also permits a PTU calculation to use the user's Production inventory/assets as its selection basis. It distinguishes that user state from PTU ownership, but does not define whether that combination is permitted by the FROZEN no-mixing rule.

**Evidence:** `docs/frozen/VECTOR_VERSIONING_V1.md:149-155`; `docs/proposed/DATA_CONTEXT_MODEL_V1.md:72-74,91-113,311-313`.

**Impact:** Implementers may either reject a useful PTU preview as cross-channel mixing or accidentally present Production ownership as PTU state. The proposal is non-binding today, so this is a freeze blocker rather than a current Production-rule change.

**Recommendation:** Define separate typed concepts for `dataset context`, `user-state context`, and `preview result`. State exactly which combinations are allowed; require preview outputs to be labeled and provenance-linked to both contexts; explicitly prohibit mutating Production state or asserting PTU ownership from the preview.

### R4 — Migration gates and repository paths need reconciliation

**Priority:** Medium  
**Type:** Pending policy conflict and implementation mismatch

The README states that database migrations must be validated in staging first. The proposed Migration Test Contract requires local validation for `NORMAL` migrations but specifically requires Preview/staging validation for `ELEVATED` and `CRITICAL` migrations. Those rules need reconciliation before the proposal is frozen. The proposal also uses `supabase/...` paths for migrations, tests, and CI triggers, while the repository currently stores migration documentation under `database/migrations/identity/`.

**Evidence:** `README.md:117,150-151`; `docs/proposed/MIGRATION_TEST_CONTRACT_V1.md:35-64,95-147,449-453,564-566`. Current repository path: `database/migrations/identity/README.md`.

**Impact:** If adopted as written, a normal migration could pass the proposed gate while violating the README rule, and CI path filters could fail to run for the repository's actual migration files.

**Recommendation:** Decide whether staging is required for every migration or selected by risk. Then update the README and contract together. Bind the manifest, tests, postchecks, and workflow path filters to the repository's actual migration layout (or explicitly migrate the layout first).

### R5 — Freeze approval and rule lifecycle are underspecified

**Priority:** Medium  
**Type:** Governance quality gap

Governance says a FROZEN rule is binding “after approval” and that reviewed/release-approved changes enter `main`, but it does not define the approving role, minimum review evidence, status transition procedure, or how a document becomes FROZEN. The listed status values are recommendations rather than a required schema. Governance recommends `docs/adr/`, but the repository currently has no `docs/adr/` directory; historical ADR material is under `docs/architecture/legacy/`.

**Evidence:** `docs/frozen/VECTOR_GOVERNANCE_V1.md:45-48,75-117,129-147,177-188`.

**Impact:** “FROZEN” can be applied inconsistently, and material rule changes may have no durable decision record beyond the document edit and merge.

**Recommendation:** Specify required status metadata and transition evidence (owner, approver, date, scope, supersedes, linked PR/ADR). Choose and implement one ADR location, then link the ADR from the affected specification.

### R6 — No repository-level instruction entry point for contributors or coding agents

**Priority:** Medium  
**Type:** Discoverability and consistency gap

The repository has detailed domain specifications, but no `AGENTS.md`, Copilot instruction file, or equivalent concise entry point was found. The README contains useful safety rules but does not link to the rule hierarchy or explain which documents a contributor should consult before changing a domain.

**Evidence:** Repository file inventory; `README.md:148-152`; governance documentation structure at `docs/frozen/VECTOR_GOVERNANCE_V1.md:75-117`.

**Impact:** Contributors and automated coding agents may miss critical rules, read legacy material as current, or fail to understand which tests and release gates apply.

**Recommendation:** Add one short contributor/agent entry point that links to the rule index, explains `FROZEN` versus `PROPOSED` versus `LEGACY_REFERENCE`, requires checking applicable domain policies, and lists validation/release expectations. Keep normative behavior in the existing specifications rather than duplicating it.

## Strengths to preserve

- FROZEN, PROPOSED, and LEGACY_REFERENCE documents are visibly distinguished.
- The legacy handover explicitly disclaims current authority and identifies known conflicts.
- Acceptance criteria and data-integrity invariants make many domain rules testable.
- LIVE/PTU isolation, provenance, completeness, and no-guess behavior are repeated consistently across relevant specifications.
- Game wipes, platform-critical actions, rollbacks, and ordinary application behavior are treated as separate operational domains.
- The reviewed rule documents are present on both `main` and `develop`; no documentation diff between those branches was found.

## Recommended remediation order

1. Publish a rule index and explicit precedence/conflict-resolution policy.
2. Resolve or formally defer the missing referenced policies.
3. Decide and document the LIVE/PTU preview input boundary before freezing Data Context Model v1.
4. Align the migration contract with README requirements and the actual repository paths.
5. Formalize FROZEN approval metadata and the ADR location.
6. Add a concise contributor/agent entry point linked to the rule index.

## Review limitations

This review evaluates documentation structure, rule clarity, cross-document consistency, and repository discoverability. It does not certify that the application, database, workflows, or release procedures conform to the written rules. The two proposed specifications relevant to the findings remain `PROPOSED` and are not treated as Production-authoritative rules.
