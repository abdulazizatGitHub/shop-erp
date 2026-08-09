# ADR-0002: SQLite locally, Postgres reserved for cloud

**Status:** Accepted · **Date:** 2026-08-08

## Context

Original plan specified Postgres as the database, including on the desktop.

## Decision

better-sqlite3 on the desktop. Postgres only if/when a cloud tier exists.

## Reasoning

Bundling Postgres into an Electron installer means shipping a server process,
managing a data directory, handling version upgrades on machines that get
switched off mid-migration, and debugging Windows service and permission issues
on hardware never seen. Support cost would be crushing for a solo developer.
SQLite is a single file, zero admin, and transactionally solid. At ~500
transactions/day it is faster than needed by orders of magnitude.

## Consequences

- Two SQL dialects if cloud arrives. Mitigated by Kysely and by keeping all
  business logic out of the database (no stored procedures, no triggers).
- `synchronous = FULL` is mandatory given frequent power cuts.

## Alternatives rejected

- **Embedded Postgres** — support cost.
- **PGlite** — immature for production accounting data in 2026.
