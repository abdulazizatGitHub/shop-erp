# Phase 2G — P2-1/P2-2 IPC+UI gap closure

**Status:** COMPLETE
**Started:** 2026-08-28
**Completed:** 2026-08-28
**Branch:** main
**Last commit:** b4ad052

---

## 1. Goal

Phase 2 (2026-08-24) built supplier CRUD and purchase entry fully at the
core+repository layer, but neither was ever reachable from the running
app — no IPC handler, no UI. Four phases and four sessions later, this
gap was still open. After this phase, the shop can create and search
suppliers, view a supplier's balance, and record a purchase (cash or
credit) with multiple lines — all from the running Electron app, not
just from a test file.

---

## 2. Scope

### In scope

- **PG-A — Supplier contracts + IPC.** `CreateSupplierInput`,
  `SupplierSearchInput`, `SupplierIdInput`, `SupplierDto`,
  `SupplierBalanceDto` (`packages/contracts/src/party/supplier.ts`).
  `getSupplierBalance` added to `PartyRepositoryPort`/
  `KyselyPartyRepository` (mirrors `getCustomerBalance` against the same
  party-type-agnostic `v_party_balance` view). `supplier.handler.ts`
  registering `party.create`/`party.search`/`party.get` (new channel)/
  `party.balance`, all `withError`-wrapped, Zod-validated. Wired into
  `main.ts`/`preload.ts`/`electron-api.d.ts`.
- **PG-B — Purchase contracts + IPC.** `PurchaseLineInput`,
  `CreatePurchaseInput`, `PurchaseIdInput`, `PurchaseLineDto`,
  `PurchaseDto` (`packages/contracts/src/purchase/purchase.ts`).
  `createPurchase`/`cancelPurchase` wrapped in `withRetry`
  (PROJECT.md BUG-15's fix, applied here for the first time now that
  these methods are genuinely IPC-reachable). `purchase.handler.ts`
  registering the pre-existing `purchase.create`/`purchase.cancel`
  channel placeholders. Wired into `main.ts`/`preload.ts`/
  `electron-api.d.ts`.
- **PG-C — Supplier UI.** `SuppliersPage.tsx`: List/Search (table with
  lazily-loaded per-row balance), Add New (create form), Import Balances
  (renders the pre-existing `SuppliersImportPage` unchanged). Replaces
  the "Suppliers" tab's content in `App.tsx`.
- **PG-D — Purchase UI.** `PurchasePage.tsx`: supplier search, purchase
  date, payment mode (cash/credit), item-search-driven line entry
  (reusing `CartTable`/`lineTotalPaisa`), submit, and an in-session
  (client-memory-only) list of purchases created this session. New
  "Purchases" tab in `App.tsx`.
- Two pre-existing gaps fixed along the way, both compile-correctness
  fixes rather than new scope: `KyselyPurchaseRepository` and
  `SupplierBalance` were never exported from their package indexes;
  `electron-api.d.ts`'s `customer` block was missing `create`/`get`/
  `balance` that `preload.ts` already exposed.

### Explicitly out of scope

- Supplier payment out — Phase 4, per the original Phase 2 plan.
- Purchase editing after creation — Phase 8.
- A real, DB-backed purchase list/search (`listPurchases` or similar) —
  no such repository method exists; `PurchasePage`'s list is in-session/
  client-memory only, per decision F2. A persisted list is natural
  Phase 4 work, alongside reporting.
- `party.ledger` channel — pre-existing placeholder, no backing
  repository method for either party type, left unregistered (F3).
- Bill reference / due date / bill notes / supplier invoice number
  fields on the purchase entry form — not requested in the PG-D field
  list; sent as `null` regardless of payment mode. A credit purchase's
  `party_ledger` row from this screen carries no bill metadata as a
  result (unlike the supplier opening-balance importer, which does
  populate these). Flagged in PROJECT.md.

---

## 3. Tasks

| ID   | Task                                                 | Status   | Commit  |
| ---- | ---------------------------------------------------- | -------- | ------- |
| PG-A | Supplier contracts + IPC (create/search/get/balance) | COMPLETE | b4ad052 |
| PG-B | Purchase contracts + IPC (create/cancel), withRetry  | COMPLETE | b4ad052 |
| PG-C | Supplier UI (list/search, add, import toggle)        | COMPLETE | b4ad052 |
| PG-D | Purchase UI (entry form, in-session list)            | COMPLETE | b4ad052 |

---

## 4. Exit criteria

- [x] `npm run verify` exits 0 — 187/187 tests passing (186 baseline + 1
      new: `getSupplierBalance returns correct balance`), verified
      repeatedly through the session including after the pre-commit
      hook's auto-formatting pass.
- [x] `npm run build` — both `@shop/client` and `@shop/server` exit 0,
      verified at every sub-phase checkpoint (PG-A, PG-B, PG-C, PG-D).
- [x] Supplier CRUD reachable end-to-end from `App.tsx`'s Suppliers tab:
      create, search, list with lazy balance load.
- [x] Purchase entry reachable end-to-end from `App.tsx`'s new Purchases
      tab: supplier pick, line entry, cash/credit submit.
- [x] `createPurchase`/`cancelPurchase` wrapped in `withRetry` — verified
      by reading the call sites (`return withRetry(() =>
    this.db.transaction()...)`), and by the existing
      `purchase.repository.test.ts` double-cancel test, updated to
      assert the new clean-error behavior instead of the old raw
      `SQLITE_BUSY` leak.
- [x] `getSupplierBalance` — new test written first (confirmed failing:
      `repo.getSupplierBalance is not a function`), then implemented,
      then green. Hand calculation: `SUM(party_ledger.amount) = -500000`
      → `v_party_balance.balance_paisa = -500000` → test asserts exactly
      that.
- [ ] Real Electron window launch — **attempted this session**
      (`npm run dev --workspace=@shop/server`) and failed at the
      pre-existing `electron-rebuild` step with "Could not find any
      Visual Studio installation to use" — the same sandbox limitation
      documented at length under `PROJECT.md` BUG-7 (no Visual Studio
      Build Tools in this sandbox). Never reached `electron-vite dev` or
      a window. The attempt left `better-sqlite3` Electron-targeted;
      restored via `npm install better-sqlite3 --no-save` and
      re-verified 187/187 green. **Owner must confirm the UI in the
      running app on real hardware** — this is the one item this session
      could not verify directly, consistent with every previous UI-phase
      in this project.

---

## 5. Design decisions made this phase

| Decision                                                                                                                                                                                                                                                                     | Reasoning                                                                                                                                                                                                                                                                           | ADR?                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `SupplierBalance` is a new, separate type (`{supplierId, name, balancePaisa}`), not a rename/reuse of `CustomerBalance`. Omits `partyCode` — `v_party_balance` doesn't carry it, only `name`, `party_id`, `party_type`, `phone`, and the balance columns.                    | Reusing/renaming `CustomerBalance` would touch already-shipped Phase 3 code for a shape that diverges anyway (`customerId` vs `supplierId`). Adding `partyCode` would need a join to `party`, growing past the "~10 lines, same pattern" instruction (F1).                          | No                                                               |
| `createPurchase`/`cancelPurchase` wrapped in `withRetry`, matching `sale.repository.ts`'s exact pattern (`return withRetry(() => this.db.transaction().execute(...))`, entire closure re-run on `SQLITE_BUSY`, never just the failed statement).                             | Decision F4 — these methods had no IPC handler before this phase, so the BUG-15 race was latent, not reachable. PG-B's handler makes it real for the first time.                                                                                                                    | No — implements the existing BUG-15 fix pattern, no new decision |
| `purchase.repository.test.ts`'s double-cancel test updated: no longer asserts a raw `SQLITE_BUSY` leaking to the caller; asserts a clean `Purchase <id> is already cancelled` `Error` with no `.code` property instead.                                                      | The old assertions documented the exact bug `withRetry` was added to fix — once fixed, the loser's retried transaction observes the winner's already-committed status and throws the same domain error a sequential double-cancel produces. Proof the fix worked, not a regression. | No                                                               |
| Purchase entry UI omits `warehouseId`, `supplierInvoiceNo`, `billReference`, `dueDate`, `billNotes`, purchase-level `notes` — all sent as `null`.                                                                                                                            | Not in the PG-D field list; `CreatePurchaseInput` requires them (nullable), so omitting them from the UI is valid but means credit purchases from this screen carry no bill metadata.                                                                                               | No — flagged in PROJECT.md as a follow-up                        |
| Purchase list in `PurchasePage` is in-session/client-memory only (an array of `{docNo, supplierName, paymentMode, totalAmountPaisa}` built from each `purchase:create` response), not a DB-backed list/search.                                                               | Decision F2 — no `listPurchases` repository method exists; building one is new repository logic, out of this session's scope.                                                                                                                                                       | No — natural Phase 4 work alongside reporting                    |
| `SuppliersPage`'s List/Search view uses a plain debounced text input feeding a persistent multi-column table (reusing the `debounce` helper `SearchSelect` uses internally), not `SearchSelect` itself. `PurchasePage`'s supplier picker does reuse `SearchSelect` directly. | `SearchSelect`'s dropdown-highlight-select-and-clear interaction doesn't fit a persistent, browsable, multi-column table with per-row lazy balance loading — a genuinely different UI pattern, not a duplicate of an existing one.                                                  | No                                                               |
| Purchase line entry reuses `CartTable`/`lineTotalPaisa`/`CartLine` from `apps/client/src/pages/sales/` directly — `unitCostPaisa` is passed through `CartLine.unitPricePaisa`, `saleUomId`/`saleToStockFactor` left `undefined`.                                             | `CartTable` is already fully generic (a line with an id, label, quantity, unit price, and unit label); duplicating it for purchases would be exactly the "three near-duplicates" CLAUDE.md §9 says means an abstraction was missed.                                                 | No                                                               |
| Unit cost input (PKR → paisa) uses `Money.fromRupees`, not a hand-written `Math.round(displayCost * 100)`.                                                                                                                                                                   | `Money.fromRupees` already does exactly this (parse, round-half-up, ×100) and is already used identically in `SalePage.tsx` for `paidAmountPaisa`. Writing a second, inline version would be a near-duplicate of existing, tested shared code (CLAUDE.md §9).                       | No                                                               |
| `payment mode` in the UI offers only Cash/Credit, not the wider Cash/Credit/Bank/Easypaisa/Jazzcash set originally requested.                                                                                                                                                | `PurchasePaymentMode` (the live core port type) is `'cash' \| 'credit'` only — a wider UI enum would not compile against `CreatePurchaseInput`/`NewPurchaseInput`. Flagged twice (PG-B contract design, PG-D UI build) rather than silently narrowed once.                          | No                                                               |

---

## 6. Bugs found this phase

No new numbered `PROJECT.md` bugs from this phase's own code. Three
pre-existing gaps found and fixed inline (compile-correctness, not new
scope, per CLAUDE.md's precedent for this class of fix):

- `KyselyPurchaseRepository` was never exported from `packages/db/src/index.ts`
  (every other repository class was) — added.
- `SupplierBalance` was not exported from `packages/core/src/index.ts` —
  added (caught by `tsc`, not anticipated in the PG-A plan).
- `electron-api.d.ts`'s `customer` block only declared `search`, missing
  `create`/`get`/`balance` that `preload.ts` had already exposed since
  Phase 3 — the same class of drift `PROGRESS.md` has recorded twice
  before. Fixed in PG-C.

One test update, not a bug: `purchase.repository.test.ts`'s double-cancel
test was rewritten (owner-approved, see §5) to assert the new
`withRetry`-fixed behavior instead of the old raw-`SQLITE_BUSY` behavior
it was originally written to document.

---

## 7. Open questions resolved this phase

None from `PROJECT.md`'s existing Open Questions list. Four
session-local decisions were locked by the owner before building
(F1–F4, see `PROGRESS.md`'s session entry and §5 above).

---

## 8. Notes for the next phase

- **Real hardware verification is still owed.** This sandbox cannot
  launch the Electron window at all (BUG-7 — no Visual Studio Build
  Tools; `electron-rebuild` fails before `electron-vite dev` ever
  starts). Every screen built this phase (`SuppliersPage`, `PurchasePage`)
  is verified only by `npm run build`/`npm run verify` in this sandbox —
  never actually clicked through in a real window. Someone needs to run
  `npm run dev --workspace=@shop/server` on real hardware and exercise
  both new tabs before trusting the UI beyond "it compiles."
- **Bill metadata gap on the purchase entry screen** (see §2/§5) — a
  credit purchase entered through `PurchasePage` posts a `party_ledger`
  row with `bill_reference`/`due_date`/`bill_notes` all `NULL`, unlike
  the supplier opening-balance importer which populates them. Worth
  adding those fields to the form if the shop wants to track supplier
  invoice numbers against ledger entries going forward.
- **No real purchase list/search exists yet** — `PurchasePage`'s "session
  purchases" list is memory-only and disappears on reload. Phase 4's
  reporting work should add a real `listPurchases` (or equivalent)
  repository method, mirroring `sale.repository.ts`'s `listSalesByDate`.
- **Payment mode is genuinely limited to cash/credit** at the core port
  type level (`PurchasePaymentMode`). If the shop needs bank/Easypaisa/
  JazzCash purchase recording, that is new core logic (widening
  `PurchasePaymentMode`, `purchase.payment_mode`'s behavior in
  `createPurchase`), not a UI-only change — budget it as such.
- Phase 3's still-outstanding real-hardware timing number (unrelated to
  this phase) remains the one item blocking Phase 3 COMPLETE — see
  `docs/phases/PHASE_3.md` §4.
