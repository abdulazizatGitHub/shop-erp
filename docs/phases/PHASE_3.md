# Phase 3 — Counter sale + udhaar

**Status:** ALL SUB-PHASES BUILT AND VERIFIED IN SANDBOX — not COMPLETE
**Started:** 2026-08-26
**Completed:** — (blocked on real-hardware timing, see §4)
**Branch:** main
**Last commit:** 09896a7

---

## 1. Goal

A salesman can sit at the counter, search for an item by keyboard alone, sell it
to a walk-in customer for cash or to a known customer on credit (udhaar), and
the system correctly decrements stock, prices the line by the customer's price
tier, records the customer's new balance if credit was given, and completes the
whole interaction in under 30 seconds. A customer can also pay down an existing
udhaar balance, and the shop's paper register of who-owes-what can be loaded in
as opening balances. From this phase on, the till and the ledger are the
system, not memory and a notebook.

---

## 2. Scope

### In scope

- **P3-0 — Shared retry/error-normalizing helper.** `withRetry()` (packages/db)
  restarting the whole transaction on `SQLITE_BUSY`. `withError()`
  (apps/server/src/ipc/middleware) translating any thrown error into
  `{code, message, details}`.
- **P3-1 — Customer CRUD.** `party` rows, `party_type='customer'`,
  `CUS-A-000001` codes. `customer:create/search/get/balance` IPC channels
  (`get`/`balance` handlers built; UI only calls `search` so far — see §8).
- **P3-2 — Counter sale.** Core pricing/warning logic + repository
  (P3C) → IPC handlers (P3D) → keyboard-driven UI (P3E).
- **P3-3 — Payment received.** Customer payments only. `payment.receive`
  IPC channel (the pre-existing scaffold name, not a new `payment:create`).
- **P3-4 — Customer opening balance import.** Dry-run/commit, idempotent on
  customer + bill reference, DB-layer idempotency check, already-settled
  bills skipped silently.

### Explicitly out of scope

- Receipt printing, A4 invoice — Phase 4
- Retail/wholesale price-level _management_ UI — mechanism only ships this
  phase (price resolution respects `price_level_id`); no bulk wholesale
  pricing data entry. `PROJECT.md` Q3 stays OPEN.
- Discount per line, delivery charges on sale — Phase 4
- Supplier payment out — Phase 4/8
- Repair job sale — Phase 6
- P2-1/P2-2 IPC + UI (supplier CRUD, purchase entry reachability) — deferred;
  see Scope Decision in the original plan-lock reply. Recommended as the
  first work after Phase 3 closes — still not reachable from the running
  app as of this phase's close.

---

## 3. Tasks

| ID    | Task                                             | Status                                                                              | Commit  |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------- |
| P3-0  | Shared retry helper + IPC error normalizer       | DONE — verified 2026-08-26                                                          | 09896a7 |
| P3-1  | Customer CRUD (core+db+IPC)                      | DONE — verified 2026-08-26                                                          | 09896a7 |
| P3-2a | Counter sale — core + repository                 | DONE — verified 2026-08-26 (10 tests)                                               | 09896a7 |
| P3-2b | Counter sale — IPC handlers                      | DONE — verified 2026-08-26 (code review)                                            | 09896a7 |
| P3-2c | Counter sale — keyboard-driven UI                | DONE — build/verify green 2026-08-26. **Real-hardware timing still owed — see §4.** | 09896a7 |
| P3-3  | Payment received (core+db+IPC)                   | DONE — verified 2026-08-26 (3 tests)                                                | 09896a7 |
| P3-4  | Customer opening balance import (core+db+IPC+UI) | DONE — verified 2026-08-27 (13 tests)                                               | 09896a7 |

---

## 4. Exit criteria

- [x] `npm run verify` exits 0, all tests green (121 baseline → 160 through
      P3-0–P3-4)
- [x] BUG-15 retry helper: real test output proves (a) success path,
      (b) retry-on-`SQLITE_BUSY`-then-succeed, (c) clean typed error after
      max attempts — never a raw `SqliteError`
- [x] Customer created: `party` table queried directly, every field correct,
      `CUS-A-000001` sequence confirmed
- [x] Cash sale: `stock_movement` row queried, quantity delta matches a
      hand calculation
- [x] Credit sale: `party_ledger` row queried, amount (paisa) matches a
      hand calculation, sign positive
- [x] Credit limit warning fires without blocking the sale — verified by
      querying the committed `party_ledger` row exists despite the warning
- [x] Negative stock warning fires without blocking the sale — verified by
      querying `v_stock_on_hand` goes negative and the sale still commits
- [x] Sale cancellation: reversing rows in `stock_movement` AND
      `party_ledger` exist, originals untouched, `sale.status='cancelled'`
- [x] Price level fallback: retail customer, wholesale customer (synthetic
      fixture), and walk-in all get the correct price — verified by query
- [x] `business_unit_id` on `sale_line` queried directly, matches
      `item.business_unit_id`
- [x] Payment received: balance before/after queried directly (`v_party_balance`),
      delta matches payment amount, hand calculation shown (Rs 20,000 →
      Rs 15,000 for a Rs 5,000 payment)
- [x] Opening balance import: idempotency proven (re-run = 0 new rows,
      queried directly: count 1 before and after a second run)
- [ ] **Full sale timed ≤30 seconds keyboard-only** — owner completes on
      real hardware, time pasted into PROGRESS.md. If >30 seconds,
      bottleneck named and fixed before COMPLETE. **Not verifiable in
      sandbox — the only unchecked box, and the only thing blocking
      Phase 3 COMPLETE.**

---

## 5. Design decisions made this phase

| Decision                                                                                                                                                                                                                                                                                             | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ADR? |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `party_ledger` sign convention for Phase 3: credit sale `+total`, payment received `-amount`, sale cancellation `-original_ledger_amount`, opening balance `+(Original-Paid)`                                                                                                                        | Direct continuation of the Phase-2-verified convention (`0001_init.sql:274-276`, PHASE_2.md §5a) — not re-derived                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | No   |
| `withRetry` wraps each repository write method's own `db.transaction().execute(fn)` inline — every read (item/price/stock/customer-balance) and every write live inside the SAME `fn`, itself the retry unit                                                                                         | Only way to satisfy BUG-15's binding constraint (restart-the-whole-transaction). Calling another repository's own `getCustomerBalance()` (bound to its own `this.db`) from inside an open `trx` was considered and rejected — risks a deadlock on Kysely's per-connection `ConnectionMutex` (PHASE_2.md §5c). The balance/stock reads are reimplemented inline against `trx` instead. Applied identically in P3F's `createPayment` (no call to `getCustomerBalance()`, an FK constraint stands in for the existence check) and P3G's `insertCustomerOpeningBalances` (its own SELECT-before-INSERT against `trx`). | No   |
| Credit limit / negative stock are warnings returned in the result object, never thrown; `unitCostMissing` (item.avg_cost NULL) is a third, always-non-blocking warning                                                                                                                               | Explicit spec requirement — core never blocks a sale on any of the three                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | No   |
| New `customer:*` IPC channel namespace, distinct from the existing unregistered `party:*` placeholders. `sale:*` and `payment:*` reuse the pre-existing scaffold names (`getById`/`listByDate`, `receive`) instead of the literal `get`/`search`/`create` named in various task prompts              | `party:*` remains reserved for supplier work when P2-1's IPC gap is closed. The scaffold names already existed in `channels.ts`/`docs/SYSTEM_DESIGN.md` — reused rather than duplicated, since nothing yet depended on them                                                                                                                                                                                                                                                                                                                                                                                        | No   |
| `listSalesByDate` added to `KyselySaleRepository` as a small plain filtered `SELECT` (date range + customerId + status, no business logic) — not present after P3C                                                                                                                                   | P3C only built create/get/cancel; P3D's four requested channels needed a backing method for the fourth. No dedicated test added (P3D's checkpoint was code-review only, by explicit agreement)                                                                                                                                                                                                                                                                                                                                                                                                                     | No   |
| Sale-screen cart shows each line's **Retail** price as a preview (`item.retailPricePaisa` from `item:search`'s own response); the actual `sale:create` call always sends `unitPricePaisa: null` per line, so the server's price resolution is the sole authority                                     | Wholesale price-level UI is out of scope this phase; a customer is only chosen at checkout (Step D), after lines are already in the cart, so the cart cannot know the true resolved price in advance. Never let a client-side guess override the server's resolution.                                                                                                                                                                                                                                                                                                                                              | No   |
| `apps/client/src/types/electron-api.d.ts` (the renderer's hand-maintained `window.api` type) had silently drifted from the real `apps/server/src/preload.ts` since P3-1 — no `customer`/`sale` entries existed. Fixed as part of P3-2c (blocking, not deferred), then kept current through P3-3/P3-4 | Discovered while building the sale screen; without it, `ipc.customer.search`/`ipc.sale.create` wouldn't type-check. Only the methods actually called from `apps/client` were added each time — not the full server-side surface, to avoid importing `@shop/core` into `apps/client` (forbidden by `eslint.config.js`'s boundary rule)                                                                                                                                                                                                                                                                              | No   |
| `payment.amount` is always a positive unsigned magnitude; `payment.direction` carries the sign ('in' for customer payments). `party_ledger.amount` for the same event is negative. The two columns use genuinely incompatible sign conventions and must never be summed together                     | Locked in P3F's plan approval. Phase 4's cash-book report reads `payment.amount WHERE direction='in'` for cash-in totals, never `party_ledger`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | No   |
| P3F's `createPayment` has no credit/balance check at all — a customer may overpay, taking their balance negative                                                                                                                                                                                     | Explicit instruction; not a gap, a deliberate simplification (unlike a credit sale, there's no "limit" a payment could exceed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | No   |
| P3G's `insertCustomerOpeningBalances` sets `source_type='import'` / `source_id=<bill reference>` on each `party_ledger` row — unlike P2-3's `insertSupplierOpeningBalances`, which leaves both `NULL` and relies on the `bill_reference` column alone for idempotency                                | Explicit, literal instruction for the customer importer, verified in the checkpoint's own SQL query. A real divergence from the supplier importer's behavior, not an oversight — noted here so a future reader doesn't assume the two importers are symmetric                                                                                                                                                                                                                                                                                                                                                      | No   |
| P3G's already-settled-bill skip condition is `(Original − Paid) <= 0`, covering both exactly-settled and (data-error) overpaid rows, not just the `=== 0` case P2-3's supplier importer checks                                                                                                       | Explicit instruction, broader than the supplier equivalent by design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | No   |

---

## 6. Bugs found this phase

None. (The `electron-api.d.ts` drift noted above was a gap, not a code
defect — fixed inline each time it blocked the sub-phase in progress, not
logged to `PROJECT.md`, since it was never an unrelated finding.)

---

## 7. Open questions resolved this phase

None. (P3-4's "already-paid-bill" policy — skip silently, report as
"already settled" — was decided during plan-lock, before this phase's
first line of code, so it was never an open question during the build
itself.)

---

## 8. Notes for the next phase

- **The one blocker to closing Phase 3**: a real-hardware timing run.
  Someone needs to sit at the packaged (or `npm run dev`) app on the
  owner's actual machine, ring up one full sale keyboard-only from item
  search to confirmation, and paste the elapsed time into `PROGRESS.md`.
  If it's over 30 seconds, find and fix the bottleneck before calling
  Phase 3 COMPLETE — do not mark it done on the strength of the sandbox
  build/verify checks alone.
- **P2-1/P2-2 (supplier CRUD, purchase entry) still have no IPC/UI**,
  three phases after Phase 2 flagged the gap. The shop can sell and
  collect udhaar now, but still cannot record a new supplier purchase
  from the running app — stock only reflects Phase 1's opening import
  plus whatever's been sold. Recommended as the very next work, before
  Phase 4 feature work, not deferred further.
- `customer:get` and `customer:balance` IPC handlers exist (P3-1) but no
  UI calls them yet — no screen shows a customer's running balance or
  looks one up directly outside the sale screen's search. Worth building
  alongside whatever Phase 4 report surfaces receivables.
- Payment received (P3-3) has IPC + repository but no dedicated UI screen
  — `payment.receive` is reachable only via a future screen, not built
  this phase (not requested).
- Cart line removal on the sale screen is mouse-only (a "Remove" button
  per row) — acceptable per the keyboard-first requirement, since
  correcting a mistaken line is not the happy path.
- Phase 4's cash-book report must read `payment.amount WHERE
direction='in'` for cash-in totals — never `party_ledger.amount`, whose
  sign convention for the same event is the opposite and incompatible.
