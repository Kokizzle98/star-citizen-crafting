# VECTOR Project Lead Evidence v1

- **Status:** OPERATIONAL (non-normative)
- **Version:** 1.0 (evidence format 1.0)
- **Scope:** the commit-bound evidence pipeline from a local Git checkout to the private evidence folder of the VECTOR Project Lead (Microsoft 365 Copilot)
- **Generator:** `scripts/export-project-lead-evidence.ps1`
- **Tests:** `tests/project-lead-evidence.test.mjs`

## 1. Purpose

A new VECTOR Project Lead conversation must be able to reconstruct the current project checkpoint within minutes without live GitHub access and without reading the whole repository. The generator turns a verified local checkout into three small, commit-bound files in the private OneDrive evidence folder:

```text
GitHub / local Git checkout
-> docs/PROJECT_STATE.md and docs/governance/AI_OPERATING_MODEL.md (repository-native)
-> scripts/export-project-lead-evidence.ps1 (local generator, fail-closed)
-> locally validated commit-bound snapshot
-> <OutputRoot>\Evidence\CURRENT (private OneDrive, synchronized by the OneDrive client)
-> M365 Copilot / VECTOR Project Lead
```

## 2. Source-of-truth boundary

- **GitHub** is the shared versioned technical knowledge base. The repository at `origin/develop` is the truth for project state.
- **OneDrive** is a private supplementary layer. The evidence folder holds commit-bound copies only. A snapshot never competes with Git; when the two disagree, the snapshot is stale.
- **Runtime systems** (Supabase, Vercel) are authoritative for directly observed runtime state. Such observations can invalidate repository assumptions and are recorded explicitly.
- The generator never talks to GitHub, the OneDrive API, Microsoft Graph, Supabase or Vercel. It reads the local Git checkout and writes local files. **OneDrive cloud synchronization happens outside the generator**; the generator neither triggers nor verifies it.

Roles and engineering contracts are defined in `docs/governance/AI_OPERATING_MODEL.md`.

## 3. Repository documents involved

- `docs/PROJECT_STATE.md`: compact master state (DONE, ACTIVE, PAUSED, BLOCKED, NEXT, OPEN DECISIONS, RELEVANT CONTRACTS). Maintained by hand with each work package. It is copied byte-identically into the snapshot.
- `docs/governance/AI_OPERATING_MODEL.md`: repository-native, non-private AI operating model.
- Governance sources embedded verbatim into `GOVERNANCE_CONTEXT.md` (fixed allowlist in the generator): `AGENTS.md`, `docs/RULE_INDEX.md`, `docs/governance/AI_OPERATING_MODEL.md`, `docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md`, `docs/handover/VECTOR_RESTART_HANDOVER.md`.

The private Project Lead operating contract stays outside the repository. The snapshot does not contain it and does not depend on it.

## 4. Prerequisites

- Windows with Windows PowerShell 5.1 (the generator is also compatible with newer PowerShell).
- `git` on `PATH`.
- A local clone of the repository with the `origin` remote.
- An existing private output root, for example the Project Lead folder in OneDrive. The generator never creates the root itself and refuses a root inside the repository.
- No credentials, tokens or API keys. The only network action is a bounded `git fetch` of the baseline branch; if it fails (offline), the run continues with the locally cached remote ref and records that.

## 5. Productive command

Run from the repository root on a clean, synchronized `develop`:

```powershell
.\scripts\export-project-lead-evidence.ps1 -OutputRoot "<OutputRoot>"
```

Optional: `-Archive` additionally stores a copy under `Evidence\ARCHIVE` (section 10). `-ValidateOnly` checks the existing CURRENT set without generating. All parameters:

| Parameter | Default | Meaning |
|---|---|---|
| `-OutputRoot` | required | existing private output root |
| `-RepositoryRoot` | parent of `scripts/` | top level of the Git work tree to export |
| `-ExpectedBranch` | `develop` | branch that must be active (isolated tests only) |
| `-BaselineRef` | `origin/develop` | ref local HEAD must equal (isolated tests only) |
| `-Archive` | off | also write an archive copy |
| `-ValidateOnly` | off | validate the existing CURRENT set, no generation |
| `-RecentCommitCount` | 15 | bounded commit list in `VECTOR_EVIDENCE.md` |
| `-TestOnlySimulatePublishFailure` | `None` | test hook for the restore path; never weakens validation |

There is deliberately no `-Force`, `-SkipValidation` or `-AllowDirtyWorkingTree`. The explicit branch and ref parameters only change which baseline an isolated test expects; every fail-closed check still runs.

## 6. The three generated files

`<OutputRoot>\Evidence\CURRENT` contains exactly these files after a successful run, nothing else:

| File | Responsibility |
|---|---|
| `VECTOR_EVIDENCE.md` | Proves which Git state the snapshot represents: format version, Evidence Status, Snapshot ID, normalized remote identity, branch, full local HEAD, baseline ref and its full HEAD, remote-evidence freshness (`FRESHLY_FETCHED` or `LOCALLY_CACHED`), synchronization and working-tree status, UTC timestamp, generator path, bounded recent commits, changed files since the previous valid snapshot (only when a safe predecessor exists), provenance and SHA256 of the exported `PROJECT_STATE.md`, the source list of `GOVERNANCE_CONTEXT.md`, and the explicit statements that this is not live GitHub access and that cloud synchronization is outside the generator. |
| `PROJECT_STATE.md` | Byte-identical copy of `docs/PROJECT_STATE.md` at the Snapshot Commit, taken from the Git object database (`git cat-file`), never summarized or regenerated. |
| `GOVERNANCE_CONTEXT.md` | The allowlisted governance sources embedded verbatim from the Snapshot Commit. Each source section states `Repository Path`, `Snapshot Commit`, `Git Blob`, `SHA256` and is delimited by `----- BEGIN CONTENT <path> -----` and `----- END CONTENT <path> -----`. |

Generated files are UTF-8 without BOM. Local absolute paths are printed on the console only, never written into the evidence.

## 7. Commit semantics

- **Snapshot ID** is `<branch>:<full commit SHA>`, productively `develop:<FULL_COMMIT_SHA>`. The Snapshot Commit is the local HEAD, which must equal the resolved baseline ref.
- A snapshot is valid only when `VECTOR_EVIDENCE.md` names one full Snapshot Commit, every source section of `GOVERNANCE_CONTEXT.md` names the same commit, and the exported `PROJECT_STATE.md` matches the repository file at that commit (verified through the Git blob id). Commit statements inside embedded source content are ignored by this check.
- `docs/PROJECT_STATE.md` carries `State verified through commit`: the latest complete commit through which its statements were verified. It never contains the hash of the commit that contains that version of itself, and it is not required to contain the current Snapshot ID. The Snapshot Commit lives in `VECTOR_EVIDENCE.md` only.
- Supported Evidence Status values: `VERIFIED_AT_GENERATION` (published) and `BLOCKED` (reported on the console and by the exit code; never written into CURRENT).

## 8. BLOCKED and failure behaviour

The generator prints `RESULT: BLOCKED`, one or more `CAUSE:` lines and exits with code 1 when any of the following holds: wrong active branch or detached HEAD, local HEAD differs from the baseline ref, dirty working tree, baseline ref does not resolve, a mandatory source is missing, empty, oversized or matches a secret pattern, the generated candidate fails validation, or publication fails. Unexpected errors are reported the same way.

On BLOCKED the generator does not publish, never replaces an existing valid CURRENT set with partial or placeholder files, removes its own staging directory, and names the recovery material if a restore was impossible.

## 9. CURRENT contract

1. The candidate is written to a staging directory next to CURRENT (`Evidence\.staging-<run id>`), never into CURRENT.
2. The candidate is validated: exactly the three final file names, Evidence Status, commit consistency across all files, Snapshot ID, SHA256 values, Git blob identity of `PROJECT_STATE.md` against the repository, allowlist of embedded sources, balanced content delimiters, size limits and secret patterns.
3. Only after validation the existing CURRENT is moved aside (`Evidence\.previous-<run id>`) and the staging directory is renamed to CURRENT. Both steps are same-volume renames with a bounded retry (3 attempts) for transient sharing violations. No process is ever terminated.
4. If the rename fails, the previous CURRENT is moved back. If even that fails, the run reports BLOCKED and leaves the previous set in the named recovery directory.
5. CURRENT is validated again after publication; the previous set is then removed.

A successful run guarantees only the local consistency actually checked. It does not claim a transaction across the OneDrive cloud and does not claim that cloud synchronization has completed. The Project Lead treats a CURRENT set as valid only when all three files exist and the commit-specific statements are consistent. Normal reruns on the same commit are idempotent; `VECTOR_EVIDENCE.md` then records `Status: NONE (identical Snapshot Commit)` for the changed-files section.

## 10. ARCHIVE contract

Only with `-Archive` the validated CURRENT set is additionally copied to `Evidence\ARCHIVE\<UTC date>_<branch>_<first 12 characters of the SHA>`. Normal runs never archive. The copy is validated before it is renamed into place. If the archive directory already exists, the generator verifies it: a valid archive of the same commit with the same exported blobs is skipped (`SKIPPED, valid archive of this commit exists`); anything else is reported as BLOCKED and the existing directory is left untouched. An archive failure never affects CURRENT. Archive mode does not migrate older exports.

## 11. Feature branch versus post-merge

The productive default (`-ExpectedBranch develop -BaselineRef origin/develop`) refuses to run from any other branch, so CURRENT evidence is never produced from unmerged work. During a work package, tests use isolated temporary repositories and temporary output roots. The first productive export of a merged change is an owner action after the merge: update local `develop` to `origin/develop`, confirm the working tree is clean, run the command from section 5.

## 12. Project Lead bootstrap workflow (M365)

Inputs for a new VECTOR Project Lead conversation: the private operating contract (outside the repository), `VECTOR_EVIDENCE.md`, `PROJECT_STATE.md`, `GOVERNANCE_CONTEXT.md`.

1. Read `VECTOR_EVIDENCE.md`. Require `Evidence Status: VERIFIED_AT_GENERATION`, one full Snapshot Commit, and note the generation time and remote-evidence freshness.
2. Read `PROJECT_STATE.md` for CURRENT BASELINE, active work package, DONE, ACTIVE, PAUSED, BLOCKED, NEXT and OPEN DECISIONS.
3. Read `GOVERNANCE_CONTEXT.md` for the relevant contracts; confirm every section names the Snapshot Commit.
4. Treat the snapshot as commit-bound evidence, not as live GitHub access; it may be older than the repository.

Stop conditions for the Project Lead: Evidence Status other than `VERIFIED_AT_GENERATION`, a missing file, inconsistent Snapshot Commits, a `PROJECT_STATE.md` that does not match its declared source, stale or unclear provenance, or a snapshot presented as live GitHub access. In each case request a fresh export instead of guessing.

## 13. Security exclusions

The generator exports only the fixed allowlist of repository text files read from the Snapshot Commit. It never exports `.env` files, secrets, credentials, tokens, private keys, database dumps, private Security Evidence, SCMDB datasets, application sources, tests, SQL migrations, `node_modules`, build artifacts, large binaries or Git history. Each source is limited to 512 KB, the whole set to 4 MB. Sources and outputs are scanned for high-confidence secret patterns (private key blocks, JWT-shaped tokens, GitHub, OpenAI-style, AWS and Supabase access tokens); a match blocks the run. Remote URLs are normalized and never logged with credentials.

`Private_Evidence\Security`, `Private_Evidence\Backup`, `Private_Evidence\Recovery` and `WP_EVIDENCE` are outside the generator's responsibility. It does not read, list, copy or modify them; the tests assert this.

## 14. Legacy exports

As of this gate the repository contains no legacy export mechanism for Project Lead evidence; the root-level audit scripts (`vector_item_data_audit_*.py`) are data audits, not exports. Older evidence exports in private storage are legacy and superseded for routine Project Lead restarts: they are preserved, never deleted, migrated or treated as CURRENT by this generator. Their cleanup is a separate Cleanup Gate.

## 15. Tests

`npm test` runs `tests/project-lead-evidence.test.mjs`. On Windows it executes the real generator against isolated temporary Git repositories (bare origin plus clone, paths containing spaces) and temporary output roots, covering the clean path, idempotent reruns, archive behaviour, simulated and real (locked file) publication failures with preservation of CURRENT, dirty tree, local and remote baseline mismatches, wrong branch, explicit test baseline parameters, missing sources, excluded content, secret patterns, commit consistency, the private folders and the absence of bypass parameters. On other platforms the suite is skipped because the generator is PowerShell only.
