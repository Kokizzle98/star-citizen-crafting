# AGENTS.md

Entry point for contributors and coding agents (Claude, Copilot, others). This file only points to the authoritative documents; it does not restate or override them.

## Read first

1. `docs/RULE_INDEX.md` — registry of all rules, their status and the conflict rule.
2. `docs/handover/VECTOR_RESTART_HANDOVER.md` — current checkpoint, recovery procedure and `NEXT STEP`.
3. `SCMDB_LOCATION_HANDOVER.md` — state and FROZEN contracts of the finished SCMDB location work.
4. `docs/frozen/` — binding specifications. Read every one that applies to your change.

Authority order: FROZEN specifications, then the repository and its lifecycle information, then PROPOSED specifications (design input only), then reviews and handovers, then chat history. If two FROZEN rules conflict and no explicit supersession decides it, stop and report `FROZEN_CONFLICT` instead of guessing.

## Project in short

VECTOR is a community tool for Star Citizen (crew inventory, crafting, fleet and loadout planning). Stack: Next.js 14, React 18, TypeScript, Supabase (Auth and Postgres). SCMDB game data is mirrored in `data/scmdb/`.

## Commands

- `npm ci` — install exactly what `package-lock.json` pins
- `npm run typecheck` — TypeScript check
- `npm test` — all tests (`node --test tests/*.test.mjs`)
- `npm run lint` — ESLint
- `npm run dev` — local dev server (needs `.env.local`, see `.env.example`)

Run typecheck and tests before proposing a change. Pull requests are expected to keep both green.

## Context and token hygiene

- Never read `data/` (about 84 MB, mostly SCMDB JSON and CSV audit output) into the conversation. Query it with a short script (`jq`, Python) and report only the result.
- Read only the FROZEN specifications that apply to the change, not all of `docs/`. `docs/architecture/legacy/` and `docs/reviews/` are historical evidence, not working material.
- One work package per conversation. The repository, not the chat, is the record: start a new conversation from `AGENTS.md` and the restart handover instead of continuing a long one.
- For larger work, write a short plan first and get it confirmed before building.
- Prefer the smallest sufficient model and effort; escalate only for architecture, data-model or security decisions.

## Working rules

- Work on a dedicated feature branch and open a pull request against `develop`. Never push directly to `develop` or `main`.
- Do not change FROZEN specifications, historical migrations or SCMDB location behavior as a side effect of other work.
- Never commit secrets. `.env.local` stays local; `CITIZEN_ID_ENABLED=false` is the default.
- Do not guess missing or uncertain data (locations, identities, resolver values). Keep it visible as an explicit review state.
- LIVE and PTU datasets are strictly isolated. No cross-channel fallback.
- Database changes go through reviewed migrations in `database/migrations/` and must be validated in staging first. Production promotion stays blocked until checks pass.
- Authorization is enforced in the backend (RLS/RPC). UI state is never the security boundary.
- Keep changes small and explain them in plain language: the project owner is a system administrator, not a developer, and works in German.

## When something does not match

If the repository state differs from the checkpoint in the restart handover, stop, show expected versus actual, and ask. Do not reconcile by assumption.
