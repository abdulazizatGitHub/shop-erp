# Phase 17 — Settings Backlog: Planning & Documentation Only

**Status:** APPROVED — 2026-09-26. Scope (all §2 T1 items plus P17-7) is
approved for build. **P17-1 is fully unblocked** — D17-1 resolved the
warn-mode design with Option C (§2.1); D17-3 resolved the warehouse-
scoping question with a new, separate `counterStockMilli` field.
Building begins this session.
**Started:** 2026-09-26
**Completed:** —
**Branch:** main
**No code, no migrations, no schema changes were written for this document.**

**Revision history:**

- Rev 1 (2026-09-26): initial candidate inventory.
- Rev 2 (2026-09-26): corrected five stale-`PROJECT.md`-derived claims
  against live code (attendance, `commission_bp`, expense-category
  filtering, overhead-split consumers, negative-stock scope). Owner
  answered Q17-1–Q17-5.
- Rev 3 (2026-09-26): amendments A17-1 through A17-5 applied. Pre-code
  verification (a)–(e) performed and reported in §2.1 before any
  editing, per instruction. Two findings — (b) and (d) — triggered a
  STOP; P17-1's warn-mode design needed one more owner decision. Q17-6
  recorded (owner answered). A schema-correction finding surfaced while
  drafting §2.6's Expense Category form wording. Scope marked
  **APPROVED**.
- Rev 4 (2026-09-26, this revision): decisions D17-1 through D17-4
  applied. **D17-1 resolves the (b) blocker** with a third design
  (Option C) — see §2.1. **D17-3 resolves the (d) blocker** — a new,
  separate `counterStockMilli` field is added; the existing
  all-warehouse `stockOnHandMilli` is kept for its other consumers, all
  individually listed in §2.1 with keep/switch stated for each.
  **D17-4** verified the expense-category schema findings against real
  seeded data and view SQL — see §2.6; `is_billable` turned out to have
  the same "zero consumers" problem as `kind`, applied symmetrically.
  P17-1 is now fully unblocked and building begins this session.

---

## 1. Goal

Every module in the sidebar (Sales/POS, Items, Suppliers, Purchase Orders &
GRN, Customers, Reports, Expenses, Staff & Attendance, Custody, Dashboard,
printing/documents) has been checked against the **live code** for
hardcoded business policy an owner would plausibly want to change,
cross-checked against every earlier owner discussion already recorded in
`PROJECT.md`, and turned into a single scoped, tiered inventory. Every
open question has now been answered by the owner (§7) and the scope is
approved for build (this revision). Go-live preparation (Phase 5's
remaining exit criteria — parallel run, pull-the-plug test, staff
training) is explicitly **not** covered here; it is a later phase.

---

## 2. Candidate inventory

Legend — **Tier:** T1 = matters for go-live/daily use soon · T2 = useful,
not urgent · T3 = later/deferred (reason given in §3/§4).
**Storage:** KV = generic `setting` table key/value row · REF = reference-data
table with add/edit/deactivate · MIG = needs a new migration.

### 2.1 Sales / POS — negative-stock policy (revised, A17-1, Q17-6)

**Q17-6 — ANSWERED.** One setting, `negativeStockPolicy`, governs BOTH
of the two mechanisms below, for **counter sales only**:

- `'warn'` → both allowed after confirmation.
- `'block'` → both refused with a plain error.
- **Default `'warn'`** — a stock-count error must never stop a sale
  during go-live / the parallel run.

This deliberately **reverses Phase 10's P10-1 hard block when the
setting is `'warn'`** — an item already at ≤0 stock becomes addable to
the cart again under `'warn'` (with a confirmation), where today it is
unconditionally refused. This is a conscious, owner-approved change to
P10-1's shipped behavior, not an oversight — recorded here, not silently
introduced.

**Pre-code verification performed (A17-1, mandatory before any editing)
— (a) through (e):**

| #   | Question                                                               | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) | Is P10-1's ≤0 block server-enforced, or only in `ItemSearchPanel.tsx`? | **Client-only.** Both checks live in `ItemSearchPanel.tsx` — `onSelect` (line 167) and `confirmPending` (line 113), both testing `item.stockOnHandMilli !== null && <= 0`. Nothing in `sale.repository.ts` or any handler enforces this today. A direct IPC call to `sale:create` is never blocked for an already-zero item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| (b) | Does the stock warning fire before or after commit?                    | **AFTER — and currently dead.** `sale.repository.ts`'s transaction always commits fully (`sale`/`saleLine`/`stockMovement`/`partyLedger` all inserted) before returning `warnings`. The client (`useSaleFlow.ts:207-221`) only inspects `warnings.creditLimitExceeded`; `warnings.stockBelowZero` is computed server-side but **never read by the UI at all** since P10-1 (confirmed by the file's own comment, lines 211-213, and `saleWarnings.ts:7-13`). **STOP triggered — see the design choice below; not built without owner go-ahead.**                                                                                                                                                                                                                                                                                                                       |
| (c) | Per line or per item (summed)?                                         | **Per line, not summed** — confirms the suspected bug. Two cart lines of the same item both read the identical pre-decrement on-hand figure (`sale.repository.ts:219`; decrements only happen in a later loop) — an item with 3 in stock split across two 2-unit lines (4 total) passes both individual checks (3−2=1 twice) while actually overselling by 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| (d) | Does on-hand include technician custody?                               | **The server's own transaction check does not** — correctly scoped to one `warehouseId`, resolved to the single seeded "Shop" warehouse (`resolveDefaultWarehouseId`, `sale.repository.ts:65-76`; `bootstrap.ts:268` seeds exactly one `is_default=1` "Shop" row; technician warehouses are separate rows, `job-part.repository.ts`'s `resolveTechnicianWarehouseId`). **But the client-facing `item.stockOnHandMilli` field does** — `item.repository.ts:206-212,269` sums `v_stock_on_hand` with **no warehouse filter at all**, so stock currently out with a technician (`transfer_out`/`transfer_in`, netting to zero across the combined total) still counts as "in stock" here. **STOP triggered** — P10-1's hard block, and any low-stock badge built on this same field, can under-report a genuinely empty counter whenever stock is out with a technician. |
| (e) | Item-level stock-tracking column?                                      | Exists: `item.track_stock` / `trackStock` (`item.repository.ts:233,253,266,295`, boolean `0/1`). No column needs to be added.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**D17-1 — ANSWERED (resolves the (b) blocker). Option C (neither A nor
B):** `sale:create` gains `acknowledgedNegativeStock: boolean` (Zod,
default `false`). Inside the sale transaction, **before any insert**,
the unified predicate runs (per item, summed across lines, base
milli-units, Shop warehouse only, `trackStock=false` exempt):

- `'block'` → throws `NegativeStockBlockedError(items)`. The flag is
  ignored — it can never bypass a block.
- `'warn'` + not acknowledged → throws
  `NegativeStockConfirmationRequiredError(items)`. Nothing is inserted.
- `'warn'` + acknowledged → commits normally, `warnings.stockBelowZero`
  reflects that it happened.

`items = readonly { itemId, name, onHandMilli, requestedMilli }[]`.
Client: catches the confirmation error, shows **one** dialog listing the
items, resubmits the identical input with the flag set on confirm. A
block error shows a plain error; the cart is never touched (nothing was
ever committed to undo). The credit-limit flow (`isCreditLimitExceeded`)
stays exactly as it is today — untouched by this phase.

**Options A/B/C and why B was rejected (recorded per instruction):**

- **Option A — validate-then-commit (separate dry-run channel):** a
  second read-only IPC call runs the same predicate before `sale:create`
  is ever invoked. Rejected in favor of C — an extra round trip and a
  second place the predicate logic could drift from the real commit-time
  check, for no benefit Option C doesn't already give.
- **Option B — extend today's commit-then-offer-to-cancel pattern**
  (the credit-limit gate's own shape): **rejected.** During the
  parallel run, `'warn'` is the default and stock-count drift is
  expected to be frequent — Option B would mean every one of those
  warnings leaves behind a real committed-then-cancelled sale: a
  reversal `stock_movement`/`party_ledger` row pair and a **consumed,
  never-reusable invoice number** for every single warning the owner
  declines. At expected parallel-run frequency this pollutes the
  document-number sequence and the ledger with noise on a near-daily
  basis. Option C's pre-insert throw has zero footprint when declined —
  no row of any kind, no consumed doc number.
- **Option C — validate-inside-the-same-transaction, throw-before-insert,
  client resubmits with an acknowledgement flag:** the one built. No
  second channel (unlike A), no throwaway committed rows (unlike B).
  **Logged in `PROJECT.md` as a known wart, not fixed this phase:** the
  credit-limit gate itself _still_ uses the Option-B shape (commit,
  then offer to cancel) — a real, pre-existing inconsistency now that
  Option C exists as the better pattern. Candidate for the credit-limit
  gate to adopt the same shape in a future phase; out of scope here
  (CLAUDE.md §8 — don't fix a bug outside the task at hand).

**Not blocked, decided in Rev 3, unchanged:** the on-hand figure the
unified predicate reads must be **warehouse-scoped to the Shop counter
only**, mirroring `sale.repository.ts`'s own existing, correct pattern —
**never** the existing all-warehouse client DTO field.

**D17-2 — recorded in `PROJECT.md` Known Bugs (dated, this session):**
over-quantity counter sales currently commit silently with no warning —
`stockBelowZero` has been computed but never read by the UI since P10-1
(verification finding (b)). **Fixed by P17-1.**

**D17-3 — ANSWERED (resolves the (d) blocker). Add a separate field,
do not repurpose the existing one:** a new, Shop-warehouse-scoped
`counterStockMilli` is added alongside the existing all-warehouse
`stockOnHandMilli`, which is **not changed** — it is the business
unit's owned stock (parts in a technician's custody are still owned by
Spare Parts) and stays correct for stock valuation and the Items list
quantity. Every real consumer of `stockOnHandMilli`, checked before
writing any code:

| Consumer                              | File:line                                                                                                                             | Keeps all-warehouse, or switches to counter?                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P10-1 hard-block guards               | `apps/client/src/pages/sales/ItemSearchPanel.tsx:113,167`                                                                             | **Switches** — this is exactly the counter-sellability check                                                                                         |
| POS product-card / cart badge         | `apps/client/src/pages/sales/ItemProductCard.tsx:57` (`resolveStockBadge`)                                                            | **Switches** — the sales-screen badge must reflect what the counter can actually sell                                                                |
| Items-list badge                      | `apps/client/src/pages/items/ItemsPage.tsx:156` (`resolveStockBadge`, same shared function, different call site)                      | **Keeps** all-warehouse — inventory management cares about total owned stock, not counter-sellability                                                |
| Field source (query/type definitions) | `packages/db/src/repositories/item.repository.ts:206-212,269`, `item.repository.port.ts:40`, `packages/contracts/src/item/item.ts:89` | Not a consumer — the field's own definition; unchanged, a sibling field (`counterStockMilli`) added                                                  |
| Stock valuation report                | `packages/db/src/repositories/report.repository.ts` (queries `v_stock_on_hand` directly)                                              | **Keeps** all-warehouse — not literally a consumer of this DTO field (separate query), but same correct semantic: custody-held stock still has value |

No consumer beyond these was found — confirmed by a full-repo grep of
`stockOnHandMilli` before writing any code. Only the three named in the
original instruction (sale predicate, cart badge, `ItemSearchPanel`)
switch in P17-1; the Items-list badge is explicitly **not** touched by
P17-1 (it switches, if at all, only when P17-2 builds the low-stock
badge — and even then, per §2.2, the low-stock rule reads the same new
counter-scoped figure, while the _existing_ out-of-stock/low-stock badge
on the Items list is a separate, pre-existing display this phase does
not have to touch to satisfy P17-2's own requirement).

| ID         | Setting                                                                                                                                                    | Source                                                                                                                                                                                     | Today's behaviour                                                                                                                                 | Proposed control & default                                                                                                                                                                                                                                                                                    | Storage                                    | Money/stock impact & history protection                                                                                                                                         | Effort                                                                                                                                                | Tier     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S17-SALE-1 | `negativeStockPolicy: 'warn' \| 'block'` (Q17-6) — governs both the already-≤0 add-to-cart case and the exceeds-on-hand-at-commit case, counter sales only | `packages/core/src/sale/sale.ts:61-64`; `packages/db/src/repositories/sale.repository.ts:219-220,427`; `apps/client/src/pages/sales/ItemSearchPanel.tsx:113,167`; `useSaleFlow.ts:207-221` | See the verification table above — two distinct mechanisms, one dead (server-computed, never surfaced), one client-only and never server-enforced | One core predicate, summed per item across cart lines (base stock milli-units, ADR-0013), read against the Shop-counter warehouse only. `'block'` → the transaction throws, nothing inserted. `'warn'` → both allowed after confirmation (design pending, see above). **Default `'warn'`** (Q17-6, ANSWERED). | KV (`setting.key = 'negativeStockPolicy'`) | No history rewrite — gates only the NEXT counter sale's commit step. A sale already committed under `'warn'` stays valid forever even if the owner later switches to `'block'`. | **M/L** (revised up from M — a genuine core-predicate rewrite plus a warehouse-scoping fix and a client-architecture decision, not a one-line toggle) | T1       |
| S17-SALE-2 | POS/product grid default (owner-pinned vs recent items)                                                                                                    | Phase 8 open item (owner discussion, chat-derived)                                                                                                                                         | No grid exists at all — Sales screen is search-only. Confirmed by grep: zero `ProductGrid`/`pinned`/`recentItems` hits.                           | **Reject for T1/T2** — see §3.                                                                                                                                                                                                                                                                                | —                                          | —                                                                                                                                                                               | —                                                                                                                                                     | T3       |
| S17-SALE-3 | Rows-per-page for reference-data lists reused on Sales                                                                                                     | Not requested; code audit only                                                                                                                                                             | No pagination exists on the search-driven item picker                                                                                             | Reject — no matching UI to configure                                                                                                                                                                                                                                                                          | —                                          | —                                                                                                                                                                               | —                                                                                                                                                     | Rejected |

**Rules (binding on implementation, from A17-1):**

- **One core predicate**, server-side, not two code paths: per item,
  quantities **summed across every cart line for that item**, in base
  stock milli-units (after ADR-0013 unit conversion — compare
  `stockQuantityMilli`, never the raw sale-unit quantity). Formula:
  `(onHandMilli − totalRequestedMilli) < 0`, read against the **Shop
  counter warehouse only** (per (d) above). Under `'block'`, the sale
  transaction throws a typed domain error and inserts nothing — the
  setting is read inside the same transaction as the check.
- Resulting stock of **exactly 0 is allowed** in both modes (the
  predicate is a strict `< 0`, matching today's `isStockBelowZero`).
- Items with `trackStock = false` are **exempt from both mechanisms in
  both modes** — never warned, never blocked.
- **`'warn'` UX:** no add-time dialog for ≤0 items (the stock badge
  already shows it) — **one** commit-time confirmation listing every
  item that will go negative (design choice above still open). The
  credit-limit warning stays its own separate, untouched path
  (`isCreditLimitExceeded`).
- **`'block'` UX:** UI refuses at add time for ≤0 items and at commit
  for an over-quantity cart (a client-side mirror only); the server
  refuses both regardless of what the UI does.
- **Parallel-run note:** with P17-2's shop-default-`0` low-stock rule,
  every item driven negative under `'warn'` will appear on the
  low-stock dashboard card — this doubles as the parallel-run
  reconciliation list the owner uses to catch stock-count errors by
  hand during go-live, which is exactly why `'warn'` is the default.

**Exact code-path scope for the 'block' mode, verified (unchanged from
Rev 2, still accurate):**

| Code path                                | File:line                                               | Movement type           | Affected by 'block'?                                                                   |
| ---------------------------------------- | ------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Counter sale line                        | `sale.repository.ts:220,339`                            | `sale`                  | **Yes — the only path this setting touches.**                                          |
| Issue part to technician custody         | `job-part.repository.ts:132` (`issuePartsToTechnician`) | `transfer_out`          | **No.** No stock check exists today — stays exactly as-is.                             |
| Issue part to a job                      | `job-part.repository.ts:316` (`issuePartsToJob`)        | `job_issue`             | **No.** Same — no check exists, none added.                                            |
| Internal transfer (Spare Parts → Repair) | `internal-transfer.repository.ts:172`                   | `transfer_out`          | **No.** No check exists, none added.                                                   |
| GRN cancellation reversal                | `grn.repository.ts:656`                                 | `purchase_cancellation` | **No.** A reversal must always be allowed to post regardless of resulting stock level. |
| Purchase cancellation reversal           | `purchase.repository.ts:384`                            | `purchase_return`       | **No.** Same reasoning.                                                                |

### 2.2 Items / Stock (revised, A17-2)

**Correction (C17-5, Rev 2):** the first draft said low-stock items are
"never flagged" with no stated rule for when the feature is built. The
rule is fixed by owner answer (Q17-3): flagged when `qty_on_hand <=
item.reorder_level`, or `<= shop default` when `reorder_level` is
`NULL`; shop default = `0`. `qty_on_hand` here means the **same
Shop-counter-only figure required by A17-1(d)** — never the all-warehouse
client DTO field currently in use elsewhere.

**New exclusions (A17-2), required in the rule itself and in every
test:**

- An item with `trackStock = false` is **never flagged**, regardless of
  its `qtyOnHand` — excluded from both the badge and the dashboard count
  entirely (matches S17-SALE-1's exemption, same reasoning: this item's
  "stock" isn't a real quantity to track).
- A **deleted** item (`deletedAt` not null) is **never flagged and never
  counted** — a deactivated item should not appear as a false alarm on a
  list or dashboard the owner is actively working from.

| ID         | Setting                                                              | Source                                                                                                                                          | Today's behaviour                                                                                                                                            | Proposed control & default                                                                                                                                                                       | Storage                                                                                                | Money/stock impact & history protection | Effort | Tier |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------ | ---- |
| S17-ITEM-1 | Low-stock badge on the Items list, rule above + exclusions           | `packages/db/src/kysely-schema.ts:30` (`reorderLevel`), `item-import.ts:41,268-325` (CSV already populates it); confirmed zero UI read anywhere | `reorderLevel` stored per item, populated by CSV import, never read by any screen; existing `stockOnHandMilli` DTO field is wrongly all-warehouse (A17-1(d)) | Badge reads a new **warehouse-scoped** on-hand figure; flagged when `qtyOnHand <= reorderLevel` (or `<= 0` when null); excludes non-tracked and deleted items. **Default ON** (Q17-3, ANSWERED). | REF (existing `item.reorder_level` column) + one KV toggle to hide the badge if the owner wants it off | Read-only. Zero history risk.           | S      | T1   |
| S17-ITEM-2 | Shop-wide default low-stock threshold when `reorder_level` is `NULL` | Same as above                                                                                                                                   | No fallback exists — a null-threshold item is never flagged today                                                                                            | Settings numeric field "Default low-stock qty" — **default `0`** (Q17-3, ANSWERED)                                                                                                               | KV                                                                                                     | Read-only. Zero history risk.           | S      | T1   |

### 2.3 Suppliers / Purchase Orders & GRN

| ID        | Setting                                                               | Source                                               | Today's behaviour                                         | Proposed control & default                            | Storage           | Money/stock impact & history protection | Effort | Tier |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ----------------- | --------------------------------------- | ------ | ---- |
| S17-PUR-1 | Purchase/GRN document print paper size                                | Code audit                                           | See §2.9 S17-PRINT-2b — folded there to avoid duplication | —                                                     | KV (existing key) | Print-time only                         | S      | T2   |
| S17-PUR-2 | Supplier/Customer/Purchase settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B3/S-B4 ("deferred") | No Settings section exists for either module              | Rejected — too vague to scope without a named control | —                 | —                                       | —      | T3   |

### 2.4 Customers

| ID        | Setting                                             | Source                                          | Today's behaviour                 | Proposed control & default                                                                 | Storage | Money/stock impact & history protection | Effort | Tier |
| --------- | --------------------------------------------------- | ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ | ------- | --------------------------------------- | ------ | ---- |
| S17-CUS-1 | Customer settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B2 ("deferred") | No Settings section for Customers | Rejected — credit-limit default is already per-customer, nullable, correctly not shop-wide | —       | —                                       | —      | T3   |

### 2.5 Reports — rows per page (revised, A17-4)

**Correction:** the prior revision described this as "11 report files" —
inaccurate framing (the count of 11 was already correct; the label
"report files" was not). A fresh grep of `ROWS_PER_PAGE` across the whole
repo confirms **exactly 11 code files use this pattern**, but only **9
are actual report tabs** — `JobsPage.tsx` is the Jobs **list** page (not
a report), and `CustomerLedgerTable.tsx` is a Customers-detail component
(using `15`, not `10`). The file count and task scope are unchanged;
only the description was wrong.

| File                                                                                                                                                                                                                                       | Constant value |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `DailySalesReport.tsx`, `CashBookReport.tsx`, `BestPerformersTable.tsx`, `ItemsSoldTable.tsx`, `WageMonthReport.tsx`, `ReceivablesAgingReport.tsx`, `ExpensesReport.tsx`, `JobSplitReport.tsx`, `StockValuationReport.tsx` (9 report tabs) | `10`           |
| `JobsPage.tsx` (Jobs list — **not** a report)                                                                                                                                                                                              | `10`           |
| `CustomerLedgerTable.tsx` (Customer detail — **not** a report)                                                                                                                                                                             | `15`           |

**Implementation change (A17-4):** read via **one shared hook/context**
(e.g. `useRowsPerPage()`), not 12 separate per-mount IPC fetches — one
IPC read on app start, cached, all 11 tables subscribe to it. Changing
the setting updates every open table immediately, with no app reload
needed.

| ID        | Setting                                                                                          | Source                                                                                      | Today's behaviour                                                                                                                                               | Proposed control & default                                                                                                                                                                                                                                                                                | Storage                                                           | Money/stock impact & history protection     | Effort                                                               | Tier     |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- | -------- |
| S17-REP-1 | Rows per page across every report/list table (9 report tabs + Jobs list + Customer ledger table) | PROJECT.md:253,1002,4238-4241 (S-B5); `docs/phases/PHASE_11.md:61` (explicit deferral note) | 11 separate hardcoded `const ROWS_PER_PAGE = ...` copies (see table above); `CustomerLedgerTable.tsx:41` uses `15` — an unexplained, pre-existing inconsistency | One Settings numeric field, "Rows per page" (10/25/50 choices), read via **one shared hook/context**, not per-table fetches. **Default `10` everywhere, including `CustomerLedgerTable`** (Q17-2, ANSWERED — a deliberate 15→10 normalization). Changing the setting updates open tables live, no reload. | KV (`setting.key = 'rowsPerPage'`), read once via the shared hook | Read-only display setting. No history risk. | M — touches 11 files, each independently verified per Golden Rule #4 | T1       |
| S17-REP-2 | Report date format                                                                               | PROJECT.md §Settings Backlog, S-B5                                                          | Fixed format, not owner-facing today                                                                                                                            | Rejected — no concrete owner complaint on record                                                                                                                                                                                                                                                          | —                                                                 | —                                           | —                                                                    | T3       |
| S17-REP-3 | Report default date range                                                                        | PROJECT.md §Settings Backlog, S-B5                                                          | Every report defaults to "This Month" via `DateRangeSelector.tsx:20-27`'s hardcoded `PRESETS` list                                                              | Rejected — cosmetic UI default, not a business-policy variation                                                                                                                                                                                                                                           | —                                                                 | —                                           | —                                                                    | Rejected |

### 2.6 Expenses (revised, A17-3, A17-5)

**Correction (C17-3, Rev 2, unchanged):** verified every report/view
query that joins `expense_category` — none of `v_unit_direct_expense`
(`0003_shared_overhead.sql:81-92`), `v_overhead_pool` (`:94-106`),
`v_owner_drawings` (`:127-135`), or `getExpenseSummaryReport`
(`report.repository.ts:579-593`) filters `ec.deleted_at IS NULL`. The
**only** query that does is `listCategories()`
(`expense.repository.ts:174-184`) — correctly, since that is the
create-expense-form category picker. **Reusing the existing `deleted_at`
column for deactivation is safe — no new `is_active` migration is
needed.** `expense_category` has zero repository write path today
(`expense.handler.ts` exposes exactly 4 read-only channels: `create`
(for expenses, not categories), `list`, `listCategories`,
`listBusinessUnits`).

#### Expense Categories form (S17-EXP-1) — schema-corrected (A17-3)

**Schema correction found while drafting the form wording, reported
before finalizing (per instruction — not silently substituted):**
`expense_category`'s real columns are `name`, `kind` (`'fixed' |
'variable'` — a **cost-accounting classification**, e.g. rent recurs
regardless of activity while fuel varies with it — **not** Direct/Shared
as the amendment's draft assumed), `is_billable`, `is_owner_drawing`,
`sort_order`, `deleted_at` (`0001_init.sql:493-503`), plus
`allocation_method` (`'direct' | 'shared_revenue' | 'shared_fixed' |
'not_expense'`, `NOT NULL DEFAULT 'direct'`) and `parts_share_bp`
(nullable) added by `0003_shared_overhead.sql:37,43`.

**There is no `business_unit_id` column on `expense_category` at all** —
that field lives on `expense` (the individual transaction,
`0003_shared_overhead.sql:59` alters `expense`, not `expense_category`)
and on `attendance`/`payment`, chosen per transaction at entry time,
already-existing behavior, entirely unaffected by this phase. The
Direct/Shared business-unit-split concept the amendment's draft wording
described is actually `allocation_method` (a different column from
`kind`), which the amendment separately says must stay **out** of the
form — consistent with Q17-1 (don't build the overhead split this
phase).

**D17-4 findings, verified against real seeded data and live view SQL
before writing any code (doc update only this step):**

**(a) The 6 seeded rows** (`bootstrap.ts:44-51`), exact values:

| Name          | `kind`     | `allocationMethod` | `isBillable` | `isOwnerDrawing` |
| ------------- | ---------- | ------------------ | ------------ | ---------------- |
| Electricity   | `fixed`    | `shared_revenue`   | `0`          | `0`              |
| Rent          | `fixed`    | `shared_revenue`   | `0`          | `0`              |
| Bike Fuel     | `variable` | `direct`           | `0`          | `0`              |
| Courier       | `variable` | `direct`           | `0`          | `0`              |
| Petrol        | `variable` | `direct`           | `0`          | `0`              |
| Miscellaneous | `variable` | `direct`           | `0`          | `0`              |

All 6 have `isBillable=0` and `isOwnerDrawing=0` uniformly — no seeded
row is an owner drawing, so the "owner drawing to not_expense" pairing
the instruction expected is not actually observed in any seed; it comes
from the migration's own comment, and (per (b) below) is never checked
by any view either way.

**(b) Column each of the 4 consumers filters on** — all four filter
**only on `is_owner_drawing`**:

| View / function                                            | Filters on                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `v_unit_direct_expense` (`0003_shared_overhead.sql:81-92`) | `ec.is_owner_drawing = 0` (plus `bu.is_overhead = 0`, a `business_unit` column, unrelated to this table) |
| `v_overhead_pool` (`:94-106`)                              | `ec.is_owner_drawing = 0`; groups by `ec.allocation_method, ec.parts_share_bp` but filters on neither    |
| `v_owner_drawings` (`:127-135`)                            | `ec.is_owner_drawing = 1`                                                                                |
| `getExpenseSummaryReport` (`report.repository.ts:579-593`) | `ec.is_owner_drawing = 0`                                                                                |

**None of the four ever filter on `kind` or `is_billable`.**

**(c) Readers of `kind`/`is_billable` in application logic — zero for
both.** `kind` appears only in a test fixture (`ExpensesPage.test.tsx:105`)
— `AddExpenseModal.tsx` never branches on it. **`is_billable` is not
even selected by `listCategories()`** (`expense.repository.ts:174-184`
selects only `id, name, kind, allocationMethod`), and
`ExpenseCategoryDto` (`packages/contracts/src/expense/expense.ts:41-47`)
has no `isBillable` field at all — it never reaches the client. (Every
other `isBillable` hit in the repo is `job_part.is_billable`, an
unrelated column on a different table — per-job billing, not this one.)

**Rule set, per D17-4:**

- `allocation_method` is **derived** from `is_owner_drawing`, never a
  form field: `true` maps to `'not_expense'`, `false` maps to
  `'direct'`. A core rule enforces the two can never disagree.
  (`'not_expense'` itself is never read by any view either — only
  `is_owner_drawing` is — so this is for internal consistency, not
  because a report requires it.)
- **`kind` has zero readers, so it is hidden from the form**, defaulted
  to `'variable'` (the majority of the 6 seeds — 4 vs. 2 — there is no
  single value that fits all 6).
- **Correction to the instruction's own premise:** "Billable help text
  must cite its actual consumer" assumed one exists. **It doesn't** —
  `is_billable` has the same zero-consumers problem as `kind`. Applying
  the same rule symmetrically: **`is_billable` is also hidden**,
  defaulted to `false` (matching all 6 seeds). Flagged for owner review
  before P17-4 starts — the alternative (keep it visible with honest
  "not yet used by any report" wording) is available if preferred.

**Corrected field list** (owner reviews before P17-4 starts):

| Field                              | Shown?        | Reasoning                                                                                                                                                                                                           |
| ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                               | Yes           | (no help text needed)                                                                                                                                                                                               |
| Owner drawing                      | Yes           | "Owner drawing: money the owner takes for personal use. It is moved out of business expenses and does not reduce either shop's profit." — matches `is_owner_drawing`, the one column every real consumer filters on |
| Kind                               | **Hidden**    | Zero readers (D17-4c) — defaulted to `'variable'`                                                                                                                                                                   |
| Billable                           | **Hidden**    | Zero readers (D17-4c) — defaulted to `false`, matching all 6 seeds                                                                                                                                                  |
| Business unit                      | **Removed**   | Not a category-level field — chosen per expense at entry time on the existing expense form, unaffected by this phase                                                                                                |
| Allocation method / Parts share bp | **Not shown** | `allocation_method` derived from `is_owner_drawing`; `parts_share_bp` stays `NULL`, matching all 6 seeds and Q17-1                                                                                                  |

**Field-lock rule (Q17-5, ANSWERED), corrected list:** once any expense
references a category, only its **`name`** stays editable —
`is_owner_drawing` locks (the only other field this form actually
writes). Enforced by a new core check (e.g.
`assertExpenseCategoryFieldsLocked`), following the
`assertCommissionModeConsistent` precedent
(`packages/core/src/job/service-charge.service.ts:21-84`) — logic lives
in `packages/core`, never a DB constraint (CLAUDE.md section 3.7).
in `packages/core`, never a DB constraint (CLAUDE.md §3.7).

**Invalid combinations rejected in `packages/core`** (checked against
what the live views actually filter on, not assumed):

- `is_owner_drawing=1` AND `is_billable=1` — an owner's personal draw
  can't simultaneously be billed to a customer.
- Any non-null `parts_share_bp` while `allocation_method !==
'shared_fixed'` — per the migration's own comment
  (`0003_shared_overhead.sql:43-45`, "NULL otherwise"). Unreachable
  through this form today (the form never sets either field), stated as
  a core-level rule for any future write path to this table.
- **Not enforced, removed from the rule list:** "direct with no business
  unit" / "shared with a business unit" — there is no `business_unit_id`
  column on this table to check against; the amendment's draft rule was
  based on a column that doesn't exist here.

Deactivation (Q17-5, ANSWERED): always allowed, soft via the existing
`deleted_at` (confirmed safe above). Reports keep showing history of
deactivated categories.

| ID        | Setting                                                                                           | Source                                                                         | Today's behaviour                                                                                                            | Proposed control & default                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Storage                                                                       | Money/stock impact & history protection                                                                                                                                                                 | Effort | Tier                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| S17-EXP-1 | Manage expense categories from Settings                                                           | PROJECT.md §Settings Backlog, S-B7 ("current behaviour acceptable — deferred") | `expense_category` (6 bootstrap-seeded rows, `bootstrap.ts:44-51`) has no repository write path at all                       | New Settings section "Expense Categories" — list/create/edit(name-only-once-referenced)/deactivate, mirroring the Service Charges/Brands pattern (Phase 16) exactly, corrected field list above                                                                                                                                                                                                                                                                                 | REF (`expense_category`, needs a repository write path — currently read-only) | Deactivating a category never edits a historical `expense` row's `category_id` — confirmed no report filters `deleted_at`, so reports keep showing the historical amount for the period it occurred in. | M      | T1                                                                                        |
| S17-EXP-2 | Manage payment methods from Settings (full open-ended reference-data version)                     | Owner discussion (chat-derived)                                                | No payment-method reference table exists — `CreatePaymentInput['method']` is a closed Zod enum                               | Rejected for T1 — turning the closed enum into open reference data ripples into payment recording, receipts, and every cash-vs-method report. See S17-EXP-4 for the smaller, accepted version.                                                                                                                                                                                                                                                                                  | —                                                                             | —                                                                                                                                                                                                       | L      | T3                                                                                        |
| S17-EXP-3 | Q10 — `parts_share_bp` allocation for SHARED categories (electricity, rent)                       | PROJECT.md §Open Questions Q10; `bootstrap.ts:39-42`                           | Every `expense_category` row has `allocation_method`/`parts_share_bp`; `parts_share_bp` is always `NULL` on every seeded row | **Moved to T3 (C17-4).** Verified no live consumer: `v_overhead_pool` (`0003_shared_overhead.sql:94-106`) only `SELECT`s/`GROUP BY`s `parts_share_bp` as a passthrough column alongside `SUM(e.amount)` — no SQL or application code anywhere performs the actual split arithmetic. Reason for T3: no consumer — belongs with a future unit P&L overhead report. The 50/50 recommendation from the first draft is withdrawn — split percentages are the owner's decision alone. | REF (existing columns, currently unset)                                       | N/A — not built this phase                                                                                                                                                                              | —      | T3 (Q17-1, ANSWERED: do not build in Phase 17)                                            |
| S17-EXP-4 | Enable/disable the existing 5 fixed payment methods from Settings (hide unused ones from pickers) | Code audit (C17-8); rules revised A17-5                                        | `PaymentMethodToggle.tsx:12-16` hardcodes cash/bank/easypaisa/jazzcash/cheque with no enable/disable concept                 | New KV boolean per method, all default `true` (= today's behaviour). Follows the exact precedent already shipped in `DiscountsSettingsSection.tsx` (`getDiscountPkrEnabled`/`setDiscountPkrEnabled`, lines 43-44, 98-99, 164, 188). **Cash cannot be disabled** (A17-5 — cash session/cash book depend on it always being available; at least one method always stays enabled). If the currently-selected default in the picker is disabled, it falls back to Cash.             | KV                                                                            | Enable/disable is picker-only, **never** enforced server-side, and never touches a stored historical `payment.method` value — stated explicitly. `CreatePaymentInput['method']` stays a closed union.   | S      | T2 — **scope-approved for this phase as P17-7** (see §6), tier stays T2 in this inventory |

### 2.7 Staff & Attendance

**Correction (C17-1, Rev 2, unchanged): the first draft's claim that
Attendance "has no schema support" was wrong** — it relied on stale
`PROJECT.md` prose instead of the live code. Attendance is fully built
(Phase 7):

- Schema: `packages/db/src/migrations/0001_init.sql:627-640` —
  `attendance` table, `status` (`present | half_day | absent | leave |
holiday`), `wage_earned INTEGER NOT NULL DEFAULT 0` (paisa).
- `wage_earned` is a **snapshot**, not a live-derived value — computed
  once by the pure function `computeDayWage`
  (`packages/core/src/payroll/wage.service.ts:12-24`) and written at
  save time by `saveAttendanceBatch`
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

| ID          | Setting                                          | Source                                                                                                                                                      | Today's behaviour                                                                                                   | Proposed control & default                                                                                                                                                                                                                                                                                                                                                                                                                        | Storage | Money/stock impact & history protection                                                                             | Effort | Tier     |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| S17-STAFF-1 | Staff settings (owner's general Phase 4 request) | PROJECT.md §Settings Backlog, S-B6 ("deferred")                                                                                                             | No Settings section                                                                                                 | **Corrected reasoning (C17-2):** `party.commission_bp` (the old per-technician rate) was **retired by ADR-0015/Phase 16** — still round-tripped by `party.repository.ts`/`AddStaffModal.tsx` but always forced to `0` and never read by any wage/commission calculation. Commission today is configured **per service charge**, already built in Settings → Jobs → Service Charges. Nothing shop-wide/per-technician remains to expose. Rejected. | —       | —                                                                                                                   | —      | T3       |
| S17-STAFF-2 | Half-day wage fraction                           | `packages/core/src/payroll/wage.service.ts:19` — `Math.floor(wageRatePaisa / 2)`                                                                            | Hardcoded 0.5× (floored), applied to every `half_day` attendance entry                                              | Settings numeric field "Half-day wage fraction (%)" — **default `50`** (= today's behaviour exactly)                                                                                                                                                                                                                                                                                                                                              | KV      | `wage_earned` is a save-time snapshot — changing this setting never rewrites a past attendance row's `wage_earned`. | S      | T2       |
| S17-STAFF-3 | Whether Leave / Holiday are paid                 | `packages/core/src/payroll/wage.service.ts:14-23` — `holiday` grouped with `present` (paid 1.0×, "shop closed"); `leave` grouped with `absent` (0×, unpaid) | Hardcoded: Holiday paid in full, Leave unpaid                                                                       | Two Settings toggles — "Pay staff for Holiday" (**default ON**), "Pay staff for Leave" (**default OFF**) — both equal today's behaviour exactly                                                                                                                                                                                                                                                                                                   | KV      | Same snapshot protection as S17-STAFF-2                                                                             | S      | T2       |
| S17-STAFF-4 | Weekly off day                                   | Grepped `weeklyOff`/`weekly_off`/`dayOff`/`sunday` (case-insensitive) across `packages/core`, `packages/db`, whole repo — zero matches                      | **Does not exist at all** — every calendar day is manually entered as one of the 5 statuses                         | Rejected for T1/T2 — a genuine feature gap (a new auto-marking concept), not a hardcoded value to flip. Would need its own schema/UI design.                                                                                                                                                                                                                                                                                                      | —       | —                                                                                                                   | L      | T3       |
| S17-STAFF-5 | Attendance status list (P/H/A/L/Ho)              | `packages/contracts/src/attendance/attendance.ts:8`                                                                                                         | Already a single canonical Zod enum, consumed (not redeclared) everywhere, including the UI's own presentation maps | Nothing to fix — reject, already correctly implemented                                                                                                                                                                                                                                                                                                                                                                                            | —       | —                                                                                                                   | —      | Rejected |

### 2.8 Custody

| ID         | Setting          | Source                                                       | Today's behaviour                                                  | Proposed control & default                                | Storage | Money/stock impact & history protection | Effort | Tier     |
| ---------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------- | ------- | --------------------------------------- | ------ | -------- |
| S17-CUST-1 | Custody settings | PROJECT.md §Settings Backlog, S-B9 ("ADR-0006 governs this") | Custody reconciliation is noted, never auto-deducted, per ADR-0006 | Rejected — the owner's own prior ADR already settled this | —       | —                                       | —      | Rejected |

### 2.9 Printing & documents

**Correction (C17-6, Rev 2, unchanged):** verified all 4 print files
individually. All are **fully hardcoded** to `'A4'` with the
`receiptPaperSize` setting never entering their call chain at all
(confirmed by reading each handler: `invoice.handler.ts`, the
payment-receipt/customer-statement branches of `print.handler.ts`, and
`purchase-print.handler.ts` — none reference `getReceiptPaperSize`).
Split by daily-use frequency: invoice + payment receipt are generated on
**every sale / every payment received**; purchase orders and customer
statements are occasional.

| ID           | Setting                                                                                                                       | Source                                                                                                                                                                                | Today's behaviour                                                            | Proposed control & default                                                                                                                                                                                                                | Storage           | Money/stock impact & history protection | Effort                                                                                  | Tier                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| S17-PRINT-2a | Wire the existing `receiptPaperSize` setting into **sale invoice + payment receipt** prints (daily customer-facing documents) | `apps/server/src/printing/invoice-pdf.ts:10-12` (no size parameter at all, hardcoded `'A4'`); `payment-receipt-pdf.ts:12,36` (hardcoded `'A4'`)                                       | Both always print A4 regardless of the existing Settings A4/A5 toggle        | Thread `getReceiptPaperSize(kysely, tenantId)` through `invoice.handler.ts` and the payment-receipt branch of `print.handler.ts`, exactly as the existing reprint-receipt path already does (`print.handler.ts:56`, `sale.handler.ts:59`) | KV (existing key) | Print-time only. Zero history impact.   | S                                                                                       | **T1** (promoted — daily customer-facing documents) |
| S17-PRINT-2b | Wire the same setting into **purchase-order + customer-statement** prints                                                     | `purchase-pdf.ts:45` (doesn't even accept a size parameter — own hardcoded `PDFDocument({ size: 'A4' })` and hardcoded `MARGIN`); `customer-statement-pdf.ts:7,33` (hardcoded `'A4'`) | Both always print A4                                                         | Same wiring approach, into `purchase-print.handler.ts` and the customer-statement branch of `print.handler.ts`                                                                                                                            | KV (existing key) | Print-time only. Zero history impact.   | M (purchase-pdf.ts needs a size parameter added first, plus an A5 layout check on both) | T2                                                  |
| S17-PRINT-1  | Thermal printer option alongside A4/A5                                                                                        | PROJECT.md:959-963,1009-1013,4325 (Q7, OPEN)                                                                                                                                          | No thermal/ESC-POS code exists at all — confirmed zero `80mm`/`thermal` hits | Rejected for T1/T2 — hardware not yet purchased (Q7 still OPEN)                                                                                                                                                                           | —                 | —                                       | —                                                                                       | T3                                                  |
| S17-PRINT-3  | Document number prefix customization (ADR-0012)                                                                               | ADR-0012; 12+ hardcoded prefix constants across repository files                                                                                                                      | Prefixes are compile-time constants, never owner-configurable                | Rejected — ADR-0012 deliberately fixed this; no owner request to reopen it                                                                                                                                                                | —                 | —                                       | L                                                                                       | T3                                                  |
| S17-PRINT-4  | 2-up printing                                                                                                                 | PROJECT.md Future Feature Requests                                                                                                                                                    | Not built                                                                    | Rejected — "not scheduled to any phase" per PROJECT.md itself                                                                                                                                                                             | —                 | —                                       | —                                                                                       | T3                                                  |

### 2.10 Dashboard

**Correction (C17-5, Rev 2, unchanged):** the first draft wrongly
reported "no candidates found." The owner requested dashboard stock
warnings back in Phase 4 — missed in the original pass.
`apps/client/src/pages/dashboard/DashboardPage.tsx` is 20 lines and
renders exactly one widget, `<CashSessionWidget />`; no low-stock or
stock-warning card exists anywhere in that directory.

| ID         | Setting                             | Source                                | Today's behaviour                                                                      | Proposed control & default                                                                                                                                                                                                                                                                                     | Storage                                          | Money/stock impact & history protection | Effort | Tier                           |
| ---------- | ----------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- | ------ | ------------------------------ |
| S17-DASH-1 | "Low stock: N items" dashboard card | Owner request, Phase 4 (chat-derived) | No such card exists — `DashboardPage.tsx` has exactly one widget (`CashSessionWidget`) | New `LowStockWidget.tsx`, following `CashSessionWidget.tsx`'s exact shape (own file, `useState`/`useEffect`-on-mount IPC call, `<Card>` wrapper), reading the same low-stock rule + exclusions as S17-ITEM-1/2. Links to the Items list pre-filtered to low-stock items. **Default: shown** (Q17-3, ANSWERED). | None of its own — reads live item/threshold data | Read-only. Zero history risk.           | S      | T1 (bundled with S17-ITEM-1/2) |

---

## 3. Rejected candidates (one-line reason each)

- **S17-SALE-2 POS grid default** — the feature doesn't exist; a
  "default view" setting for a nonexistent screen is a feature request,
  not a setting.
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
  smaller enable/disable version is accepted as S17-EXP-4/P17-7 instead.
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
- **Overhead split (`parts_share_bp`, Q10)** — moved to T3 per C17-4: no
  live consumer exists today; belongs with a future unit P&L overhead
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

```text
General            (unchanged)
  Shop
  Invoices & Receipts

Sales
  Discounts                     (existing)
  Stock & Alerts                (NEW, T1 — S17-SALE-1, S17-ITEM-1, S17-ITEM-2)
  Payment Methods                (NEW — P17-7, S17-EXP-4)

Jobs               (unchanged)
  Service Charges
  Brands
  Commission Approvals

Expenses            (NEW GROUP, T1)
  Categories                    (NEW — S17-EXP-1)
  (No "Overhead Split" section — not built this phase, see §4/Q17-1)

Staff              (NEW GROUP, T2 — not built this phase, see §6)
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

## 6. Task breakdown — re-estimated (A17-1, A17-4; SCOPE APPROVED)

**SCOPE APPROVED (2026-09-26):** T1 (P17-1 through P17-5) plus **P17-7**
(payment method enable/disable). P17-6 and P17-8 stay documented as T2,
not built this phase.

Build order matches dependency order (schema/repository before IPC before
UI), same convention as every prior phase's task table.

### T1 — approved for build

| Task ID | Description                                                                                                                     | Files likely touched                                                                                                                                                                                                                                                                                                                                                                    | Migration?                                      | Status                                                                                                                                                                       | Effort                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| P17-1   | `negativeStockPolicy`, one core summed/warehouse-scoped predicate, block+warn, both mechanisms unified (S17-SALE-1)             | `setting.repository.ts`/`setting.handler.ts`, `packages/contracts/src/setting/setting.ts`, new warehouse-scoped stock-check helper (core), `sale.repository.ts` (rewritten check + throw when `'block'`), `ItemSearchPanel.tsx` (mirror only, reads the setting), `useSaleFlow.ts`/`SalePage.tsx` (warn-mode UI — depends on Option A/B), new `sections/StockAlertsSettingsSection.tsx` | No                                              | **BLOCKED** — needs owner's Option A vs. B choice (§2.1) before the warn-mode UI can be written; the core predicate, warehouse-scoping fix, and block mode are all unblocked | **M/L** (revised up from M) |
| P17-2   | Low-stock badge + default threshold + Dashboard card, with `trackStock`/deleted exclusions (S17-ITEM-1, S17-ITEM-2, S17-DASH-1) | `item.repository.ts` (new warehouse-scoped read, shared with P17-1's helper where possible), Items list component, new/extended item-list IPC filter, `setting.repository.ts`/`setting.handler.ts`, `StockAlertsSettingsSection.tsx` (shared with P17-1), new `DashboardLowStockWidget.tsx` + `DashboardPage.tsx` wiring                                                                | No                                              | Ready                                                                                                                                                                        | M                           |
| P17-3   | Rows-per-page via one shared hook/context, default 10 everywhere including `CustomerLedgerTable` (S17-REP-1)                    | `setting.repository.ts`/`setting.handler.ts`, new `useRowsPerPage()` hook, new `sections/ReportsDisplaySettingsSection.tsx`, one-line edits to all 11 files (9 reports + `JobsPage.tsx` + `CustomerLedgerTable.tsx`)                                                                                                                                                                    | No                                              | Ready                                                                                                                                                                        | M                           |
| P17-4   | Expense Categories Settings section, corrected field list (S17-EXP-1)                                                           | New `expense-category.repository.ts` (write path: create/update-name-only-if-referenced/toggle `deleted_at`), new core enforcement check (`assertExpenseCategoryFieldsLocked` + the two invalid-combination rules), new contracts, new IPC channels, new `ExpenseCategoriesTab.tsx` + modal (mirror `BrandsTab.tsx`/`ServiceChargesTab.tsx`)                                            | No — `deleted_at` already exists, safe to reuse | Ready — form wording is provisional, owner reviews before this task starts                                                                                                   | M                           |
| P17-5   | Wire `receiptPaperSize` into sale invoice + payment receipt prints (S17-PRINT-2a)                                               | `invoice-pdf.ts`, `payment-receipt-pdf.ts`, `invoice.handler.ts`, `print.handler.ts` (payment-receipt branch)                                                                                                                                                                                                                                                                           | No                                              | Ready                                                                                                                                                                        | S                           |
| P17-7   | Enable/disable payment methods, cash-cannot-disable + fallback rule (S17-EXP-4)                                                 | `setting.repository.ts`/`setting.handler.ts`, `PaymentMethodToggle.tsx`, new `sections/PaymentMethodsSettingsSection.tsx`                                                                                                                                                                                                                                                               | No                                              | Ready — **scope-approved this phase**, tier stays T2 in the inventory                                                                                                        | S                           |

**Revised total T1 effort estimate:** M/L + M + M + M + S + S ≈ **3–4
focused sessions** (up slightly from the prior "3 sessions" estimate,
reflecting P17-1's re-estimate and P17-7's addition).

### T2 — stays documented, not built this phase

| Task ID | Description                                                                            | Files likely touched                                                                                                                                             | Migration? | Effort |
| ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| P17-6   | Wire `receiptPaperSize` into purchase-order + customer-statement prints (S17-PRINT-2b) | `purchase-pdf.ts` (needs a size parameter added first), `customer-statement-pdf.ts`, `purchase-print.handler.ts`, `print.handler.ts` (customer-statement branch) | No         | M      |
| P17-8   | Half-day wage fraction + Leave/Holiday paid toggles (S17-STAFF-2, S17-STAFF-3)         | `wage.service.ts` (read settings instead of hardcoded constants), `setting.repository.ts`/`setting.handler.ts`, new `sections/PayrollSettingsSection.tsx`        | No         | S      |

**Settings-nav wiring** (the new groups/items from §5) is folded into
whichever of P17-1/P17-3/P17-4/P17-7 lands first — no separate task.

---

## 7. Owner decisions — ANSWERED

**Q17-1 — Overhead split.** **ANSWERED:** Do not build the overhead split
in Phase 17. Percentages will come from the owner when the overhead
report is actually built. → S17-EXP-3 moved to T3.

**Q17-2 — Rows-per-page default.** **ANSWERED:** Default `10` everywhere,
including `CustomerLedgerTable` (its pre-existing `15` is normalized down,
a deliberate, approved behavior change for that one table). → P17-3 built
accordingly.

**Q17-3 — Low-stock badge default + dashboard card.** **ANSWERED:** Badge
ON by default, rule per C17-5 (flagged at `qty_on_hand <= reorder_level`,
or `<= 0` when `reorder_level` is null; excludes non-tracked and deleted
items per A17-2), plus the Dashboard "Low stock: N items" card, also
default-shown. → S17-ITEM-1, S17-ITEM-2, S17-DASH-1 built accordingly.

**Q17-4 — Negative-stock default + block scope.** **ANSWERED:** Default
`'warn'`. `'block'` applies to **counter sales only** — see the exact
code-path table in §2.1. Superseded/unified with Q17-6 below.

**Q17-5 — Expense category deactivation + field-locking.** **ANSWERED:**
Deactivation always allowed (soft, via the existing `deleted_at` column —
confirmed safe, no new `is_active` migration needed). Once any expense
references a category, only its `name` stays editable (corrected list:
`kind`/`is_billable`/`is_owner_drawing` — `business_unit_id` removed, it
doesn't exist on this table; `allocation_method`/`parts_share_bp` removed,
never exposed by this form at all). Reports keep showing the historical
amount for the period it occurred in regardless of the category's later
deactivation.

**Q17-6 — Negative stock: one setting or two? ANSWERED (decided by:
owner).** One `negativeStockPolicy` setting governs both the
already-≤0-add-to-cart mechanism and the exceeds-on-hand-at-commit
mechanism, scoped to counter sales only. `'warn'` → both allowed after
confirmation; `'block'` → both refused. Default `'warn'`. This
deliberately reverses P10-1's hard block when the policy is `'warn'` —
recorded in §2.1 as a conscious change, not an oversight.

**Outstanding — not yet answered, blocking P17-1's warn-mode
implementation only:** the Option A vs. Option B choice in §2.1 (b).
Everything else in this phase is unblocked.

---

## 8. Exit criteria

Task-specific criteria for the approved T1 tasks (plus P17-7). Each
names its own verification method, per CLAUDE.md §6 — no "looks correct"
entries.

- [ ] **P17-1** — new/rewritten tests, all combinations named explicitly
      (Option C, D17-1):
  - `(≤0 add) × 'warn'` — allowed at add time, no per-item dialog; at
    commit, `NegativeStockConfirmationRequiredError` thrown with the
    item listed, zero rows inserted.
  - `warn + not acknowledged` → confirmation error thrown, **zero rows
    inserted**, `items` in the error lists the correct
    `onHandMilli`/`requestedMilli` for each affected item.
  - `warn + acknowledged` → commits, stock goes negative,
    `warnings.stockBelowZero === true`.
  - `block + acknowledgedNegativeStock=true` → **still refused** — the
    flag can never bypass a block, `NegativeStockBlockedError` thrown
    regardless.
  - A direct IPC call to `sale:create` with no flag at all, under
    `'warn'`, for a sale that would go negative → refused with the
    confirmation error, **never a silent oversell** (proves the
    guarantee is server-side, not UI-only — directly answers
    verification (a) and closes the D17-2 bug).
  - Two cart lines of the same item, each individually within stock,
    **summed** over available stock → refused under `'block'` (proves
    the per-line bug found in verification (c) is fixed).
  - Resulting stock of exactly `0` → **allowed** under `'block'`.
  - A `trackStock=false` item → never warned, never blocked, in either
    mode.
  - A multi-unit line (ADR-0013, e.g. cylinder→kg) → compared in base
    stock milli-units, not the sale-entered unit.
  - **Custody test (D17-3):** an item with `0` in the Shop warehouse and
    `5` in a technician's warehouse → treated as `0` at the counter by
    both the predicate and the cart badge (`counterStockMilli`), while
    the existing all-warehouse `stockOnHandMilli` on the same item still
    reports `5` — both fields read back from the same seeded rows in one
    test, proving they diverge exactly as designed.
  - **Rewrites**, not modifies, `ItemSearchPanel.test.tsx`'s existing
    ≤0-item test: under `'warn'`, a ≤0-stock item **can now be added**
    to the cart (a deliberate reversal of P10-1, per Q17-6); under
    `'block'`, it is still refused exactly as before.
  - Query: on a fresh migrated DB, `SELECT value FROM setting WHERE
key='negativeStockPolicy'` returns no row, and the getter's default
    is confirmed `'warn'`.
- [ ] **P17-2** — Repository tests: an item with `reorderLevel=5` and a
      **Shop-warehouse-scoped** `qtyOnHand<=5` (via a real seeded
      `stock_movement` sum, Shop warehouse only — not the all-warehouse
      figure) is flagged; an item with `reorderLevel=NULL` and
      `qtyOnHand=0` is also flagged (shop default `0`); an item above its
      threshold is not. **New exclusion tests (A17-2):** a
      `trackStock=false` item at qty `0` is **not** flagged and **not**
      counted on the dashboard; a **deleted** item at qty `0` is likewise
      not flagged and not counted. All hand-verified against a real temp
      DB. Render test: `LowStockWidget.tsx` shows the correct count from
      a mocked IPC response. UI action: clicking the Dashboard card
      navigates to the Items list pre-filtered to low-stock items.
- [ ] **P17-3** — All 11 existing report-table tests plus a
      `CustomerLedgerTable` render test still pass after switching from a
      local constant to the shared `useRowsPerPage()` hook, with the
      setting defaulted to `10`. Query: a fresh DB has no `rowsPerPage`
      key and every table falls back to `10`, confirmed by direct query.
      UI action: changing Settings → Reports → Display → "Rows per page"
      to `25` updates every currently-open report table **without a
      reload** (A17-4) — manual verification on the shop machine, or a
      render test confirming the hook re-renders subscribers on change.
- [ ] **P17-4** — Repository tests: create a category; edit its name
      only (succeeds); attempt to edit `kind`/`isBillable`/
      `isOwnerDrawing` on a category already referenced by a real seeded
      `expense` row (rejected with the new typed error); the two invalid
      combinations (`is_owner_drawing=1` AND `is_billable=1`; non-null
      `parts_share_bp` with `allocation_method !== 'shared_fixed'`) are
      rejected in `packages/core`; deactivate a category with existing
      expenses (soft, `deletedAt` set) and confirm `expense:list`/
      `getExpenseSummaryReport` still return the same historical
      rows/totals unchanged (hand-calculated total in the test comment).
      UI action: Settings → Expenses → Categories shows the corrected
      field list (Name/Kind/Billable/Owner drawing, no Business unit, no
      Allocation method), matching the Brands/Service-Charges shell.
- [ ] **P17-5** — Unit test: `renderInvoicePdf`/`renderPaymentReceiptPdf`
      each accept and thread through a page-size parameter (test asserts
      the parameter reaches the underlying `PDFDocument` call). UI
      action / manual print: with `receiptPaperSize='A5'`, printing a
      sale invoice and a payment receipt both render at A5 dimensions;
      with the default `'A4'`, both are visually unchanged from today.
- [ ] **P17-7** — new tests: attempting to disable the last remaining
      enabled payment method (or Cash specifically) is refused by the
      settings section's save handler; a historical `payment` row whose
      `method` was later disabled still displays correctly by name in
      `expense`/payment reports and the customer ledger (disabling never
      touches the stored value); the picker falls back to Cash when the
      previously-selected default method is disabled.
- [ ] `npm run verify` exits 0 after every task above, count pasted each
      time (Golden Rule #4 — one thing at a time, verified before the
      next begins).
- [ ] `PROJECT.md` and `PROGRESS.md` updated per CLAUDE.md §7 before this
      phase (the build sub-phase) is called complete.

---

## Appendix — PHASES.md gap (fixed)

Phases 9, 10, 13, 14, and 15 all had detailed `docs/phases/PHASE_N.md`
files but no entry in `docs/PHASES.md`'s main plan. Short entries for
**all five** (9, 10, 13, 14, 15) have been added to `docs/PHASES.md` —
`docs/PHASES.md` now has a continuous entry for every phase from 0
through 16.
