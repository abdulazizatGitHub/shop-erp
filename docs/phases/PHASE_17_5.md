# Phase 17.5 — Drawer Cash Movements: Planning Only

**Status:** PLAN ONLY — no code, no migration applied. 2026-09-27.
**Blocks go-live** — accepted by the owner as a blocker (BUG-31,
`PROJECT.md`). **Pauses Phase 17**: P17-3, P17-4, P17-5, P17-7, and the
logged follow-up P17-2b all stay approved and resume once this phase's
build is complete.
**Started:** 2026-09-27
**Completed:** —

See `docs/decisions/ADR-0016-cash-drawer-movements.md` for the
decision record this plan implements.

---

## 1. Goal

Give the owner a way to record cash added to or removed from the
physical till for a reason that is **not** a sale, a purchase, an
expense, or a party payment — a bank deposit, cash taken by the owner,
a float/change top-up, or anything else (with a required note). This
must change the cash session's `expected_cash` figure only. It must
have **zero** effect on either business unit's P&L.

---

## 2. Verification (requested before any design, answered with file:line)

### (1) Does the system track a bank balance anywhere?

**No.** Grepped for `bank_movement`, `bank_book`, `bank balance`, and
any report/view referencing one — zero matches. `'bank'` exists in
exactly one place as data, not a tracked balance: one of five values in
`PaymentMethod`
(`packages/core/src/payment/payment.repository.port.ts:9`:
`'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'cheque'`) — a tag on how
a `sale`/`purchase`/`payment` row was settled, nothing more.

**A pre-existing, unrelated defect found while checking this**
(`getCashBookReport`, `report.repository.ts:208-255`): its own
doc-comment (`:195-206`) claims "inflows are the union of cash actually
collected at sale time," but the `sale` branch of the query
(`:223-227`) has **no `payment_mode = 'cash'` filter at all** — every
confirmed sale with `paid_amount > 0` is counted as a "Cash sale,"
regardless of whether it was actually paid in cash, bank transfer,
easypaisa, jazzcash, or cheque. (The `purchase` branch, `:214-219`,
**does** correctly filter `payment_mode = 'cash'`.) Logged as **BUG-32**
in `PROJECT.md` — a genuine gap in the _existing_ Cash Book report,
unrelated to this phase's own scope, not fixed here (CLAUDE.md §8).

**Consequence for this plan:** since no bank balance is tracked
anywhere, a bank deposit does **not** need a "credit the bank" side —
there is no bank-side ledger to credit. It only needs to debit the
drawer (this phase's whole scope).

### (2) ADR-0005 — does every money row require `business_unit_id`? How is a movement belonging to neither unit represented?

**No — not every money row.** Grepped every `business_unit_id` column
addition across all migrations
(`packages/db/src/migrations/0002_business_units.sql:46,49,55-57,59,134,142`,
`0003_shared_overhead.sql:58-59`): every one of them is
`ALTER TABLE ... ADD COLUMN business_unit_id TEXT REFERENCES
business_unit(id)` — **nullable**, no `NOT NULL` anywhere except
`sale_line`'s own table definition
(`0002_business_units.sql:196`, `business_unit_id TEXT NOT NULL`) —
revenue lines must always be attributed; cost-side tables
(`expense`, `purchase`, `stock_movement`, `payment`, `attendance`,
`party`, `item`, `job`, `job_part`) do not. `expense.business_unit_id
IS NULL` is the live, working precedent for "belongs to neither unit":
`0003_shared_overhead.sql:105` reads
`AND (bu.is_overhead = 1 OR e.business_unit_id IS NULL)` to treat a
null-tagged expense as shared/overhead.

**Decision (ADR-0016):** `cash_movement` has **no `business_unit_id`
column at all**, rather than a nullable-and-always-NULL one.
`cash_session` itself — the closest sibling table, whole-till cash
reconciliation — has never had a `business_unit_id` column either
(`0001_init.sql:530-544`). ADR-0005 tags revenue and cost **lines**; it
was never a rule that every money-adjacent table must carry the
column, and `cash_session` is the existing proof. There's no future
case where a drawer movement becomes unit-specific, so a column that
would always read NULL is dead weight, not honesty-through-schema the
way `expense.business_unit_id` genuinely is (a real expense CAN belong
to a unit; a drawer movement never can).

### (3) Must a movement attach to an open cash session? Behaviour when none is open?

**No — and neither does anything else in this schema.** Grepped every
migration and `kysely-schema.ts` for `cash_session_id`: **zero
references anywhere.** `sale`, `purchase`, `expense`, and `payment` are
all associated with a day's cash session purely by **date** —
`cash-session.repository.ts:164-203`'s five `sumPaisa` queries all
filter `WHERE ... = ${date}` on `sale_date`/`payment_date`/
`purchase_date`/`expense_date`, never by a session foreign key.
Confirmed no code path anywhere gates creating a cash sale or expense
on whether today's session is open
(`grep`'d `cash-session`/`CashSession` across `sale.repository.ts`,
`expense.repository.ts`, and every `core` service — zero hits outside
the cash-session module itself; `CashSessionWidget.tsx` has no such
gate either).

**Decision:** `cash_movement` follows the identical pattern — a plain
`movement_date` column, no `cash_session_id` FK, no requirement that a
session be open to record one. If no session exists yet for that date,
the row simply sits in the ledger, exactly like a cash sale recorded
before anyone opens that day's session — it is picked up whenever a
`cash_session` row for that date is eventually opened and closed. This
is a deliberate consistency choice, not a gap: introducing a new gate
here that doesn't exist for sales/expenses would be a new, inconsistent
rule this task wasn't asked to add.

### (4) Append-only, corrections, paisa, UUIDv7, tenant_id

Yes to all — see the DDL in §3. `id` is application-generated UUIDv7
(`newId()`, same as every other table); `tenant_id NOT NULL`; `amount`
is `INTEGER` paisa, signed (`+` in / `-` out — same convention as
`stock_movement.quantity`, `0001_init.sql:323`,
`-- milli-units, SIGNED (+in / -out)`); no `UPDATE`/`DELETE` on this
table, ever — a correction is a new row with `amount` negated. **No
`reversed_by_id` column** — see ADR-0016's Consequences for why
(`DATABASE_RULES.md §3`'s finding that the equivalent column on
`stock_movement`/`party_ledger` is never actually written by any
application code path; this table doesn't repeat that).

### (5) Exact change to the expected-cash formula

Current (`cash-session.repository.ts:205-208`):

```ts
const cashIn = existing.openingCash + cashSales + cashPaymentsIn;
const cashOut = cashPurchases + cashExpenses + cashPaymentsOut;
const expectedCashPaisa = cashIn - cashOut;
const differencePaisa = input.countedCashPaisa - expectedCashPaisa;
```

Proposed (one new `sumPaisa` call, same style as the five already at
`:164-203`, plus one new term in the final line — nothing else in the
method changes):

```ts
const cashMovements = await sumPaisa(
  trx,
  sql<{ total: number }>`
    SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movement
    WHERE tenant_id = ${this.tenantId} AND movement_date = ${date}
  `,
);

const cashIn = existing.openingCash + cashSales + cashPaymentsIn;
const cashOut = cashPurchases + cashExpenses + cashPaymentsOut;
const expectedCashPaisa = cashIn - cashOut + cashMovements;
const differencePaisa = input.countedCashPaisa - expectedCashPaisa;
```

`amount` is already signed at insert time (positive for `float_add`,
negative for `bank_deposit`/`owner_draw`, either for `other`), so this
one `+ cashMovements` term is correct regardless of direction — no
separate in/out sums needed here, unlike the five pre-existing terms
(which sum unsigned columns from tables that don't carry a sign).

### (6) Every consumer of drawer-cash summing (list, file:line)

Grepped `cashSales|cashExpenses|cashPurchases|cashPaymentsIn|cashPaymentsOut|expectedCash` across `apps/`
and `packages/`:

| Consumer                                                                    | What it does                                                                                                                         | Change needed                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `cash-session.repository.ts:146-222` (`closeSession`)                       | **The one and only place** the `expected_cash` formula is computed — confirmed by grep, nothing else duplicates it                   | Add the `cashMovements` term (§2.5)                                                                         |
| `apps/server/src/ipc/handlers/cash-session.handler.ts`                      | Calls `closeSession`/`openSession`/`getTodaySession`, maps to DTO — never recomputes                                                 | None (formula change is transparent to it)                                                                  |
| `apps/client/src/pages/dashboard/CashSessionWidget.tsx:230-232`             | Displays `session.difference` as "Short by"/"Over by"/"Balanced" — reads the stored value, never recomputes                          | None to the display logic; gains a new "Record cash movement" action (see §4 Task 4)                        |
| `report.repository.ts:208-255` (`getCashBookReport`) / `CashBookReport.tsx` | An **independent**, differently-scoped ledger (date-range, not per-session) — does NOT reuse the `cash_session` formula at all today | New third `UNION ALL` branch for `cash_movement` (see §4 Task 5). Pre-existing gap noted, not fixed: BUG-32 |

No other report, KPI card, or dashboard widget sums cash-in-hand
independently (checked `DailySalesReport.tsx`, `ExpensesReport.tsx`,
`CashCreditPie.tsx`, `SalesSummaryCards.tsx` — all payment-method
breakdowns of sales, unrelated to drawer reconciliation).

### (7) Migration number and DDL (proposed, not applied)

Next free number: **`0021`** (`0020_job_technician_unassign_reason.sql`
is the latest applied). Proposed
`packages/db/src/migrations/0021_cash_movement.sql`:

```sql
-- =====================================================================
--  ADDENDUM 21 - CASH_MOVEMENT
--  Migration version 21.
-- =====================================================================
--
--  WHY THIS EXISTS
--  BUG-31 (PROJECT.md), Phase 17.5 (docs/phases/PHASE_17_5.md), ADR-0016.
--  The cash session's expected_cash formula (cash-session.repository.ts)
--  has no term for cash added to or removed from the drawer that is not
--  a sale, purchase, expense, or party payment (a bank deposit, cash
--  taken by the owner, a float top-up). This table fills that one gap.
--
--  Append-only (ADR-0004): no UPDATE, no DELETE, ever. A correction is
--  a new row with `amount` negated. No reversed_by_id column —
--  DATABASE_RULES.md section 3 records that the equivalent column on
--  stock_movement/party_ledger is never actually written by any
--  application code path; this table does not repeat that.
--
--  No business_unit_id column (deliberately) — see ADR-0016. No
--  party_id column (deliberately) — see ADR-0016's rejected
--  alternatives. No cash_session_id column — every sibling table
--  (sale, purchase, expense, payment) associates with a day's session
--  purely by date, never by FK; this table follows the same pattern.
--
--  Table count: +1 (cash_movement). View count: unchanged.
--
--  No BEGIN/COMMIT here — migration-runner.ts already wraps
--  db.exec(migration.sql) in its own db.transaction() closure, same
--  note as every migration from 0006 on.
-- =====================================================================

CREATE TABLE cash_movement (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    doc_no          TEXT NOT NULL,
    movement_date   TEXT NOT NULL,
    movement_type   TEXT NOT NULL,
        -- bank_deposit | owner_draw | float_add | other
    amount          INTEGER NOT NULL,       -- paisa, SIGNED (+in / -out)
    note            TEXT,                   -- required (non-blank) when movement_type='other'; optional free text otherwise — core-enforced, not a CHECK constraint (DATABASE_RULES.md section 3, "enum-like columns are canonical in application code")
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no)
);
CREATE INDEX idx_cm_date ON cash_movement (tenant_id, movement_date);
```

`doc_no` follows the existing `document_sequence` pattern (prefix
`CM`, e.g. `CM-0001`, via `formatDisplayDocNumber` — same choice
`item.repository.ts` makes, not the device-code-suffixed
`formatDocNumber` `sale`/`purchase` use, since this isn't a
multi-device-collision-sensitive document).

---

## 3. Rejected alternatives (see ADR-0016 for full reasoning)

- **Recording it as an `expense`** — hits both units' P&L / expense
  reports (`v_unit_direct_expense`, `getExpenseSummaryReport`), and
  conflicts with Q-DRAWING (owner drawings are out of scope for the
  expense side already).
- **A `payment` row against a dummy/placeholder party** — pollutes the
  party ledger and every receivables/payables report with a
  non-trading relationship (`payment.amount`'s sign convention is also
  flatly incompatible with `party_ledger.amount`'s — `PHASE_3.md §8`).

---

## 4. Task breakdown

Build order matches dependency order (schema → core → db → contracts →
IPC → UI), same convention as every prior phase.

| Task | Description                                                                                                                                                                                                                                                                                                   | Files touched                                                                                                                                                                                                                                                | Migration? | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ |
| T1   | Migration `0021_cash_movement.sql` (§2.7's DDL, verbatim)                                                                                                                                                                                                                                                     | New migration file, `kysely-schema.ts` (new `CashMovement` table type)                                                                                                                                                                                       | **Yes**    | S      |
| T2   | Core: `CashMovementType`, `CashMovementRecord`, `NewCashMovementInput`, `CashMovementRepositoryPort`; pure `assertCashMovementValid(type, amountPaisa, note)` enforcing sign-per-type (`bank_deposit`/`owner_draw` negative, `float_add` positive, `other` either) and non-blank `note` when `type==='other'` | New `packages/core/src/cash-movement/cash-movement.repository.port.ts`, `cash-movement.service.ts`, `cash-movement.service.test.ts`, `packages/core/src/index.ts` exports                                                                                    | No         | S      |
| T3   | DB: `KyselyCashMovementRepository` (insert + `audit_log` + `sync_outbox` in one transaction, same three-way pattern as `cash-session.repository.ts:63-110`; `listForDateRange` for the Cash Book report); modify `KyselyCashSessionRepository.closeSession` per §2.5                                          | New `packages/db/src/repositories/cash-movement.repository.ts` (+ `.test.ts`), `packages/db/src/repositories/cash-session.repository.ts` (+ its own `.test.ts`, new hand-calculated cases), `packages/db/src/index.ts`                                       | No         | M      |
| T4   | Contracts + IPC: `RecordCashMovementInput`, `CashMovementDto`; new channels `cashMovement.record` / `cashMovement.listForDateRange`; new `cash-movement.handler.ts`                                                                                                                                           | `packages/contracts/src/cash-movement/cash-movement.ts` (+ `index.ts`), `apps/server/src/ipc/channels.ts`, new `cash-movement.handler.ts` (+ `.test.ts`), `apps/server/src/main.ts`, `apps/server/src/preload.ts`, `apps/client/src/types/electron-api.d.ts` | No         | S      |
| T5   | UI: a "Record cash movement" action on `CashSessionWidget.tsx` (reason picker, amount, note — note required only for "Other"), listing today's recorded movements underneath; extend `getCashBookReport`'s SQL with the third `UNION ALL` branch for `cash_movement` (both signs, one row each)               | `CashSessionWidget.tsx` (+ `.test.tsx`), new small modal component, `report.repository.ts` (`getCashBookReport`), `CashBookReport.tsx` if the "Description" column needs a new case                                                                          | No         | M      |

**Total effort estimate:** S + S + M + S + M ≈ **1–2 focused sessions**
(materially smaller than a typical Phase 17 T1 task — one new table,
one new formula term, one new report branch, one small form).

---

## 5. Exit criteria (with tests)

- [ ] **T1** — Migration applies cleanly on a fresh DB (`migrate.ts`);
      `sqlite_master` query confirms `cash_movement` exists with the
      exact columns in §2.7's DDL and `idx_cm_date`. Table count is
      previous + 1 (Q11 baseline table, re-verified at that point —
      see `PROJECT.md` Q11 for the running count convention).
- [ ] **T2** — `cash-movement.service.test.ts`: `assertCashMovementValid`
      accepts `bank_deposit`/`owner_draw` only with a negative amount,
      rejects a positive one for either; accepts `float_add` only with
      a positive amount, rejects a negative one; accepts `other` with
      either sign but rejects a blank/whitespace-only `note`; accepts
      `other` with a non-blank note in both directions.
- [ ] **T3** — Repository tests, real temp DB: recording a movement
      inserts exactly one `cash_movement` row plus one `audit_log` row
      plus one `sync_outbox` row, in one transaction (mirrors
      `cash-session.repository.test.ts`'s existing assertions for
      `openSession`). **Priority hand-calculated test (this instruction):**
      open a session with `openingCashPaisa = 1,000,000` (Rs 10,000);
      insert a confirmed cash sale for `500,000` paisa (Rs 5,000) on the
      same date; record a `bank_deposit` cash movement of
      `-1,200,000` paisa (Rs 12,000 removed) on the same date; close
      the session with `countedCashPaisa = 300,000` (Rs 3,000). Assert
      `expectedCashPaisa === 300000` (hand-calculated:
      `1,000,000 + 500,000 + 0 − 0 − 0 − 0 + (−1,200,000) = 300,000`)
      and `differencePaisa === 0` (no shortage). A second test in the
      same file confirms `getExpenseSummaryReport`'s business totals
      and `v_unit_direct_expense`'s sum are **byte-identical** before
      and after the movement is recorded (the movement touches no row
      either view reads) — the "no unit P&L or expense report total
      changes" requirement, proven directly rather than argued.
- [ ] **T4** — Handler test (real temp DB, no Electron mocking, same
      `runX`-plain-function precedent as `item.handler.test.ts`/
      `sale.handler.test.ts`): recording a movement through the IPC
      input schema round-trips correctly; a blank `note` on `'other'`
      is rejected at the Zod boundary before it ever reaches the
      repository.
- [ ] **T5** — Render test: submitting the "Record cash movement" form
      with reason "Bank deposit" and amount "12,000" calls the IPC
      method with `movementType: 'bank_deposit'`, `amountPaisa:
-1200000`; the "Other" reason shows a required note field and blocks
      submission when it's blank. `getCashBookReport` test: the same
      bank-deposit movement appears as one "Out" row in the Cash Book
      date range it falls in, with `runningBalancePaisa` reflecting it
      (hand-calculated, same style as the existing Cash Book tests).
- [ ] `npm run verify` exits 0 after every task above, count pasted
      each time (Golden Rule #4).
- [ ] `PROJECT.md` (BUG-31 → FIXED) and `PROGRESS.md` updated per
      CLAUDE.md §7 before this phase is called complete.
- [ ] Phase 17 resumes: P17-3, P17-4, P17-5, P17-7, P17-2b unpaused.
