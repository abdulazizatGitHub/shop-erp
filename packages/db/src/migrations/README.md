# Migrations

Numbered, forward-only. Never edit a migration that has been applied to a real
database — write a new one.

| File                                  | Contents                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `0001_init.sql`                       | Base schema (tenant, items, parties, stock, sales, purchases, expenses)                            |
| `0002_business_units.sql`             | Business unit separation, technician custody, contracts                                            |
| `0003_shared_overhead.sql`            | Shared overhead pool + allocation seam (ADR-0010)                                                  |
| `0004_party_ledger_bill_metadata.sql` | Nullable `bill_reference`/`due_date`/`bill_notes` on `party_ledger` (Phase 2 P2-1b)                |
| `0005_party_payment_terms.sql`        | Nullable `party.payment_terms TEXT` — Phase 2 P2-1 supplier field found missing from 0001_init.sql |

Place the SQL files delivered with the design docs here before running
`npm run db:migrate`.
