# Phase 17.5 — Drawer Cash Movements

**Status:** **APPROVED — 2026-09-27**, amended after review round 2
(R1 BUG-32 scope verified and folded into this phase as Task 4, ahead
of the UI task; R2 movements require an open session; R3 adds
`reverses_id` reversal support; R4 accepted risk recorded in ADR-0016)
and review round 3 (R6 `movement_date` follows the currently-open
session, never the wall clock — BUG-33 logged, not fixed this phase;
R7 a reversal is scoped to the original's own still-open session, with
Task 6 extended to expose `cash_session.notes`) and review round 4 (R8
at most one session may ever be open — `openSession` refuses a second
one, `getOpenSession()` throws rather than picking one; this closes
BUG-33's "two sessions open at once" part, the sale-dating parts stay
open). **Tasks 1–2 built** (migration `0021`; core validation +
`getOpenSession`) — **R8 built as part of Task 3** (the single-open-
session guard, ahead of the repository's own `recordMovement`/
`reverseMovement`). **Blocks go-live** —
accepted by the owner as a blocker (BUG-31, `PROJECT.md`). **Pauses
Phase 17**: P17-3, P17-4, P17-5, P17-7, and the logged follow-up
P17-2b all stay approved and resume once this phase's build is
complete.
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

**Review round 2 (R2) — reversed from the first draft below.**

**Finding requested first: does `closeSession` sum by session time
window or calendar date, and are expected/closing figures stored at
close?** By **calendar date**, never a time window: every one of
`closeSession`'s five `sumPaisa` queries
(`cash-session.repository.ts:164-203`) filters
`WHERE ... = ${date}` on `sale_date`/`payment_date`/`purchase_date`/
`expense_date` (plain `'YYYY-MM-DD'` date strings) — there is no
`openedAt`/`closedAt` timestamp range anywhere in any of the five
queries, so a sale recorded at 8am on a date, before that date's
session is opened at 9am, is still summed in exactly the same way as
one recorded at 5pm after the session opened. `expectedCash`,
`countedCash`, `difference`, and `closedAt` are all written in the same
`UPDATE cashSession SET {...}` at `:211-222` and never recomputed
elsewhere (`CashSessionWidget.tsx` and the handler only read the
already-stored value — confirmed in §2.6's consumer table). Also
confirmed: zero references to a `cash_session_id` FK exist anywhere in
the schema (`kysely-schema.ts`, all migrations) — `sale`/`purchase`/
`expense`/`payment` associate with a session purely by date match, and
no code path gates creating any of them on whether today's session is
open (`CashSessionWidget.tsx` has no such gate either).

**Decision (R2): `cash_movement` is different from those four tables
on this one point — regardless of the finding above, a movement may
only be recorded while a cash session is open, enforced in core and
refused with a plain message otherwise.** The reasoning the first draft
gave for matching sale/expense's ungated pattern doesn't hold here: a
sale or expense can legitimately be entered for a past date (a missed
entry caught up later), but a drawer movement is inherently "this
physical thing is happening right now" — recording a bank deposit for
a day whose till was never opened (or was already closed and counted)
has no real-world referent to attach to, and silently letting it
through would let a movement affect a `cash_session` row's
`expected_cash` retroactively, **after** that session's owner-verified
`countedCashPaisa`/`differencePaisa` were already computed and stored —
exactly the kind of after-the-fact tampering §2.9 (R4) below is
concerned about. New `CashSessionNotOpenError` (same typed-error shape
as `SessionAlreadyOpenError`,
`packages/core/src/expense/cash-session.repository.port.ts:45-52`):
thrown when no session exists for today's date, or one exists but is
already closed. The check and the insert happen inside the same
transaction (read `cash_session` for today's date, verify
`closedAt IS NULL`, else throw and roll back — nothing inserted).

### (4) Append-only, corrections, paisa, UUIDv7, tenant_id

Yes to all — see the DDL in §3. `id` is application-generated UUIDv7
(`newId()`, same as every other table); `tenant_id NOT NULL`; `amount`
is `INTEGER` paisa, signed (`+` in / `-` out — same convention as
`stock_movement.quantity`, `0001_init.sql:323`,
`-- milli-units, SIGNED (+in / -out)`); no `UPDATE`/`DELETE` on this
table, ever.

**Corrections (R3 — reversed from the first draft's "no
`reversed_by_id` column" position).** The first draft cited
`DATABASE_RULES.md §3`'s finding that `stock_movement.reversed_by_id`
is never actually written by any code path, and proposed omitting the
equivalent column here entirely. R3 overrides that: `cash_movement`
gets a nullable `reverses_id TEXT REFERENCES cash_movement(id)`,
**pointing the opposite direction** from the vestigial
`reversed_by_id` columns — it is set **on the reversal row**, pointing
back at the original it corrects, not on the original pointing forward
(the original is never touched, staying true to ADR-0004's "original
row is never edited"). This sidesteps the exact reason the old columns
went unused: those are set on the ORIGINAL at the moment a reversal is
inserted elsewhere in a different code path, an easy step to forget;
`reverses_id` is set by the ONE `reverseMovement()` write path that
creates the reversal row itself, in the same insert, so there's no
second call site to forget it in. `UNIQUE(reverses_id)` enforces "a
movement can be reversed at most once" — SQLite's `UNIQUE` allows
unlimited `NULL`s (every non-reversal row) but at most one non-null
value per original id, the identical precedent already used for
`commission_decision_reversal`'s `UNIQUE(decision_id)`
(ADR-0015). **Reversal amount must be the exact opposite** of the
original's (`reversalAmount === -original.amount`), core-enforced, not
just documented — see the sign/type rules below.

**Sign-per-type rule (core-enforced, `assertCashMovementValid`),
scoped to _original_ (non-reversal) rows only:** `bank_deposit` and
`owner_draw` must always be negative (cash out); `float_add` must
always be positive (cash in); `other` may be either sign. This rule
does **not** apply to a reversal row — a reversal of a (necessarily
negative) `bank_deposit` is itself positive by definition (it cancels
a removal), so enforcing "bank_deposit is always negative" against the
reversal row too would be self-contradictory. A reversal keeps its
original's `movement_type` (it's correcting that same entry, not
recording a new kind of event) and is validated only against
"amount is the exact negation of what `reverses_id` points to," never
against the type/sign table above.

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

| Consumer                                                                    | What it does                                                                                                                                                                                                                                                                                                                                    | Change needed                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cash-session.repository.ts:146-222` (`closeSession`)                       | **The one and only place** the `expected_cash` formula is computed — confirmed by grep, nothing else duplicates it. **R1 finding: its own `cashSales`/`cashPaymentsIn` (and every other term) already correctly filter `payment_mode='cash'`/`method='cash'` — shown in full in §2.1a below. `closeSession` itself is NOT affected by BUG-32.** | Add the `cashMovements` term (§2.5) + the open-session gate (§2.3, R2)                                                                                                                                       |
| `apps/server/src/ipc/handlers/cash-session.handler.ts`                      | Calls `closeSession`/`openSession`/`getTodaySession`, maps to DTO — never recomputes                                                                                                                                                                                                                                                            | None (formula change is transparent to it)                                                                                                                                                                   |
| `apps/client/src/pages/dashboard/CashSessionWidget.tsx:230-232`             | Displays `session.difference` as "Short by"/"Over by"/"Balanced" — reads the stored value, never recomputes                                                                                                                                                                                                                                     | None to the display logic; gains a new "Record cash movement" action + a reversal action + a per-movement list (§4 Task 6)                                                                                   |
| `report.repository.ts:208-255` (`getCashBookReport`) / `CashBookReport.tsx` | An **independent**, differently-scoped ledger (date-range, not per-session) — does NOT reuse the `cash_session` formula at all today, and (R1 finding, §2.1a) is missing its own cash-method filter on two branches **and** two outflow branches (`expense`, `payment` direction='out') entirely                                                | **BUG-32 fixed inside this phase** (§4 Task 4) — cash-filter the existing branches, add the two missing outflow branches, add the new `cash_movement` branch (both signs, "Correction of CM-xxxx" labelling) |

No other report, KPI card, or dashboard widget sums cash-in-hand
independently (checked `DailySalesReport.tsx`, `ExpensesReport.tsx`,
`CashCreditPie.tsx`, `SalesSummaryCards.tsx` — all payment-method
breakdowns of sales, unrelated to drawer reconciliation).

### (6a) R1 — BUG-32 scope, verified against `closeSession` directly

**Requested first: does `closeSession`'s `cashSales`/`cashPaymentsIn`
filter `method='cash'`? Shown in full** (already quoted in part at
§2.3; repeated here for the direct answer) — **yes, both do, and so do
all three other terms:**

```sql
-- cashSales (cash-session.repository.ts:164-171)
SELECT COALESCE(SUM(total_amount), 0) AS total FROM sale
WHERE tenant_id = ? AND sale_date = ? AND payment_mode = 'cash' AND status = 'confirmed'

-- cashPaymentsIn (:172-179)
SELECT COALESCE(SUM(amount), 0) AS total FROM payment
WHERE tenant_id = ? AND payment_date = ? AND direction = 'in' AND method = 'cash'

-- cashPurchases (:180-187)
SELECT COALESCE(SUM(total_amount), 0) AS total FROM purchase
WHERE tenant_id = ? AND purchase_date = ? AND payment_mode = 'cash' AND status = 'confirmed'

-- cashExpenses (:188-195)
SELECT COALESCE(SUM(amount), 0) AS total FROM expense
WHERE tenant_id = ? AND expense_date = ? AND method = 'cash'

-- cashPaymentsOut (:196-203)
SELECT COALESCE(SUM(amount), 0) AS total FROM payment
WHERE tenant_id = ? AND payment_date = ? AND direction = 'out' AND method = 'cash'
```

**Conclusion: BUG-31-severity does NOT apply here.** `closeSession` —
the authoritative figure the owner actually reconciles against — was
never affected by the cash-filter gap; a digital (bank/easypaisa/
jazzcash/cheque) sale or payment has never inflated `expectedCashPaisa`.
The bug is confined entirely to `getCashBookReport`, a separate,
independently-implemented report query that never reuses
`closeSession`'s logic. Re-reading that query in full
(`report.repository.ts:208-238`) surfaced a **second, larger gap** the
first BUG-32 write-up didn't capture: it has exactly **three**
`UNION ALL` branches (`purchase` out, `sale` in, `payment` direction='in')
— there is **no `expense` branch and no `payment` direction='out'
branch at all**. The report doesn't just over-count non-cash inflows;
it omits cash outflows from expenses and outgoing payments entirely.
Both defects are fixed together inside this phase (§4 Task 4), ahead of
the `cash_movement` UI task, per this review round's instruction.

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
--  a new row with `amount` negated AND `reverses_id` set to the
--  original's id (review round 2, R3) — the original row is never
--  touched. UNIQUE(reverses_id) enforces "reversed at most once" (same
--  precedent as commission_decision_reversal's UNIQUE(decision_id),
--  ADR-0015).
--
--  No business_unit_id column (deliberately) — see ADR-0016. No
--  party_id column (deliberately) — see ADR-0016's rejected
--  alternatives. No cash_session_id column — every sibling table
--  (sale, purchase, expense, payment) associates with a day's session
--  purely by date, never by FK; this table follows the same pattern for
--  READS, but (R2) a movement may only be WRITTEN while a session is
--  open — enforced in core (CashSessionNotOpenError), not by a DB
--  constraint (there is no FK to check against).
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
    note            TEXT NOT NULL,          -- required (non-blank) on EVERY movement, all types (R4 mitigation — an audit trail even without user attribution) — core-enforced, not a CHECK constraint (DATABASE_RULES.md section 3, "enum-like columns are canonical in application code")
    reverses_id     TEXT REFERENCES cash_movement(id),  -- set ONLY on a reversal row, pointing back at the original it corrects. NULL for an original (non-reversal) movement. The ORIGINAL row is never updated — reversal-discovery is via this column on the reversal, or by summing, never by editing the original.
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no),
    UNIQUE (reverses_id)
);
CREATE INDEX idx_cm_date ON cash_movement (tenant_id, movement_date);
```

`doc_no` follows the existing `document_sequence` pattern (prefix
`CM`, e.g. `CM-0001`, via `formatDisplayDocNumber` — same choice
`item.repository.ts` makes, not the device-code-suffixed
`formatDocNumber` `sale`/`purchase` use, since this isn't a
multi-device-collision-sensitive document). A reversal row gets its
own new `doc_no` too (it's its own document, referencing the original
via `reverses_id`, not reusing the original's number).

### (8) R6 — `movement_date` is always the open session's business date, never the wall clock

**Review round 3.** Confirmed the root problem by reading how `sale`
sets its own date, since `cash_movement` was about to copy that exact
pattern: `apps/client/src/pages/sales/useSaleFlow.ts:280` sets
`saleDate: new Date().toISOString().slice(0, 10)` — **the client's
wall-clock date at submit time**, entirely decoupled from which
`cash_session` happens to be open. `expense`/`purchase`/`payment` all
follow the identical client-wall-clock pattern (grepped every
`new Date().toISOString().slice(0, 10)` call site feeding a `*_date`
field). **Decision: `cash_movement` does NOT repeat this pattern.**
`movement_date` is resolved server-side from **whichever session is
currently open** (`sessionDate`, a new `getOpenSession()` port method —
`WHERE closed_at IS NULL`, not `WHERE session_date = today`), not from
`new Date()`. If the open session was opened on day D and is still
open when a movement is recorded on wall-clock D+1, the movement gets
`movement_date = D` — the day it actually happened, from the business's
point of view — and is therefore always included in that same
session's eventual close, regardless of how late it runs.

**(a) A cash sale made while day D's session is still open on D+1
wall-clock — which date does it get, is it in D's close?** It gets
`saleDate = D+1` (today's real wall-clock date, per
`useSaleFlow.ts:280` above) — **not** D, and **not** included in D's
close. `closeSession` sums `WHERE sale_date = ${existing.sessionDate}`
(`cash-session.repository.ts:168`), i.e. exactly `D` when D's session
is eventually closed — a D+1-dated sale can never match that filter.
The sale is silently excluded from the very session that was open when
it was made.

**(b) A cash sale entered for date D after D's session is already
closed — does any close ever count it?** No, and it is **permanently
uncounted**. Nothing gates sale/expense/purchase/payment creation on
cash-session status (confirmed in §2.3) — such a sale can still be
inserted with `sale_date = D`. But `closeSession` computes and stores
`expected_cash` once, at the moment of closing, and never recomputes
(`cash-session.repository.ts:211-222`; confirmed by the consumer table
in §2.6 — nothing else ever recomputes it either). D's close already
ran; no future close will ever re-query `sale_date = D` (each session's
close only filters its _own_ date). The late sale sits in the ledger
forever, never reflected in any `cash_session` row's figures.

**(c) Can two sessions exist for one date?** No — `UNIQUE(tenant_id,
session_date)` on `cash_session` prevents it at the DB level, and
`openSession` already has a passing test for this
(`SessionAlreadyOpenError`). **But a related, more serious gap exists:
two sessions for _different_ dates can be open simultaneously**, which
is the actual mechanism behind (a). `cashSession:today`
(`cash-session.handler.ts:72-88`) resolves via
`getSessionByDate(todayIso())` — a lookup keyed on **today's wall-clock
date**, blind to an older session that's still open. If D's session is
never closed and wall-clock rolls to D+1, `CashSessionWidget.tsx`'s
`loadToday()` finds no session for D+1, shows "no session today," and
lets the owner **open a brand-new session for D+1** — while D's sits
open and forgotten. `openSession` itself never checks "is any session
already open," only "is one already open **for this exact date**."

**Logged as BUG-33 (`PROJECT.md`) — not fixed this phase.** Root cause:
`sale`/`expense`/`purchase`/`payment` dates are all wall-clock at
creation time, with no concept of "which session is this for"; opening
a new session never checks for an already-open older one. Both are
pre-existing, unrelated to `cash_movement`'s own scope, and not fixed
here — `cash_movement` sidesteps the whole problem for itself by
resolving its own date from the open session, never the wall clock.

### (9) R7 — reversals are scoped to the currently-open session

**How opening cash is set (checked first, per instruction — this
changes the reasoning if it's automatic):** **Manually counted and
typed in by the owner every time**, never carried over.
`CashSessionWidget.tsx:48-56`'s `handleOpen()` reads `amountInput` (a
plain text field the owner fills in, converted via `Money.fromRupees`)
— there is no read of the previous session's `countedCash` anywhere in
that flow, and `openSession`'s own repo method
(`cash-session.repository.ts:56-95`) takes `openingCashPaisa` as a
plain caller-supplied number, never derived from a prior row. **Not a
STOP condition** — proceeding with the reasoning below as given.

**Rule: a movement can be reversed only while its ORIGINAL's session
is still the currently-open one.** Checked via `getOpenSession()`
(§2.8) — if there is no open session, or the open session's
`sessionDate` doesn't match the original movement's `movementDate`,
reversal is refused with: _"That day is closed — its cash difference
already reflects this. Add a note to the closed session instead."_

**Why (double-counting risk):** a session's `expected_cash` and
`difference` are computed once, at close, from that date's rows as
they existed **at that moment** (§2.3/§2.6) — a closed session never
recomputes. If a movement belonging to an already-closed day D were
reversed **today** (a later, currently-open day), the reversal row
would get today's `movement_date` (per §2.8's own rule — it's recorded
against whichever session is open _now_), so it would adjust _today's_
`expected_cash`, not D's. The result: D's stored `expected_cash` still
reflects the original (uncorrected) movement — permanently, since D's
close already ran — while today's close now carries an adjustment for
an error that occurred on a different day entirely. The mistake is
effectively double-counted: still wrong on the day it happened, and
wrongly "corrected" on a day it didn't happen on. Scoping reversal to
"only while the original's own day is still open" is what keeps a
correction inside the same day's figures it's actually correcting.

**Found while designing this: `cash_session.notes` (the column the
refusal message points the owner toward) is currently unused —
grepped every read/write site, zero hits anywhere in application code.**
The message names a real column that already exists and is already
nullable/always-NULL today, but no UI currently lets the owner set it,
even on an open session. **Task 6 (§4) is extended to add a minimal
"Add note" action on a closed session's detail view**, writing to this
existing column (no migration needed) — otherwise the refusal message
sends the owner toward a feature that doesn't exist.

**Additional core rules (this review round):**

- `amount !== 0` — a movement of exactly zero paisa records nothing
  and serves no purpose; rejected for both original and reversal rows.
- **A reversal row cannot itself be reversed** (kept from R3, restated
  here since R7 adds the session-scoping check alongside it —
  `reversesId !== null` on the row being reversed is refused before
  the session check even runs).
- **`reverses_id` uniqueness is checked in core before the insert is
  attempted** (`SELECT` for an existing row with
  `reverses_id = originalId`; if found, throw immediately with a plain
  "already reversed" message) — **the DB's `UNIQUE(reverses_id)`
  constraint stays as the backstop** for the race window between that
  check and the insert (same two-layer shape CLAUDE.md's own
  concurrency guidance expects: application-level check first, DB
  constraint as the guarantee), mapped to the same typed error via
  `isUniqueConstraintError`, the existing precedent
  (`cash-session.repository.ts:24-31`).

### (10) R8 — at most one cash session may ever be open at a time

**Review round 4.** `getOpenSession()` (§2.8) is only well-defined if
"the" open session is unambiguous — R6/R7's own designs assumed this
without yet enforcing it. Fixed here, not deferred:

- **`openSession` refuses if ANY session is open**, not only one for
  the same date. Checked inside the same transaction, before the
  insert: `SELECT session_date FROM cash_session WHERE tenant_id=? AND
closed_at IS NULL`. If found and it's the **same** date as the request,
  throws the pre-existing `SessionAlreadyOpenError` (unchanged
  behaviour, existing test still passes). If found and it's a
  **different** date, throws the new `AnotherSessionStillOpenError`,
  naming that date: _"The drawer for {date} is still open — close it
  first."_
- **`getOpenSession()` throws `MultipleOpenSessionsError` (naming every
  open date found) if more than one session is ever open** — it never
  silently picks one, even though `openSession`'s new guard should make
  this state unreachable going forward. Kept as a defensive backstop
  against pre-existing bad data (this dev DB has zero open sessions
  today — see the dev-DB report below — but a shop that's already been
  running could have one).
- **The Dashboard widget** (`CashSessionWidget.tsx`) resolves
  `cashSession:today` via `getOpenSession()` (already the R6 design,
  §2.8) rather than a same-day lookup — an older still-open session now
  renders as "Open" (with its own date shown next to the opened time,
  since "Opened at {time}" alone would be ambiguous about which day),
  never as "Not started." Before this fix, "Not started" is exactly
  what let the owner open a second session over a forgotten one — the
  render fix and the `openSession` guard close the same hole from two
  directions.
- **Dev-DB report (requested):** copied `data/shop-dev.db` to a
  scratchpad path first (CLAUDE.md session rule — the live file is
  never queried directly), then `SELECT COUNT(*) FROM cash_session
WHERE closed_at IS NULL`: **0 open sessions** (1 `cash_session` row
  total, already closed). No pre-existing violation of the new
  invariant in this environment.
- **BUG-33 (`PROJECT.md`), updated:** the "two sessions for different
  dates can be open simultaneously" part — (c) in the original
  write-up — is **fixed by this task**. Parts (a) and (b) — sales
  dated by the wall clock rather than the open session, both while a
  session runs past midnight and after it's already closed — remain
  **open**, planned as their own pre-go-live task after Phase 17.5,
  pending an owner workflow question: does the shop close its drawer
  nightly, and do sales ever happen after that close? **Refusing to
  record a sale after the day's session is closed is ruled out as a
  fix** — the register must never refuse to sell something to a
  customer standing at the counter over a bookkeeping technicality.

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

### Accepted risk (R4 — recorded here and in ADR-0016)

Without an auth/permission layer (ADR-0009 — permissions are code, not
data, but no user/role gate exists yet, per `BUG-ADR9`), **anyone with
access to the app can record a cash-out movement to mask what would
otherwise show as a shortage** — e.g. entering a fake `owner_draw` for
exactly the missing amount makes a till that's actually short
reconcile cleanly, with nothing today distinguishing that from a real
withdrawal. **Accepted as a risk for this phase**, not a blocker,
mitigated by three things built now, not deferred:

1. **`note` is required (non-blank) on every movement, all four
   types** — not just `'other'` (the first draft's design). Even a
   `bank_deposit`/`owner_draw` must carry some text (e.g. "Deposited at
   HBL Malakand branch") — a minimal audit trail exists even without
   per-user attribution.
2. **The close screen lists every movement individually**, not a net
   adjustment figure folded silently into `expected_cash` — a
   suspicious pattern (many small "owner_draw" entries, say) is visible
   to anyone looking at the session, without recomputing anything.
3. **The Cash Book report shows every movement**, with its note and
   its correction status, in the same running ledger as sales/expenses.

A future auth phase should add real attribution: `created_by` already
exists on `cash_movement` as a nullable `REFERENCES app_user(id)`
column (same convention as `expense.created_by`, `cash_session.opened_by`
— populated with `NULL` everywhere today, ready to be populated once
users exist) — no schema change needed when that phase arrives.

---

## 4. Task breakdown

Build order matches dependency order (schema → core → db → contracts →
IPC → UI), same convention as every prior phase. **Task 4 (the Cash
Book report fix) is ordered before Task 6 (the UI), per review round
2's instruction** — BUG-32 is fixed inside this phase, ahead of the
`cash_movement` UI.

| Task | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Files touched                                                                                                                                                                                                                                                                                                                                           | Migration? | Effort |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| T1   | Migration `0021_cash_movement.sql` (§2.7's amended DDL — `reverses_id` + `UNIQUE(reverses_id)`, `note NOT NULL`), verbatim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | New migration file, `kysely-schema.ts` (new `CashMovement` table type)                                                                                                                                                                                                                                                                                  | **Yes**    | S      |
| T2   | Core: `CashMovementType`, `CashMovementRecord`, `NewCashMovementInput`, `CashMovementRepositoryPort` (now including `getOpenSession()` on the cash-session port, §2.8), `CashSessionNotOpenError`, `CashMovementAlreadyReversedError`; pure `assertCashMovementValid(type, amountPaisa, note)` (sign-per-type for _original_ rows, non-blank `note` always, `amount !== 0`) and `assertReversalValid(original, reversalAmountPaisa, openSessionDate)` (exact negation; refuses reversing an already-reversed or already-reversal row; refuses when `openSessionDate !== original.movementDate`, per R7 — the plain "that day is closed" message)                             | New `packages/core/src/cash-movement/cash-movement.repository.port.ts`, `cash-movement.service.ts`, `cash-movement.service.test.ts`, `packages/core/src/index.ts` exports                                                                                                                                                                               | No         | S      |
| T3   | DB: **R8 built first** — `openSession` refuses a second open session (any date, not just the same one), `getOpenSession()` throws on more than one found, `CashSessionWidget.tsx` resolves via `getOpenSession()` (§2.10). Then: `KyselyCashMovementRepository.recordMovement` (open-session gate, `movementDate` resolved from the open session's `sessionDate` — never wall-clock — insert + `audit_log` + `sync_outbox`, one transaction) and `.reverseMovement` (same gate, R7's session-match check, core-side `reverses_id` pre-check + DB `UNIQUE` backstop); `listForDateRange` for the Cash Book report; modify `KyselyCashSessionRepository.closeSession` per §2.5 | New `packages/db/src/repositories/cash-movement.repository.ts` (+ `.test.ts`), `packages/db/src/repositories/cash-session.repository.ts` (+ its own `.test.ts`, new hand-calculated cases including R1's mixed-day test, R6's stale-open-session test, and R8's guard/throw tests), `CashSessionWidget.tsx` (+ `.test.tsx`), `packages/db/src/index.ts` | No         | M      |
| T4   | **Fix BUG-32** in `getCashBookReport`: add `payment_mode='cash'`/`method='cash'` to the existing `sale`/`payment(in)` branches; add the two missing outflow branches (`expense`, `payment` direction='out', both `method='cash'`); add the new `cash_movement` branch (both signs via `CASE`, description `'Correction of ' \|\| (doc_no of what reverses_id points to)` when reversing, else the type's human label or the note for `'other'`)                                                                                                                                                                                                                              | `report.repository.ts` (`getCashBookReport`), `report.repository.test.ts` (new cases for the fixed filters and the missing branches), `CashBookReport.tsx` if a new description case needs client-side handling                                                                                                                                         | No         | M      |
| T5   | Contracts + IPC: `RecordCashMovementInput`, `ReverseCashMovementInput`, `CashMovementDto`; new channels `cashMovement.record` / `cashMovement.reverse` / `cashMovement.listForDateRange`; new `cash-movement.handler.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `packages/contracts/src/cash-movement/cash-movement.ts` (+ `index.ts`), `apps/server/src/ipc/channels.ts`, new `cash-movement.handler.ts` (+ `.test.ts`), `apps/server/src/main.ts`, `apps/server/src/preload.ts`, `apps/client/src/types/electron-api.d.ts`                                                                                            | No         | S      |
| T6   | UI: a "Record cash movement" action on `CashSessionWidget.tsx` (reason picker, amount, note — note always required), a per-movement list underneath with a "Reverse" action on each (R4's mitigation #2), disabled/refused per R7's session-scoping with the exact plain message; a minimal "Add note" action on a closed session's detail view, writing to the existing (currently unused anywhere) `cash_session.notes` column — R7's refusal message points the owner here, so it must exist; Cash Book display of corrections                                                                                                                                            | `CashSessionWidget.tsx` (+ `.test.tsx`), new small modal component, `CashBookReport.tsx` (if needed)                                                                                                                                                                                                                                                    | No         | M      |

**Total effort estimate:** S + S + M + M + S + M ≈ **2–3 focused
sessions** (up from the first draft's 1–2, reflecting BUG-32's fuller
scope and the reversal mechanics).

---

## 5. Exit criteria (with tests)

- [ ] **T1** — Migration applies cleanly on a fresh DB (`migrate.ts`);
      `sqlite_master` query confirms `cash_movement` exists with the
      exact columns in §2.7's amended DDL (including `reverses_id`,
      `note NOT NULL`) plus `idx_cm_date` and both `UNIQUE` constraints.
      Table count is previous + 1 (Q11 baseline table, re-verified at
      that point — see `PROJECT.md` Q11 for the running count
      convention).
- [ ] **T2** — `cash-movement.service.test.ts`:
      `assertCashMovementValid` (original rows only) accepts
      `bank_deposit`/`owner_draw` only with a negative amount, rejects
      a positive one for either; accepts `float_add` only with a
      positive amount, rejects a negative one; accepts `other` with
      either sign; rejects a blank/whitespace-only `note` **regardless
      of type** (R4 — required on every movement, not just `'other'`);
      rejects `amount === 0` for every type (R7).
      `assertReversalValid`: accepts a reversal amount that is the
      exact negation of the original's; rejects one that isn't (even
      by 1 paisa); rejects reversing a row that is itself already a
      reversal (`reversesId !== null`); **R7 — rejects reversing an
      original whose `movementDate` doesn't match the currently-open
      session's `sessionDate`** (no session open at all, or a
      different date's session is open), with the exact message
      `"That day is closed — its cash difference already reflects
  this. Add a note to the closed session instead."`; accepts a
      reversal when the original's `movementDate` **does** match the
      open session's date (same-day reversal, still open).
- [ ] **T3** — **R8, built first (DONE):** opening a session while
      another (same or different date) is already open is refused —
      `SessionAlreadyOpenError` for the same date (existing behaviour,
      unchanged), `AnotherSessionStillOpenError` naming the open date
      otherwise — zero extra rows inserted either way. Opening a new
      session succeeds once the previous one is closed. `getOpenSession()`
      finds a still-open earlier-dated session even when a same-day
      lookup finds nothing, and throws `MultipleOpenSessionsError`
      (naming every open date) when two are seeded directly, bypassing
      the repository. `CashSessionWidget.test.tsx` (new case): mocking
      `cashSession:today` to resolve an old, still-open session renders
      STATE 2 ("Open"), never STATE 1 ("Not started"), with the
      session's own date visible next to the opened time.
      Repository tests, real temp DB: recording a movement
      inserts exactly one `cash_movement` row plus one `audit_log` row
      plus one `sync_outbox` row, in one transaction (mirrors
      `cash-session.repository.test.ts`'s existing assertions for
      `openSession`). **Priority hand-calculated test (kept from the
      first draft):** open a session with `openingCashPaisa = 1,000,000`
      (Rs 10,000); insert a confirmed cash sale for `500,000` paisa
      (Rs 5,000) on the same date; record a `bank_deposit` cash movement
      of `-1,200,000` paisa (Rs 12,000 removed) on the same date; close
      the session with `countedCashPaisa = 300,000` (Rs 3,000). Assert
      `expectedCashPaisa === 300000` (hand-calculated:
      `1,000,000 + 500,000 + 0 − 0 − 0 − 0 + (−1,200,000) = 300,000`)
      and `differencePaisa === 0` (no shortage). A second test in the
      same file confirms `getExpenseSummaryReport`'s business totals
      and `v_unit_direct_expense`'s sum are **byte-identical** before
      and after the movement is recorded — the "no unit P&L or expense
      report total changes" requirement, proven directly.
      **R2 — session-open gate tests:** recording a movement on a date
      with **no** `cash_session` row throws `CashSessionNotOpenError`,
      zero rows inserted; recording one on a date whose session is
      **already closed** throws the same error, zero rows inserted;
      recording one while the session is open succeeds. A separate test
      confirms the _calendar-date, not time-window_ finding directly:
      insert a cash sale timestamped/dated on the session's date but
      with a `created_at` **before** `openedAt`, and confirm
      `closeSession` still sums it (proving date-match, not a
      timestamp-range match).
      **R3 — reversal tests:** reversing a movement inserts exactly one
      new row with `reversesId` set to the original's id and `amount`
      negated; the original row is **byte-unchanged** (still queryable
      exactly as inserted — no `UPDATE` ever ran against it); reversing
      the **same** original a second time throws a typed
      "already reversed" error (the `UNIQUE(reverses_id)` violation,
      mapped the same way `SessionAlreadyOpenError` maps its own
      constraint violation) with zero rows inserted; reversing a
      `bank_deposit` (originally negative) succeeds with a **positive**
      reversal amount without tripping the sign-per-type rule (proving
      that rule is correctly scoped to original rows only, per §2.4).
      **R6 — `movement_date` follows the open session, not the wall
      clock:** open a session dated D; without closing it, insert a
      movement whose recording logic runs against a clock/date stubbed
      to D+1 — assert the inserted row's `movementDate === D`, and that
      closing D's session (still using the real `sessionDate` D) sums
      it correctly. A second test proves `getOpenSession()` finds D's
      session by `closedAt IS NULL`, regardless of what "today" is.
      **R7 — reversal core-side uniqueness check:** reversing a
      movement twice in immediate succession (simulating the
      check-then-insert race) still results in exactly one reversal
      row and one thrown "already reversed" error for the second
      attempt — first via the core pre-check (no DB round trip for the
      insert attempt), separately confirmed the DB's own
      `UNIQUE(reverses_id)` constraint independently refuses a
      hand-crafted second insert that bypasses the core check
      entirely (the backstop, tested directly against the repository's
      raw SQL path, not just through the public method).
- [ ] **T4 — fixes BUG-32.** `report.repository.test.ts` new cases:
      an Easypaisa sale and a bank-method incoming payment are **excluded**
      from `getCashBookReport`'s totals (the cash-filter fix); a cash
      expense and a cash outgoing payment **appear** as new "Out" rows
      (the two previously-missing branches); a `cash_movement` row
      appears with the correct sign split and, when it's a reversal,
      the description reads `"Correction of {original's doc_no}"`.
      **R1 priority mixed-day test, hand-calculated, tying the two
      calculations together for one session:** on one session date —
      opening `1,000,000` paisa (Rs 10,000); a cash sale of `600,000`
      paisa (`payment_mode='cash'`); an Easypaisa sale of `400,000`
      paisa (`payment_mode='easypaisa'`); a bank-method payment
      received of `200,000` paisa (`direction='in', method='bank'`); a
      cash expense of `150,000` paisa (`method='cash'`); a `bank_deposit`
      cash movement of `-500,000` paisa. Compute `closeSession`'s
      `expectedCashPaisa`: `1,000,000 + 600,000 + 0 − (0 + 150,000 + 0)
  - (−500,000) = 950,000`. Compute `getCashBookReport`'s net for
that single day (`dateFrom = dateTo =`the session date, so its
internal running balance starts at 0 for the query): inflows`600,000`(cash sale only — Easypaisa and the bank payment are
correctly excluded) minus outflows`150,000 + 500,000 = 650,000`
= **`−50,000`**. Assert
`sessionOpeningCashPaisa + cashBookNetForDay === expectedCashPaisa`
(`1,000,000 + (−50,000) = 950,000`) — the two independently-computed
    figures agree exactly, for a day exercising every branch at once.
- [ ] **T5** — Handler tests (real temp DB, no Electron mocking, same
      `runX`-plain-function precedent as `item.handler.test.ts`/
      `sale.handler.test.ts`): `record` and `reverse` both round-trip
      correctly through the IPC input schema; a blank `note` (any type)
      is rejected at the Zod boundary before it ever reaches the
      repository; a `record` call with no open session surfaces
      `CashSessionNotOpenError`'s code intact across the boundary
      (matches P17-1's own IPC-boundary lesson — verify this
      empirically, don't assume a thrown error's custom properties
      survive `ipcMain.handle`→`ipcRenderer.invoke`; resolve a
      discriminated result if they don't, same fix pattern as
      `sale.handler.ts`'s `runCreateSale`).
- [ ] **T6** — Render tests: submitting the "Record cash movement" form
      with reason "Bank deposit" and amount "12,000" calls the IPC
      method with `movementType: 'bank_deposit'`, `amountPaisa: -1200000`,
      and a required note; every reason (not just "Other") blocks
      submission when the note is blank (R4); the movement list shows
      each recorded entry individually with a "Reverse" action;
      clicking "Reverse" on an already-reversed entry is disabled/
      hidden, not merely re-clickable-and-erroring. **R7 addition:** a
      movement belonging to a closed session's date renders its
      "Reverse" action disabled with the exact refusal copy shown as a
      tooltip/inline message, not merely a silently-ignored click; the
      closed session's own detail view has an "Add note" field that
      calls a save method writing to `cash_session.notes`.
- [ ] `npm run verify` exits 0 after every task above, count pasted
      each time (Golden Rule #4).
- [ ] `PROJECT.md` (BUG-31 → FIXED, BUG-32 → FIXED) and `PROGRESS.md`
      updated per CLAUDE.md §7 before this phase is called complete.
- [ ] Phase 17 resumes: P17-3, P17-4, P17-5, P17-7, P17-2b unpaused.
