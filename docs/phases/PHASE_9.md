# Phase 9 — Purchase Orders + Goods Receipt Notes (GRN)

**Status:** COMPLETE — backend (2026-09-12) + UI (2026-09-13) + CSV import (2026-09-13).
**Started:** 2026-09-12
**Completed:** 2026-09-12 (backend), 2026-09-13 (UI), 2026-09-13 (CSV import)
**Branch:** main
**Last verified commit:** 18ea084 (UI, committed); this session's CSV-import
work pending commit.
**Test baseline:** 464/464 → 479/479 (backend session, 15 new tests);
479/479 held throughout the UI session; 479 → 492/492 this session
(13 new tests in `grn-csv-import.test.ts`).

---

## 1. Goal

Split the shop's single-step "purchase" flow (order + receive + post
stock/ledger, all at once) into two explicit stages: a **Purchase Order**
(what was ordered, from whom, no prices, no stock/ledger impact) and a
**Goods Receipt Note** (what actually arrived, at what cost, against a
supplier bill — this is where stock moves and the supplier ledger
updates). One PO can have multiple GRNs (partial deliveries); a GRN line
can be unplanned (not linked to any PO line).

Requested 2026-09-01 during Phase 4.5 close-out (PROJECT.md "GRN and
batch tracking workflow" future feature request). Batch/lot tracking was
explicitly dropped by owner decision for this phase — only the PO→GRN
split was built.

---

## 2. Scope

### In scope

Migration 0014 (5 new tables + 2 document_sequence rows); Kysely types;
core-layer ports + typed domain errors for both new modules;
`purchase-order.repository.ts` and `grn.repository.ts`; IPC handlers,
Zod contracts, and channel registration for both modules; preload +
`electron-api.d.ts` exposure; real-temp-SQLite-DB tests for both
repositories (15 new tests, every money/stock assertion hand-calculated);
`migration-runner.test.ts` updated for the new migration and table count.

### Explicitly out of scope (per the session brief)

- Any UI screens — the Purchase Order / GRN screens are a future session,
  built once this backend is verified
- CSV bulk import for GRN
- Batch/lot tracking (owner decision)
- Any changes to the existing `purchase` / `purchase_line` tables or their
  two live rows (PUR-0001, PUR-0002) — read-only historical data from
  this migration forward
- Any changes to existing purchase/sale/payment IPC handlers
- Low-stock alerts, reorder points
- Anything in CLAUDE.md §10

---

## 3. Schema (migration `0014_purchase_order_grn.sql`)

Five new tables: `purchase_order`, `purchase_order_line`, `grn`,
`grn_line`, `item_price_history`. Two new `document_sequence` rows
(`purchase_order`/PO, `grn`/GRN). No `CHECK` constraints, per project
convention (enums canonical in application/Zod code only). Full column
list in the migration file itself.

Verified against the real dev DB (`data/shop-dev.db`) before and after
applying:

- `.tables` — all 5 new tables present alongside all 44 existing tables
  (49 total).
- `document_sequence` — exactly two new rows: `purchase_order`/PO/1,
  `grn`/GRN/1.
- `purchase` — PUR-0001/PUR-0002 unchanged, confirming the existing
  one-step purchase flow and its live data were untouched.

---

## 4. Decisions

Several genuine ambiguities surfaced while implementing this phase.
Recorded here so the next session (UI, or any future backend change to
this schema) doesn't have to re-derive them.

### D1 — `price_level` has no `code` column

The session brief assumed GRN resolves retail/wholesale price levels via
`price_level WHERE code = 'RETAIL'`/`'WHOLESALE'`. The live schema has no
`code` column at all — only `name` (`'Retail'`/`'Wholesale'`,
`UNIQUE(tenant_id, name)`). Confirmed by querying the live dev DB before
writing any code (CLAUDE.md rule 5 — stop and report, don't improvise).
**Resolution (owner-confirmed):** match by `price_level.name = 'Retail'`
/ `'Wholesale'` directly. No migration change to `price_level`.
`bootstrap.ts` only seeds `'Retail'` by default (`DEFAULT_PRICE_LEVEL_NAME`)
— test fixtures for GRN must insert a `'Wholesale'` row explicitly, which
`grn.repository.test.ts` does in its own `beforeEach`.

### D2 — `grn_line.unit_cost_paisa` is per-purchase-unit, not per-stock-unit

The UoM-conversion test case (cylinder→kg, reusing the exact fixture and
numbers from `purchase.repository.test.ts`) requires
`stock_movement.unit_cost_paisa` (257,353) to differ from the GRN line's
own `unit_cost_paisa` input (3,500,000). Resolved by reusing
`computeCostPerStockUnitPaisa(unitCostPaisa, item.purchaseToStockFactor)`
— the exact same function `purchase.repository.ts` already uses — since
the brief explicitly says "this is the same hand-calculation from Phase
2." `item.last_purchase_cost`/`avg_cost` and `item_price_history`'s
`purchase_cost` entries always use this **converted**, per-stock-unit
value, never the raw `grn_line.unit_cost_paisa`, matching
`item_price.price`'s documented "paisa per stock unit" convention
everywhere else in the schema.

### D3 — Credit GRN ledger total for a UoM-converting item

Given D2, a credit GRN's `party_ledger` total can't simply sum the raw
`unit_cost_paisa` per line (that's correct for the Rs-35,000-cylinder
line itself, but wrong for a normal per-stock-unit line, e.g. "3 pieces ×
Rs 5,000 = Rs 15,000" needs `unitCost × qty`, not `unitCost` alone).
**Owner-confirmed resolution:** every line's contribution is
`Money.multiplyByQuantity(costPerStockUnitPaisa, quantityReceivedMilli)`
— i.e. always recomputed from the converted per-stock-unit rate × the
actual received quantity, uniformly across every line regardless of the
item's UoM. This introduces a documented, accepted 1-paisa rounding drift
for a UoM-converting item versus the exact supplier bill amount (Rs
35,000 exactly vs. Rs 35,000.01 posted) — the same class of rounding
ADR-0003 already accepts elsewhere (round-half-up on integer division),
not a new kind of imprecision.

### D4 — `purchase_order.status` when "no lines received" follows a cancellation

The brief's own step-h status logic ("no lines received yet → 'sent'")
was ambiguous about what happens when a GRN cancellation brings a
previously `partially_received`/`fully_received` PO back down to zero
received (not just the initial `draft`→`sent` transition). A first
implementation only special-cased `draft`, which would have left a fully
cancelled PO stuck showing `fully_received` with zero actual receipt — a
real, self-caught bug (see §6). **Fixed**: "no lines received" always
resolves to `'sent'`, regardless of the PO's prior status, except a
`'cancelled'` PO is left alone (defensive only — `cancel()` already
refuses to cancel a PO with any confirmed GRN, so this branch is
unreachable in practice). `grn.repository.test.ts` test 8 asserts this
directly (`'sent'` after cancelling a GRN that had completed the PO).

### D5 — Typed error classes, doc-number generation, and transaction wrapping

Per explicit owner instruction: all new PO/GRN errors are typed classes
(`packages/core/src/purchase-order/errors.ts`,
`packages/core/src/grn/errors.ts`) rather than the plain-`Error`-string
pattern `purchase.repository.ts` uses (an acknowledged, not-backfilled
CODING_STANDARDS gap in that file). `nextPurchaseOrderDocNo`/`nextGrnDocNo`
follow `purchase.repository.ts`'s exact per-device pattern (keyed by
`(tenantId, docType, deviceCode)`, not a hardcoded device code), and
every write path (`create`/`cancel` on both repositories) is wrapped in
`withRetry(() => this.db.transaction().execute(...))` — `packages/db/src/retry.ts`'s
own doc comment establishes this is load-bearing for BUG-15's
doc-number-collision safety, not a style choice.

### D6 — Zod schemas use `.nullable()`, not the brief's own `.optional()`

The phase brief's own draft Zod schemas used `.optional()` for fields the
already-written core port interfaces declare as `T | null` (e.g.
`supplierNote`, `wholesalePricePaisa`). A handler passes
`Schema.parse(raw)`'s output directly into the repository as the port
input type with no adapter step, so the parsed shape must match exactly.
Used `.nullable()` throughout instead, matching both the port types and
the existing `CreatePurchaseInput` convention in
`packages/contracts/src/purchase/purchase.ts`.

---

## 5. Bugs found

None found in existing code this session (Phase 9 only added new
tables/modules — it never touched `purchase`/`purchase_line` or any
other existing table). One bug was found and fixed in **this session's
own new code**, caught before it shipped, not left for a future session:

### Self-caught: `recomputePurchaseOrderStatus`'s "no lines received" branch

Found while writing `grn.repository.test.ts` test 8 (cancelling a GRN
that had brought a PO to `fully_received`), before running any test — see
Decision D4 above for the full detail and fix. Never reached a passing
test suite in its buggy form; not logged as a PROJECT.md Known Bug since
it never shipped.

---

## 6. Verification performed

Every step below produced real, pasted terminal output — not eyeballed:

- `git log --oneline -10` confirmed the starting commit (4f2d887) before
  any code was written.
- `npm run verify` confirmed green (464/464) as the pre-session baseline.
- `SELECT doc_no, status, payment_mode FROM purchase` confirmed
  PUR-0001/PUR-0002 untouched, before and after the migration.
- Migration 0014 applied to the real dev DB via `npm run db:migrate`
  (with its automatic pre-migrate backup), then `.tables` and
  `document_sequence` queried directly to confirm the new schema.
- `npx tsc --noEmit` and `npx eslint --max-warnings=0` run after every
  file added, not just at the end.
- 5 new `purchase-order.repository.test.ts` tests: named-supplier create
  (every column asserted against the real inserted row), supplier-note-only
  create, cancel-with-no-GRNs, cancel-with-a-confirmed-GRN (throws
  `PurchaseOrderHasGrnsError`, and the PO row is confirmed untouched —
  not partially applied), list (newest-first, cancelled excluded, summary
  fields hand-verified).
- 10 new `grn.repository.test.ts` tests, covering every business rule in
  the brief plus the UoM-conversion hand-calculation reused verbatim from
  Phase 2 (Rs 35,000/cylinder → 257,353 paisa/kg, `3,500,000 × 1000 /
13,600 = 257,352.94… → 257,353`, asserted against the real
  `stock_movement` row). Test case 1's two independent conditions (no
  purchase-cost history vs. no retail history) are asserted with separate
  queries and separate expectations, per explicit instruction, not
  conflated into one check.
- `npm run verify`: 479/479 (typecheck + lint + test, exit 0).
- `npm run build --workspace=@shop/client` and
  `--workspace=@shop/server`: both clean.

---

## 7. Open questions resolved

None of PROJECT.md's existing open questions (Q1–Q9) were resolved or
touched by this phase — none were blocking.

---

## 8. Notes for next phase (UI session)

- IPC surface is complete: `purchaseOrder.{create,get,list,cancel}` and
  `grn.{create,get,listForPO,cancel}`, all Zod-validated, all exposed
  through `preload.ts` and `electron-api.d.ts`.
- `purchaseOrder:list` takes no arguments and returns every non-cancelled
  PO with resolved supplier name and aggregate line/quantity totals — a
  UI screen can render straight from this without a second call per row.
- `grn:listForPO` takes `{ purchaseOrderId }` and includes cancelled GRNs
  (status carries that) — matches `purchase:list`'s existing
  don't-hide-cancelled-rows convention.
- No permission enforcement exists on these handlers, consistent with
  every other handler in the codebase (BUG-ADR9, still open, deferred in
  Phase 8).
- BUG-16 (purchase form missing bill-reference fields) is now
  structurally addressed by `grn.supplier_bill_ref`, but the field still
  needs an actual UI home — either on a new GRN entry screen or, if the
  old one-step Purchase screen is kept alongside GRN, there too. See
  PROJECT.md's updated BUG-16 status note.
- `avg_cost`/`last_purchase_cost` remain simplified (last-purchase-cost
  overwrite, not a true weighted average) — same known limitation as the
  existing purchase flow, now shared by GRN too. Not addressed this
  phase; still open for a future costing phase.
- A GRN cancellation never rolls back `item_price_history` or
  `item.last_purchase_cost`/`avg_cost` — by design (Decision, see §4 of
  the original brief). A UI showing "current cost" after a GRN
  cancellation should be aware the price change from that GRN is still
  in effect unless a later GRN/price change supersedes it.

---

## 9. UI session (2026-09-13) — P9U-0 through P9U-9, all DONE

### 9.1 What was built

Old one-step Purchases screen removed entirely from the UI
(`PurchasePage.tsx`, `PurchaseListTable.tsx` deleted; `purchase:*`
backend untouched, read-only historical data). New
`apps/client/src/pages/purchase-orders/` module:

- **PurchaseOrdersPage / PurchaseOrdersTable** — list, status pills
  (`PurchaseOrderStatusBadge`), quantities via the existing
  `QuantityDisplay` primitive, Cancel gated to draft/sent.
- **NewPoModal (+ NewPoStep1/NewPoStep2/PoLinesTable)** — two-step:
  supplier-or-note + dates, then item/qty/notes lines (no price —
  prices are entered at GRN time, per the original design).
- **PurchaseOrderDetailModal (+ PoDetailLinesTable/PoDetailGrnsSection)**
  — lines with ordered/received/remaining (fully-received rows
  struck through), the GRN list for this PO, Cancel PO.
- **NewGrnModal (+ NewGrnStep1/GrnLinesEditor/GrnLineRow/grnLines.ts)**
  — two-step: date/bill-ref/payment-mode (credit locked out with a
  warning when the PO has no linked supplier), then PO lines
  pre-filled with the remaining quantity (editable) plus "add
  unplanned line". Money conversion (Rupees string -> paisa) happens
  in exactly one function, `convertLineMoney` in `NewGrnModal.tsx`,
  called by both the submit handler and the live subtotal preview —
  never re-implemented inline. "Receiving now" is validated against
  the remaining quantity in two places sharing one function,
  `validateReceivingNow` (`grnLines.ts`): inline on the field as the
  user types, and again defensively in the submit handler.
- **GrnDetailModal (+ GrnDetailLinesTable)** — full line detail,
  Cancel GRN with the required stock/ledger-reversal warning copy.
- **Item price history** — new additive `item:priceHistory` channel
  (owner-approved before writing code), `price-history.repository.ts`
  (plain function, no port — matches `wage-report.repository.ts`'s
  established precedent for a single read-only query), a "History"
  button/modal on `ItemsPage.tsx` (old price struck through, new
  price beside it, source shown as `"GRN <id>"`).

### 9.2 Live-code discrepancies found and resolved (rule 6)

1. **`packages/ui` cannot import `@shop/contracts`**
   (`eslint.config.js:78-87`, lint-enforced) — the brief's own
   instruction to put `PurchaseOrderStatusBadge`/`GrnStatusBadge` in
   `packages/ui/src/components/` would fail lint immediately, since
   both switch on contract-typed status enums. Placed in
   `apps/client/src/components/shared/` instead, the exact precedent
   `BusinessUnitPill.tsx` already set for the same constraint.
2. **`PurchaseOrderLineRecord`/`GrnLineRecord` carry no `itemName`**
   (confirmed against the live `electron-api.d.ts` types) — only
   `itemId`. Every line table resolves names client-side against a
   full `ipc.item.search({query:'',categoryId:null})` load, the same
   pattern `ItemsPage.tsx` already uses for its own list.
3. **PO/GRN quantities are stock-unit, not "purchase-unit"** — the
   brief's S2 spec assumed a `Quantity (Cylinder)`-style purchase-UoM
   label; `grn.repository.ts:311` inserts `quantityReceivedMilli`
   directly as `stock_movement.quantity` with no conversion, and
   `ItemDto` has no `purchaseUomId` field at all (only `stockUomId`).
   Labelled "Quantity (stock unit)" instead, matching
   `PurchasePage.tsx`'s own prior precedent for the identical field.
4. **`purchaseOrder:list` hard-filters cancelled POs in SQL**
   (`purchase-order.repository.ts:210`, no parameter to include them)
   — the brief's "Show cancelled" toggle was skipped; there is
   nothing for it to show without a backend change, logged as a
   future-feature note in `PROJECT.md` instead of built as dead UI.
5. **`PurchaseOrderRecord` has no supplier name**, only
   `supplierPartyId`, and there is no `party.getById` channel to
   resolve it — the list row (`PurchaseOrderSummary`) already carries
   a server-resolved `supplierName`, threaded through as a prop into
   `PurchaseOrderDetailModal` instead of adding a new IPC call.
6. **`item.repository.ts` was already at 301 lines** (at/over the
   300-line cap) when S6 needed a new query — per instruction, the
   query went into a new `price-history.repository.ts` rather than
   that file; the handler itself (110 lines, under the 260-line
   threshold given) stayed in the existing `item.handler.ts`.
7. **Real column names differ from the brief's assumed SQL** — money
   verification queries in the session brief referenced
   `stock_movement.unit_cost_paisa`; the live column is `unit_cost`.
   The brief's cancellation-verification query also assumed
   `source_type = 'grn'` would show reversing rows; cancellation
   actually posts them under `source_type = 'grn_cancellation'`
   (`grn.repository.ts:667,712`) — confirmed before running any query,
   not after a wrong result.

### 9.3 Verification (real output, not eyeballed)

Electron's GUI cannot launch in this sandbox
(`ELECTRON_RUN_AS_NODE=1` forces the `electron` binary to run as
plain Node — confirmed via a real crash trace on
`electron.app.setName is not a function`, same class of finding as
every session since Session 48). Given the choice, the owner selected
driving the real repositories directly over a click-through:

- Every sub-task: `npm run typecheck`, `npm run lint`
  (`--max-warnings=0`), `npm run build --workspace=@shop/client` (and
  `--workspace=@shop/server` at S6, since it touched the backend) all
  clean; `npm run test` 479/479 throughout.
- **P9U-6 (GRN create), real dev DB (`data/shop-dev.db`)**: a
  throwaway `tmp-verify-grn.ts` (deleted after use, confirmed via
  `git status`) called `KyselyPurchaseOrderRepository.create` then
  `KyselyGrnRepository.create` directly — the same functions the IPC
  handler calls — for 5 pieces of the real "Compressor" item
  (`ITM-0001`, `purchase_to_stock_factor` 1000, no UoM conversion) at
  Rs 5,000/piece, credit, from the real "Test Supplier" (`SUP-0001`).

  ```text
  stock_movement: quantity 5000, unit_cost 500000, source_type 'grn'
  party_ledger:   amount -2500000, entry_type 'purchase', source_type 'grn'
  ```

  Hand calculation: 5 × 1000 milli = 5000 (matches); factor 1000 means
  no conversion, so `unit_cost` stays 500,000 paisa (matches);
  `500,000 × 5000 / 1000 = 2,500,000` paisa, negative for a credit
  receipt (shop owes supplier) (matches).

- **P9U-7 (GRN cancel), same DB, same GRN**: `KyselyGrnRepository.cancel`
  called directly.

  ```text
  stock_movement: quantity -5000, unit_cost 500000, source_type 'grn_cancellation'
  party_ledger:   amount +2500000, entry_type 'purchase_return', source_type 'grn_cancellation'
  ```

  Exact opposite-sign reversal of both rows above — matches.

- **P9U-8 (price history)**: after the P9U-6 GRN above raised
  `ITM-0001`'s retail price from Rs 6,000 to Rs 7,500, a direct query
  of `item_price_history` for that item confirmed one real row
  (`price_type='retail'`, `old_value_paisa=600000`,
  `new_value_paisa=750000`, `source_type='grn'`) — the exact row the
  new `item:priceHistory` endpoint/UI would surface.
- **Self-caused, self-fixed incident**: an initial attempt to launch
  the Electron GUI ran `electron-rebuild -f -w better-sqlite3`,
  swapping the workspace's native module from the Node ABI (127) to
  the Electron ABI (130) and breaking all 84 test files
  (`NODE_MODULE_VERSION` mismatch — same class as historical BUG-7).
  Fixed via `npm install better-sqlite3 --no-save` at the repo root
  plus `npm rebuild better-sqlite3` inside `packages/db` for its own
  nested copy; confirmed back to 479/479 and a clean `git status`
  before any further work. Not logged as a new bug — caught and fixed
  before any verification was reported as passing.

### 9.4 Not done / deferred

- No real click-through in a running Electron window — the sandbox
  blocker above. A full "what to click" instruction list was handed
  to the owner (see `PROGRESS.md`'s session entry).
- "Show cancelled purchase orders" toggle — needs a backend change
  (§9.2 point 4), out of this session's scope.
- CSV bulk import for GRN — **now done, see §10**. Batch/lot tracking
  still explicitly out of scope (owner decision), unchanged from the
  backend session.

---

## 10. CSV-import session (2026-09-13) — P9C-0 through P9C-6, all DONE

### 10.1 What was built

A new "Upload GRN CSV" button beside "New GRN" (`PoDetailGrnsSection.tsx`),
launching `GrnCsvImportModal.tsx` — a three-step modal (own `Modal`, not
the shared `ImportModal`, see §10.3):

- **Step 1** — GRN date, bill reference, payment mode (Cash/Credit).
  Credit shows a warning banner but never blocks, per the brief.
- **Step 2** — file picker; on selection, the client parses the CSV
  itself (`grnCsvParse.ts` — header split + exact-order header check
  only, no business rules) then immediately calls the new
  `grn:csvDryRun` channel for the authoritative accepted/rejected
  split (see 10.2 — resolves a real contradiction in the session
  brief). Shows accepted/rejected counts and each rejection's row
  number + reason. "Download template" produces a CSV pre-filled with
  one row per remaining PO line (item code + remaining qty; cost/
  price/notes left blank for staff to fill from the supplier bill).
- **Step 3** — summary (PO, date, bill ref, payment mode, line count,
  total value) before the actual commit via the unchanged `grn:create`.

Backend: `packages/core/src/grn/grn-csv-import.ts` —
`GRN_CSV_COLUMNS`, `parseGrnCsv` (file-level: exact case-sensitive
exact-order header, non-empty data), `validateGrnCsvRows` (row-level:
item exists → on this PO → qty positive and ≤ remaining → cost/price
positive → optional wholesale valid if present → notes ≤200 chars).
The remaining-quantity check is **stateful across rows within one
file** — a `Map<purchaseOrderLineId, number>` is decremented as each
row is accepted, so a second CSV row receiving more of an
already-partially-received (within this same file) item is checked
against what's genuinely left, not the PO's original static remaining.
Verified live: a real dry-run against a fresh 10-unit PO with one
4-unit accepted row followed by a 99-unit row correctly reported the
second row's remaining as 6, not 10 (see §10.4).

New additive IPC: `grn:csvDryRun` (channel in `channels.ts`, handler in
the existing `grn.handler.ts`, 75→128 lines, still well under the
260-line threshold given). Zod input `GrnCsvDryRunInput` = `{
purchaseOrderId, rows }` only — deliberately excludes a client-supplied
`tenantId` the brief's draft included (see 10.3). New
`packages/db/src/repositories/item-lookup.repository.ts`
(`getItemsByCode`, a plain function, not a `KyselyItemRepository`
method — `item.repository.ts` was already at 301 lines, matching the
exact precedent `price-history.repository.ts` set in the Phase 9-UI
session for the identical situation).

`downloadCsv.ts` gained an additive sibling, `downloadCsvRows()`, for
multi-row templates — the original `downloadCsv()` and its four
existing callers (Items/Suppliers/Customers/Opening-Stock templates)
are untouched.

**Button gating widened, a real behaviour fix** (owner decision, Q1):
`PurchaseOrderDetailModal.tsx`'s `GRN_ALLOWED_STATUSES_EXCLUDED` now
excludes `draft` as well as `fully_received`/`cancelled`, for **both**
"New GRN" and "Upload GRN CSV" — previously "New GRN" alone was wrongly
enabled for a `draft` PO (goods cannot have arrived if the order was
never sent). Not scoped to CSV import only; it's a correctness fix to
existing manual-entry behaviour too.

### 10.2 A real contradiction in the session brief, resolved by asking

Step 2's own wording said _"parse CSV client-side, run dry-run
validation immediately (no IPC call yet — pure client-side
validation)"_ — but the same brief specified a full `grn:csvDryRun`
server endpoint (its own core module, handler, and test-case list) to
perform exactly that validation. Taking "no IPC call yet" literally
would make the entire channel dead code the UI never calls, which
doesn't fit the rest of the brief's structure. Asked rather than
guessed (CLAUDE.md rule 5); owner confirmed: the client only splits
the file into rows (that part is genuinely IPC-free), and
`grn:csvDryRun` is the actual, authoritative validation path, called
immediately after parsing — mirroring the inline-then-defensive
double-check pattern `NewGrnModal.tsx` already uses for its own
receiving-quantity cap.

### 10.3 Other discrepancies found and resolved (rule 6), all owner-confirmed

1. `ImportModal` (`packages/ui/src/patterns/ImportModal.tsx`) is a
   fixed two-page shell (`page: 1 | 2`, hardcoded "Step N of 2" title,
   Back/Close nav on page 2) — not an extensible N-step wizard, and
   `ImportItemsModal.tsx` itself is genuinely two-step, so the brief's
   own "reuse ImportModal... three-step pattern like ImportItemsModal"
   was self-contradictory. Built `GrnCsvImportModal.tsx` on the base
   `Modal` primitive with local step state instead, matching
   `NewPoModal.tsx`/`NewGrnModal.tsx`'s own precedent for multi-step
   flows in this same folder.
2. The brief's `grn:csvDryRun` payload included a client-supplied
   `tenantId` — no other channel in this codebase accepts tenant id
   from the renderer (always `deps.tenantId`, server-side, per CLAUDE.md
   §3.5). Excluded from `GrnCsvDryRunInput`.
3. Neither existing header-check helper enforces the brief's
   exact-order contract: `parseCsv` (core) needs only a ≥60% fuzzy
   name-match to locate a header row (order-agnostic); `validateHeaders`
   (client) checks set-membership only. Wrote a dedicated exact-order
   check in both `grn-csv-import.ts` (server) and `grnCsvParse.ts`
   (client, for instant feedback before the dry-run round-trip) instead
   of stretching either existing helper's semantics.
4. The brief's named `ParsedGrnCsvRow` type is identical in shape to
   the existing `ParsedCsvRow` (`{ rowNumber, cells }`) — reused that
   type directly. To build it with the same quote-aware comma-splitting
   `parseCsv` already has (Notes can legitimately contain commas),
   additively exported `csv.ts`'s previously-private `parseCsvLine`
   (one-line change, zero behaviour change to `parseCsv`'s existing
   callers).
5. Pre-fill decision (the brief asked for one): pre-fill the template
   with the PO's remaining lines, per the brief's own recommendation —
   confirmed before writing `downloadCsvRows()`.
6. Total-value calculation: used `Money.multiplyByQuantity` +
   `Money.sum` (the established, tested, shared utility for exactly
   this) rather than the brief's own hand-rolled
   `Math.round(qtyMilli/1000 × unitCostPaisa/100 × 100)` formula, which
   is algebraically the same operation. The required hand-calculated
   comment is in `GrnCsvImportModal.tsx`'s total-value computation.

### 10.4 Verification (real output, not eyeballed)

Same sandbox constraint as the Phase 9-UI session
(`ELECTRON_RUN_AS_NODE=1` prevents the Electron GUI from launching
here) — every sub-task verified via `npm run typecheck`/`lint`
(`--max-warnings=0`)/`npm run build --workspace=@shop/client` (and
`--workspace=@shop/server` at the backend sub-tasks) all clean, and
`npm run test` 492/492 throughout (13 new unit tests, no DB/IPC,
pure `validateGrnCsvRows`/`parseGrnCsv` logic — all 10 required cases
plus 3 extra file-level checks, every money/quantity value
hand-calculated in a comment).

Money/stock correctness (P9C-6) verified via a throwaway
`tmp-verify-grn-csv.ts` (deleted after use, confirmed via a clean
`git status`) exercising the real repositories directly against
`data/shop-dev.db`, using real existing rows (`ITM-0002` "Compressor 2
Ton", `SUP-0001` "Test Supplier"): created a fresh 10-unit PO, ran a
2-row CSV (one valid 4-unit row, one 99-unit row that must be
rejected) through `parseGrnCsv`/`validateGrnCsvRows` exactly as the
handler does, then recorded a GRN from the accepted row via the
unchanged `grn.repository.ts`.

```text
dry-run accepted[0]: quantityReceivedMilli 4000, unitCostPaisa 800000, sellingPricePaisa 950000
dry-run rejected[0]: "Qty received (99) exceeds remaining qty (6) for ITM-0002"
stock_movement:      quantity 4000, unit_cost 800000, source_type 'grn'
party_ledger:        amount -3200000, entry_type 'purchase', source_type 'grn'
```

Hand calculation: 4 × 1000 = 4000 milli (matches); Rs 8,000 × 100 =
800,000 paisa (matches); Rs 9,500 × 100 = 950,000 paisa (matches); the
rejected row's "remaining qty (6)" — not the PO's original 10 — proves
the running-decrement-across-rows logic is live (10 − 4 accepted = 6);
credit ledger total = 800,000 × 4000 / 1000 = 3,200,000 paisa = Rs
32,000, negative for a credit receipt (shop owes supplier) (matches).

### 10.5 Not done / deferred

- No real click-through in a running Electron window — same sandbox
  blocker as every session since Session 48. Click-through list for
  the owner: (1) open a `sent`/`partially_received` PO, confirm both
  "New GRN" and "Upload GRN CSV" are enabled and both are disabled for
  `draft`/`fully_received`/`cancelled`; (2) Upload GRN CSV → fill
  Step 1 → download the template → confirm it lists the PO's remaining
  lines → fill in cost/price on one line → upload → confirm the
  accepted/rejected report renders correctly → Import → Step 3 shows
  the correct total → Confirm & Record GRN → toast + PO detail
  refreshes.
- Multi-PO CSV, barcode/serial/batch tracking — explicitly out of
  scope per the brief.
