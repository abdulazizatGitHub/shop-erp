# ADR-0016: Drawer cash movements are their own append-only table, outside both units' P&L

**Status:** Proposed (draft — plan only, no migration applied yet) · **Date:** 2026-09-27

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
`other` (either direction; a non-blank note is required). It is
**append-only** (ADR-0004) and participates in the cash session's
`expected_cash` formula as one new signed term — nothing else. It has
**no `business_unit_id` column** and **no effect on either unit's
P&L** — see Consequences.

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
- **No `reversed_by_id` column.** `docs/DATABASE_RULES.md §3` records
  the finding, confirmed by grep, that `stock_movement.reversed_by_id`
  and `party_ledger`'s equivalent are **never actually written by any
  application code path** — the real, working correction pattern in
  this codebase is a plain new row with the opposite sign, discovered
  by summing, not by following a pointer. `cash_movement` follows that
  same real pattern from day one rather than adding a second unused
  pointer column: a correction is a new row with `amount` negated (and
  ideally a `note` referencing which entry it corrects, free text, not
  FK-enforced).
- **No `party_id` column** — deliberately, per "why not a payment to a
  dummy party" above.
- Corrects `cash-session.repository.ts`'s `expected_cash` formula to
  add one new signed term,
  `cashMovementsNet = SUM(cash_movement.amount) WHERE tenant_id=? AND movement_date=?`
  (COALESCE'd to 0, same convention as every other term in that
  formula): `expectedCashPaisa = cashIn - cashOut + cashMovementsNet`.
- `getCashBookReport` (`report.repository.ts:208-255`) gains a third
  `UNION ALL` branch for `cash_movement`, alongside `purchase`/`sale`/
  `payment`. **Separately noted, not fixed here:** while reading this
  report to plan the new branch, its existing `sale`/`payment` unions
  were found to not actually filter `payment_mode`/`method = 'cash'`
  despite the file's own doc-comment claiming they do — logged as
  BUG-32 (`PROJECT.md`), a pre-existing, unrelated defect.
- See `docs/phases/PHASE_17_5.md` for the full schema, task breakdown,
  and exit criteria.

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
- **A `reversed_by_id` self-referencing column** (matching
  `stock_movement`'s schema) — rejected because that exact column is
  documented (`DATABASE_RULES.md §3`) as dead weight on the two tables
  that already have it; a new table shouldn't repeat a mistake that's
  already been found and named.
