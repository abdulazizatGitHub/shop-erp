# Phase 2 — Purchases + suppliers

**Status:** COMPLETE (real-hardware `npm run verify` confirmation still owed by the owner — see Exit Criteria)
**Started:** 2026-08-24
**Completed:** 2026-08-24
**Branch:** main
**Last commit:** 11e34cd462e7265094dd33f874b7e069fd8b0b8d

---

## 1. Goal

The shop can record a supplier, record stock coming in from that supplier as a
purchase (cash or credit), see what the shop owes each supplier as a result,
and load supplier opening balances carried over from the old paper register —
so that from this phase on, incoming stock and supplier debt are tracked by
the system instead of by memory and the register.

---

## 2. Scope

### In scope

- **P2-1 — Supplier CRUD.** `party` rows with `party_type = 'supplier'`.
  Fields: name, shop_name (optional), phone (required), city_area,
  payment_terms, notes. Auto `party_code` as `SUP-A-000001` via
  `document_sequence`, `doc_type = 'supplier'`. A minimal party repository —
  reused if Phase 3 preview work already created one (none currently exists
  in `packages/core/src/party` or `packages/db/src/repositories`, confirmed
  by listing — both are empty except `.gitkeep`), built fresh otherwise.
- **P2-1b — Migration 0004.** Forward-only migration
  `0004_party_ledger_bill_metadata.sql` adding three nullable columns to
  `party_ledger`: `bill_reference TEXT`, `due_date TEXT`, `bill_notes TEXT`.
  Wrapped in a transaction. Separate, queryable columns — not folded into
  `running_note`.
- **P2-2 — Purchase entry.** Supplier (required), warehouse (default: seeded
  "Shop"), date, one or more lines (item, quantity in purchase UoM, unit
  cost). One transaction inserts `purchase` + `purchase_line`,
  `stock_movement` (type `purchase`, converted to stock UoM, unit cost
  snapshot), `party_ledger` **only for credit purchases**, `audit_log`,
  `sync_outbox`, and updates `item.last_purchase_cost` /
  `item.avg_cost`. Cash purchases post stock only — see Design Decisions
  below on the deliberately unresolved cash-book gap. `business_unit_id`
  resolved at runtime from `business_unit WHERE code = 'PARTS'`, never
  hardcoded. Cancellation posts reversing rows, never deletes; `purchase.status
= 'cancelled'`.
- **P2-3 — Supplier opening balance import.** Same importer pattern as
  Phase 1 (dry-run/commit, dual-location report). Column contract: Supplier
  Name | Phone | Bill Reference | Bill Date | Original Amount (PKR) | Amount
  Paid So Far (PKR) | Due Date | Notes. Supplier matched by
  `.trim().toLowerCase()` exact match on name; unmatched rows rejected. One
  `party_ledger` row per bill, `entry_type = 'opening_balance'`,
  `amount = Original - Paid`, `bill_reference`/`due_date`/`bill_notes`
  written onto the migration-0004 columns. Idempotent on supplier + bill
  reference.
- **Housekeeping** — `PROJECT.md` BUG-13 severity: LOW → MEDIUM only. No
  other change to that entry.

### Explicitly out of scope

- Payments out to suppliers — Phase 3
- Cheque tracking — Phase 3
- Supplier aging report — Phase 4
- Purchase returns — Phase 4
- True weighted-average costing — Phase 8 (see Design Decisions)
- Any resolution of the cash-purchase / cash-book gap beyond recording the
  open question — blocked on the owner's answer (see the blocking question
  raised before this plan was approved)

---

## 3. Tasks

| ID    | Task                                                       | Status                                                    | Commit      |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------- | ----------- |
| P2-1  | Supplier CRUD (party repository, SUP-A-000001 codes)       | DONE — verified 2026-08-24, real-DB tests green           | uncommitted |
| P2-1b | Migration 0004 — bill metadata on party_ledger             | DONE — verified 2026-08-24                                | uncommitted |
| P2-2  | Purchase entry (cash/credit, stock + ledger, cancellation) | DONE — verified 2026-08-24, real-DB tests green (99→102)  | uncommitted |
| P2-3  | Supplier opening balance import (core+db+IPC+UI)           | DONE — verified 2026-08-24, real-DB tests green (102→114) | uncommitted |
| P2-H  | Housekeeping — BUG-13 severity LOW → MEDIUM                | DONE — verified 2026-08-24                                | uncommitted |

---

## 4. Exit criteria

- [ ] **`npm run verify` — all tests green, pasted from real hardware.**
      This sandbox got a genuine 114/114 green run repeatedly through the
      session (final run, all tasks included: 13 files, 114 tests, exit 0)
      after a `npm install better-sqlite3 --no-save` reinstall (BUG-7's ABI
      mismatch did not reproduce today), but per the owner's explicit
      instruction this item stays unchecked until the owner independently
      runs `npm run verify` on their own machine and pastes the output.
- [x] A purchase increases stock by exactly the right amount — verified by
      query, hand-calculated against the same 13.6 kg/cylinder numbers
      Phase 1 verified (`purchase.repository.test.ts`)
- [x] Cash purchase produces zero `party_ledger` rows; credit purchase
      produces exactly one, negative, matching the schema's sign convention
- [x] Cancelling a purchase reverses stock via a new reversing row (never a
      delete or update) for both cash and credit; net stock and net ledger
      balance both return to zero
- [x] Purchase in cylinders correctly increases kg stock (13.6 kg/cylinder)
- [x] `business_unit_id` resolved at runtime, not hardcoded — proven by a
      test that re-seeds `business_unit` with a different id mid-test
- [x] Supplier opening balance import — dry-run/commit, idempotent on
      supplier + bill reference, bill metadata written onto the 0004
      columns verbatim (no truncation, not folded into `running_note`) —
      verified against a synthetic fixture (1 matched, 1 unmatched, 1
      zero-balance row) at both the pure-validation and real-DB layers,
      plus reachable end-to-end via IPC + a minimal UI trigger
- [x] BUG-13 severity updated in `PROJECT.md` (LOW → MEDIUM), diff-confirmed
      to touch only the severity tag and one added note line

---

## 5. Design decisions made this phase

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ADR?                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `avg_cost` is OVERWRITTEN to the incoming unit cost on every purchase line — it is **not** a true weighted average, despite the column name. It will equal `last_purchase_cost` after every purchase. This will distort margin figures for any item whose purchase cost fluctuates between purchases. True weighted-moving-average costing is deferred to Phase 8. Any future reader must not assume `avg_cost` means anything more than "cost of the most recent purchase." | Owner's explicit simplification for Phase 2 scope; correctness of a real weighted average needs more design time than the go-live deadline allows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Not yet — candidate for an ADR if this proves confusing later                                                                                    |
| `business_unit_id` on every purchase resolved at runtime by querying `business_unit WHERE code = 'PARTS'` — never hardcoded, including in tests/seed/fallback.                                                                                                                                                                                                                                                                                                               | Per the project's defining business fact: Repair owns no stock, so a purchase can only ever be Spare Parts stock. Hardcoding the id would silently break if the business_unit table is ever reseeded with different ids.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | No — follows existing ADR-0005/ADR-0010                                                                                                          |
| Cash purchases post **zero** `party_ledger` rows — stock movement only. Phase 4's cash-book report will read cash outflow directly from `purchase WHERE payment_mode='cash'` (and the `sale`/`expense` equivalents once they exist), unioned in a view — no new table, no ledger row, built in Phase 4 not now.                                                                                                                                                              | Owner decision 2026-08-24 (PROJECT.md Q12): `party_ledger` is party-debt tracking, not a cash-drawer ledger; adding one now would be designing Phase 4 early.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | No — recorded as PROJECT.md Q12, not an ADR                                                                                                      |
| `party.payment_terms` did not exist in `0001_init.sql` despite being in P2-1's field list. Added as its own migration, `0005_party_payment_terms.sql` (nullable `TEXT`), separate from 0004 since 0004 is scoped to `party_ledger`.                                                                                                                                                                                                                                          | Found by reading the live schema before writing code (CLAUDE.md rule 6/5) rather than silently folding the field into `notes`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | No                                                                                                                                               |
| Credit purchase `party_ledger.amount` is posted **negative** (`-total_amount`), not positive as P2-2's literal spec text read.                                                                                                                                                                                                                                                                                                                                               | The schema's documented sign convention (`0001_init.sql:274-276`: "+ve = party owes US, -ve = party owes US less (payment received, purchase)") is what the already-built `v_party_balance` view (a plain `SUM(amount)`, no party-type branching) relies on. Posting positive would make a supplier's balance read backwards — a CRITICAL-class money-direction bug. Owner confirmed negative 2026-08-24. Worked example and real view output below.                                                                                                                                                                                                                      | No                                                                                                                                               |
| Purchase cancellation **never** sets `reversed_by_id` on the original row — it stays `NULL` forever on every row, original and reversal alike. Reversal is discoverable via the shared `source_type`/`source_id` pair plus `movement_type`/`entry_type`.                                                                                                                                                                                                                     | `docs/DATABASE_RULES.md` §3 contradicts **itself** across three consecutive bullets: "No `UPDATE`. No `DELETE`." / "Corrections insert a reversing row and set `reversed_by_id` on the original." (only achievable via an UPDATE) / "Any code path that updates these tables is a **CRITICAL** bug." `CLAUDE.md` §3.3 independently reinforces the no-update rule ("Corrections are new reversing rows, never edits or deletes") and never mentions `reversed_by_id` at all. No existing code ever set `reversed_by_id` to anything but `null`. Owner chose the no-update reading 2026-08-24: zero updates to these two tables, full stop. Exact linkage mechanism below. | No — logged as `PROJECT.md` BUG-14 (documentation bug), not an ADR                                                                               |
| A supplier-balance import row where `Original Amount = Amount Paid` (zero net balance) is **skipped**, not accepted or rejected — no `party_ledger` row posted, reason names the bill reference.                                                                                                                                                                                                                                                                             | Posting a zero-amount ledger row is informationally pointless and would clutter the ledger; "skipped" (not "rejected") because the data itself isn't invalid, mirroring Phase 1's "already imported" skip category.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | No                                                                                                                                               |
| Bill Reference is a **required** field on the supplier-balance import, even though the column contract doesn't explicitly mark it required.                                                                                                                                                                                                                                                                                                                                  | It is the only stable idempotency key across re-imports (unlike item import, which can fall back to matching by name) — without it, "re-run posts zero new rows" cannot be implemented at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | No                                                                                                                                               |
| P2-3 got a full IPC handler (`import:supplierBalance:dryRun`/`commit`) + a minimal UI trigger page (dry-run/commit buttons, no full supplier list/edit UI); P2-1 and P2-2 did **not** get equivalent IPC/UI wiring — `channels.ts`'s pre-existing `party.*` and `purchase.*` channel entries remain unregistered placeholders.                                                                                                                                               | P2-3's own spec text explicitly named "dual-location report writing, same as Phase 1" as in-scope, which only has meaning with a reachable trigger. P2-1/P2-2's spec text had no equivalent line — their stated verification was DB-level only. Asked the owner before building P2-3's wiring rather than assuming; flagged the P2-1/P2-2 gap explicitly here rather than silently leaving it unmentioned.                                                                                                                                                                                                                                                                | No — Phase 3 (or a dedicated UI pass) should close this gap if the owner wants supplier CRUD / purchase entry usable from the app before go-live |

### 5a. Worked example — the sign convention, with real output

The exact view, read from the live schema (`packages/db/src/migrations/0001_init.sql:274-276, 699-711`):

```sql
-- Sign convention:  +ve = party owes US more (sale, advance given)
--                   -ve = party owes US less (payment received, purchase)
CREATE TABLE party_ledger ( ... );

CREATE VIEW v_party_balance AS
SELECT  p.tenant_id,
        p.id                                    AS party_id,
        p.name,
        p.party_type,
        p.phone,
        COALESCE(SUM(pl.amount), 0)             AS balance_paisa,
        COALESCE(SUM(pl.amount), 0) / 100.0      AS balance_pkr,
        MAX(pl.entry_date)                      AS last_activity_date
FROM    party p
LEFT JOIN party_ledger pl ON pl.party_id = p.id
WHERE   p.deleted_at IS NULL
GROUP BY p.tenant_id, p.id;
```

A Rs 5,000 credit purchase run through the real repository against a real
SQLite DB (`npx tsx` scratch run, then codified as a permanent test —
`purchase.repository.test.ts` "worked example: a Rs 5,000 credit purchase
reads correctly through v_party_balance"), queried directly, no
hand-simulation:

```
--- BEFORE purchase: v_party_balance for this supplier ---
{ balance_paisa: 0, balance_pkr: 0, last_activity_date: null, ... }

--- The party_ledger row this purchase posted ---
{ entry_type: 'purchase', amount: -500000, source_type: 'purchase',
  source_id: '<purchase.id>', bill_reference: 'BILL-WORKED-EXAMPLE', ... }

--- AFTER purchase: v_party_balance for this supplier ---
{ balance_paisa: -500000, balance_pkr: -5000, last_activity_date: '2026-08-24', ... }
```

`balance_pkr: -5000` reads correctly as "the shop owes this supplier
Rs 5,000" — negative in this view's convention means the shop's own
liability, consistent with every other party (a customer's positive
balance is what _they_ owe _us_; a supplier's negative balance is what
_we_ owe _them_). Posting the amount positive, as P2-2's literal spec
text read, would have produced `balance_pkr: +5000` here — reading as
"the supplier owes the shop Rs 5,000," backwards from reality.

### 5b. Reversal linkage — exact mechanism, now that `reversed_by_id` is off-limits

**No column links a reversing row to its specific original row 1:1.**
There is no new column, and `reversed_by_id` is never set (see 5, above).
Instead:

- **Which column, on which row:** the _existing_ `source_type` and
  `source_id` columns — already present on every `stock_movement` and
  `party_ledger` row to record which document caused it. On
  cancellation, the reversing row is inserted with the **same**
  `source_type = 'purchase'` and `source_id = <purchase.id>` as the
  original row(s) it reverses. Original and reversal are siblings under
  the same document id, not a forward/backward pointer pair.
- **What distinguishes direction:** `movement_type` (`'purchase'` for
  the original stock movement, `'purchase_return'` for the reversal) and
  `entry_type` on `party_ledger` (`'purchase'` vs `'purchase_return'`),
  plus the sign of `quantity`/`amount`.
- **How a report joins across it:** it doesn't need a join at all — it
  filters `WHERE source_type = 'purchase' AND source_id = ?` and
  aggregates. This is the exact same aggregation pattern already used by
  `v_stock_on_hand` (`SUM(sm.quantity) ... GROUP BY item_id,
warehouse_id` — no join, no reversal-awareness, `0001_init.sql:689-697`)
  and `v_party_balance` (`SUM(pl.amount) ... GROUP BY party_id`, above) —
  neither view was changed this phase, and neither needed to be: a
  cancelled purchase's rows net to zero automatically inside the same
  `SUM()` that already computes the live balance/stock figure.

Verified against the real views, not asserted — cancelling the same Rs
5,000 credit purchase and the two-line cash purchase both bring
`v_party_balance.balance_paisa` and `v_stock_on_hand.qty_milli` back to
exactly `0` (`purchase.repository.test.ts`, `KyselyPurchaseRepository.cancelPurchase`
describe block — assertions added directly against `v_party_balance` and
`v_stock_on_hand`, not just the raw `stock_movement`/`party_ledger` rows).

### 5c. Double-cancel guard — two different mechanisms, both measured, not assumed

`cancelPurchase`'s status check and its reversal insert run inside one
`db.transaction().execute()` call, but Kysely's transaction wrapper is
`async`/`await`-based (unlike better-sqlite3's own synchronous
`db.transaction(fn)`), so control can genuinely yield to the event loop
between the status-check `SELECT` and the reversal `INSERT`/`UPDATE`.
Whether that gap is exploitable depends on which of two real scenarios
applies. Both were tested — with genuinely concurrent JS invocation
(`Promise.allSettled`, both calls in flight before either resolves, not
sequential `await`-then-`await`) — and each turned out to be guarded by a
**different** mechanism, discovered by reading Kysely's actual source and
by measuring wall-clock timing, not by assuming either:

**Scenario A — two calls sharing one connection** (one `KyselyPurchaseRepository`
instance). The JS invocation is concurrent, but the resulting SQL
execution is not: reading `TransactionBuilder.execute()`
(`node_modules/kysely/dist/cjs/kysely.js`) shows it calls
`executor.provideConnection(...)` — which awaits
`driver.acquireConnection()` — **before** `beginTransaction()` or the
callback (our `SELECT`) ever runs. `SqliteDriver.acquireConnection()`
(`.../dialect/sqlite/sqlite-driver.js`) awaits a JS-level `ConnectionMutex`
that only unlocks once `releaseConnection()` runs, which happens in a
`finally` after `COMMIT`/`ROLLBACK`. So the second call's own `SELECT`
cannot execute until the first call's entire transaction has already
committed — there is no read-then-write gap for it to fall into; the
mutex forces full serialization _before_ either call's callback body
runs, regardless of how the calls were invoked in JS. The second call's
own status check then correctly reads `'cancelled'` and rejects with
`Purchase <id> is already cancelled` (`purchase.repository.test.ts`,
"two concurrent cancel calls on the same purchase").

**Scenario B — two calls on separate connections.** This is the scenario
that actually matters: **every existing IPC handler in this codebase
opens a fresh `better-sqlite3` connection per call**
(`apps/server/src/ipc/handlers/item.handler.ts`: `openDatabase(deps.dbPath)`
at the top of each handler, `db.close()` in a `finally`) — a future
`purchase:cancel` handler would do the same, and Scenario A's mutex is
per-connection, so it provides **no** protection here. Tested with two
genuinely separate `openDatabase()` connections (`purchase.repository.test.ts`,
"two concurrent cancel calls from SEPARATE connections"), confirming
`busy_timeout = 5000` is actually set on both (read back via
`db.pragma('busy_timeout', { simple: true })`, not assumed from
`packages/db/src/connection.ts`'s pragma call alone) — and the mechanism
is different again: the losing call's `SELECT` succeeds (WAL mode lets a
reader proceed against its own snapshot even while a writer's transaction
is uncommitted), but its first reversal `INSERT` fails outright with a
raw `SqliteError: database is locked`.

**The `.code` on that error is `SQLITE_BUSY`** — checked explicitly
(`error.code`, not the message text), confirmed across 6 independent
runs including the original test's own purchase. Not `SQLITE_BUSY_SNAPSHOT`
(WAL's "your read snapshot is stale, retrying won't help" error, which
would have implied a missing retry-on-conflict pattern needed by every
future concurrent-write handler, not just this one).

**Despite `busy_timeout = 5000`, the loser fails in ~2ms, not after
waiting anywhere near 5 seconds** — and this needed an actual mechanism,
not an assumption, so it was tested three ways before being written up:

1. _Timing_: `performance.now()` around both calls, three runs — 3.8ms,
   4.8ms, 3.8ms total wall time for _both_ calls to settle, the loser's
   rejection landing at +1.8–2.0ms.
2. _Step-by-step trace_: both calls' every statement wrapped in the same
   execute-then-`Promise.resolve()` shape Kysely's `SqliteConnection.executeQuery`
   actually uses (a raw trace without that shape doesn't reproduce the
   real interleaving — the first version of this trace ran fully
   sequentially and had to be corrected). The trace shows B's write
   attempt genuinely starts _while_ A's transaction is still open (A's
   own `INSERT` already succeeded, A hasn't committed yet), and B's
   `.run()` call throws **within the same microtask**, before any second
   attempt could even be observed.
3. _The controlling comparison_: the same conflict, reproduced across two
   **genuinely separate OS processes** (`child_process.spawn`, not two
   connections in one process) — process A holds the write lock for a
   real, measured 300ms; process B waits 80ms then attempts its own
   conflicting write. Real output:
   ```
   [A +0.5ms] after UPDATE (write lock acquired)
   [A +0.6ms] sleeping 300ms while holding the write lock...
   [B +0.0ms] after BEGIN
   [A +300.0ms] done sleeping, committing now
   [A +303.6ms] after COMMIT (lock released)
   [B +232.3ms] after UPDATE — SUCCEEDED (busy_timeout genuinely waited)
   [B +232.9ms] after COMMIT
   ```
   Across real, separate processes, `busy_timeout` works exactly as
   documented: B waited roughly 232ms and succeeded once A released the
   lock. This rules out "`busy_timeout` doesn't apply to this lock class"
   as an explanation.

**Conclusion, now demonstrated rather than asserted:** this whole
application is **one Node.js process on one thread** — true in the
same-process test, and equally true of the real Electron main process,
which is also single-threaded. better-sqlite3's calls are synchronous.
For the losing connection's retry to ever succeed, the winning
connection's paused async continuation would need the event loop to
resume it and reach `COMMIT` — but the losing connection's own blocking
native call is not yielding to that event loop while it retries. The
lock can never be observed clearing, so SQLite's busy-handler gives up
almost immediately rather than genuinely waiting out the configured
timeout. The two-process comparison proves this is specific to
same-thread contention, not a general limitation of `busy_timeout` or
this WAL setup. **This is a real property of this app's single-process
architecture** — two near-simultaneous `purchase:cancel` IPC calls in
production would fail fast the same way, not hang for up to 5 seconds —
**and it generalizes beyond purchase cancellation**: any future IPC
handler that lets two concurrent calls attempt conflicting writes to the
same row (Phase 3's sale cancellation, any adjustment/write-off) will hit
the identical fast-fail `SQLITE_BUSY`, not a graceful queued retry. The
permanent test asserts the timing directly (`elapsedMs < 2000`, generously
bounded against CI jitter but tight enough to catch a regression to a
multi-second hang), not just as a comment.

**Both mechanisms were verified to produce the same data outcome**,
across every run of both tests (10 repeated runs of Scenario A, 8 of
Scenario B, plus the standalone timing measurements above): exactly one
call fulfilled, one call rejected, and querying `stock_movement`/
`party_ledger` afterward showed **exactly one** `purchase_return` row of
each kind — never two. The data invariant holds in both scenarios; only
the shape and speed of the rejection differs.

**Not fixed this session, and broader than one handler:** Scenario B's
rejection is a raw native `SQLITE_BUSY` error, not the clean `Purchase
<id> is already cancelled` message Scenario A produces — and, per the
conclusion above, this is not narrow to `purchase:cancel`. Every future
IPC handler that performs a write and could plausibly race another
concurrent write to the same row will hit the identical fast-fail
`SQLITE_BUSY` in this app's single-threaded architecture, with no
graceful queued retry to fall back on. Whoever builds the real
`purchase:cancel` IPC handler (see §8) should catch this and re-check
status to give a clean message rather than let a raw SQLite error reach
the renderer — but the more durable fix is a **shared retry/error-normalizing
helper** wrapping `db.transaction()` for write paths, used by every
concurrent-write handler, not something each one reimplements ad hoc.
Correctness is proven (never more than one reversal, in every scenario
tested); error-message polish and a shared handling pattern are not built
— flagged explicitly rather than left implicit. Logged as its own entry,
**`PROJECT.md` BUG-15, severity HIGH** — a phase-doc note alone is not
where the next person triaging work would see it.

### 5d. `document_sequence` — checked separately, because the consequence would be different

`nextSupplierCode`/`nextPurchaseDocNo` (`party.repository.ts`,
`purchase.repository.ts`) have the **identical** read-then-write shape
that made `cancelPurchase` worth investigating: `SELECT nextNumber`, then
`UPDATE ... SET nextNumber = nextNumber + 1` (or `INSERT` if the row
doesn't exist yet). If two `createSupplier`/`createPurchase` calls raced
the way the two `cancelPurchase` calls did, and both computed the same
`nextNumber` before either wrote, two suppliers or two purchases could
receive the **same** `SUP-A-000123` / `PUR-A-000123`. This is a genuinely
different class of consequence than BUG-15: a leaked error message is a
UX annoyance; a duplicate purchase order number is silent data
corruption a shop owner might not notice until reconciling paperwork
weeks later. Checked with the same rigor as §5c — measured, not reasoned
about — with **N concurrent calls (8 for suppliers, 5 for purchases)**,
not just 2, to raise the chance of exposing any race, and checking both
what the calls _returned_ and what actually **persisted in the database**
(the UNIQUE constraint on `party_code`/`doc_no` would only stop a
duplicate row from being inserted, not stop two callers from computing
and briefly believing they'd been given the same code).

Real, repeated results (5 full repetitions of all four scenarios, now
also permanent tests — `party.repository.test.ts` and
`purchase.repository.test.ts`, "document_sequence concurrency" describe
blocks):

| Scenario                             | Fulfilled | Rejected          | Duplicate codes returned | Duplicate codes in DB |
| ------------------------------------ | --------- | ----------------- | ------------------------ | --------------------- |
| Suppliers, same connection, N=8      | 8/8       | 0                 | none                     | none                  |
| Suppliers, separate connections, N=8 | 1/8       | 7 (`SQLITE_BUSY`) | none                     | none                  |
| Purchases, same connection, N=5      | 5/5       | 0                 | none                     | none                  |
| Purchases, separate connections, N=5 | 1/5       | 4 (`SQLITE_BUSY`) | none                     | none                  |

**Conclusion: not vulnerable, in either scenario — but not because the
read-then-write shape is safe in the abstract.** Same-connection races
never open a window at all (Kysely's per-connection mutex, per §5c).
Separate-connection races **do** open a window — but SQLite's write lock
in this app is whole-database, not row- or table-scoped, and the winning
connection holds it for its **entire transaction**, not just the
`document_sequence` statement. Every losing connection's own first write
attempt — whatever it is, `document_sequence` or otherwise — collides
with that still-open lock and fails outright with `SQLITE_BUSY` before it
can ever reach the point of using a stale cached `nextNumber`. The same
mechanism that produces BUG-15's rough edge (fast-fail, no graceful
retry) is incidentally what closes this specific data-integrity window.
This is **not a general guarantee for every future read-then-write
pattern** — it depends on the loser's write happening while the winner's
transaction is still open, which is likely but not proven exhaustive for
every possible statement ordering. Any new code with this shape should
still be checked the same way, not assumed safe by analogy.

**This finding is contingent, not permanent — see `PROJECT.md` BUG-15's
"Design constraint on the fix."** The guarantee above holds only because
a `SQLITE_BUSY` failure today discards the _entire_ transaction,
including the already-executed `SELECT nextNumber`. BUG-15's eventual
shared retry helper MUST restart the whole transaction (re-running the
read, not just retrying the failed write) — a naive
retry-the-statement-only implementation would resume with the stale
`nextNumber` already captured in JS and silently reintroduce the
duplicate-document-number race this section just proved doesn't
currently exist. Whoever builds that helper needs to read this before
writing it.

---

## 6. Bugs found this phase

- **BUG-14** (`PROJECT.md`) — `docs/DATABASE_RULES.md` §3 contradicts
  itself across three consecutive bullets on whether `stock_movement`/
  `party_ledger` may ever be updated. A documentation bug, not a code
  bug — Phase 2's own code follows the no-update reading throughout (see
  §5b above). Logged so Phase 3's sale cancellation doesn't hit the same
  ambiguity and guess differently.
- **BUG-15** (`PROJECT.md`) — HIGH, code/architecture, not documentation.
  This app's single-threaded main process makes `busy_timeout` fail fast
  rather than queue-and-retry whenever two IPC calls race a write to the
  same row — proven with real timing, a corrected step trace, and a
  controlling two-OS-process comparison (§5c). Not narrow to purchase
  cancellation: every future write-path IPC handler with a plausible
  concurrent-write scenario will hit the identical fast-fail
  `SQLITE_BUSY`, with no shared handling anywhere yet. Carries a binding
  design constraint on its own fix — see §5d and the bug entry itself.

The other two items surfaced this phase (missing `payment_terms` column,
the ledger sign convention) were caught before any code shipped, via
reading the live schema and checking against `v_party_balance` — not
discovered as bugs afterward, so not logged as bugs.

---

## 7. Open questions resolved this phase

- **Q12** (PROJECT.md) — where a cash purchase's outflow is recorded for
  Phase 4's cash-book report. Resolved 2026-08-24: no schema change in
  Phase 2; Phase 4 reads `purchase.payment_mode = 'cash'` directly. See
  Design Decisions above.

---

## 8. Notes for the next phase

- **Concurrent-write `SQLITE_BUSY` handling is not built anywhere yet, and
  it isn't specific to purchase cancellation.** §5c proves (real timing +
  a controlled two-OS-process comparison, not assumption) that this app's
  single-threaded main process makes `busy_timeout` fail fast rather than
  queue-and-retry whenever two IPC calls race a write to the same row.
  Every future write-path handler with a plausible double-submit or
  near-simultaneous-edit scenario (Phase 3 sale cancellation, any
  adjustment/write-off, `purchase:cancel` once it gets an IPC handler)
  will hit this. Build a **shared helper** (retry-with-backoff or a clean
  error-normalizing wrapper around `db.transaction()`) once, rather than
  letting each handler reimplement — or omit — its own handling. The data
  itself is never at risk (never more than one reversal, proven for
  purchase cancellation specifically) — this is about not leaking a raw
  SQLite error to the renderer, and not duplicating the fix N times.
- **UI/IPC gap, real and worth closing before go-live**: supplier CRUD
  (P2-1) and purchase entry (P2-2) are fully built and verified at the
  core+db layer, but nothing in the running app can invoke them yet.
  `channels.ts` already has `party: { create, search, ledger, balance }`
  and `purchase: { create, cancel }` entries (pre-existing scaffold
  placeholders), but no handler file registers them. Phase 3 (customer +
  counter sale) will need supplier/purchase UI anyway for a complete
  billing workflow before the 2026-08-31 deadline — budget time for it
  explicitly rather than assuming P2-1/P2-2 are "done" in the
  user-facing sense.
- **`avg_cost` is not a real weighted average** — every purchase overwrites
  it to the incoming cost. Do not build any margin/profit report against
  it without re-reading the Design Decisions table above; true
  weighted-average costing is Phase 8 work.
- **The cash-book gap (PROJECT.md Q12) is resolved as a design decision,
  not built.** Phase 4's P4-3 cash-book report must read `purchase WHERE
payment_mode='cash'` directly — there is no `party_ledger` row and no
  separate cash-movement table to query instead.
- **`docs/DATABASE_RULES.md` §3 needs a docs-only correction**: it still
  reads "set `reversed_by_id` on the original," which contradicts
  `CLAUDE.md` §3.3 and this phase's actual implementation (reversed_by_id
  is never set, by owner decision). Not fixed this session since it's a
  docs change outside Phase 2's task list — flag for a documentation pass.
- **Migrations now at version 5** (`0004_party_ledger_bill_metadata.sql`,
  `0005_party_payment_terms.sql`, both new this phase). `packages/db/src/migrations/README.md`
  is up to date.
- Real-hardware `npm run verify` confirmation from the owner is still the
  one open item before this phase is unconditionally closed — see Exit
  Criteria.
