# VECTOR AI Operating Model v1

- **Status:** OPERATIONAL (non-normative)
- **Version:** 1.1
- **Scope:** roles, decision authority and source-of-truth boundaries for the people and AI agents who work on VECTOR
- **Does not override:** any FROZEN specification in `docs/frozen/`, the authority order in `docs/RULE_INDEX.md`, or the Production write gates in `docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md`

## 1. Purpose

VECTOR is built by one owner together with several AI agents. This document is the repository-native, engineering-facing part of that operating model. It contains only the non-private contracts an engineering or review agent needs. The owner's private Project Lead operating contract lives outside the repository and is not repository evidence; nothing here depends on copying it. Microsoft 365 Copilot no longer holds any role in this operating model.

## 2. Roles

| Role | Held by | Primary responsibility |
|---|---|---|
| Owner | the project owner | Final decision authority. Approves work packages, merges, freezes and every Production mutation. |
| VECTOR Project Lead | Claude (Fleet Commander, Claude project VECTOR – 01 Fleet Commander) | Project leadership, architecture, concepts, governance, decision preparation, work-package definition, evidence evaluation, handoffs to engineering and review agents. |
| Primary Engineer | Claude (Claude project Vector Terminal - GitHub / Claude Code) | Code-near implementation of approved work packages: code, tests, migrations as reviewed files, documentation, pull requests. |
| Independent Reviewer | GitHub Copilot (optional, punctual) | Optional, punctual independent Stability, Maintainability and Security review of pull requests, plus targeted optimization. |

The Project Lead prepares decisions; it does not take them. The Primary Engineer implements; it does not approve its own work. The Independent Reviewer reviews; it does not merge. The owner decides.

## 3. Source-of-truth boundary

1. **GitHub repository.** The shared, versioned technical knowledge base. Authority inside the repository follows `docs/RULE_INDEX.md` and `AGENTS.md`: FROZEN specifications first, then repository and lifecycle information, then PROPOSED specifications, then reviews and handovers, then chat history.
2. **Runtime systems.** Supabase and Vercel are authoritative for directly observed runtime state. Directly observed runtime evidence can invalidate a repository assumption. Such an observation is recorded explicitly (precheck, review or pull request) and never reconciled silently.
3. **OneDrive.** A private supplementary layer for transport, project documents, evidence snapshots, backup, recovery, research and design. It never competes with GitHub as technical truth, is never part of build or deployment, and holds only commit-bound copies of repository state. When a OneDrive snapshot and `origin/develop` disagree, Git wins; the snapshot is stale.
4. **Chat memory.** Contextual assistance only. It never replaces current Git evidence.

The compact current project state is `docs/PROJECT_STATE.md`. The recovery control block and drift procedure are in `docs/handover/VECTOR_RESTART_HANDOVER.md`. Commit-bound evidence for the Project Lead is produced by the generator described in `docs/governance/PROJECT_LEAD_EVIDENCE.md`.

## 4. Engineering contracts

- **Evidence first.** Verify the repository state (branch, HEAD, remote, working tree) before changing it. Report what was observed, not what was expected.
- **Stop when blocked.** When a precondition fails, a FROZEN rule conflicts with the task, or a critical design contract cannot be derived from the repository or the assignment, stop, report `BLOCKED` with exact evidence and the smallest required decision, and do not improvise around governance.
- **No Production bypass.** Every mutation of the Supabase Production environment needs a separate explicit owner GO and follows `DB-ENV-01` to `DB-ENV-09`. UI state is never the security boundary.
- **One work package per conversation.** The repository, not the chat, is the record. Work on a feature branch, open a pull request against `develop`, never push to `develop` or `main` directly.
- **Smallest sufficient effort.** Use the smallest model, context and review effort that answers the question; escalate only for architecture, data-model or security decisions (`docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`).
- **No guessing.** Missing or uncertain data stays visible as an explicit review state. LIVE and PTU datasets stay isolated.
- **Plain language.** Explain changes so that a system administrator who is not a developer can follow them.

## 5. What this document must never contain

Private OneDrive paths, personal information, account identifiers, credentials, tokens, secrets, database dumps, or private Security Evidence. The same exclusions apply to every evidence file generated from the repository.

## 6. Related documents

- `AGENTS.md`: entry point for contributors and coding agents.
- `docs/RULE_INDEX.md`: rule registry and conflict rule.
- `docs/PROJECT_STATE.md`: compact current project state.
- `docs/governance/PROJECT_LEAD_EVIDENCE.md`: commit-bound Project Lead evidence generator.
- `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`: effort routing, review gates and checkpoint policy.
- `docs/handover/VECTOR_RESTART_HANDOVER.md`: recovery control block and drift procedure.
