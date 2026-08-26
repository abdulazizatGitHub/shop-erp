# Architecture Decision Records — Index

One place to read every decision taken on this project. Each row is the
decision itself; open the linked file for context, reasoning, consequences,
and alternatives rejected. Do not edit a decision's meaning here — this
index is a summary, the linked file is the source of truth.

| ADR                                                  | Decision                                                                                                                                 | Date       | Status   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| [0001](ADR-0001-typescript-only.md)                  | TypeScript everywhere in the shipped app. No Python.                                                                                     | 2026-08-08 | Accepted |
| [0002](ADR-0002-sqlite-not-postgres.md)              | `better-sqlite3` on the desktop. Postgres reserved for a future cloud tier only.                                                         | 2026-08-08 | Accepted |
| [0003](ADR-0003-integer-money.md)                    | Money stored/computed as integer paisa. Quantities as integer milli-units.                                                               | 2026-08-08 | Accepted |
| [0004](ADR-0004-append-only-ledger.md)               | `stock_movement` and `party_ledger` are INSERT-only. Current values are derived by summation; corrections are reversing rows.            | 2026-08-08 | Accepted |
| [0005](ADR-0005-business-unit-tagging.md)            | Spare Parts vs. Repair separated by line-level `business_unit_id` tagging. No internal sale document for billed work.                    | 2026-08-08 | Accepted |
| [0006](ADR-0006-technician-custody.md)               | Technician custody modelled as a `warehouse`. Shortages are recorded, never auto-deducted from wages.                                    | 2026-08-08 | Accepted |
| [0007](ADR-0007-payer-per-line.md)                   | `payer_party_id` / `revenue_type` live on the invoice **line**, not the job — one job can have two payers.                               | 2026-08-08 | Accepted |
| [0008](ADR-0008-flat-item-list.md)                   | Flat `item` table (category + brand + free-text variant label). No parent product / variant matrix.                                      | 2026-08-08 | Accepted |
| [0009](ADR-0009-permissions-are-code.md)             | Roles and permissions are TypeScript code, not a metadata-driven permission engine.                                                      | 2026-08-08 | Accepted |
| [0010](ADR-0010-peer-units-shared-overhead.md)       | `PARTS`/`REPAIR`/`SHARED` are peer business units. Overhead is allocated at report time, never split on write.                           | 2026-08-09 | Accepted |
| [0011](ADR-0011-app-naming-and-contracts-package.md) | `apps/client` / `apps/server` / `packages/contracts` are the permanent names, superseding earlier `apps/desktop` / `apps/renderer` docs. | 2026-08-10 | Accepted |

## Adding a new ADR

1. Create `ADR-00NN-short-slug.md` in this folder, following the existing
   files' structure (Status/Date, Context, Decision, Reasoning,
   Consequences, Alternatives rejected where relevant).
2. Add a row to the table above.
3. Add a row to `PROJECT.md` §5 ("Decisions taken") — that table stays the
   at-a-glance version inside the living status doc; this file is the full
   index.
