# ADR-0015: Commission is an owner-approved claim, not an automatic posting

**Status:** Accepted · **Date:** 2026-09-22

## Decision

Phase 7's automatic commission model is retired. `party.commission_bp`
(per-technician, basis points) is no longer read by any code path; the
column stays (never edit an applied migration) and existing
Phase-7-era `party_ledger` commission rows are untouched. Commission is
now configured **per service charge**
(`service_charge.commission_amount` / `commission_bp`): none, a fixed
paisa amount, or basis points of the labour line's charged amount.

Delivering a job with a commission-eligible labour line no longer posts
money. It writes one immutable `commission_claim` row **inside the same
transaction as the delivery itself** (`deliverJob`), snapshotting the
job, the sale line, the service charge, a suggested paisa amount, and a
suggested recipient. A claim is not a `party_ledger` entry — it is a
proposal.

The owner reviews pending claims (Commission Approvals) and either:

- **Approves**, naming one or more recipients (each an integer paisa
  amount > 0; recipient eligibility corrected by OD-16-12 below) — this
  writes one `commission_decision` row and one `party_ledger` row per
  recipient, in one transaction; or
- **Rejects**, with a required non-empty reason.

Both are immutable — a decision, once made, is never edited or deleted.
A claim has at most one _active_ decision at a time, tracked by
`commission_decision.attempt_no` and enforced by
`UNIQUE(claim_id, attempt_no)`, with a core-layer "already decided"
check (does this claim have a decision with no reversal?) as the first
line of defence and the constraint as the backstop for concurrent
attempts, not the only guard.

**Decisions are correctable (added 2026-09-22, GAP-1).** The first
version of this ADR made `UNIQUE(claim_id)` the whole story — one claim,
one decision, forever. That is wrong in practice: an owner reviewing a
stack of claims will occasionally approve the wrong one, approve the
wrong amount, or reject one that should have been approved, and an
uncorrectable mistake in money owed to a named technician is worse than
the automatic model this ADR replaces. A decision can be **reversed**
with a required reason, writing an immutable `commission_decision_reversal`
row (`UNIQUE(decision_id)` — a decision can be reversed at most once).
Reversing an approved decision writes one reversing `party_ledger` row
per original recipient (`amount` sign flipped, same `source_type`/
`source_id` as the original — the standard reversal-discovery pattern,
ADR-0004/`DATABASE_RULES.md` §3); reversing a rejected decision writes
no ledger rows at all. A claim whose latest decision has been reversed
is pending again and can receive a new decision at `attempt_no + 1` —
correction is "decide again," never "edit the old decision." Corrections
remain reversing rows throughout, per ADR-0004 — nothing is ever edited
or deleted, on the claim side or the ledger side.

**Recipient rule corrected (added 2026-09-24, P16-3a Checkpoint 1b,
OD-16-12).** The original recipient rule above — a recipient must be
present in the job's technician assignment history, active or removed —
conflicts with OD-16-5's technician-list lock: claims are approved
**after** delivery, by which point the technician list on a
ready/delivered/cancelled job is already locked, so "assign them to the
job first" is not something the owner can still do. A wrong or missing
assignment record under the original rule would make the correct person
unpayable in-app, with no correction path short of a direct DB edit —
unacceptable for the same reason `UNIQUE(claim_id)` alone was rejected
above. Corrected rule:

- A recipient may be **any active staff party**, not only one present in
  the job's technician history.
- A recipient **not** in the job's assignment history requires a
  non-blank, trimmed `outside_history_reason` stored on that specific
  `commission_decision_recipient` row (core-enforced, Zod-validated at
  the IPC boundary). A recipient who **is** in the history stores `NULL`
  there — the reason exists to make an unusual payment auditable, not to
  annotate the normal case.
- A **non-staff** party (a customer, supplier, or any other party type)
  as recipient is rejected outright, reason or not.
- The Commission Approvals screen (P16-3b) flags outside-history
  recipients and displays the stored reason next to them.

Schema: `commission_decision_recipient.outside_history_reason TEXT`
(nullable), added by migration `0019` — `0018`, already applied in dev
databases, is never edited to add this; new columns arrive via a new
migration instead, the same rule that applies to every other addendum
in this codebase.

## Why Phase 7's model was retired

Phase 7 (`party.commission_bp`, `recordCommissionIfEligible`) paid
whichever single technician happened to be `job.assignedTo` — the first
technician ever assigned to the job (P14-1's "set once" rule) — a fixed
percentage of the job's labour total, automatically, in a transaction
separate from and after the delivery itself. This broke the moment
Phase 14 shipped multi-technician assignment: a second or third
technician on a delivered job earned nothing (`BUG-COMMISSION-MULTI`,
logged LOW since it was a missing feature, not a wrong number).

Fixing it mechanically — iterating `job_technician` and paying every
active technician the job's `commission_bp` — was considered and
rejected by the owner during Phase 16 planning. The shop's real
business rule is not mechanical: technicians are paid mainly by daily
wage; commission applies only to specific kinds of work (today: AC
installation); and the owner — not a formula — decides who earns it and
how much, usually the senior technician on the job. A fixed
per-technician rate has no way to express "the owner decides," and
`party.commission_bp` has no way to express "this only applies to AC
installation, not fridge repair." `service_charge.commission_amount` /
`commission_bp` already existed in the schema, unused since Phase 7
(`PHASE_7.md` §5, Conflict 3, Decision A — noted at the time as a
plausible future direction), and map directly onto "commission depends
on what kind of job this is," which is the real rule.

Claims exist as a distinct, immutable step between delivery and money
because the two moments have different failure and correctness
requirements. Delivery must always succeed once its own preconditions
are met — it is the moment stock, revenue, and the customer's invoice
become real, and it must never be blocked or delayed by a commission
decision the owner hasn't made yet. Approval must never be silently
lost — a claim, once created, is durable, queryable state the owner can
act on whenever they get to it, not a value computed transiently and
discarded if nobody was looking at the time.

## A deliberate reversal of Phase 7's transaction behaviour

Phase 7 explicitly recorded commission in **a second, separate
transaction, after** `deliverJob()` committed, and a commission failure
was caught and logged, never rethrown — a delivery was never rolled back
because commission recording failed (`PHASE_7.md` §8d). That was correct
for Phase 7's model, where commission was money leaving the shop
automatically and delivery was strictly more important than getting
that posting right.

Under this ADR, a commission **claim** is not money — it is a record
inside the delivery's own transaction, no different in kind from the
`sale_line` rows it describes. If a claim insert fails, the entire
delivery now rolls back: no `sale`, no `sale_line`, no stock movement,
no claim survive. This is the opposite of Phase 7's behaviour, and
deliberately so — a claim silently lost after a successful delivery
would be worse than a slightly larger delivery transaction, since a lost
claim can never be recreated once the delivery's service-charge
snapshot data has moved on, whereas a failed delivery can simply be
retried. `commission.repository.test.ts`'s Phase 7 test `'a commission
recording failure does not roll back the delivery'` is rewritten to its
opposite, `'a claim insert failure rolls back the entire delivery'`
(Phase 16, P16-3a).

## Consequences

- `computeCommission(labourTotalPaisa, commissionBp)`
  (`packages/core/src/payroll/commission.service.ts`) is retired,
  replaced by a pure claim-suggestion function taking the service
  charge's mode/amount/bp and the line's charged quantity/total —
  called from `job-delivery.repository.ts` exactly as
  `computeLineTotalPaisa` already is (a `packages/core` pure function
  imported by `packages/db`, never a service invoked from a
  repository — layering unchanged).
- The wage report (`wage-report.repository.ts`) needed no change to
  its `party_ledger.entry_date`-scoped correlated subquery's _filter_ —
  it already attributes commission to the month it was recorded, and
  recording now happens at approval time, so the query's existing
  meaning becomes exactly "approval-date commission" for free.
  **A structural change IS required, though (found 2026-09-22,
  FIX-1):** the query's `commissionPaisa` column and the commission
  term inside `netPaisa` both wrap the subquery in `ABS(...)`, which
  was safe under Phase 7 (every commission row was negative, no
  exceptions existed) but is wrong once reversals exist — a month
  containing only a reversal (`amount = +X`, a positive row) would
  display as `+X` commission _earned_ instead of `-X` commission
  _clawed back_. Fixed by dropping `ABS` and negating instead:
  `-COALESCE(SUM(pl.amount), 0)`. See `PHASE_16.md` P16-3b for the
  hand-calculated cases.
- Reads are aggregations, per ADR-0004: a rejected claim is not deleted,
  an approved claim's decision is not edited, and "how much has this
  technician earned" is always `SUM(party_ledger.amount) WHERE
entry_type='commission'`, unchanged in shape from Phase 7.
- Commission Approvals is, for now, unrestricted — there is no
  user/role layer yet (ADR-0009; `BUG-ADR9`). Logged as backlog for the
  auth phase: owner-only access, and a `decided_by` column on
  `commission_decision`.
