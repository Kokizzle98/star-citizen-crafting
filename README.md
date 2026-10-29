# VECTOR

VECTOR is a community-driven, hobby project for Star Citizen players focused on crafting, equipment planning, item analysis, loadout comparison, and inventory-related decision support.

The project is intentionally free to use and designed to grow with the community. Monetization is not the primary goal and will only be considered later, if at all, once the project proves useful and sustainable.

## Vision

VECTOR exists to make Star Citizen planning more structured, transparent, and useful for players. The goal is to provide a practical tool that helps players better understand:
- inventories
- crafting requirements
- material planning
- armor and resistance logic
- loadout differences
- item analysis and build decisions
- fleet and operational planning

The Star Citizen ecosystem is full of complex data, systems, and mechanics. Many important details are spread across different sources and are difficult to compare or reason about. VECTOR aims to bring this information together in one place and make it easier to use.

This project is built for the community first, not for immediate commercial pressure. It is designed as a hobby project with long-term potential, and only later, if there is real value and demand, could optional support models such as Patreon, Buy Me a Coffee, or similar community support mechanisms be introduced.

## Project Principles

- Free and accessible
- Community-first
- Hobby-driven but professionally structured
- Long-term usefulness over short-term monetization
- Safety and validation before rollout
- Modular, extensible architecture

## Current Scope

This repository currently contains the foundation for:
- a Next.js web application
- core calculation and model logic
- item and armor data analysis
- validation and environment safety tooling
- staged migration and operational safety workflows

## High-Level Product Goal

VECTOR aims to become a practical platform for:
- Inventory management
- Fabricator and crafting support
- Fleet and loadout planning
- Trading and market insight
- Build and item analysis
- Community-driven refinement of game data and rules

The goal is not only to display data, but to help players make better decisions based on clear, structured information.

## Architecture Overview

The system is organized in multiple layers:

### 1. Application Layer
Built with Next.js 14 and React.

Key directories:
- `app/`
- `app/account`
- `app/admin`
- `app/api`
- `app/auth`
- `app/login`

This layer provides the user-facing interface and the operational workflows for:
- inventory management
- crafting and material review
- fleet planning
- trading-related views
- account and auth flow
- admin and operational access

### 2. Business Logic and Calculation Layer
Located in `src/` and related modules:
- `src/calculation`
- `src/engine.js`
- `src/model.js`
- `src/data.js`

This layer is responsible for:
- item and build logic
- crafting calculations
- model behavior and data interpretation
- reusable rules for optimization and evaluation

### 3. Data Resolver and Validation Layer
This repository includes structured item and resolver logic:
- `VECTOR_V5_RESOLVER_DEFINITION.json`
- `vector_item_data_audit_v*.py`
- `validate_armor_environment.py`
- `apply_armor_environment_patch.py`

This layer handles:
- item normalization
- armor and environment validation
- data review states
- source-data completeness checks
- resolver logic for ambiguous or incomplete information

### 4. Database and Migration Layer
Security-sensitive workflows are included to support controlled staging and production safety:
- `database/`
- `database/migrations/`

This layer is intended to ensure:
- staged execution
- safe validation before changes
- controlled rollout
- protection against unsafe production operations

### 5. Safety and Quality Gates
The project includes guardrails such as:
- local-only environment handling
- no secret leakage
- staging-only migration expectations
- production blockers until checks pass
- explicit handling of missing or unresolved data

## Planned Functional Areas

- Inventory
- Fabricator
- Fleet
- Trading
- Identity and account flow
- Item and build analysis
- Community-driven data refinement

## Technical Summary

VECTOR is designed to become a practical layered system:

- Frontend: interaction and visualization
- Logic layer: calculations, planning, and evaluation
- Validation layer: data quality and rule enforcement
- Safety layer: operational control and staged rollout

This architecture separates:
- user experience
- business logic
- validated game data
- safe implementation workflows


## Safety Rules
CITIZEN_ID_ENABLED=false is the default
Never commit .env.local or server secrets
Database migrations must be validated in staging first
Production promotion is blocked until checks pass
Missing or unresolved data must remain visible as review states


## Future Direction
VECTOR is intentionally designed as a long-term community tool. It can grow toward:

richer crafting workflows
more complete item and armor resolution
better loadout comparison and planning
broader community-driven data support
optional supporter models later on, if the project proves valuable
Monetization, if introduced at all, will be secondary, community-friendly, and never the foundation of the project.

## Summary
VECTOR is a free, hobby-driven, community-first Star Citizen project designed to make crafting, planning, and item analysis more structured and accessible. It combines a modern Next.js application with a data-heavy, validation-focused architecture to build a useful platform for the community, not just a prototype.

The long-term goal is to create something genuinely helpful, extensible, and sustainable — with a strong community-first identity and no pressure to force monetization.
