# ADR-0016: Drawer cash movements are their own append-only table, outside both units' P&L

**Status:** Accepted — 2026-09-27 (amended after review round 2: R1 BUG-32 scope/fix, R2 session-open gate, R3 reversal mechanism, R4 accepted risk; amended again after review round 3: R6 movement_date follows the open session not the wall clock — BUG-33 logged, not fixed; R7 reversal scoped to the still-open original session; amended again after review round 4: R8 at most one session may ever be open — `openSession` refuses a second one, `getOpenSession()` throws rather than picking one, BUG-33's cross-date-open-sessions part is fixed by this). Tasks 1–3 built (migration 0021; core validation + getOpenSession; KyselyCashMovementRepository + the single-open-session guard + the expected_cash formula change). Task 4 (fixes BUG-32) next.

## Context

BUG-31 (`PROJECT.md`): the cash session's `expected_cash` formula
(`cash-session.repository.ts:205-208`) has no term for cash physically
removed from — or added to — the drawer for a reason that is not a
sale, a purchase, an expense, or a party payment. The everyday example
that surfaced this: the owner takes cash to the bank. Today, that cash
is simply gone from the drawer with no recorded counterpart, so at
close `countedCashPaisa` comes in lower than `expectedCashPaisa` and
the session reports a "shortage" — indistinguishable from an actual
till discrepancy (theft, miscounting, an unrecorded sale). This is
accepted as a go-live blocker.

## Decision

A new table, `cash_movement`, records cash added to or removed from the
physical drawer for one of four reasons: `bank_deposit` (cash removed,
taken to the bank), `owner_draw` (cash removed, taken by the owner for
personal use), `float_add` (cash added — change/float top-up), or
`other` (either direction). **A non-blank note is required on every
movement, all four types** (review round 2, R4 — see Consequences). It
is **append-only** (ADR-0004) and participates in the cash session's
`expected_cash` formula as one new signed term — nothing else. It has
**no `business_unit_id` column** and **no effect on either unit's
P&L** — see Consequences. **A movement may only be recorded while a
cash session is open** (review round 2, R2), refused with a plain,
typed error otherwise. **Its `movement_date` is always the currently
open session's `sessionDate`, never the wall clock** (review round 3,
R6). **A movement can be reversed** — a new row, `reverses_id` pointing
back at the original, amount negated, at most once per original — but
**only while the original's own session is still the open one**
(review round 3, R7) — see Consequences.

## Reasoning

**Why not `expense`.** An expense is a business cost — every view that
reads `expense_category`-joined rows (`v_unit_direct_expense`,
`v_overhead_pool`, `getExpenseSummaryReport`) treats it as one.
Recording a bank deposit as an expense would misrepresent the owner
moving their own cash to a bank account as the business _spending_
money, inflating expense totals and depressing both units' apparent
profit for no real economic reason. It would also collide with
Q-DRAWING (`docs/phases/PHASE_17.md` §2.6, 2026-09-27): the owner has
already said personal drawings are out of scope for the expense-side
tables — this ADR is the cash-side mirror of that same boundary.

**Why not a payment to a dummy party.** `payment` requires a real
`party_id` (`packages/contracts/src/payment/payment.ts:10`) and every
payment row feeds `v_party_balance`/the receivables ledger. Inventing a
placeholder party ("Owner", "Bank") to hold these rows would pollute
the party ledger and the receivables/payables reports with a
non-trading, non-debt relationship that has no real balance to collect
or pay — every future "list overdue customers" or "party statement"
query would need to remember to filter this one fake party out
forever. `packages/core/src/payment/payment.repository.port.ts` and
`PHASE_3.md §8`'s binding note (`payment.amount` unsigned + `direction`
vs. `party_ledger.amount` signed — genuinely incompatible conventions)
already establish that `payment`/`party_ledger` are for real party
debt, not general cash bookkeeping.

**Why a new table, not extending `cash_session` itself.**
`cash_session` is `UNIQUE(tenant_id, session_date)` — one row per day,
mutated at close (`PHASE_7.md §5` Correction 2: it is deliberately
**not** append-only, since it holds a single day's summary, not a
ledger of events). A drawer movement is an _event_ — multiple can
happen on the same day (a float top-up in the morning, a bank deposit
in the afternoon) — so it needs its own append-only row per event,
summed into the day's `cash_session` snapshot at close, exactly the
way `sale`/`purchase`/`expense`/`payment` already are.

## Consequences

- **No `business_unit_id` column.** `cash_session` itself — the
  closest sibling table — has no `business_unit_id` either
  (`0001_init.sql:530-544`): whole-till cash reconciliation has never
  been unit-scoped in this schema, because physical cash in a drawer
  isn't owned by one business unit. ADR-0005 tags **revenue and cost
  lines** (`sale_line`, `expense`, `purchase`, `stock_movement`); it
  never required every money-adjacent table to carry the column, and
  `cash_session` is the existing proof of that. Omitting the column
  entirely (rather than adding it nullable-and-always-NULL, the way
  `expense.business_unit_id` represents a shared/overhead cost) is the
  more honest design here — there's no future case where a drawer
  movement gains unit meaning, since it isn't revenue or cost.
- **Genuinely no effect on either unit's P&L**, by construction: no
  existing report or view reads `cash_movement` — it's a new table, not
  a new filter condition on an existing one. `v_unit_direct_expense`,
  `v_overhead_pool`, `v_owner_drawings`, and `getExpenseSummaryReport`
  are all completely untouched by this ADR.
- **`reverses_id`, reversed from the first draft's "no reversal
  column" position (review round 2, R3).** The first draft cited
  `docs/DATABASE_RULES.md §3`'s finding that `stock_movement.reversed_by_id`
  is never actually written by any application code path, and proposed
  omitting the equivalent column here. Overruled: `cash_movement` gets
  a nullable `reverses_id TEXT REFERENCES cash_movement(id)`, set only
  on the reversal row, pointing **back** at the original — the opposite
  direction from the vestigial `reversed_by_id` columns, which were set
  on the _original_ by a second, easy-to-forget call site. Here there
  is exactly one write path (`reverseMovement()`) that creates the
  reversal row and sets `reverses_id` in the same insert, so the
  "column nobody remembers to write" failure mode doesn't apply.
  `UNIQUE(reverses_id)` enforces "reversed at most once" (SQLite allows
  unlimited `NULL`s, at most one non-null value) — the same precedent
  as `commission_decision_reversal.UNIQUE(decision_id)` (ADR-0015). The
  reversal amount must be the exact negation of the original's,
  core-enforced (`assertReversalValid`). The sign-per-type rule below
  applies only to _original_ rows — a reversal of a (necessarily
  negative) `bank_deposit` is itself positive by definition, and
  enforcing "always negative" against it too would be
  self-contradictory.
- **No `party_id` column** — deliberately, per "why not a payment to a
  dummy party" above.
- Corrects `cash-session.repository.ts`'s `expected_cash` formula to
  add one new signed term,
  `cashMovementsNet = SUM(cash_movement.amount) WHERE tenant_id=? AND movement_date=?`
  (COALESCE'd to 0, same convention as every other term in that
  formula): `expectedCashPaisa = cashIn - cashOut + cashMovementsNet`.
- **A movement may only be recorded while a cash session is open
  (R2).** `closeSession` itself sums by calendar date, not a time
  window, and never gates any other table's writes on session status —
  but a drawer movement is different in kind from a sale or expense: it
  is "this physical thing is happening right now," not a document that
  can legitimately be entered for a past date. Letting one through for
  a date whose session was never opened, or was already closed and
  counted, would let it change a `cash_session` row's `expected_cash`
  retroactively, after the owner's `countedCashPaisa` was already
  verified and stored — the exact kind of after-the-fact tampering R4
  below is concerned about. `CashSessionNotOpenError`, checked and
  inserted in one transaction.
- **`movement_date` is resolved from the currently-open session, never
  `new Date()` (R3, R6).** Found while designing this: `sale`
  (`useSaleFlow.ts:280`) and every sibling document set their own date
  from the client's wall clock at submit time, entirely decoupled from
  which `cash_session` is open — logged as **BUG-33** (`PROJECT.md`,
  not fixed here): a session left open past midnight silently excludes
  every sale made after midnight from its own close (they get
  tomorrow's date), and nothing checks for an already-open older
  session before letting a new one be opened. `cash_movement` does not
  repeat this: a new `getOpenSession()` port method
  (`WHERE closed_at IS NULL`) resolves `movement_date` from whichever
  session is actually open, so a movement recorded late always lands in
  the correct close regardless of wall-clock date.
- **A movement can be reversed only while its original's session is
  still the open one (R7).** Verified first (per instruction) that
  opening cash is manually counted and typed in every time
  (`CashSessionWidget.tsx:48-56`), never carried over from the prior
  close — the reasoning below holds. A session's `expected_cash` is
  computed once, at close, and never recomputed. Reversing a
  closed-day's movement from a later, currently-open day would record
  the reversal against _that later day_ (per R6's own rule — a
  movement's date always follows whichever session is open _now_),
  leaving the closed day's stored figure wrong forever while
  "correcting" a day the error never happened on — the mistake is
  double-counted, not fixed. Refused with: _"That day is closed — its
  cash difference already reflects this. Add a note to the closed
  session instead."_ That message names `cash_session.notes`, an
  existing column with zero reads or writes anywhere in application
  code today — Task 6 (`docs/phases/PHASE_17_5.md`) is extended to add
  a minimal way to set it, so the message doesn't point at a dead end.
  Additional core rules: `amount !== 0` (rejected for both original and
  reversal rows); a reversal row cannot itself be reversed (kept from
  R3); `reverses_id` uniqueness is checked in core before the insert is
  attempted (a plain "already reversed" message, no DB round trip for a
  doomed insert), with the DB's `UNIQUE(reverses_id)` kept as the
  backstop for the check-then-insert race window.
- **At most one cash session may ever be open at a time (review round
  4, R8)** — required for `getOpenSession()` above to be well-defined
  at all; without it, "the" open session is ambiguous. `openSession`
  now refuses (inside its own transaction, before the insert) if ANY
  session is open, not just one for the same date — `AnotherSessionStillOpenError`,
  naming the open date: _"The drawer for {date} is still open — close
  it first."_ (The exact-same-date case still throws the pre-existing
  `SessionAlreadyOpenError`, unchanged.) `getOpenSession()` itself
  throws `MultipleOpenSessionsError` if it ever finds more than one —
  it never silently picks one, even though that state should now be
  unreachable in normal operation. The Dashboard widget
  (`CashSessionWidget.tsx`) resolves `cashSession:today` via
  `getOpenSession()`, not a same-day lookup (already true from R6), so
  an older still-open session now renders as "Open," with its own date
  shown next to the opened time — not as "Not started," which is what
  silently let a second session get opened over it before this fix.
  **This closes the "two sessions for different dates can be open
  simultaneously" part of BUG-33** (`PROJECT.md`, updated) — the
  sale/expense/purchase/payment wall-clock-dating parts (a)/(b) remain
  open, out of this phase's scope (see BUG-33's updated entry).
- `getCashBookReport` (`report.repository.ts:208-255`) is **fixed as
  part of this ADR's own scope, not left as a separate bug (R1)** —
  gains a fourth `UNION ALL` branch for `cash_movement` (both signs,
  "Correction of CM-xxxx" labelling for a reversal), and its
  pre-existing gaps are corrected: the `sale`/`payment`(in) branches
  gain the `payment_mode`/`method = 'cash'` filter their own doc-comment
  already claimed they had (BUG-32, `PROJECT.md`), and two entirely
  missing outflow branches (`expense`, `payment` direction='out') are
  added. Verified first (R1) that `closeSession` itself was never
  affected by BUG-32 — its own five queries already filter to cash
  correctly; the gap was confined to this separate, independently
  implemented report.
- See `docs/phases/PHASE_17_5.md` for the full schema, task breakdown,
  and exit criteria.

## Accepted risk (R4)

Without an auth/permission layer (ADR-0009; no user/role gate exists
yet, `BUG-ADR9`), anyone with app access can record a cash-out movement
to mask what would otherwise show as a shortage — e.g. a fake
`owner_draw` for exactly the missing amount reconciles a genuinely
short till cleanly, with nothing today distinguishing it from a real
withdrawal. **Accepted as a risk for this phase**, mitigated by three
things built now: a non-blank `note` required on every movement, all
four types (not only `'other'`) — a minimal audit trail even without
per-user attribution; the close screen lists every movement
individually, never only a net figure; the Cash Book report shows every
movement with its note and reversal status. `created_by
REFERENCES app_user(id)` already exists on the table, nullable and
populated with `NULL` everywhere today — ready for a future auth phase
to populate without a schema change.

## Alternatives rejected

- **Recording it as an `expense`** — misrepresents personal/drawer cash
  handling as a business cost; conflicts with Q-DRAWING.
- **A `payment` row against a dummy/placeholder party** — pollutes the
  party ledger and every receivables/payables report with a
  non-trading relationship that must be filtered out forever.
- **A `business_unit_id` column, nullable and always NULL** (matching
  `expense`'s shared-cost pattern) — considered, rejected in favour of
  omitting the column outright: `cash_session` already establishes that
  whole-till tables don't carry unit tagging at all, and there's no
  plausible future case where a drawer movement becomes unit-specific.
- **No requirement to attach to an open session** (the first draft's
  position) — reversed by R2: unlike sale/expense, a drawer movement
  has no legitimate "entered late for a past date" case, and allowing
  one after a session's figures are already verified and stored would
  undermine the very reconciliation this ADR exists to fix.
- **Note required only for `'other'`** (the first draft's position) —
  reversed by R4: requiring it on every movement is a cheap, real
  mitigation for the accepted no-auth risk above.
- **No reversal mechanism / no `reverses_id` column** (the first
  draft's position, citing `DATABASE_RULES.md §3`'s finding that the
  equivalent column on `stock_movement`/`party_ledger` goes unwritten)
  — reversed by R3: that finding is about a column set on the wrong
  row (the original) by a second, easy-to-forget call site;
  `reverses_id` on the reversal row, written by the one call site that
  creates it, doesn't share that failure mode, and "reversed at most
  once" needs _some_ way to check for an existing reversal — a
  `UNIQUE` constraint is the simplest one available.
