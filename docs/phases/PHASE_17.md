# Phase 17 — Settings Backlog: Planning & Documentation Only

**Status:** PLANNING — not approved.
**Started:** 2026-09-26
**Completed:** —
**Branch:** main
**No code, no migrations, no schema changes were written for this document.**

**Revision note (this pass):** the first draft of this document relied on
stale `PROJECT.md` prose for several claims (attendance schema, commission
storage, expense-category filtering, overhead-split consumers, low-stock
semantics, paper-size wiring, negative-stock scope). Every item below was
re-verified against the live code before this revision. Corrections are
called out inline where they change a conclusion from the first draft.
Owner answers to §7 are recorded and marked ANSWERED.

---

## 1. Goal

Every module in the sidebar (Sales/POS, Items, Suppliers, Purchase Orders &
GRN, Customers, Reports, Expenses, Staff & Attendance, Custody, Dashboard,
printing/documents) has been checked against the **live code** for
hardcoded business policy that an owner would plausibly want to change,
cross-checked against every earlier owner discussion already recorded in
`PROJECT.md`, and turned into a single scoped, tiered inventory. This
document is that inventory, revised once against direct verification.
Every T1/T2 item still needs an explicit owner go-ahead before any code is
written — the five original open questions (Q17-1–Q17-5) have now been
answered by the owner and are recorded as ANSWERED in §7.

Go-live preparation (Phase 5's remaining exit criteria — parallel run,
pull-the-plug test, staff training) is explicitly **not** covered here; it
is a later phase.

---

## 2. Candidate inventory

Legend — **Tier:** T1 = matters for go-live/daily use soon · T2 = useful,
not urgent · T3 = later/deferred (reason given in §3/§4).
**Storage:** KV = generic `setting` table key/value row · REF = reference-data
table with add/edit/deactivate · MIG = needs a new migration.

### 2.1 Sales / POS

**Correction (was inaccurate in the first draft):** two distinct
mechanisms exist for stock-going-negative, not one. (1) Phase 10 (P10-1)
already hard-blocks adding an item whose _current_ `stockOnHandMilli <= 0`
to the cart at all (`ItemSearchPanel.tsx`, matching `resolveStockBadge()`'s
`<= 0` condition) — this is permanent, already shipped, and **is not
touched by anything in this phase**. (2) A cart line that starts from
positive stock but is quantitied beyond what's actually on hand is still
only **warned**, never blocked, at commit time: `isStockBelowZero`
(`packages/core/src/sale/sale.ts:61-64`), called once from
`packages/db/src/repositories/sale.repository.ts:220`, feeding
`warnings.stockBelowZero` (`sale.repository.ts:427`) — the sale still
commits and stock goes negative. S17-SALE-1 below is about mechanism (2)
only.

| ID         | Setting                                                                                                     | Source                                                                                            | Today's behaviour                                                                                                                                                                      | Proposed control & default                                                                                                                                                  | Storage                                    | Money/stock impact & history protection                                                                                                                                     | Effort | Tier     |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| S17-SALE-1 | Negative-stock policy for a counter sale whose requested quantity exceeds on-hand stock (mechanism 2 above) | `packages/core/src/sale/sale.ts:61-64`; `packages/db/src/repositories/sale.repository.ts:220,427` | Always allowed, always warns via `ConfirmDialog`. Never blocks. (The separate already-at-zero case, mechanism 1, is already hard-blocked since Phase 10 and is unaffected either way.) | Settings toggle `negativeStockPolicy: 'warn' \| 'block'`, default `'warn'` (= today's behaviour, unchanged). **Scope: counter sales only** — see the code-path table below. | KV (`setting.key = 'negativeStockPolicy'`) | No history rewrite — gates only the NEXT counter sale's commit step. A sale already committed under 'warn' stays valid forever even if the owner later switches to 'block'. | M      | T1       |
| S17-SALE-2 | POS/product grid default (owner-pinned vs recent items)                                                     | Phase 8 open item (owner discussion, chat-derived)                                                | No grid exists at all — Sales screen is search-only. Confirmed by grep: zero `ProductGrid`/`pinned`/`recentItems` hits.                                                                | **Reject for T1/T2** — see §3.                                                                                                                                              | —                                          | —                                                                                                                                                                           | —      | T3       |
| S17-SALE-3 | Rows-per-page for reference-data lists reused on Sales                                                      | Not requested; code audit only                                                                    | No pagination exists on the search-driven item picker                                                                                                                                  | Reject — no matching UI to configure                                                                                                                                        | —                                          | —                                                                                                                                                                           | —      | Rejected |

**Exact code-path scope for the 'block' mode (C17-7), verified:**

| Code path                                | File:line                                               | Movement type           | Affected by 'block'?                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counter sale line                        | `sale.repository.ts:220,339`                            | `sale`                  | **Yes — the only path this setting touches.** When `'block'`, the transaction throws instead of setting `warnings.stockBelowZero = true`; `SalePage.tsx` must show a hard error for this one case (the credit-limit warning path, `isCreditLimitExceeded`, is a separate flag and stays a warn-only `ConfirmDialog`, untouched). |
| Issue part to technician custody         | `job-part.repository.ts:132` (`issuePartsToTechnician`) | `transfer_out`          | **No.** Has no stock check today at all (confirmed by reading the function in full) — stays exactly as-is.                                                                                                                                                                                                                       |
| Issue part to a job                      | `job-part.repository.ts:316` (`issuePartsToJob`)        | `job_issue`             | **No.** Same — no check exists, none added.                                                                                                                                                                                                                                                                                      |
| Internal transfer (Spare Parts → Repair) | `internal-transfer.repository.ts:172`                   | `transfer_out`          | **No.** No check exists, none added.                                                                                                                                                                                                                                                                                             |
| GRN cancellation reversal                | `grn.repository.ts:656`                                 | `purchase_cancellation` | **No.** No check exists, none added — a reversal must always be allowed to post regardless of resulting stock level.                                                                                                                                                                                                             |
| Purchase cancellation reversal           | `purchase.repository.ts:384`                            | `purchase_return`       | **No.** Same reasoning as above.                                                                                                                                                                                                                                                                                                 |

### 2.2 Items / Stock

**Correction (C17-5):** the first draft said low-stock items are "never
flagged" with no stated rule for when the feature is built. The rule is
now fixed by owner answer (Q17-3): flagged when
`qty_on_hand <= item.reorder_level`, or `<= shop default` when
`reorder_level` is `NULL`; shop default = `0` (so an out-of-stock or
negative item is always flagged even with no reorder level set). Today,
nothing reads `reorderLevel` in any UI at all — that part of the original
finding still holds.

| ID         | Setting                                                              | Source                                                                                                                                          | Today's behaviour                                                                 | Proposed control & default                                                                                                                                                                                                                                                                                     | Storage                                                                                                | Money/stock impact & history protection | Effort | Tier |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------ | ---- |
| S17-ITEM-1 | Low-stock badge on the Items list, rule per C17-5                    | `packages/db/src/kysely-schema.ts:30` (`reorderLevel`), `item-import.ts:41,268-325` (CSV already populates it); confirmed zero UI read anywhere | `reorderLevel` stored per item, populated by CSV import, never read by any screen | Items list badge/filter: flagged when `qtyOnHand <= reorderLevel` (or `<= 0` when `reorderLevel` is null). **Default ON** (Q17-3, ANSWERED) — a purely informational badge carries no transactional risk, and hiding real already-present low-stock data by default would be a worse surprise than showing it. | REF (existing `item.reorder_level` column) + one KV toggle to hide the badge if the owner wants it off | Read-only. Zero history risk.           | S      | T1   |
| S17-ITEM-2 | Shop-wide default low-stock threshold when `reorder_level` is `NULL` | Same as above                                                                                                                                   | No fallback exists — a null-threshold item is never flagged today                 | Settings numeric field "Default low-stock qty" — **default `0`** (Q17-3, ANSWERED, matches C17-5's rule exactly)                                                                                                                                                                                               | KV                                                                                                     | Read-only. Zero history risk.           | S      | T1   |

### 2.3 Suppliers / Purchase Orders & GRN

| ID        | Setting                                                               | Source                                               | Today's behaviour                                         | Proposed control & default                            | Storage           | Money/stock impact & history protection | Effort | Tier |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ----------------- | --------------------------------------- | ------ | ---- |
| S17-PUR-1 | Purchase/GRN document print paper size                                | Code audit                                           | See §2.9 S17-PRINT-2b — folded there to avoid duplication | —                                                     | KV (existing key) | Print-time only                         | S      | T2   |
| S17-PUR-2 | Supplier/Customer/Purchase settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B3/S-B4 ("deferred") | No Settings section exists for either module              | Rejected — too vague to scope without a named control | —                 | —                                       | —      | T3   |

### 2.4 Customers

| ID        | Setting                                             | Source                                          | Today's behaviour                 | Proposed control & default                                                                 | Storage | Money/stock impact & history protection | Effort | Tier |
| --------- | --------------------------------------------------- | ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ | ------- | --------------------------------------- | ------ | ---- |
| S17-CUS-1 | Customer settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B2 ("deferred") | No Settings section for Customers | Rejected — credit-limit default is already per-customer, nullable, correctly not shop-wide | —       | —                                       | —      | T3   |

### 2.5 Reports

| ID        | Setting                                      | Source                                                                                      | Today's behaviour                                                                                                                                                                                                                                                                                                                                                                                                        | Proposed control & default                                                                                                                                                                                                                                                                          | Storage                                                             | Money/stock impact & history protection     | Effort                                                                                               | Tier     |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| S17-REP-1 | Rows per page across every report/list table | PROJECT.md:253,1002,4238-4241 (S-B5); `docs/phases/PHASE_11.md:61` (explicit deferral note) | 11 separate hardcoded `const ROWS_PER_PAGE = 10;` copies (`DailySalesReport.tsx:27`, `CashBookReport.tsx:34`, `JobsPage.tsx:36`, `BestPerformersTable.tsx:15`, `ItemsSoldTable.tsx:15`, `WageMonthReport.tsx:35`, `ReceivablesAgingReport.tsx:26`, `ExpensesReport.tsx:37`, `JobSplitReport.tsx:35`, `StockValuationReport.tsx:27`); `CustomerLedgerTable.tsx:41` uses `15` — an unexplained, pre-existing inconsistency | One Settings numeric field, "Rows per page" (10/25/50 choices). **Default `10` everywhere, including `CustomerLedgerTable` (Q17-2, ANSWERED)** — this is a deliberate, owner-approved behavior change for that one table (15→10), removing the unexplained inconsistency rather than enshrining it. | KV (`setting.key = 'rowsPerPage'`), read once at each table's mount | Read-only display setting. No history risk. | M — touches 12 files (11 reports + the ledger table), each independently verified per Golden Rule #4 | T1       |
| S17-REP-2 | Report date format                           | PROJECT.md §Settings Backlog, S-B5                                                          | Fixed format, not owner-facing today                                                                                                                                                                                                                                                                                                                                                                                     | Rejected — no concrete owner complaint on record                                                                                                                                                                                                                                                    | —                                                                   | —                                           | —                                                                                                    | T3       |
| S17-REP-3 | Report default date range                    | PROJECT.md §Settings Backlog, S-B5                                                          | Every report defaults to "This Month" via `DateRangeSelector.tsx:20-27`'s hardcoded `PRESETS` list                                                                                                                                                                                                                                                                                                                       | Rejected — cosmetic UI default, not a business-policy variation                                                                                                                                                                                                                                     | —                                                                   | —                                           | —                                                                                                    | Rejected |

### 2.6 Expenses

**Correction (C17-3):** verified every report/view query that joins
`expense_category` — none of `v_unit_direct_expense`
(`0003_shared_overhead.sql:81-92`), `v_overhead_pool` (`:94-106`),
`v_owner_drawings` (`:127-135`), or `getExpenseSummaryReport`
(`report.repository.ts:579-593`) filters `ec.deleted_at IS NULL`. The
**only** query that does is `listCategories()`
(`expense.repository.ts:174-184`) — correctly, since that is the
create-expense-form category picker, which should hide inactive
categories from new use while every report keeps showing history
regardless. **Conclusion: reusing the existing `deleted_at` column for
deactivation is safe — no new `is_active` migration is needed**, unlike
the concern this correction anticipated (contrast with Brand, which has
no separate `is_active` either and uses the identical pattern). Also
confirmed: `expense_category` has zero repository write path today
(`expense.handler.ts` exposes exactly 4 read-only channels: `create` (for
expenses, not categories), `list`, `listCategories`, `listBusinessUnits` —
no category create/update/toggle channel exists).

| ID        | Setting                                                                                           | Source                                                                         | Today's behaviour                                                                                                                                   | Proposed control & default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Storage                                                                       | Money/stock impact & history protection                                                                                                                                                                                            | Effort | Tier                                           |
| --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| S17-EXP-1 | Manage expense categories from Settings                                                           | PROJECT.md §Settings Backlog, S-B7 ("current behaviour acceptable — deferred") | `expense_category` (6 bootstrap-seeded rows, `bootstrap.ts:44-51`) has no repository write path at all — only a read for the expense-entry dropdown | New Settings section "Expense Categories" — list/create/edit(name-only-once-referenced)/deactivate, mirroring the Service Charges/Brands pattern (Phase 16) exactly. Default = today's 6 seeded categories, unchanged. **Rule (Q17-5, ANSWERED):** deactivation always allowed (soft, existing `deleted_at`); once ANY expense references a category, only its `name` stays editable — `kind`/`is_billable`/`is_owner_drawing`/`allocation_method`/`business_unit_id` lock. Enforced by a new core check (e.g. `assertExpenseCategoryFieldsLocked`), following the exact precedent of `assertCommissionModeConsistent` (`packages/core/src/job/service-charge.service.ts:21-84`) — logic lives in `packages/core`, never a DB constraint (CLAUDE.md §3.7). | REF (`expense_category`, needs a repository write path — currently read-only) | Deactivating a category never edits a historical `expense` row's `category_id` — confirmed no report filters `deleted_at`, so reports keep showing the historical amount for the period it occurred in, exactly as Q17-5 requires. | M      | T1                                             |
| S17-EXP-2 | Manage payment methods from Settings (full open-ended reference-data version)                     | Owner discussion (chat-derived)                                                | No payment-method reference table exists — `CreatePaymentInput['method']` is a closed Zod enum                                                      | Rejected for T1 — turning the closed enum into open reference data ripples into payment recording, receipts, and every cash-vs-method report. See S17-EXP-4 below for the smaller, accepted version of this ask.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                             | —                                                                                                                                                                                                                                  | L      | T3                                             |
| S17-EXP-3 | Q10 — `parts_share_bp` allocation for SHARED categories (electricity, rent)                       | PROJECT.md §Open Questions Q10; `bootstrap.ts:39-42`                           | Every `expense_category` row has `allocation_method`/`parts_share_bp` columns, always `NULL` on every seeded row                                    | **Corrected tier (C17-4): moved to T3.** Verified there is no live consumer: `v_overhead_pool` (`0003_shared_overhead.sql:94-106`) only `SELECT`s/`GROUP BY`s `parts_share_bp` as a passthrough column alongside `SUM(e.amount)` — no SQL or application code anywhere performs the actual bp-split arithmetic. Nothing shows the owner a real split number today. Reason for T3: **no consumer — belongs with a future unit P&L overhead report**, not this settings inventory. The 50/50 recommendation from the first draft is withdrawn — split percentages are the owner's decision alone, to be made when that report is actually built.                                                                                                             | REF (existing columns, currently unset)                                       | N/A — not built this phase                                                                                                                                                                                                         | —      | T3 (Q17-1, ANSWERED: do not build in Phase 17) |
| S17-EXP-4 | Enable/disable the existing 5 fixed payment methods from Settings (hide unused ones from pickers) | Code audit (C17-8)                                                             | `PaymentMethodToggle.tsx:12-16` hardcodes cash/bank/easypaisa/jazzcash/cheque with no enable/disable concept                                        | New KV boolean per method (e.g. `paymentMethodJazzcashEnabled`), all default `true` (= today's behaviour, every method shown). Follows the exact precedent already shipped in `DiscountsSettingsSection.tsx` (`getDiscountPkrEnabled`/`setDiscountPkrEnabled`, lines 43-44, 98-99, 164, 188) — a KV toggle gating which options render, no schema/enum change.                                                                                                                                                                                                                                                                                                                                                                                             | KV                                                                            | `CreatePaymentInput['method']` stays a closed union — hiding a method from the picker never touches a stored historical `payment.method` value.                                                                                    | S      | T2                                             |

### 2.7 Staff & Attendance

**Correction (C17-1): the first draft's claim that Attendance "has no
schema support" was wrong** — it relied on stale `PROJECT.md` prose
instead of the live code. Attendance is fully built (Phase 7):

- Schema: `packages/db/src/migrations/0001_init.sql:627-640` — `attendance`
  table, `status` (`present | half_day | absent | leave | holiday`),
  `wage_earned INTEGER NOT NULL DEFAULT 0` (paisa).
- `wage_earned` is a **snapshot**, not a live-derived value — computed once
  by the pure function `computeDayWage` (`packages/core/src/payroll/wage.service.ts:12-24`)
  and written at save time by `saveAttendanceBatch`
  (`packages/core/src/payroll/attendance.service.ts:47`), persisted as a
  plain column (`attendance.repository.ts:76,85,131` — read back with no
  aggregation). **Confirmed: changing any of the settings below only
  affects future attendance entries — a previously saved `wage_earned`
  value is never rewritten.**
- UI: `apps/client/src/pages/attendance/AttendancePage.tsx` — a `CYCLE`
  array (lines 21-29) and `STATUS_LABEL`/`STATUS_CLASSES` maps (lines
  31-45), both `Record<AttendanceStatus, string>` typed against the one
  canonical Zod enum, `packages/contracts/src/attendance/attendance.ts:8`
  — exhaustive, not duplicated.

| ID          | Setting                                          | Source                                                                                                                                                      | Today's behaviour                                                                                                                      | Proposed control & default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Storage | Money/stock impact & history protection                                                                                         | Effort | Tier     |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| S17-STAFF-1 | Staff settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B6 ("deferred")                                                                                                             | No Settings section                                                                                                                    | **Corrected reasoning (C17-2):** `party.commission_bp` (the old per-technician rate) was **retired by ADR-0015/Phase 16** — it is still round-tripped by `party.repository.ts`/`AddStaffModal.tsx` but always forced to `0` and never read by any wage/commission calculation. Commission today is configured **per service charge**, already built in Settings → Jobs → Service Charges. There is no remaining shop-wide/per-technician default rate to expose here. Rejected — nothing concrete left to add. | —       | —                                                                                                                               | —      | T3       |
| S17-STAFF-2 | Half-day wage fraction                           | `packages/core/src/payroll/wage.service.ts:19` — `Math.floor(wageRatePaisa / 2)`                                                                            | Hardcoded 0.5× (floored), applied to every `half_day` attendance entry                                                                 | Settings numeric field "Half-day wage fraction (%)" — **default `50`** (= today's behaviour exactly)                                                                                                                                                                                                                                                                                                                                                                                                           | KV      | `wage_earned` is a save-time snapshot (see above) — changing this setting never rewrites a past attendance row's `wage_earned`. | S      | T2       |
| S17-STAFF-3 | Whether Leave / Holiday are paid                 | `packages/core/src/payroll/wage.service.ts:14-23` — `holiday` grouped with `present` (paid 1.0×, "shop closed"); `leave` grouped with `absent` (0×, unpaid) | Hardcoded: Holiday paid in full, Leave unpaid                                                                                          | Two Settings toggles — "Pay staff for Holiday" (**default ON**), "Pay staff for Leave" (**default OFF**) — both equal today's behaviour exactly                                                                                                                                                                                                                                                                                                                                                                | KV      | Same snapshot protection as S17-STAFF-2                                                                                         | S      | T2       |
| S17-STAFF-4 | Weekly off day                                   | Grepped `weeklyOff`/`weekly_off`/`dayOff`/`sunday` (case-insensitive) across `packages/core`, `packages/db`, whole repo — zero matches                      | **Does not exist at all** — every calendar day is manually entered as one of the 5 statuses; there is no auto-marked recurring day off | Rejected for T1/T2 — this is a genuine feature gap (a new auto-marking concept), not a hardcoded value to flip. Would need its own schema/UI design.                                                                                                                                                                                                                                                                                                                                                           | —       | —                                                                                                                               | L      | T3       |
| S17-STAFF-5 | Attendance status list (P/H/A/L/Ho)              | `packages/contracts/src/attendance/attendance.ts:8`                                                                                                         | Already a single canonical Zod enum, consumed (not redeclared) everywhere it's used, including the UI's own presentation maps          | Nothing to fix — reject, already correctly implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —       | —                                                                                                                               | —      | Rejected |

### 2.8 Custody

| ID         | Setting          | Source                                                       | Today's behaviour                                                  | Proposed control & default                                | Storage | Money/stock impact & history protection | Effort | Tier     |
| ---------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------- | ------- | --------------------------------------- | ------ | -------- |
| S17-CUST-1 | Custody settings | PROJECT.md §Settings Backlog, S-B9 ("ADR-0006 governs this") | Custody reconciliation is noted, never auto-deducted, per ADR-0006 | Rejected — the owner's own prior ADR already settled this | —       | —                                       | —      | Rejected |

### 2.9 Printing & documents

**Correction (C17-6):** verified all 4 print files individually. All are
**fully hardcoded** to `'A4'` with the `receiptPaperSize` setting never
entering their call chain at all (confirmed by reading each handler:
`invoice.handler.ts`, the payment-receipt/customer-statement branches of
`print.handler.ts`, and `purchase-print.handler.ts` — none reference
`getReceiptPaperSize`). Split by daily-use frequency per the owner's
correction: invoice + payment receipt are generated on **every sale /
every payment received**; purchase orders and customer statements are
occasional.

| ID           | Setting                                                                                                                       | Source                                                                                                                                                                                | Today's behaviour                                                            | Proposed control & default                                                                                                                                                                                                                | Storage           | Money/stock impact & history protection | Effort                                                                                  | Tier                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| S17-PRINT-2a | Wire the existing `receiptPaperSize` setting into **sale invoice + payment receipt** prints (daily customer-facing documents) | `apps/server/src/printing/invoice-pdf.ts:10-12` (no size parameter at all, hardcoded `'A4'`); `payment-receipt-pdf.ts:12,36` (hardcoded `'A4'`)                                       | Both always print A4 regardless of the existing Settings A4/A5 toggle        | Thread `getReceiptPaperSize(kysely, tenantId)` through `invoice.handler.ts` and the payment-receipt branch of `print.handler.ts`, exactly as the existing reprint-receipt path already does (`print.handler.ts:56`, `sale.handler.ts:59`) | KV (existing key) | Print-time only. Zero history impact.   | S                                                                                       | **T1** (promoted — daily customer-facing documents) |
| S17-PRINT-2b | Wire the same setting into **purchase-order + customer-statement** prints                                                     | `purchase-pdf.ts:45` (doesn't even accept a size parameter — own hardcoded `PDFDocument({ size: 'A4' })` and hardcoded `MARGIN`); `customer-statement-pdf.ts:7,33` (hardcoded `'A4'`) | Both always print A4                                                         | Same wiring approach, into `purchase-print.handler.ts` and the customer-statement branch of `print.handler.ts`                                                                                                                            | KV (existing key) | Print-time only. Zero history impact.   | M (purchase-pdf.ts needs a size parameter added first, plus an A5 layout check on both) | T2                                                  |
| S17-PRINT-1  | Thermal printer option alongside A4/A5                                                                                        | PROJECT.md:959-963,1009-1013,4325 (Q7, OPEN)                                                                                                                                          | No thermal/ESC-POS code exists at all — confirmed zero `80mm`/`thermal` hits | Rejected for T1/T2 — hardware not yet purchased (Q7 still OPEN)                                                                                                                                                                           | —                 | —                                       | —                                                                                       | T3                                                  |
| S17-PRINT-3  | Document number prefix customization (ADR-0012)                                                                               | ADR-0012; 12+ hardcoded prefix constants across repository files                                                                                                                      | Prefixes are compile-time constants, never owner-configurable                | Rejected — ADR-0012 deliberately fixed this; no owner request to reopen it                                                                                                                                                                | —                 | —                                       | L                                                                                       | T3                                                  |
| S17-PRINT-4  | 2-up printing                                                                                                                 | PROJECT.md Future Feature Requests                                                                                                                                                    | Not built                                                                    | Rejected — "not scheduled to any phase" per PROJECT.md itself                                                                                                                                                                             | —                 | —                                       | —                                                                                       | T3                                                  |

### 2.10 Dashboard

**Correction (C17-5):** the first draft wrongly reported "no candidates
found." The owner requested dashboard stock warnings back in Phase 4 —
this was missed in the original pass. `apps/client/src/pages/dashboard/DashboardPage.tsx`
is 20 lines and renders exactly one widget, `<CashSessionWidget />`; no
low-stock or stock-warning card exists anywhere in that directory.

| ID         | Setting                             | Source                                | Today's behaviour                                                                      | Proposed control & default                                                                                                                                                                                                                                                                                                             | Storage                                          | Money/stock impact & history protection | Effort | Tier                           |
| ---------- | ----------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- | ------ | ------------------------------ |
| S17-DASH-1 | "Low stock: N items" dashboard card | Owner request, Phase 4 (chat-derived) | No such card exists — `DashboardPage.tsx` has exactly one widget (`CashSessionWidget`) | New `LowStockWidget.tsx`, following `CashSessionWidget.tsx`'s exact shape (own file, `useState`/`useEffect`-on-mount IPC call, `<Card>` wrapper), reading the same low-stock rule as S17-ITEM-1/2. Links to the Items list pre-filtered to low-stock items. **Default: shown** (Q17-3, ANSWERED — same reasoning as the badge itself). | None of its own — reads live item/threshold data | Read-only. Zero history risk.           | S      | T1 (bundled with S17-ITEM-1/2) |

---

## 3. Rejected candidates (one-line reason each)

- **S17-SALE-2 POS grid default** — the feature doesn't exist; a "default
  view" setting for a nonexistent screen is a feature request, not a
  setting.
- **S17-SALE-3 Item-search page size** — no paginated list exists to
  configure.
- **S17-PUR-2 generic Supplier/PO settings** — PROJECT.md marks these
  "deferred" with no concrete control named.
- **S17-CUS-1 generic Customer settings** — same; credit limit (the one
  real candidate) is already correctly per-customer.
- **S17-REP-2 report date format** — no owner complaint on record;
  cosmetic.
- **S17-REP-3 report default date-range preset** — cosmetic UI default,
  not a business-policy variation.
- **S17-EXP-2 open-ended payment-method reference data** — would ripple
  into payment recording, receipts, and every cash-vs-method report; the
  smaller enable/disable version is accepted as S17-EXP-4 instead.
- **S17-STAFF-1 generic Staff settings** — commission is no longer
  per-technician (ADR-0015 retired `party.commission_bp`); it's already
  configured per service charge, already built.
- **S17-STAFF-4 weekly off day** — a genuine feature gap (no schema/code
  exists at all), not a hardcoded value to flip.
- **S17-STAFF-5 attendance status list** — already a single canonical Zod
  enum, consumed everywhere else with no duplication; nothing to fix.
- **S17-CUST-1 Custody settings** — ADR-0006 already settled this.
- **S17-PRINT-1 thermal printing** — hardware not yet purchased (Q7 still
  OPEN); would be speculative to build now.
- **S17-PRINT-3 document-number prefix customization** — ADR-0012
  deliberately fixed this; no owner request to reopen it.
- **S17-PRINT-4 2-up printing** — PROJECT.md itself says "not scheduled to
  any phase."
- **`CANCELLATION_REASON_LABELS`** (evaluated per C17-8, not previously
  assessed) — used only for two UI-label consumers
  (`CancelJobModal.tsx`, `job-history-events.ts`), never in any
  reporting/analytics query; the underlying `CancellationReason` enum is
  closed in `@shop/contracts`, so an editable label map alone wouldn't let
  the owner add new reasons. Fixed taxonomy, not a setting.

---

## 4. Deferred to other phases

- **Permissions / "who is allowed to do X"** — ADR-0009 is explicit:
  permissions are code, not data. Belongs to a future **auth phase**, not
  Settings (already flagged as BUG-ADR9 for Commission Approvals — Phase
  16).
- **Overhead split (`parts_share_bp`, Q10)** — moved to T3 per C17-4:
  no live consumer exists today; belongs with a future unit P&L overhead
  report, when the owner is ready to set real percentages. Not part of
  Phase 17 (Q17-1, ANSWERED: do not build).
- **Go-live preparation** (parallel run, pull-the-plug test, staff
  training, Urdu cheat sheet) — Phase 5's own remaining exit criteria;
  explicitly out of scope here.
- **Cloud sync / multi-device, multi-tenancy beyond `tenant_id`,
  double-entry accounting, FBR e-invoicing, analytics dashboards, barcode
  scanning, mobile app** — CLAUDE.md §10, unchanged, not reopened.

---

## 5. Proposed Settings navigation

```
General            (unchanged)
  Shop
  Invoices & Receipts

Sales
  Discounts                     (existing)
  Stock & Alerts                (NEW, T1 — S17-SALE-1, S17-ITEM-1, S17-ITEM-2)
  Payment Methods                (NEW, T2 — S17-EXP-4)

Jobs               (unchanged)
  Service Charges
  Brands
  Commission Approvals

Expenses            (NEW GROUP, T1)
  Categories                    (NEW — S17-EXP-1)
  (No "Overhead Split" section — not built this phase, see §4/Q17-1)

Staff              (NEW GROUP, T2 — optional this phase)
  Payroll                        (NEW — S17-STAFF-2 half-day fraction, S17-STAFF-3 leave/holiday paid)

Reports            (NEW GROUP, T1)
  Display                       (NEW — S17-REP-1 rows per page)

Data               (unchanged)
  Backup & Restore
```

The Dashboard's "Low stock: N items" card (S17-DASH-1) is **not** a
Settings-nav item — it's a Dashboard widget reading the same threshold
configured under Sales → Stock & Alerts.

---

## 6. Proposed task breakdown for T1 (and T2)

Build order matches dependency order (schema/repository before IPC before
UI), same convention as every prior phase's task table.

### T1

| Task ID | Description                                                                               | Files likely touched                                                                                                                                                                                                                                                                                                | Migration?                                                           | Depends on                               | Effort |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- | ------ |
| P17-1   | `negativeStockPolicy` setting, scoped to counter sales only (S17-SALE-1)                  | `setting.repository.ts`, `setting.handler.ts`, `packages/contracts/src/setting/setting.ts`, `sale.repository.ts:220` (throw instead of warn-only when `'block'`), `SalePage.tsx` (hard-error path for this one case; credit-limit warning path untouched), new `sections/StockAlertsSettingsSection.tsx`            | No                                                                   | —                                        | M      |
| P17-2   | Low-stock badge + default threshold + Dashboard card (S17-ITEM-1, S17-ITEM-2, S17-DASH-1) | `item.repository.ts` (read path), Items list component, new/extended item-list IPC filter, `setting.repository.ts`/`setting.handler.ts`, `StockAlertsSettingsSection.tsx` (shared with P17-1), new `DashboardLowStockWidget.tsx` + `DashboardPage.tsx` wiring                                                       | No                                                                   | P17-1 (shares the settings section file) | M      |
| P17-3   | Rows-per-page setting, default 10 everywhere including `CustomerLedgerTable` (S17-REP-1)  | `setting.repository.ts`, `setting.handler.ts`, new `sections/ReportsDisplaySettingsSection.tsx`, one-line edits to all 11 report files + `CustomerLedgerTable.tsx`                                                                                                                                                  | No                                                                   | —                                        | M      |
| P17-4   | Expense Categories Settings section (S17-EXP-1)                                           | New `expense-category.repository.ts` (write path: create/update-if-unused/name-only-update/toggle `deleted_at`), new core enforcement check (`assertExpenseCategoryFieldsLocked`), new contracts, new IPC channels, new `ExpenseCategoriesTab.tsx` + modal (mirror `BrandsTab.tsx`/`ServiceChargesTab.tsx` exactly) | No — `deleted_at` already exists, safe to reuse (verified, see §2.6) | —                                        | M      |
| P17-5   | Wire `receiptPaperSize` into sale invoice + payment receipt prints (S17-PRINT-2a)         | `invoice-pdf.ts`, `payment-receipt-pdf.ts`, `invoice.handler.ts`, `print.handler.ts` (payment-receipt branch)                                                                                                                                                                                                       | No                                                                   | —                                        | S      |

**Total T1 effort estimate:** M+M+M+M+S ≈ **3 focused sessions**, similar
cadence to Phase 16's multi-sub-phase build.

### T2 (optional this phase — independently schedulable)

| Task ID | Description                                                                            | Files likely touched                                                                                                                                             | Migration? | Effort |
| ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| P17-6   | Wire `receiptPaperSize` into purchase-order + customer-statement prints (S17-PRINT-2b) | `purchase-pdf.ts` (needs a size parameter added first), `customer-statement-pdf.ts`, `purchase-print.handler.ts`, `print.handler.ts` (customer-statement branch) | No         | M      |
| P17-7   | Enable/disable payment methods (S17-EXP-4)                                             | `setting.repository.ts`/`setting.handler.ts`, `PaymentMethodToggle.tsx`, new `sections/PaymentMethodsSettingsSection.tsx`                                        | No         | S      |
| P17-8   | Half-day wage fraction + Leave/Holiday paid toggles (S17-STAFF-2, S17-STAFF-3)         | `wage.service.ts` (read settings instead of hardcoded constants), `setting.repository.ts`/`setting.handler.ts`, new `sections/PayrollSettingsSection.tsx`        | No         | S      |

**T2 total:** M+S+S — a separate half-day-to-one-day pass.

**Settings-nav wiring** (the new groups/items from §5) is folded into
whichever of P17-1/P17-3/P17-4 lands first — no separate task.

---

## 7. Owner decisions — ANSWERED

**Q17-1 — Overhead split.** **ANSWERED:** Do not build the overhead split
in Phase 17. Percentages will come from the owner when the overhead
report is actually built. → S17-EXP-3 moved to T3; P17-5 (the original
overhead-split task) removed from the T1 plan entirely.

**Q17-2 — Rows-per-page default.** **ANSWERED:** Default `10` everywhere,
including `CustomerLedgerTable` (its pre-existing `15` is normalized down,
a deliberate, approved behavior change for that one table). → P17-3 built
accordingly.

**Q17-3 — Low-stock badge default + dashboard card.** **ANSWERED:** Badge
ON by default, rule per C17-5 (flagged at `qty_on_hand <= reorder_level`,
or `<= 0` when `reorder_level` is null), plus the Dashboard "Low stock: N
items" card, also default-shown. → S17-ITEM-1, S17-ITEM-2, S17-DASH-1
built accordingly.

**Q17-4 — Negative-stock default + block scope.** **ANSWERED:** Default
`'warn'`. `'block'` applies to **counter sales only** — see the exact
code-path table in §2.1. → S17-SALE-1 built accordingly; job-issue,
internal-transfer, and both cancellation-reversal paths are explicitly
unaffected.

**Q17-5 — Expense category deactivation + field-locking.** **ANSWERED:**
Deactivation always allowed (soft, via the existing `deleted_at` column —
confirmed safe, no new `is_active` migration needed). Once any expense
references a category, only its `name` stays editable; reports keep
showing the historical amount for the period it occurred in regardless of
the category's later deactivation. → S17-EXP-1 built accordingly, enforced
by a new core check.

---

## 8. Exit criteria

Placeholder promoted to real, task-specific criteria for the approved T1
tasks. Each names its own verification method, per CLAUDE.md §6 — no
"looks correct" entries. This phase (the planning document itself) closes
once the owner has approved the scope above; the criteria below apply to
the _build_ sub-phase that follows, listed here so the next session can
pick them up without re-deriving them.

- [ ] **P17-1** — `sale.repository.test.ts`: a new test seeds a positive-
      stock item, requests more than on-hand with `negativeStockPolicy='block'`,
      and asserts the transaction throws with no `stock_movement` row
      inserted (hand-calculated before/after stock delta in the test
      comment); a second test with `'warn'` (default) asserts the sale
      still commits with `warnings.stockBelowZero === true`. Query: on a
      fresh migrated DB, `SELECT value FROM setting WHERE key='negativeStockPolicy'`
      returns no row, and the getter's default is confirmed `'warn'`. UI
      action: on the shop machine (or a render test), attempting a
      blocked sale shows a plain error, not the old warn-and-continue
      dialog; `ItemSearchPanel.test.tsx` (Phase 10's existing hard-block
      test) still passes unmodified, confirming mechanism (1) is
      untouched.
- [ ] **P17-2** — Repository test: an item with `reorderLevel=5` and
      `qtyOnHand<=5` (via a real seeded `stock_movement` sum) is flagged;
      an item with `reorderLevel=NULL` and `qtyOnHand=0` is also flagged
      (shop default `0`); an item above its threshold is not — all
      hand-verified against a real temp DB. Render test: `LowStockWidget.tsx`
      shows the correct count from a mocked IPC response. UI action:
      clicking the Dashboard card navigates to the Items list pre-filtered
      to low-stock items.
- [ ] **P17-3** — All 11 existing report-table tests plus a
      `CustomerLedgerTable` render test still pass after switching from a
      local constant to the shared setting read, with the setting
      defaulted to `10`. Query: a fresh DB has no `rowsPerPage` key and
      every table falls back to `10`, confirmed by direct query. UI
      action: changing Settings → Reports → Display → "Rows per page" to
      `25` and reloading a report table shows 25 rows (manual
      verification on the shop machine per CLAUDE.md §6).
- [ ] **P17-4** — Repository tests: create a category; edit its name only
      (succeeds); attempt to edit `kind`/`isBillable`/`isOwnerDrawing` on
      a category already referenced by a real seeded `expense` row
      (rejected with the new typed error); deactivate a category with
      existing expenses (soft, `deletedAt` set) and confirm
      `expense:list`/`getExpenseSummaryReport` still return the same
      historical rows/totals unchanged (hand-calculated total in the test
      comment). UI action: Settings → Expenses → Categories shows
      list/create/edit/deactivate, matching the Brands/Service-Charges
      shell exactly.
- [ ] **P17-5** — Unit test: `renderInvoicePdf`/`renderPaymentReceiptPdf`
      each accept and thread through a page-size parameter (test asserts
      the parameter reaches the underlying `PDFDocument` call). UI
      action / manual print: with `receiptPaperSize='A5'`, printing a
      sale invoice and a payment receipt both render at A5 dimensions;
      with the default `'A4'`, both are visually unchanged from today.
- [ ] `npm run verify` exits 0 after every task above, count pasted each
      time (Golden Rule #4 — one thing at a time, verified before the
      next begins).
- [ ] `PROJECT.md` and `PROGRESS.md` updated per CLAUDE.md §7 before this
      phase (the build sub-phase) is called complete.

Until the owner approves this scope and the build sub-phase actually
starts, this section is the agreed target — not yet satisfied by anything
in the repository today.

---

## Appendix — PHASES.md gap (now fixed)

Phases 9, 10, 13, 14, and 15 all had detailed `docs/phases/PHASE_N.md`
files but no entry in `docs/PHASES.md`'s main plan. Short entries for
**all five** (9, 10, 13, 14, 15) have been added to `docs/PHASES.md` in
this session (C17-9) — the first draft of this document only added 13–15
and merely flagged 9/10 as "also missing, left untouched." That gap is now
closed; `docs/PHASES.md` has a continuous entry for every phase from 0
through 16.
