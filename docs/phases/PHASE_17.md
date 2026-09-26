# Phase 17 — Settings Backlog: Planning & Documentation Only

**Status:** PLANNING — not approved.
**Started:** 2026-09-26
**Completed:** —
**Branch:** main
**No code, no migrations, no schema changes were written for this document.**

---

## 1. Goal

Every module in the sidebar (Sales/POS, Items, Suppliers, Purchase Orders &
GRN, Customers, Reports, Expenses, Staff & Attendance, Custody, Dashboard,
printing/documents) has been checked against the codebase for hardcoded
business policy that an owner would plausibly want to change, cross-checked
against every earlier owner discussion already recorded in `PROJECT.md`
(the "Settings Backlog" section, §Open Questions, "Future Feature Requests"),
and turned into a single scoped, tiered inventory the owner can approve
section by section. This document is that inventory. It decides nothing by
itself — every T1/T2 item still needs an explicit owner go-ahead before any
code is written, and Q17-1 through Q17-N (§7) are open questions for the
owner, not decisions.

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

| ID         | Setting                                                                             | Source                                                                                                                                     | Today's behaviour                                                                                                                                               | Proposed control & default                                                                                                                       | Storage                                    | Money/stock impact & history protection                                                                                                                                                                                | Effort | Tier     |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| S17-SALE-1 | Negative-stock policy at sale time (warn vs block)                                  | `packages/core/src/sale/sale.ts:61`; `docs/PROJECT_STRUCTURE.md:233` names an intended (never built) `packages/policies/negative-stock.ts` | Always allowed, always warns via `ConfirmDialog` (BUG-Y). Never blocks.                                                                                         | Settings toggle `negativeStockPolicy: 'warn' \| 'block'`, default `'warn'` (= today's behaviour, unchanged)                                      | KV (`setting.key = 'negativeStockPolicy'`) | No history rewrite — this only gates the NEXT sale's warning-gate step; nothing about `stock_movement` changes. A sale already committed under "warn" stays valid forever even if the owner later switches to "block". | S      | T1       |
| S17-SALE-2 | POS/product grid default (owner-pinned vs recent items)                             | Phase 8 open item (owner discussion, chat-derived — not in PROJECT.md by that name)                                                        | No grid exists at all — Sales screen is search-only (`SalePage.tsx`, `ItemSearchPanel.tsx`). Confirmed by grep: zero `ProductGrid`/`pinned`/`recentItems` hits. | **Reject for T1/T2** — see §3. Building a grid is a UI feature, not a setting; a "default view" setting is meaningless until the feature exists. | —                                          | —                                                                                                                                                                                                                      | —      | T3       |
| S17-SALE-3 | Rows-per-page for reference-data lists reused on Sales (e.g. item search page size) | Not requested by owner; found only via code audit                                                                                          | No pagination exists on the search-driven item picker (it's a live-filtered dropdown, not a paged list)                                                         | Reject — no matching UI to configure                                                                                                             | —                                          | —                                                                                                                                                                                                                      | —      | Rejected |

### 2.2 Items / Stock

| ID         | Setting                                                                                 | Source                                                                                                                                                                                                                                                                           | Today's behaviour                                                                                                                    | Proposed control & default                                                                                                                                                                                                                                                                                                                                                                             | Storage                                                             | Money/stock impact & history protection                                  | Effort | Tier |
| ---------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | ---- |
| S17-ITEM-1 | Low-stock alert — per-item reorder level already exists in schema but is never surfaced | `packages/db/src/kysely-schema.ts:30` (`reorderLevel`), `item-import.ts:41,268-325` (CSV column already maps into it); PROJECT.md:4223-4224 (S-B1, described as "not yet in schema" — **stale**, the column exists and is populated by import, only the UI read path is missing) | `reorderLevel` is stored per item (settable via import) but never read by any screen — no low-stock badge, no alert, no list filter. | Items list gets a "Low stock" badge/filter reading `qtyOnHand <= reorderLevel` (existing column, no new setting needed for the threshold itself — it is already per-item data, correctly not shop-wide). Optionally add ONE Settings toggle: "Show low-stock badge in Items list", default ON (=today's _absence_ of the badge is the true baseline, so default must be chosen carefully — see Q17-3). | REF (existing `item.reorder_level` column) + one KV toggle if built | Read-only — no money/stock write path touched at all. Zero history risk. | S      | T1   |
| S17-ITEM-2 | Low-stock alert default threshold when an item has no `reorderLevel` set                | Same as above                                                                                                                                                                                                                                                                    | No fallback — a null `reorderLevel` item is simply never flagged                                                                     | Settings numeric field: "Default low-stock qty (used when an item has no reorder level set)", default `0` (= today's effective behaviour: an item with no threshold is never flagged)                                                                                                                                                                                                                  | KV                                                                  | Read-only. No history risk.                                              | S      | T1   |

### 2.3 Suppliers / Purchase Orders & GRN

| ID        | Setting                                                               | Source                                               | Today's behaviour                                                                                                                                               | Proposed control & default                                                                                                                                     | Storage                                             | Money/stock impact & history protection | Effort | Tier |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- | ------ | ---- |
| S17-PUR-1 | Purchase/GRN/Purchase-Order document print paper size                 | Code audit (not previously requested)                | `purchase-pdf.ts:45` hardcodes `size: 'A4'` regardless of the existing Settings A4/A5 toggle that already governs sale receipts (`setting.repository.ts:12-15`) | Extend the existing `receiptPaperSize` read to purchase-order/GRN print paths — no new setting, this is a bug-fix/consistency item, not a new control          | KV (existing key, wire it into a second print path) | None — print-time only, no data write   | S      | T2   |
| S17-PUR-2 | Supplier/Customer/Purchase settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B3/S-B4 ("deferred") | No Settings section exists for either module                                                                                                                    | See §3 — rejected as too vague to scope without the owner naming a specific control; PROJECT.md's own entries for these say "deferred", not "define this list" | —                                                   | —                                       | —      | T3   |

### 2.4 Customers

| ID        | Setting                                             | Source                                          | Today's behaviour                 | Proposed control & default                                                                                                                                     | Storage | Money/stock impact & history protection | Effort | Tier |
| --------- | --------------------------------------------------- | ----------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------- | ------ | ---- |
| S17-CUS-1 | Customer settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B2 ("deferred") | No Settings section for Customers | Rejected for T1/T2 — nothing concrete named. Credit-limit default is already per-customer, nullable (`customer.ts:16,40`), already correct — no change needed. | —       | —                                       | —      | T3   |

### 2.5 Reports

| ID        | Setting                                      | Source                                                                                      | Today's behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Proposed control & default                                                                                                                                                                                                                                                   | Storage                                                             | Money/stock impact & history protection     | Effort                                                                                                                                       | Tier     |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S17-REP-1 | Rows per page across every report/list table | PROJECT.md:253,1002,4238-4241 (S-B5); `docs/phases/PHASE_11.md:61` (explicit deferral note) | 11 separate hardcoded `const ROWS_PER_PAGE = 10;` copies (`DailySalesReport.tsx:27`, `CashBookReport.tsx:34`, `JobsPage.tsx:36`, `BestPerformersTable.tsx:15`, `ItemsSoldTable.tsx:15`, `WageMonthReport.tsx:35`, `ReceivablesAgingReport.tsx:26`, `ExpensesReport.tsx:37`, `JobSplitReport.tsx:35`, `StockValuationReport.tsx:27`); `CustomerLedgerTable.tsx:41` uses `15` — an unexplained, pre-existing inconsistency to flag, not silently normalize away (see Q17-2). | One Settings numeric field, "Rows per page" (10/25/50 choices), default `10` (= today's behaviour everywhere except the Customer ledger table, which is a pre-existing inconsistency the owner should be told about, not one this phase silently "fixes" by picking a side). | KV (`setting.key = 'rowsPerPage'`), read once at each table's mount | Read-only display setting. No history risk. | M — touches 11+ files, each a one-line constant replaced with a shared read, but each file must be verified independently per Golden Rule #4 | T1       |
| S17-REP-2 | Report date format                           | PROJECT.md §Settings Backlog, S-B5                                                          | Fixed format, not owner-facing today                                                                                                                                                                                                                                                                                                                                                                                                                                       | Rejected for T1 — no concrete owner complaint on record, bundling it with ROWS_PER_PAGE would blur one task into two; revisit only if the owner raises it                                                                                                                    | —                                                                   | —                                           | —                                                                                                                                            | T3       |
| S17-REP-3 | Report default date range                    | PROJECT.md §Settings Backlog, S-B5                                                          | Every report defaults to "This Month" via `DateRangeSelector.tsx:20-27`'s hardcoded `PRESETS` list (5 presets: today/thisWeek/thisMonth/thisQuarter/thisYear)                                                                                                                                                                                                                                                                                                              | Rejected for T1/T2 — the 5 presets themselves are a UI feature (already flexible), not a hidden policy; "which preset is pre-selected" is cosmetic, not a business variation an owner would plausibly ask to change per CLAUDE.md §Settings rule 2                           | —                                                                   | —                                           | —                                                                                                                                            | Rejected |

### 2.6 Expenses

| ID        | Setting                                                                     | Source                                                                                                                           | Today's behaviour                                                                                                                                                                                                                                                                       | Proposed control & default                                                                                                                                                                                                                                                                                                                             | Storage                                                                       | Money/stock impact & history protection                                                                                                                                                                                             | Effort                          | Tier                  |
| --------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------- |
| S17-EXP-1 | Manage expense categories from Settings                                     | PROJECT.md §Settings Backlog, S-B7 ("current behaviour acceptable — deferred")                                                   | `expense_category` table exists (`0001_init.sql:493`, columns `kind`, `is_billable`, `is_owner_drawing`, `sort_order`) with 6 bootstrap-seeded rows (`bootstrap.ts:44-51`), editable only by direct DB access — no repository write path, no Settings UI                                | New Settings section "Expense Categories" — list/create/edit/deactivate, mirroring the Service Charges/Brands pattern from Phase 16 exactly. Default = today's 6 seeded categories, unchanged, nothing re-tagged.                                                                                                                                      | REF (`expense_category`, needs a repository write path — currently read-only) | Existing `expense` rows keep their `expense_category_id` FK untouched; deactivating a category (soft `deleted_at`, per DATABASE_RULES.md §3) never edits historical expense rows, only hides the category from new-expense pickers. | M                               | T1                    |
| S17-EXP-2 | Manage payment methods from Settings                                        | Owner discussion (chat-derived) + PROJECT.md's general phrasing "manage ... payment methods from Settings"                       | No payment-method reference table exists at all — `CreatePaymentInput['method']` is a closed Zod enum (`cash`/`bank`/`easypaisa`/`jazzcash`/`cheque`), hardcoded in `PaymentMethodToggle.tsx:7-17`; `advance.repository.ts:21` separately hardcodes advances to always post as `'cash'` | Rejected for T1 — turning a closed enum into owner-editable reference data means every consumer (payment recording, receipts, reports' cash-vs-method breakdowns) must handle an open-ended method list; that is a schema-and-report-wide change disguised as a "settings" ask. Flag to owner as its own future task, not bundled into Phase 17 T1/T2. | REF if ever built                                                             | N/A                                                                                                                                                                                                                                 | L                               | T3                    |
| S17-EXP-3 | Q10 — `parts_share_bp` allocation for SHARED categories (electricity, rent) | PROJECT.md §Open Questions Q10 (`PROJECT.md:4328`); `bootstrap.ts:39-42` ("No `parts_share_bp` is set on any row... stays OPEN") | Every `expense_category` row has an `allocationMethod`/split-basis-points column that is never set on any seeded row — Repair-vs-Spare-Parts overhead split for shared costs is undefined                                                                                               | See Q17-1 (§7) — this is an **owner decision**, not a UI-design question: what split percentage, and does it vary by category? Once decided, the control itself is a plain numeric field per SHARED category (already has a column to hold it) — no new table, no migration.                                                                           | REF (existing column, currently unset)                                        | Snapshot-safe by construction: `parts_share_bp` only affects future overhead-report calculations, never rewrites a posted `expense` row.                                                                                            | S (once the split % is decided) | T1 (blocked on Q17-1) |

### 2.7 Staff & Attendance

| ID          | Setting                                          | Source                                                                  | Today's behaviour                     | Proposed control & default                                                                                                                               | Storage | Money/stock impact & history protection | Effort | Tier |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------- | ------ | ---- |
| S17-STAFF-1 | Staff settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B6 ("deferred")                         | No Settings section                   | Rejected — nothing concrete named beyond the general request; commission rate is already per-technician (`party.commission_bp`), correctly not shop-wide | —       | —                                       | —      | T3   |
| S17-STAFF-2 | Attendance settings                              | PROJECT.md §Settings Backlog, S-B8 ("no schema support yet — deferred") | No `attendance` schema support at all | Rejected — a settings screen cannot precede the schema it configures                                                                                     | —       | —                                       | —      | T3   |

### 2.8 Custody

| ID         | Setting          | Source                                                                                   | Today's behaviour                                                  | Proposed control & default                                                           | Storage | Money/stock impact & history protection | Effort | Tier     |
| ---------- | ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------- | --------------------------------------- | ------ | -------- |
| S17-CUST-1 | Custody settings | PROJECT.md §Settings Backlog, S-B9 ("ADR-0006 governs this — no Settings UI needed yet") | Custody reconciliation is noted, never auto-deducted, per ADR-0006 | Rejected — the owner's own prior ADR already settled this; no new control identified | —       | —                                       | —      | Rejected |

### 2.9 Printing & documents

| ID          | Setting                                                                                           | Source                                                                                                                                                       | Today's behaviour                                                                                                                                                                                                              | Proposed control & default                                                                                                                                                                                                                                                                                                               | Storage           | Money/stock impact & history protection | Effort                                                                   | Tier               |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| S17-PRINT-1 | Thermal printer option alongside A4/A5                                                            | PROJECT.md:959-963 ("deferred — pending hardware arrival"), PROJECT.md:1009-1013, PROJECT.md:4325 (Q7, OPEN: "Thermal printer model — blocks: print driver") | No thermal/ESC-POS code exists at all; confirmed zero `80mm`/`thermal` hits anywhere in the repo                                                                                                                               | Rejected for T1/T2, confirmed still correctly blocked — the owner has not purchased the hardware yet (Q7 still OPEN) and CLAUDE.md rule 2 requires a real, present business variation, not a speculative one. Revisit the moment hardware is confirmed.                                                                                  | —                 | —                                       | —                                                                        | T3 (blocked on Q7) |
| S17-PRINT-2 | Extend the existing A4/A5 setting to purchase-order/GRN/payment-receipt/customer-statement prints | Code audit — same finding as S17-PUR-1                                                                                                                       | `purchase-pdf.ts:45`, `invoice-pdf.ts:11`, `payment-receipt-pdf.ts:36`, `customer-statement-pdf.ts:33` all hardcode `'A4'`, ignoring the Settings toggle that already exists and correctly governs the sale-receipt print path | Wire the existing `receiptPaperSize` setting into these four print functions — no new control, a bug-fix/consistency pass under the existing setting's own intent                                                                                                                                                                        | KV (existing key) | Print-time only. Zero history impact.   | M (4 files, each needs its own layout check at A5 width before shipping) | T2                 |
| S17-PRINT-3 | Document number prefix customization (ADR-0012)                                                   | ADR-0012; code audit of `SALE_CODE_PREFIX` etc. across 10+ repository files                                                                                  | Prefixes (`INV`, `CUS`, `SUP`, `RCP`, `PMT`, `PUR`, `PO`, `GRN`, `IT`, `EXP`, `ITM`, `JOB`, `STF`) are compile-time constants, one per repository file, never owner-configurable                                               | Rejected for T1/T2 — ADR-0012 deliberately fixed these; changing to owner-editable prefixes risks breaking `formatDisplayDocNumber`/`packages/shared/src/id.ts` parsing assumptions and touches 12+ files for a control no shop owner has asked for. Flag as a "reopen ADR-0012" question only if the owner explicitly asks (see Q17-4). | —                 | —                                       | L                                                                        | T3                 |
| S17-PRINT-4 | 2-up printing                                                                                     | PROJECT.md Future Feature Requests (~line 1006-1008)                                                                                                         | Not built                                                                                                                                                                                                                      | Rejected for T1/T2 per PROJECT.md's own "not scheduled to any phase"                                                                                                                                                                                                                                                                     | —                 | —                                       | —                                                                        | T3                 |

### 2.10 Dashboard

No candidates found. No hardcoded dashboard-specific business policy was located by the STEP 2 grep, and no owner request references Dashboard settings by name. Not listed as a rejected item because there was nothing to reject — flagged here only so the module isn't silently skipped.

---

## 3. Rejected candidates (one-line reason each)

- **S17-SALE-2 POS grid default** — the feature (a pinned/recent-items grid) doesn't exist; a "default view" setting for a nonexistent screen is not a setting, it's a feature request.
- **S17-SALE-3 Item-search page size** — no paginated list exists on the Sales screen to configure.
- **S17-PUR-2 generic Supplier/PO settings** — PROJECT.md itself marks these "deferred" with no concrete control named; nothing to scope.
- **S17-CUS-1 generic Customer settings** — same as above; credit limit (the one real candidate) is already correctly per-customer.
- **S17-REP-2 report date format** — no owner complaint on record; cosmetic.
- **S17-REP-3 report default date-range preset** — cosmetic UI default, not a business-policy variation.
- **S17-EXP-2 payment-method reference data** — would ripple into payment recording, receipts, and every cash-vs-method report; too large to fold into a "settings" ask.
- **S17-STAFF-1 generic Staff settings** — nothing concrete named; commission is already correctly per-technician.
- **S17-STAFF-2 Attendance settings** — schema doesn't exist yet; can't configure what isn't built.
- **S17-CUST-1 Custody settings** — ADR-0006 already settled this; no new control identified.
- **S17-PRINT-1 thermal printing** — hardware not yet purchased (Q7 still OPEN); building the toggle now would be speculative.
- **S17-PRINT-3 document-number prefix customization** — ADR-0012 deliberately fixed this; no owner request to reopen it.
- **S17-PRINT-4 2-up printing** — PROJECT.md itself says "not scheduled to any phase."

---

## 4. Deferred to other phases

- **Permissions / "who is allowed to do X"** — ADR-0009 is explicit: permissions are code, not data. Any "who can approve a commission claim" / "who can edit a posted expense" control belongs to a future **auth phase**, not Settings. (Already flagged in PROJECT.md as BUG-ADR9 for Commission Approvals access control — Phase 16.)
- **Go-live preparation** (parallel run, pull-the-plug test, staff training, Urdu cheat sheet) — Phase 5's own remaining exit criteria; explicitly out of scope for this planning phase per the kickoff prompt.
- **Cloud sync / multi-device, multi-tenancy beyond `tenant_id`, double-entry accounting, FBR e-invoicing, analytics dashboards, barcode scanning, mobile app** — CLAUDE.md §10, unchanged, not reopened by anything found this phase.

---

## 5. Proposed Settings navigation

Additions to `apps/client/src/pages/settings/settingsNav.config.ts` (existing four groups — General, Sales, Jobs, Data — kept unchanged; two new groups added, one new item added to an existing group):

```
General            (unchanged)
  Shop
  Invoices & Receipts

Sales
  Discounts                     (existing)
  Stock & Alerts                (NEW — S17-SALE-1, S17-ITEM-1, S17-ITEM-2)

Jobs               (unchanged)
  Service Charges
  Brands
  Commission Approvals

Expenses           (NEW GROUP)
  Categories                    (NEW — S17-EXP-1)
  Overhead Split                (NEW — S17-EXP-3, blocked on Q17-1)

Reports            (NEW GROUP)
  Display                       (NEW — S17-REP-1, rows per page)

Data               (unchanged)
  Backup & Restore
```

"Stock & Alerts" is placed under the existing **Sales** group rather than a
new "Items" group — both its settings (negative-stock policy, low-stock
badge/threshold) are read at sale time or on the Items list, and Phase 17's
own inventory found no other Items-module setting to justify a standalone
group. Revisit if a later phase adds more Items settings.

---

## 6. Proposed task breakdown for T1 (and T2)

Build order matches dependency order (schema/repository before IPC before
UI), same convention as every prior phase's task table.

| Task ID | Description                                                                                                | Files likely touched                                                                                                                                                                                                                                                                                                          | Migration?                           | Depends on                          | Effort |
| ------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------- | ------ |
| P17-1   | `negativeStockPolicy` setting (S17-SALE-1)                                                                 | `setting.repository.ts`, `setting.handler.ts`, `packages/contracts/src/setting/setting.ts`, `SalePage.tsx` (read the flag at the warning-gate step), new `sections/StockAlertsSettingsSection.tsx`                                                                                                                            | No                                   | —                                   | S      |
| P17-2   | Low-stock badge + default-threshold setting (S17-ITEM-1, S17-ITEM-2)                                       | `item.repository.ts` (read path only), Items list component, `setting.repository.ts`/`setting.handler.ts`, `StockAlertsSettingsSection.tsx` (same section as P17-1)                                                                                                                                                           | No                                   | P17-1 (shares the new section file) | S      |
| P17-3   | Rows-per-page setting (S17-REP-1)                                                                          | `setting.repository.ts`, `setting.handler.ts`, new `sections/ReportsDisplaySettingsSection.tsx`, then one-line edits to all 11 files listed in §2.5, plus `CustomerLedgerTable.tsx`'s `15` (owner decision needed first — Q17-2)                                                                                              | No                                   | Q17-2 answered                      | M      |
| P17-4   | Expense Categories Settings section (S17-EXP-1)                                                            | new `job-client.repository.ts`-style `expense-category.repository.ts` (write path: create/update/toggle `deleted_at`), new contracts, new IPC channels (`expenseCategory:list/create/update/toggle`), new `ExpenseCategoriesTab.tsx` + modal (mirror `BrandsTab.tsx`/`ServiceChargesTab.tsx` exactly, per Phase 16 precedent) | No — table and columns already exist | —                                   | M      |
| P17-5   | Overhead split (`parts_share_bp`) field (S17-EXP-3)                                                        | `expense-category.repository.ts` (extend P17-4's write path with the split field), new `OverheadSplitTab.tsx`                                                                                                                                                                                                                 | No — column already exists           | Q17-1 answered, P17-4               | S      |
| P17-6   | Wire existing `receiptPaperSize` into purchase/GRN/payment-receipt/customer-statement prints (S17-PRINT-2) | `purchase-pdf.ts`, `invoice-pdf.ts`, `payment-receipt-pdf.ts`, `customer-statement-pdf.ts` — each needs its own A5 layout check                                                                                                                                                                                               | No                                   | — (T2, can run independently)       | M      |

**Settings-nav wiring** (adding the two new groups/items from §5) is folded
into whichever of P17-1/P17-3/P17-4 lands first — no separate task.

**Total effort estimate:** T1 tasks (P17-1, P17-2, P17-3, P17-4, P17-5) ≈
S+S+M+M+S — roughly **2–3 focused sessions**, similar in size to a single
Phase-16-style sub-phase. P17-6 (T2) is a separate, independently-schedulable
half-day pass since it touches only print layout, no settings storage.

---

## 7. Owner decisions needed

**Q17-1 — Overhead split (Q10 carried forward).** What basis-points split
should `parts_share_bp` use for SHARED expense categories (electricity,
rent), and does it need to vary per category or is one shop-wide number
enough? _Recommendation:_ start with one shop-wide default (e.g. 50/50,
`5000` bp) editable per category from the new Overhead Split section, so
the owner can override electricity vs. rent independently later without a
second migration — the column already exists per category, so this costs
nothing extra to support now.

**Q17-2 — Rows-per-page: normalize the Customer ledger table's `15` to `10`,
or make `15` the shop-wide default?** The audit found `CustomerLedgerTable.tsx`
already uses `15` while every report uses `10`, with no record of why.
_Recommendation:_ default the new setting to `10` (matching the vast
majority of existing tables) and let the Customer ledger table read the
same setting like everything else — a silent behavior change for that one
table, but one that removes an unexplained inconsistency rather than
enshrining it. Flag to the owner before building, not after.

**Q17-3 — Low-stock badge: does the owner want it ON by default the moment
this ships, or OFF until they've reviewed which items actually have a
`reorderLevel` set?** Today, nothing is flagged (functionally "off"). Turning
the badge on by default could surface a large number of already-low items
the first day it ships, from data entered via CSV import without the owner
realizing thresholds were being read. _Recommendation:_ default ON, since
CLAUDE.md's own default-preserving rule is about not changing computed
_money or stock behaviour_ — a purely informational badge carries no
transactional risk, and hiding real, already-present low-stock data by
default would be a worse surprise later.

**Q17-4 — Negative-stock default: confirm `warn` (today's only behaviour)
is still correct, or does the owner now want `block` as the default given
how close go-live is?** _Recommendation:_ keep `warn` as default (per
CLAUDE.md rule 1 — default must equal today's behaviour) and let the owner
flip to `block` explicitly once they've seen a few real negative-stock
warnings in daily use.

**Q17-5 — Expense Categories: should deactivating a category with existing
`expense` rows against it be allowed (soft-deactivate only, per DATABASE_RULES.md,
never a hard delete), or should the UI block deactivation until the owner
confirms no _recent_ expense used it?** _Recommendation:_ allow deactivation
unconditionally (soft-deactivate, `deleted_at`) — this matches the Brands/
Service-Charges precedent from Phase 16 exactly, and past `expense` rows
keep their FK regardless.

---

## 8. Exit criteria

Placeholder — this phase is **PLANNING ONLY**. Exit criteria for Phase 17's
actual build sub-phases (P17-1 through P17-6) will be written once the
owner has:

1. Answered Q17-1 through Q17-5.
2. Approved the T1 scope in §2 (or requested changes to which items are T1
   vs T2 vs T3).
3. Approved the navigation change in §5.

Until then, this document has no exit criteria of its own beyond: paste the
owner's answers into an updated version of this file, and confirm the task
breakdown in §6 still matches what was approved before any code is written.

---

## Appendix — PHASES.md gap found this phase

Phases 13, 14, and 15 had detailed `docs/phases/PHASE_13.md` /
`PHASE_14.md` / `PHASE_15.md` files but **no entry at all** in
`docs/PHASES.md`'s main plan (which jumped from Phase 12 straight to Phase
16). Short entries for 13, 14, and 15 have been added to `docs/PHASES.md`
in this same session — see the diff pasted after this document.

**Also found, not fixed (out of the explicit Phase 13–16 ask):** Phases 9
and 10 have the same gap — `docs/phases/PHASE_9.md` and `PHASE_10.md`
exist on disk but `docs/PHASES.md` has no `## Phase 9` / `## Phase 10`
heading either. Left untouched since the kickoff prompt named only 13–16;
flagging here so it isn't silently missed.
