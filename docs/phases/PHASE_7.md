# Phase 7 — Staff, Wages, and Expenses

**Status:** CODE-COMPLETE — P7-0 through P7-11 all done and verified.
UI has now been VISUALLY VERIFIED WITH KNOWN ISSUES in a real, running
Electron window (2026-09-06 visual verification session) — all 7
user-facing workflows were exercised end-to-end against real data and
passed, but one real, unresolved bug (BUG-21 — see PROJECT.md Known
Bugs, MEDIUM) remains open, so this phase is not marked COMPLETE.
**Started:** 2026-09-06
**Completed:** 2026-09-06 (code-complete); visually verified 2026-09-06
with BUG-21 open
**Branch:** main
**Last commit:** uncommitted work across nine sessions — see PROGRESS.md;
committing was not requested

---

## 1. Goal

The owner can run a full day's cash-wage shop through the system instead of
memory and paper: mark each of two or three staff present/half-day/absent
for the day, hand a technician a peshgi against next payday and see it
tracked, watch a technician's commission land automatically when they
deliver a job, log every shop expense (electricity, bike fuel, courier)
against the correct business unit, and count the till at day's end to see
exactly how far off it is from what the system expected. At month end the
owner opens one report and sees, per staff member, days worked, gross
wage, advances taken, commission earned, and net cash due — numbers that
were calculated by hand and matched exactly during this phase's
verification, not just "look right." This phase does not run payroll, does
not compute tax, and does not enforce a pay cycle — it makes the shop's
existing cash-wage practice recordable and reportable.

---

## 2. Scope

### In scope

- Staff party rows (`party.party_type = 'staff'`) — minimal creation form,
  since none exist yet (GAP-9).
- Attendance entry: present / half_day / absent / leave / holiday, one row
  per staff per day, upsert semantics, wage computed and stored at save
  time (Correction/Conflict 1), business unit derived and stored at save
  time from `staff_role` (Correction C).
- Advances (peshgi): `party_ledger` + `payment` (`payment_out`/PMT), one
  transaction (GAP-4).
- Commission on delivered REPAIR-unit labour, from `party.commission_bp`
  only, posted after `deliverJob()` commits, in its own transaction
  (Conflict 3, GAP-10).
- Expense entry: category, business unit (PARTS/REPAIR/SHARED), vehicle,
  `method` (`cash` | `owner_personal`) (Conflict 4, Correction A).
  `expense_category` seeded with 6 starting rows if none exist yet
  (Correction B).
- Cash session open/close: float, counted, `expected_cash`/`difference`
  computed and stored at close (Conflict 2), display-only variance
  (GAP-8), dashboard widget (GAP-7).
- Wage report: read-only, monthly, per staff — days by status, gross
  (summed from stored `wage_earned`), advances, commission, net due.
- UI: Attendance page (grid), Expenses page (list + form), Cash session
  dashboard widget, Wages tab on Reports page.

### Explicitly out of scope

- Payslips, payroll cycles, tax computation — not a salaried-staff shop.
- `service_charge.commission_amount` / `service_charge.commission_bp` —
  exist in the schema, unused this phase (Finding-d).
- Overhead allocation reporting (`v_overhead_pool` consumption in the UI,
  setting `parts_share_bp`) — deferred to Phase 8 or later (Correction B,
  Q10 stays OPEN).
- `expense.business_unit_id` `NOT NULL` schema tightening — application
  validation only this phase (Correction A).
- Leave/holiday pay policy changes, paid-leave accrual, or any policy
  beyond the fixed multiplier table in §5.
- Barcode scanning, mobile technician app, cloud sync — CLAUDE.md §10,
  unchanged.
- Fixing BUG-18, DEBT-2, DEBT-3, BUG-ADR9, BUG-P6.5-1 unless one directly
  blocks a task below (CLAUDE.md kickoff brief DC-13).

---

## 3. Tasks

| ID    | Task                                                                                                                                                                          | Status                                                                 | Commit     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| P7-0  | Schema re-audit (full grep, confirmed no migration needed) + `expense_category` idempotent seed (bootstrap pattern) + staff party creation (contract widening + minimal form) | DONE                                                                   | 2026-09-06 |
| P7-1  | Attendance entry backend — repository, service (derives `business_unit_id`, computes+stores `wage_earned`), upsert, `staff:listStaff`                                         | DONE                                                                   | 2026-09-06 |
| P7-2  | Daily wage multiplier — pure function in `wage.service.ts`, called from P7-1's save path (not a monthly aggregate — see Correction 1 in §5)                                   | DONE (built as P7-1's Step A)                                          | 2026-09-06 |
| P7-3  | Advances / peshgi — backend + UI                                                                                                                                              | DONE                                                                   | 2026-09-06 |
| P7-4  | Expense entry — backend + UI                                                                                                                                                  | DONE                                                                   | 2026-09-06 |
| P7-5  | Cash session open/close — writes `expected_cash`/`difference` at close                                                                                                        | DONE                                                                   | 2026-09-06 |
| P7-6  | Commission on labour — backend only, posted after `deliverJob()` commits, separate transaction                                                                                | DONE                                                                   | 2026-09-06 |
| P7-7  | Wage report — read-only, `SUM(attendance.wage_earned)` + advances + commission                                                                                                | DONE                                                                   | 2026-09-06 |
| P7-8  | UI: Attendance page (month grid, 5-status cycling, explicit save)                                                                                                             | DONE (new top-level tab, not squeezed into StaffPage)                  | 2026-09-06 |
| P7-9  | UI: Expenses page (list + form)                                                                                                                                               | DONE (fully built in P7-4; this session added confirming render tests) | 2026-09-06 |
| P7-10 | UI: Cash session dashboard widget (no new route)                                                                                                                              | DONE (fully built in P7-5; this session added confirming render tests) | 2026-09-06 |
| P7-11 | UI: Wages tab on Reports page                                                                                                                                                 | DONE                                                                   | 2026-09-06 |

---

## 4. Exit criteria

Every item verified with actual output before the phase closes.

- [ ] **EC-P7-0** — Full grep of migrations 0001–0012 for `ALTER TABLE`
      on `attendance`/`expense`/`expense_category`/`cash_session`/`party`
      pasted in the session transcript, confirming zero missing columns.
      `SELECT COUNT(*) FROM expense_category` run against a real/dev
      database: if 0, the 6 seed rows are inserted via the bootstrap
      idempotent-seed pattern (`packages/db/src/bootstrap.ts`, same
      SELECT-before-INSERT shape as `seedBusinessUnits`/`seedWarehouse`);
      re-running the seed a second time inserts 0 additional rows
      (idempotency proven by query, not assumed). `npm run verify`
      exits 0.

- [ ] **EC-P7-1** — 3 staff × 26 working days entered (mix of statuses).
      Query `attendance` directly: row count = 78. Spot-check 3 rows.
      Duplicate-date insert on an existing `(tenant_id, staff_id, date)`
      is upserted (row count for that day stays 1, `status`/`wage_earned`
      reflect the second save), not appended as a second row. For a
      `technician`, `business_unit_id` resolves to the `REPAIR` row's id
      (looked up by `business_unit.code = 'REPAIR'`, never hardcoded);
      for a `salesman`, to `PARTS`; for a `helper` or `NULL` role, to
      `SHARED` — confirmed by joining `attendance.business_unit_id` to
      `business_unit.code` in the query, not by reading the code.

- [ ] **EC-P7-2** — Unit test asserts the exact per-day multiplier table
      (§5) at `wage_rate_paisa = 60000` (Rs 600/day):
      `present → 60000`, `half_day → 30000`, `leave → 0`,
      `holiday → 60000`, `absent → 0`. A second test proves the stored
      values reconcile: 22 `present` + 3 `half_day` + 5 `absent` days
      saved through P7-1's path, then
      `SELECT SUM(wage_earned) FROM attendance WHERE staff_id = ? AND
  strftime('%Y-%m', attendance_date) = ?` returns exactly
      `22 × 60000 + 3 × 30000 + 0 × 5 = 1,320,000 + 90,000 + 0 =
  1,410,000` paisa = **Rs 14,100** — matching a value computed by
      hand from the formula before running, not read off the output
      after.

- [ ] **EC-P7-3** — Advance of Rs 2,500 to one staff member.
      `advance_paisa = 250000`.
      Query `party_ledger`: one row, `amount = +250000`,
      `entry_type = 'advance'`.
      Query `payment` (`payment_out`): one row, `amount_paisa = 250000`,
      `payment_mode = 'cash'`, `doc_no` matches the next `PMT-NNNN`.
      Query `v_party_balance` for this staff member: `balance = +250000`.
      All three pasted from real queries.

- [ ] **EC-P7-4** — 3 expenses entered: 1. Electricity, Rs 4,500 → `450000` paisa, category = `Electricity`
      (seeded `allocation_method = 'shared_revenue'`),
      `business_unit_id = SHARED`, `method = 'cash'`. 2. Bike fuel, Rs 800 → `80000` paisa, category = `Bike Fuel`
      (seeded `allocation_method = 'direct'`), `business_unit_id =
     REPAIR`, `vehicle = 'NX-100'`, `method = 'cash'`. 3. Parts courier, Rs 200 → `20000` paisa, category = `Courier`
      (seeded `allocation_method = 'direct'`), `business_unit_id =
     PARTS`, `method = 'owner_personal'`.
      Query `v_unit_direct_expense` directly: **exactly 2 rows** —
      `unit_code = 'REPAIR', expense_paisa = 80000` and
      `unit_code = 'PARTS', expense_paisa = 20000`. The SHARED
      (Electricity) row does **not** appear in this view at all — its
      own `WHERE bu.is_overhead = 0` predicate excludes every SHARED-unit
      expense by construction, not just keeps it visually separate as
      the original kickoff brief assumed. Confirm this by pasting the
      2-row result, not a 3-row result with SHARED filtered out
      manually.
      Query `v_overhead_pool` directly: **exactly 1 row** —
      `allocation_method = 'shared_revenue'`, `parts_share_bp = NULL`,
      `overhead_paisa = 450000` — proving the Electricity expense is
      captured, just in the overhead pool view rather than the direct-
      expense view. This view is not wired into any Phase 7 report/UI
      (Correction B) — this query is a hand-check only.

- [ ] **EC-P7-5** — Open session: float (`opening_cash`) = Rs 5,000 =
      `500000` paisa. Second open attempt same calendar day is rejected
      with a typed error (`UNIQUE(tenant_id, session_date)` violation
      surfaced as a domain error, not a raw SQLite constraint message).
      Close session: `counted_cash` = Rs 47,350 = `4,735,000` paisa.
      `expected_cash` is computed at close from that date's sales minus
      purchases minus expenses (exact formula fixed in P7-5's
      implementation) and stored; for the hand-check, assume
      `expected_cash` computes to `4,500,000` paisa (a fixed scripted
      value for this test's fixtures, asserted exactly, not "close
      enough").
      `difference = counted_cash − expected_cash = 4,735,000 − 4,500,000
  = 235,000` paisa = **Rs 2,350 over**.
      Query `cash_session` directly: `opening_cash = 500000`,
      `counted_cash = 4735000`, `expected_cash = 4500000`,
      `difference = 235000`, `status`/`closed_at` set. All four numeric
      columns read from the row, not recomputed by the report layer
      (Conflict 2).

- [ ] **EC-P7-6** — One delivered job, labour line Rs 1,200
      (`labour_total_paisa = 120000`), technician's
      `party.commission_bp = 1000` (10%).
      `commission_paisa = FLOOR(120000 × 1000 / 10000) = FLOOR(12000) =
  12000` paisa = **Rs 120**. Written in the test comment before
      running, then asserted exactly.
      Query `party_ledger`: one row, `amount = -12000`,
      `entry_type = 'commission'`, `source_type = 'job'`,
      `source_id = job.id`. A second test: technician with
      `commission_bp = 0` (or `NULL`) produces **zero** `party_ledger`
      rows for that delivery — the service checks before opening the
      transaction, confirmed by asserting no row exists, not just that
      no error was thrown. A third test confirms a PARTS-unit
      `sale_line` on the same delivery contributes nothing to the
      commission calculation (labour-only, REPAIR-only).

- [ ] **EC-P7-7** — Seed: Staff A — 22 `present` + 2 `half_day` this
      month, `wage_rate_paisa = 60000`, one advance of `300000` paisa
      this month, one commission entry of `24000` paisa this month.
      Staff B — 26 `present`, `wage_rate_paisa = 80000`, no advance,
      one commission entry of `48000` paisa this month.
      Hand-calc Staff A: `gross_paisa = SUM(wage_earned) =
  22 × 60000 + 2 × 30000 = 1,320,000 + 60,000 = 1,380,000`;
      `net_paisa = 1,380,000 − 300,000 + 24,000 = 1,104,000` paisa =
      **Rs 11,040**.
      Hand-calc Staff B: `gross_paisa = 26 × 80000 = 2,080,000`;
      `net_paisa = 2,080,000 − 0 + 48,000 = 2,128,000` paisa =
      **Rs 21,280**.
      `report:wageMonth` query result pasted, both rows matching these
      exact paisa values.

- [x] **EC-P7-8** — Attendance page: verified via a component-render
      test (`AttendancePage.test.tsx`, `JobsPage.test.tsx`'s precedent —
      no running Electron window this session, see §8's "What is and
      isn't verified"). Confirmed: one row per staff member, one column
      per day of the month; a cell click cycles
      `blank → present → half_day → absent → leave → holiday → blank`
      (6 states, asserted one step at a time); "Save changes" is
      disabled until a cell changes and enabled immediately after
      (asserted via the button's `disabled` attribute); an empty staff
      list shows "No staff yet." with a pointer to the Staff tab.

- [x] **EC-P7-9** — Expenses page: `ExpensesPage.tsx`/`AddExpenseModal.tsx`/
      `ExpenseListTable.tsx` were fully built in P7-4 already matching
      every field this criterion asks for. Added `ExpensesPage.test.tsx`
      this session, rendering the exact 3 EC-P7-4 expenses and asserting
      Category/Amount/Unit/Method columns render correctly (`Till`/
      `Owner` labels, unit codes not UUIDs); a second test confirms the
      "Add expense" form blocks submission with no business unit
      selected and shows the exact error text; a third confirms all
      three unit options (Spare Parts/Repair/Shared) are present.

- [x] **EC-P7-10** — Cash session widget: `CashSessionWidget.tsx` was
      fully built in P7-5 already implementing all three states.
      Added `CashSessionWidget.test.tsx` this session, rendering
      against all three `cashSession:today()` response shapes (`null`,
      `status:'open'`, `status:'closed'` with difference `0`/`>0`/`<0`)
      and confirming "Not started"/"Open Session", opening float +
      "Close Session", and "Balanced"/"Over by"/"Short by" render
      correctly in each case.

- [x] **EC-P7-11** — Wages tab on Reports page: new `WageMonthReport.tsx`
      added as a "Wages" tab on `ReportsPage.tsx`, following its exact
      existing `Tabs`/`TAB_ITEMS`/`TAB_TITLES` pattern. Verified via
      `WageMonthReport.test.tsx` rendering the exact EC-P7-7 Staff A/
      Staff B data and asserting every Rs-formatted money value
      (Rs 13,800/3,000/240/11,040 and Rs 20,800/0/480/21,280) — every
      money column goes through `MoneyDisplay`, confirmed by asserting
      on its rendered output text, not a raw division anywhere in the
      component.

- [x] `npm run verify` exits 0 at every task checkpoint, test count
      strictly increasing from the 350 baseline
      (350→356→373→377→382→388→398→402→406→416).

---

## 5. Design decisions made this phase

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Reasoning                                                                                                                                                                                                                                                                                                                                                                                              | ADR? |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| **Correction to kickoff brief DC-5**: `attendance.wage_earned` IS written at attendance-save time, one value per row, snapshotting `wage_rate_paisa` as of that day. Monthly gross for the wage report is `SUM(wage_earned)` over stored rows, never recomputed from the current `wage_rate`. If `wage_rate` changes later, past attendance rows keep the wage that was correct when saved — the same snapshot principle DATABASE_RULES §3 already applies to `sale_line.unit_cost`.                                                                                                                                                                                      | The kickoff brief's DC-5 ("wages are derived, never stored... no column stores a cumulative wage") was written without reading the live schema, which already has this column with a code comment stating intent ("computed at entry"). Building against the live column matches CLAUDE.md §3.6 ("the live code is the truth") rather than an assumption.                                              | No   |
| **Correction to kickoff brief DC-2**: `cash_session.expected_cash` and `difference` ARE written at close time, computed once from that date's sales/purchases/expenses and `counted_cash`, then stored in the same `UPDATE` that sets `closed_at`. Display reads the stored values; no recomputation at display time.                                                                                                                                                                                                                                                                                                                                                     | Same reasoning — the live schema's own column comments ("computed at close") show the original design intent; DC-2 in the brief contradicted the schema it was meant to describe.                                                                                                                                                                                                                      | No   |
| Commission source: `party.commission_bp` (per technician, basis points) governs exclusively. `service_charge.commission_amount`/`commission_bp` exist in the schema and are read by no Phase 7 code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Two commission fields exist in the live schema; the owner picked the simpler per-technician model for this phase rather than per-job-type rates.                                                                                                                                                                                                                                                       | No   |
| `expense.method` extended to accept `'owner_personal'` alongside the existing `'cash'`. No new column. UI labels: "Paid from till" / "Owner's pocket". `owner_personal` expenses are excluded from the cash book's cash-outflow filter, same treatment as credit purchases today.                                                                                                                                                                                                                                                                                                                                                                                         | Reuses an existing column rather than adding `paid_by` as a duplicate concept; keeps the cash book's existing cash-filter pattern unchanged.                                                                                                                                                                                                                                                           | No   |
| Half-day wage = exactly 0.5 × daily rate, integer-truncated at the paisa level if the rate is odd (accepted rounding, sub-rupee). Full multiplier table: `present → 1.0`, `half_day → 0.5`, `leave → 0`, `holiday → 1.0` (shop closed, staff still paid), `absent → 0`.                                                                                                                                                                                                                                                                                                                                                                                                   | Standard for a cash-wage shop; matches all 5 status values the live `attendance.status` column already supports, not just the 3 the kickoff brief assumed.                                                                                                                                                                                                                                             | No   |
| Advance sign convention: `party_ledger.amount = +advance_paisa` (staff owes the shop). Wage report nets it off: `net_paisa = gross_paisa − advances_this_month + commission_this_month`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Consistent with `party_ledger`'s documented sign convention (`+ve = party owes us more`) already in `0001_init.sql`'s own comment.                                                                                                                                                                                                                                                                     | No   |
| Cash session UI: a widget/card on the existing dashboard/home page. No new route, no new nav item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Minimizes surface area for a feature used once a day.                                                                                                                                                                                                                                                                                                                                                  | No   |
| Cash session variance is stored (per the DC-2 correction above) but never auto-posted anywhere — no expense row, no `party_ledger` row. The owner sees the number and acts manually. Storing the number is not the same decision as acting on it automatically.                                                                                                                                                                                                                                                                                                                                                                                                           | Matches the brief's explicit GAP-8 answer; keeps a human in the loop for shortages.                                                                                                                                                                                                                                                                                                                    | No   |
| **Correction A** — `expense.business_unit_id` (already exists, nullable, added in `0002_business_units.sql:55`) is left nullable in the schema. `NOT NULL` is enforced at the Zod boundary (`CreateExpenseInput.business_unit_id = z.string().uuid()`, no `.nullable()`) and in the UI (no submission without a selection). No SQLite table-rebuild migration is performed to tighten the column.                                                                                                                                                                                                                                                                         | SQLite has no `ALTER COLUMN ... SET NOT NULL`; the only way to add it is a full table rebuild (the same technique `0011_sale_line_item_optional.sql` used the other direction). The risk/complexity of a rebuild migration is not justified when application-level enforcement gives the same practical guarantee — every write path in this codebase goes through Zod at the IPC boundary regardless. | No   |
| **Correction B** — `expense_category.allocation_method` and `parts_share_bp` already exist (`0003_shared_overhead.sql:37-45`) and are already read by the live `v_overhead_pool` view. Phase 7's only action on them: seed 6 starting categories (Electricity/Rent → `shared_revenue`; Bike Fuel/Courier/Petrol/Miscellaneous → `direct`) **only if `expense_category` has zero rows**, via the same idempotent SELECT-before-INSERT pattern `packages/db/src/bootstrap.ts` already uses for `business_unit`/`warehouse`/`uom`. No `parts_share_bp` values are set (Q10 stays OPEN — no invented percentages). `v_overhead_pool` is not read by any Phase 7 report or UI. | The prior session's audit missed these two `ALTER TABLE` statements and the `v_overhead_pool` view entirely, and wrongly concluded a new column and a "defer" decision were both needed. Correcting this in the phase doc rather than repeating the error.                                                                                                                                             | No   |
| **Correction C** — `attendance.business_unit_id` (already exists, `0003_shared_overhead.sql:58`) IS written at attendance-save time, derived automatically from `staff_role`: `technician → REPAIR`, `salesman → PARTS`, `helper` or `NULL` → `SHARED`. Always resolved at runtime by looking up `business_unit.code`, never a hardcoded id, resolved once per save-batch (not per row) and reused for every row in that batch. The "Add staff member" form does **not** expose a business-unit picker — it shows the derived unit as read-only text next to the `staff_role` selector.                                                                                   | Matches the migration's own comment stating this exact intent, and the codebase's existing convention of resolving business units by code rather than id everywhere else (e.g. `purchase` always resolves `PARTS` by code).                                                                                                                                                                            | No   |
| GAP-9: no staff `party` rows exist yet. Phase 7 adds a minimal "Add staff member" form (name, phone, `staff_role`, `wage_rate_paisa` entered in Rs/day and ×100'd on save, `commission_bp` entered as a whole-number percent and ×100'd on save, default 0) as part of P7-0, since P7-1 (attendance) cannot be built or verified without at least one staff row existing. This requires widening `CreatePartyInput`/the party repository mapper, which currently expose none of `staff_role`/`wage_rate`/`commission_bp` (confirmed by grep — zero matches in `packages/contracts`).                                                                                      | Sequencing requirement — attendance has nothing to attach to otherwise.                                                                                                                                                                                                                                                                                                                                | No   |
| Commission is posted after `deliverJob()` commits, in its own separate transaction — never inside the delivery transaction. If `commission_bp` is 0 or `NULL` for the technician, the service checks this before opening a transaction and inserts nothing.                                                                                                                                                                                                                                                                                                                                                                                                               | Keeps the delivery transaction's existing shape (already proven correct across Phase 6's EC-1/EC-2) unchanged; commission is a consequence of delivery, not a required part of recording it — a printer-jam-style "never let a secondary concern block or roll back the primary write" pattern already established for printing in `docs/SYSTEM_DESIGN.md` §6.                                         | No   |
| Live-schema naming exceptions kept as-is, not renamed: `attendance.staff_id` (not `party_id`), `party.wage_rate` (not `wage_rate_paisa`), `party.commission_bp` (not `commission_pct_milli`). TypeScript-side DTOs use the correct `*Paisa`/camelCase names (`wageRatePaisa`, `staffId`); the repository mapper layer translates, the same snake_case↔camelCase convention used everywhere else in this codebase.                                                                                                                                                                                                                                                         | Renaming a live, applied-migration column is out of scope and against `DATABASE_RULES.md` §4 ("never edit an applied migration").                                                                                                                                                                                                                                                                      | No   |

---

## 6. Bugs found this phase

- **BUG-20** (LOW, documentation-only) — `party_ledger.entry_type`'s
  schema comment in `0001_init.sql` lists `staff_advance`; this phase's
  approved decision and all code use `advance` instead. No `CHECK`
  constraint enforces either value. See `PROJECT.md` Known Bugs for the
  full writeup. Not fixed — logged, owner to decide whether the comment
  gets corrected.

No other bugs were found this phase. One shared-middleware gap was
found and fixed before anything depended on the wrong behaviour (not
logged as a bug): `apps/server/src/ipc/middleware/with-error.ts`'s
`toIpcError()` had no case for `SessionAlreadyOpenError` until P7-5
added one, matching `DbBusyError`'s exact shape.

---

## 7. Open questions resolved this phase

None of `PROJECT.md`'s existing Q1–Q12 are resolved by this phase.
**Q10** (allocation method per expense category) remains explicitly
**OPEN** — Correction B seeds `allocation_method` values using the
schema's existing default vocabulary (`direct`/`shared_revenue`) but does
not set any `parts_share_bp` percentage, which is what Q10 actually asks.

All open items this phase resolved were phase-local gaps/conflicts from
the kickoff brief and drafting corrections (§5 above), not `PROJECT.md`
Open Questions.

---

## 8a. Note added during P7-3 implementation

`party_ledger.entry_type` on the advance row is `'advance'`, per GAP-4's
approved decision text above. The live schema's own column comment
(`0001_init.sql`) lists `'staff_advance'`, not `'advance'`, in its
enumerated values. There is no `CHECK` constraint on this column
(confirmed by grep — zero `CHECK` constraints anywhere in this schema,
enums are application-enforced only), so nothing breaks either way, and
this discrepancy does not block P7-3. Recorded here since it was found
after this document's decisions were already approved, not before — see
`PROJECT.md`'s Known Bugs for the same note.

## 8b. Notes added during P7-4 implementation

- `expense` has no `notes` column — the live column is `description`.
  The contracts-layer `CreateExpenseInput`/`ExpenseDto` keep `notes` as
  the field name (consistent with every other DTO in this codebase);
  `expense.repository.ts` maps it to/from `description`.
- `document_sequence.doc_type`'s own comment already listed `expense` as
  an intended value, but no seed row or prefix existed anywhere in the
  migrations. Used prefix `EXP`, created lazily on first use — same
  pattern as `payment_out`/PMT (P7-3) and `staff`/STF (P7-0).
- `lookup.repository.ts`'s existing `listBusinessUnits()` (used by
  `item:lookups`) filters out SHARED (`is_overhead = 0`) — correct for
  items, wrong for the expense form, which must offer all three units.
  Extended it with an `includeOverhead` parameter (default `false`,
  preserving `item:lookups`' existing behaviour exactly) rather than
  writing a second, duplicate query — added a new `expense:listBusinessUnits`
  channel that calls it with `true`.
- `apps/client/src/app/navigation.ts`'s `NAV_ITEMS` had all of Alt+0
  through Alt+9 already taken (Staff took the last one, `0`, in P7-0).
  `NavItem.shortcutDigit` is now optional — Expenses has no keyboard
  shortcut rather than stealing one or inventing a multi-key scheme
  unprompted; `Sidebar.tsx` only renders the "Alt+N" badge when one exists.

## 8c. Notes added during P7-5 implementation

- **GAP-7's resolution assumed an existing dashboard/home page — there
  wasn't one.** `useState<Tab>('sales')` makes `SalePage.tsx` (580 lines,
  the checkout flow) the app's default view; there is no separate
  landing/summary page anywhere in this codebase. Presented this to the
  owner as a real blocking choice (not a mechanical precedent-driven
  call like the nav-digit/includeOverhead decisions in P7-0/P7-4) rather
  than guessing. Owner decision: a new minimal `DashboardPage.tsx`/
  `dashboard` tab, reached like any other tab (no shortcut digit — none
  were free, same as Expenses in P7-4) — `sales` stays the default tab
  App.tsx opens to, so nothing about the app's current launch behaviour
  changed. The Dashboard page is a plain grid of widget cards, currently
  holding just the one Cash Session widget — a natural home for any
  future at-a-glance widgets too.
- `apps/server/src/ipc/middleware/with-error.ts`'s `toIpcError()` had no
  case for a `SessionAlreadyOpenError` before this session — every
  non-`DbBusyError`/non-`ZodError` `Error` fell through to a generic
  `INTERNAL_ERROR`. Added a case matching `DbBusyError`'s exact shape
  (`{ code: 'SESSION_ALREADY_OPEN', message }`) — this is the correct,
  intended place for this mapping, not a workaround.
- `cash_session` has a `notes TEXT` column not mentioned anywhere in
  PHASE_7.md's contracts — left NULL; no field in `OpenSessionInput`/
  `CloseSessionInput` asks for it, and nothing in this phase needs it.

## 8d. Notes added during P7-6 implementation

- `DeliverJobResult` carries no technician id — the handler fetches the
  job's `assignedTo` separately via `KyselyJobRepository.getJob(jobId)`
  after delivery, then the technician's `commissionBp` via a new
  `KyselyPartyRepository.getStaffById(id)` (added this session, following
  `getSupplierById`'s exact existing pattern — no such method existed
  for staff before now).
- New `packages/core/src/payroll/commission.repository.port.ts`, not an
  extension of `advance.repository.port.ts` — commission is grouped
  with attendance/wages/advances under the `payroll` module
  (`docs/SYSTEM_DESIGN.md` §3) but has a different trigger point
  (post-delivery, never user-initiated) and no "list" requirement, so
  kept as its own port.
- `getLabourTotalPaisa` (in `commission.repository.ts`) resolves REPAIR's
  id by `business_unit.code`, never hardcoded — same convention
  `attendance.service.ts`'s `deriveBusinessUnitCode` and
  `job-delivery.repository.ts`'s own `repairUnit` lookup both use.
- Commission recording runs in its own DB connection/transaction,
  opened and closed strictly after `deliverJob()`'s connection has
  already closed — never nested inside the delivery's own transaction,
  and a commission failure is caught and logged (`console.error`) in
  `job-delivery.handler.ts`, never rethrown — a delivered job is never
  rolled back or failed because commission couldn't be recorded.

## 8e. Notes added during P7-7 implementation

- **Deviated from the brief's Steps B/D** (a `wage-report.repository.port.ts`
  - `wage-report.service.ts`): `report.repository.ts` (R1–R5) is the
    established precedent for every report in this codebase — plain
    exported `(db, tenantId, ...) => Promise<...>` functions, no port/
    service layer, called directly from `report.handler.ts`. Matched that
    convention instead of introducing the one port/service pair no other
    report has. `getWageMonthReport(db, tenantId, year, month)` lives in a
    new `wage-report.repository.ts`, same shape as `getDailySalesReport`/
    `getUnitPlReport`.
- No SQLite `FILTER` clause precedent exists anywhere in this codebase —
  used `SUM(CASE WHEN status = 'x' THEN 1 ELSE 0 END)` instead, matching
  `0012_job_split_v2.sql`'s `v_job_split` view, which already uses this
  exact idiom for the same kind of conditional aggregation.
- Contracts naming: the DB-layer type is `WageMonthRow` (no suffix,
  matching `DailySalesReportRow`); the wire-format Zod schema is
  `WageMonthRowDto` (matching `DailySalesReportRowDto`'s exact
  suffix convention) — not the bare `WageMonthRow` name the brief used
  for the contracts type.

## 8. Notes for the next phase

- **`v_overhead_pool` is live and will have real data once Phase 7
  expense entry is in use** (every SHARED expense with
  `allocation_method = 'shared_revenue'` or `'shared_fixed'` flows into
  it correctly, per Correction B). Phase 8 (or a dedicated enhancement
  phase) should: (1) get the owner's answer to Q10 (allocation
  percentages), (2) set `parts_share_bp` on the `Electricity` and `Rent`
  categories once that answer exists, (3) add an "Overhead Allocation"
  tab to the Reports page reading `v_overhead_pool`, presented as the
  estimate half of the two-margin-numbers model (`docs/SYSTEM_DESIGN.md`
  §4) alongside the existing direct-margin numbers.
- **`service_charge.commission_amount`/`commission_bp`** exist in the
  schema and are unused this phase (Finding-d/Conflict 3). A future
  phase may want per-job-type commission rates instead of, or blended
  with, the flat per-technician `party.commission_bp` used here — no
  code reads these columns yet, so introducing that logic later is a
  pure addition, not a migration.
- **Leave/holiday pay policy** (§5's multiplier table: `leave → 0`,
  `holiday → 1.0×`) is a single owner-stated default, not derived from
  any law or contract. If the owner's real practice differs (e.g. paid
  leave after a probation period), that is a policy change to
  `wage.service.ts`'s multiplier table only — the `attendance.status`
  schema already has room for it (5 statuses, no `CHECK` constraint).
- **`expense.business_unit_id` stays nullable in the schema** (Correction
  A) — any future direct SQL query or report against `expense` must not
  assume it is always populated; only rows written through Phase 7's
  own `CreateExpenseInput` path (which requires it) are guaranteed to
  have it set. Pre-Phase-7 `expense` rows, if any exist from manual
  testing, may have `business_unit_id = NULL`.
- **`attendance.business_unit_id` is derived, never user-editable.** If a
  later phase ever lets staff hold more than one role, or moves a
  technician onto counter duty temporarily, this derivation rule
  (§5, Correction C) needs revisiting — it currently assumes exactly one
  `staff_role` maps to exactly one `business_unit_id` for a staff
  member's entire history.
- **Nothing in this phase touches `BUG-18`, `DEBT-2`, `DEBT-3`,
  `BUG-ADR9`, or `BUG-P6.5-1`.** All remain open exactly as documented in
  `PROJECT.md`.

## 8f. Notes added during P7-8 through P7-11 (UI close-out)

- **Attendance got its own new top-level tab** (`apps/client/src/pages/attendance/`),
  not a third section on `StaffPage.tsx` — that page already covers
  roster + advances, and an interactive month grid with cycling cells
  and dirty-state tracking is enough interaction complexity to deserve
  its own screen, the same reasoning Dashboard and Expenses got
  dedicated tabs rather than being appended to an existing page.
  `NavItem.shortcutDigit` stays optional (extended in P7-4) — Attendance
  has no keyboard shortcut, since Alt+0 through Alt+9 were already all
  taken.
- **Arrow-key cell-to-cell navigation was deliberately not built** in
  the attendance grid — it would need a 2D grid of refs and manual
  `.focus()` calls; native Tab order between `<button>` cells already
  covers keyboard traversal without that complexity. Space cycles a
  cell's status, Enter triggers Save, both via a per-cell `onKeyDown`
  that calls `preventDefault()` before acting (overriding the browser's
  default Enter-activates-the-button behaviour, which would otherwise
  cycle the cell instead of saving).
- **P7-9 and P7-10 needed no production code changes** — `ExpensesPage.tsx`/
  `AddExpenseModal.tsx`/`ExpenseListTable.tsx` (P7-4) and
  `DashboardPage.tsx`/`CashSessionWidget.tsx` (P7-5) already satisfied
  every EC-P7-9/EC-P7-10 criterion exactly as written. This session
  added `ExpensesPage.test.tsx`/`CashSessionWidget.test.tsx` — neither
  page had a render test before now — to turn "already correct" into
  "verified with actual output" rather than taking the earlier
  sessions' word for it.
- **`WageMonthReport.tsx`** follows `ReportsPage.tsx`'s existing
  `Tabs`/`TAB_ITEMS`/`TAB_TITLES`/`Card` pattern exactly — no new
  page-composition idiom introduced for the seventh tab.

## What is and isn't verified (read before treating this phase as closed)

**Verified this session, with real command output, per CLAUDE.md §6:**
`npm run typecheck`/`lint`/`test` all green throughout, 416/416 tests at
close, including new component-render tests for all four UI screens
built or confirmed this session (`AttendancePage.test.tsx`,
`ExpensesPage.test.tsx`, `CashSessionWidget.test.tsx`,
`WageMonthReport.test.tsx`) using the same mocked-`ipc`/`@testing-library/react`
technique `JobsPage.test.tsx` established in Phase 6.5. Every backend
task (P7-0 through P7-7) was additionally verified against a real
SQLite database with hand-calculated paisa values pasted from actual
queries, not assumed — see each session's entry in `PROGRESS.md`.

**Update, 2026-09-06 visual verification session — the gap above is now
closed.** A real, built Electron window (electron-vite build,
Playwright `_electron`-driven) was launched and driven through all 7
workflows against real data in the dev database:

1. **Staff creation** — 3 staff created (Naeem/technician, Bilal/
   salesman, Chowkidar/helper); STF-0001/0002/0003 codes and the
   derived business-unit text (Repair unit / Spare Parts unit / Shared)
   all confirmed correct.
2. **Attendance grid** — a full month marked for all 3 staff exactly
   per spec (Naeem 20P/2H/2A, Bilal 22P/2A, Chowkidar 24P); cell colours,
   Save-button enable/disable, and persistence across a full app
   restart all confirmed correct.
3. **Peshgi** — Rs 3,000 advance recorded for Naeem with notes "Eid
   advance"; PMT doc number, MoneyDisplay rendering, and attribution to
   Naeem all confirmed correct.
4. **Expenses** — 3 expenses entered exactly per spec, all rendering
   correctly (amount, unit code, method). Submitting with no explicit
   Business Unit selection was **not** blocked — this is a real bug,
   see BUG-21 in `PROJECT.md` Known Bugs (MEDIUM, UNFIXED).
5. **Cash session** — opened with Rs 5,000 float, closed with Rs 47,350
   counted; expected-cash and variance both hand-verified against the
   real ledger and the widget's colour matched the variance sign.
6. **Job delivery + commission** — a job delivered with a Rs 1,200
   labour line to Naeem (10% commission); a direct `party_ledger` query
   confirmed `amount = -12000`, `entry_type = 'commission'`,
   `source_type = 'job'` exactly as specified.
7. **Wage report** — Gross/Advances/Commission/Net-Due were hand-
   calculated _before_ reading the screen for all 3 staff and matched
   the rendered table exactly (Naeem: Rs 12,600 / 3,000 / 120 / 9,720;
   Bilal: Rs 11,000 / 0 / 0 / 11,000; Chowkidar: Rs 9,600 / 0 / 0 /
   9,600). The empty-state message ("No attendance records for this
   month.") was also confirmed by switching to a month with no data.

**Phase 7 is now VISUALLY VERIFIED WITH KNOWN ISSUES** — every workflow
works as specified except the one gap in item 4 (BUG-21). Recommend a
short, targeted fix session for BUG-21 before or alongside Phase 8.
