# Phase 9 — Purchase Orders + Goods Receipt Notes (GRN)

**Status:** BACKEND COMPLETE (P9-1 through P9-13 all done). No UI —
screens are a follow-up session, per this phase's own explicit scope.
**Started:** 2026-09-12
**Completed:** 2026-09-12 (backend only)
**Branch:** main
**Last verified commit:** 4f2d887 (this session's work pending commit)
**Test baseline:** 464/464 → 479/479 this session (5 new tests in
purchase-order.repository.test.ts, 10 new tests in
grn.repository.test.ts)

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
