# Shop ERP

Desktop shop-management system for an AC / fridge / oven repair shop with an
attached spare-parts counter (Malakand, KP, Pakistan).

**Two business units, kept strictly separate:** Spare Parts (owns stock, earns
parts margin) and Repair (earns labour, consumes parts).

## Quick start

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

## Development machine notes

`npm run dev` and `npm run package` rebuild the `better-sqlite3` native
module for Electron's Node ABI before running. If you then run `npm test`,
it will fail with a `NODE_MODULE_VERSION` mismatch, because tests run under
plain Node, which needs the module built for a different ABI. Fix: run
`npm install` (no rebuild step needed) before running tests again. This is a
known, accepted trade-off of using a native module in an Electron app — see
BUG-7 in `PROJECT.md`.

## Commands

| Command              | Does                                                  |
| -------------------- | ----------------------------------------------------- |
| `npm run dev`        | Launch the app in development                         |
| `npm run verify`     | typecheck + lint + test — **run before every commit** |
| `npm test`           | Unit and integration tests                            |
| `npm run db:migrate` | Apply pending migrations                              |
| `npm run db:reset`   | Drop and rebuild the dev database                     |
| `npm run package`    | Build the Windows installer                           |

## Working on this project

**Read `CLAUDE.md` first.** It contains the operating rules and the technical
non-negotiables (integer money, append-only ledgers, package boundaries).

| File                       | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `CLAUDE.md`                | Rules. Read every session.                           |
| `PROJECT.md`               | Current status, open questions, known bugs           |
| `PROGRESS.md`              | Session log                                          |
| `docs/PHASES.md`           | Phase plan and exit criteria                         |
| `docs/SYSTEM_DESIGN.md`    | Layers, modules, IPC contract, key flows             |
| `docs/decisions/README.md` | Index of every ADR — why things are the way they are |

## Structure

```
apps/client         Frontend  — React, Tailwind, sandboxed
apps/server         Backend   — Electron main, IPC handlers, DB owner
packages/contracts  Shared Zod schemas + types (the API surface)
packages/core       Business logic (pure TS)
packages/db         Migrations + repositories (only place SQL is written)
packages/ui         Presentational components + design tokens
packages/shared     Money, Qty, IDs (zero dependencies)
```

There is **no HTTP server** — see `docs/PROJECT_STRUCTURE.md` §1.

## Stack

TypeScript · Electron · React · Vite · Tailwind · SQLite (better-sqlite3) · Kysely · Zod · Vitest
