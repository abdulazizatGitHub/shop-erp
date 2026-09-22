# Phase 16 — Jobs Settings: Service Charges, Brands, Commission Claims

**Status:** PLANNED (docs approved 2026-09-22; implementation not started)
**Started:** —
**Branch:** main
**Baseline:** f9cc7b8 (H1-H3 + I1-I4 close, 649/649 tests)

---

## 1. Goal

The shop owner can manage service charges and appliance brands without a
developer touching the database, and commission is no longer automatic:
the owner reviews and approves (or rejects) a claim for every delivered
labour charge that has commission configured, deciding who gets paid and
how much. This phase **replaces** Phase 7's automatic per-technician
commission model entirely — it does not extend it.

---

## 2. Scope

### In scope

- **P16-1 — Service charge management.** New "Job Settings" section
  (reached via a tile on `SettingsPage.tsx`, opening `JobSettingsPage.tsx`
  with tabs — see §2b). Service Charges tab: list all `service_charge`
  rows (active + inactive), create, edit, toggle active. Fields: name,
  retail charge (Rs in UI, paisa in DB), job type (optional), commission
  mode (none / fixed paisa / basis points) + value. Inactive charges are
  excluded from `lookup.repository.ts`'s `listServiceCharges` (already
  filters `isActive=1` — this is the delivery modal's dropdown source)
  but still visible in the new admin list. No delete. Dev-only seed
  (never runs against a packaged/production build).

- **P16-2 — Brand management.** Brands tab in the same Job Settings page.
  List all non-deleted brands, create, toggle active/inactive. `brand`
  is a single table shared with `item.brandId` (confirmed in use by the
  CSV item importer, `import.repository.ts` — see §2c). New migration
  `0017`: `ALTER TABLE brand ADD COLUMN is_active INTEGER NOT NULL
DEFAULT 1` (same convention as `service_charge.is_active`). `is_active`
  controls **only** the job-intake brand dropdown; CSV/item brand
  matching ignores it entirely and keeps using `deleted_at` exactly as
  today, untouched by this phase. Replaces the hardcoded `BRAND_OPTIONS`
  constant in `JobApplianceFields.tsx` (and `JobApplianceEditSection.tsx`,
  which re-exports it) with a live `brand:list` call (active brands
  only, for the dropdown). "Other" free-text stays and is never
  auto-added to `brand`. Production bootstrap: idempotent, per-tenant —
  for each starter name, insert only if no brand row with that name
  exists for the tenant, case-insensitive, **including deleted rows**
  (not "only if the tenant has zero brand rows" — safe to re-run every
  startup without ever double-inserting a name).

- **P16-3 — Commission claims and approvals.** Replaces Phase 7's
  automatic commission entirely. See §2a (owner decisions) for the full
  model. Delivered in three commits:
  - **P16-3a** — migrations, pure claim-calculation function in
    `packages/core`, delivery-transaction claim inserts, approve/reject
    core logic + repository, retirement of the `party.commission_bp`
    read path, rewritten Phase 7 tests, ADR-0015.
  - **P16-3b** — Commission Approvals tab (Job Settings page), wage
    report change (approval-date attribution, pending-total in the
    report header).
  - **P16-3c** — technician removal guard: `unassign_reason`, new core
    `unassignTechnician` function enforcing a required reason and a
    status lock, replacing the handler's direct repository call.

- **P16-4 — Shop Identity verification.** Owner smoke test, not an agent
  task (see §4).

### Explicitly out of scope

- Any Settings area beyond the new Job Settings tile/page
- Receipt/invoice design or template changes
- User management, permissions, PIN login, `decided_by` tracking
- Report configuration beyond the P16-3b wage-report change
- Wiring `service_charge.wholesale_charge` into delivery logic (field is
  shown read/write in the admin list only, per SQ-1 of the plan
  discussion — no delivery-time behaviour depends on it this phase)
- Any Type B / Type C Settings Backlog item (`PROJECT.md` §Settings
  Backlog)

---

## 2a. Owner decisions (OD-16-1 – OD-16-10, 2026-09-22)

These replace parts of this document's original draft and are binding.

**OD-16-1 — Commission model replaced.** Phase 7's automatic
per-technician commission (`party.commission_bp`) is retired: no code
reads it any more; the field is hidden from the staff add/list UI; the
column stays (never edit an applied migration); existing `party_ledger`
commission rows from Phase 7 are untouched. Commission is configured
**per service charge**, using `service_charge.commission_amount` /
`commission_bp`: mode = none | fixed paisa | basis points of the
labour line's **charged** amount (post operator-override, pre
invoice-level discount). Default: none.

**OD-16-2 — Delivery never posts commission money.** For each delivered
labour line whose charge has commission configured, delivery writes one
commission **claim** row inside the existing delivery transaction (a
claim is not money). The claim snapshots: job, sale line, service
charge, computed suggested amount in paisa, suggested recipient. Later
edits to the service charge never change an existing claim. Charges with
mode = none create no claim.

**OD-16-3 — Owner approves or rejects claims.** Commission Approvals
lists pending claims (job number, customer, charge name, labour amount,
suggested amount, full technician assignment history including removed
technicians with dates/reasons). Approve: one or more recipients, each
an integer paisa amount > 0, each a technician present in that job's
assignment history (active or removed) — to pay someone else they must
first be assigned to the job. Reject: requires a non-empty reason.
Approval writes the decision and all `party_ledger` commission rows in
one transaction. Decisions are immutable; corrections are reversing
`party_ledger` rows. A claim can be decided exactly once (DB-enforced).
Unrestricted by convention until the auth phase (logged as backlog).

**OD-16-4 — Commission month.** Commission counts in the wage report by
the _approval_ date (`party_ledger.entry_date` = decision date), not the
delivery date. Approved commission shown per technician as today. Total
pending commission (count + suggested amount, **not** split per
technician, since it is not yet owed to anyone) shown once in the report
header.

**OD-16-5 — Technician removal guard.** `job_technician` rows are never
deleted; removal only sets `unassigned_at` (confirmed true today — the
only write path is `KyselyJobTechnicianRepository.unassignTechnician`).
Removal requires a reason: new nullable `unassign_reason` column,
required in the UI and enforced by a new core-layer function for every
removal path (confirmed there is exactly one). The technician list is
locked once the job reaches status **`ready`, `delivered`, or
`cancelled`**, enforced in the core service, not only the UI.

**OD-16-6 — Brands.** Brand is stored on the job as `TEXT` (a snapshot;
confirmed — `job.appliance_brand`, no FK). The `brand` table is the pick
list, shared with `item.brandId`. Names trimmed, internal spaces
collapsed, unique case-insensitively per tenant. **`is_active`** (new
column, P16-2) hides a brand from the job-intake dropdown only; it does
not affect CSV/item brand matching, and does not touch `deleted_at`,
whose existing meaning (and existing callers) are untouched by this
phase — see §2c. An existing job's stored text is unaffected by later
brand changes either way. "Other" free text never auto-added to `brand`.
No brand-per-appliance-type mapping.

**OD-16-7 — Seeding.** Brands are reference data: an idempotent
per-tenant bootstrap that, for each starter name, inserts it only if no
`brand` row with that name (case-insensitive) already exists for the
tenant — **including soft-deleted rows** — so it is safe to run on
every app startup without ever attempting a duplicate insert against
`UNIQUE(tenant_id, name)`. Starter list: Dawlance, Haier, PEL, Orient,
Gree, Kenwood, TCL, Samsung, LG, Ecostar, Panasonic, Changhong Ruba,
Homage, Nasgas, Westpoint, Daikin, Mitsubishi, plus the existing
`BRAND_OPTIONS` name not already listed (Waves). Service charges are
test data: a dev-only seed (gated on `!app.isPackaged`, following
`scripts/seed-test-data.ts`'s existing pattern) that can never run
against production, covering at minimum AC Installation (fixed
commission), AC General Service (none), AC Gas Refill (none), Fridge
Gas Charging (none), Compressor Replacement Labour (bp commission),
Oven Repair (none), Checking/Inspection Fee (none). Confirmed: no
migration inserts any `service_charge` row today (searched
`0002_business_units.sql` in full — zero INSERTs) — there is no
existing production risk to avoid here.

**OD-16-8 — Tests.** Phase 7 tests asserting automatic commission are
rewritten to the claim model, not deleted silently (full list in §5).
`docs/decisions/ADR-0015-commission-claims.md` records the model and why
Phase 7's was retired (confirmed: no `ADR-0014` file exists on disk —
the "no hard delete" decision referenced in PROGRESS.md was never
written as an ADR file; commission-claims takes **ADR-0015** rather than
risk a future collision). BUG-COMMISSION-MULTI closes as SUPERSEDED by
ADR-0015 once P16-3a is verified.

**OD-16-9 — No back-fill.** No historical commission back-fill.

**OD-16-10 — Zero-bill delivery.** Unchanged; logged as an open question
in `PROJECT.md` §4, not fixed this phase.

---

## 2b. Navigation

`SettingsPage.tsx` keeps its existing 4 cards unchanged. A 5th tile,
"Job Settings," links to a new `JobSettingsPage.tsx` with three tabs:
**Service Charges | Brands | Commission Approvals**. The Job Settings
tile and the Commission Approvals tab each show a read-only pending-claim
count badge (no new tables — `COUNT(*)` on `commission_claim LEFT JOIN
commission_decision` where the decision is absent).

## 2c. Brand table sharing (C-6 finding, resolved)

`item.brandId` is a real, exercised FK path: `import.repository.ts`
(CSV bulk item import, via `packages/core/src/import/item-import.ts`)
matches `brand.name` (filtered `deleted_at IS NULL`, case-insensitive)
to assign `item.brandId`. No UI sets it directly — item creation
(`item.repository.ts`'s `createItem`) always writes `brandId: null`,
and no `apps/client` file references `brandId`/`brand_id`.

**CSV import does not auto-create brand rows.** Confirmed by reading
`item-import.ts` (lines 156–167): when a CSV row's `Brand / Company`
text does not match any name in `brandIdByName`, the row is **rejected**
outright with reason `Brand "<name>" not found` — no new `brand`
row is ever inserted by the importer. This means P16-2's `is_active`
column needs no "what do auto-created rows get" case to handle; the
question doesn't arise.

**Decision (owner, 2026-09-22): do not reuse `deleted_at` as
"inactive."** Two problems with that approach, both confirmed real:
deactivating a brand via `deleted_at` would break future CSV matching
for that name (the importer filters `deleted_at IS NULL`), and
re-creating a soft-deleted name later would violate
`UNIQUE(tenant_id, name)` since the deleted row still occupies it.

Instead: new migration `0017` adds `brand.is_active INTEGER NOT NULL
DEFAULT 1` (mirrors `service_charge.is_active`'s existing convention).
`is_active` governs **only** the job-intake dropdown (P16-2's
`brand:list` for that purpose filters `is_active = 1`). CSV/item brand
matching is untouched — it keeps filtering `deleted_at IS NULL` only,
exactly as today, and ignores `is_active` entirely. `deleted_at` itself
is not written by any Phase 16 code path. The Settings Brands tab lists
all non-deleted brands (`deleted_at IS NULL`) with an `is_active`
toggle per row.

Test (P16-2): deactivate "Haier" (`is_active = 0`) → hidden from the
job-intake dropdown; a parts CSV row with brand text "Haier" still
resolves to the same `brand.id` and imports successfully; no second
"Haier" row is created by either path.

---

## 3. Tasks

| ID     | Task                                                | Depends on                             | Status      | Commit |
| ------ | --------------------------------------------------- | -------------------------------------- | ----------- | ------ |
| P16-1  | Service charge management                           | —                                      | NOT STARTED | —      |
| P16-2  | Brand management + DB-driven dropdown               | P16-1 (shares Job Settings page shell) | NOT STARTED | —      |
| P16-3a | Commission claim schema + core calc + delivery hook | P16-1                                  | NOT STARTED | —      |
| P16-3b | Commission Approvals tab + wage report change       | P16-3a                                 | NOT STARTED | —      |
| P16-3c | Technician removal guard                            | —                                      | NOT STARTED | —      |
| P16-4  | Shop identity verify (owner smoke test)             | —                                      | NOT STARTED | —      |

Order: P16-1 → P16-2 → P16-3a → P16-3b → P16-3c → P16-4. One task at a
time; verified and reviewed before the next begins.

---

## 4. Exit criteria

Sign convention (confirmed in `0001_init.sql` / Phase 7): `party_ledger`
commission rows use `amount = -commissionPaisa` (negative — "the shop
owes the technician"). `commission_decision`-sourced ledger rows use
`source_type = 'commission_decision', source_id = commission_decision.id`
(the decision, not the claim, is the reversal unit — approving pays N
recipients from one decision; a correction reverses the whole decision
via rows sharing that source, per `DATABASE_RULES.md` §3's existing
pattern).

- **P16-1**: creating a service charge `{name: 'AC Installation (test)',
retailChargePaisa: 300000, commissionMode: 'fixed',
commissionAmountPaisa: 50000}` via the new create channel, then reading
  it back via the admin list, returns exactly those values. Toggling
  `isActive=0` removes it from `lookup.repository.ts`'s
  `listServiceCharges` (delivery dropdown) but keeps it in the admin
  list. Verified: named repository tests + one hand-run query.
- **P16-2**: after bootstrap, `brand` has ≥ 18 non-deleted rows (17
  starter names + Waves) with no case-insensitive duplicates, all
  `is_active = 1`; creating `"gree"` when `"Gree"` exists (active or
  soft-deleted) is rejected; running the bootstrap a second time inserts
  nothing new. Deactivating "Haier" (`is_active = 0`) removes it from
  the job-intake dropdown (`brand:list` filtered for that use) but a
  subsequent parts CSV import row with brand text "Haier" still resolves
  to the same `brand.id` and the row is accepted, not rejected — no
  second "Haier" row exists afterward. Verified: named repository tests
  (bootstrap idempotency, uniqueness-including-deleted, is_active
  toggle) + one named import-repository test reusing the existing CSV
  import test fixtures + hand-run queries.
- **P16-3a** (all hand-calculated):
  - Charge "AC Installation," retail 300000 paisa, fixed commission
    50000 paisa, delivered at charged (undiscounted) price → one
    `commission_claim` row, `suggested_amount_paisa = 50000`.
    `sale_line_id` is set and `UNIQUE` — a second claim can never be
    created against the same labour line (DB-enforced).
  - Quantity-milli 2000 case (pure-function unit test, since the live
    delivery path always uses `quantityMilli = 1000` for labour today):
    fixed commission 50000 paisa at `quantity_milli = 2000`. Expected:
    `FLOOR(50000 * 2000 / 1000) = 100000`.
  - Charge "Compressor Replacement Labour," 1000 bp, charged (with an
    operator price override) at 400000 paisa. Expected:
    `FLOOR(400000 * 1000 / 10000) = 40000`.
  - Charge with `commissionMode = none` → zero claim rows for that line.
  - Suggested recipient: job has technicians A (assigned first, then
    removed before delivery) and B (assigned after A, still active at
    delivery) → suggested recipient is **B** (earliest-assigned
    technician still active at delivery), not `job.assignedTo` (which
    still points at A, per P14-1's "set once" rule) and not A.
  - Approve a claim as 30000 + 20000 to two technicians both present in
    the job's assignment history (one active, one previously removed) →
    exactly two `party_ledger` commission rows (`amount = -30000`,
    `amount = -20000`, `entryType = 'commission'`, `entryDate` =
    decision date), sum 50000, one `commission_decision` row, two
    `commission_decision_recipient` rows. A second approval attempt on
    the same claim is rejected by a core "already decided" check (clear
    error) with the `UNIQUE(claim_id)` constraint as the backstop — test
    asserts both the error and that no new rows were written.
  - Reject with an empty reason is rejected at the Zod boundary; nothing
    written.
  - A recipient not in the job's assignment history is rejected by core
    before any write; nothing written.
  - **Rewritten test**: a claim-insert failure (e.g. a constraint
    violation) rolls back the **entire delivery** — no `sale`, no
    `sale_line`, no stock movement, no claim survive — since claim
    creation now happens inside `deliverJob`'s existing transaction
    (C-1/C-5), the exact opposite of Phase 7's "commission failure never
    rolls back delivery" behaviour, which is being deliberately retired.
  - `npm run verify` passes; final test count reported exactly (see §5
    for the per-task delta).
- **P16-3b**: UI action — approve the seeded pending claim, confirm it
  leaves the pending list, confirm the wage report for that
  technician/month increases by the approved amount, confirm the
  report's pending-commission header total decreases by the claim's
  suggested amount (not per-technician).
- **P16-3c**: `job:unassignTechnician` with no reason → Zod rejection.
  Called (directly, bypassing the UI) on a job at status `ready`,
  `delivered`, or `cancelled` → core-service rejection, named test for
  each of the three statuses.
- **P16-4**: owner manually confirms Shop Identity persists across
  restart and prints on an invoice. Not agent-verifiable — checklist
  only:
  - [ ] Open Settings, edit shop name, Save
  - [ ] Restart the app
  - [ ] Confirm the new name is still shown in Settings
  - [ ] Print/preview an invoice, confirm the shop name appears

---

## 5. Rewritten/added tests and expected count delta

Baseline: 649/649 (commit f9cc7b8).

**Rewritten (not deleted) from Phase 7** — `commission.repository.test.ts`:

1. `'inserts correct party_ledger row — commissionPaisa = 12000
(pre-computed)'` → becomes a claim-approval test asserting the same
   ledger row shape, sourced from a decision instead of a direct write.
2. `'recordCommission with commissionPaisa = 0 throws, inserts nothing'`
   → becomes `'approving with amountPaisa = 0 is rejected, inserts
nothing'` (amount > 0 is now a core check per C-2).
3. `'PARTS-unit lines do not contribute to commission — only the REPAIR
labour line counts'` → unchanged in spirit; asserts no claim is ever
   created for a `line_kind = 'part'` line.
4. `'EC-P7-6: Rs 1,200 labour, 10% commission -> exactly 12000 paisa,
technician with commission_bp=0 gets nothing'` → becomes two tests:
   a claim-suggestion hand-calc (bp mode) and a `commissionMode = none`
   → zero-claims test (the `commission_bp = 0`-on-party concept no
   longer exists post-OD-16-1).
5. `'a commission recording failure does not roll back the delivery'` →
   **inverted** per C-5: `'a claim insert failure rolls back the entire
delivery'`.

`commission.service.test.ts`'s `computeCommission` test is retired
outright — replaced by unit tests for the new pure claim-calculation
function (fixed/bp × the milli-quantity and override cases above).

**Net new tests this phase** (estimate, finalized per task as built):

- P16-1: ~6 (create/edit/toggle/uniqueness/list-excludes-inactive ×
  repository + 1 UI test)
- P16-2: ~6 (create/toggle/case-insensitive-uniqueness/bootstrap ×
  repository + 1 UI test)
- P16-3a: ~12 (5 rewritten above, ~7 net new: pure-function unit tests,
  multi-recipient approval, double-decision rejection, bad-recipient
  rejection, empty-reason rejection, rollback-on-failure)
- P16-3b: ~4 (approvals list, approve flow, wage-report pending total,
  wage-report per-technician approval-date attribution)
- P16-3c: ~4 (missing-reason rejection, one test per locked status ×3)
- P16-4: 0 (manual checklist only)

Each task's commit states the exact before/after count from its own
`npm run verify` run — the estimate above is not to be treated as
verified until each task lands.

---

## 6. Backlog additions (PROJECT.md — logged, not built this phase)

- Commission approvals must be owner-only once the auth phase exists;
  record `decided_by` (user) then, not now.
- `ADR-0014` is referenced in PROGRESS.md (job hard-delete / Cancel not
  Void) but no such file exists in `docs/decisions/` — write it, or
  correct the reference, in a documentation pass.
- If a delivered job is ever voided (Q-VOID, open), define what happens
  to its undecided and already-approved commission claims — not
  designed this phase.
- Go-live clean-start procedure (OD-16-9): production database must
  start with no test jobs, ledger rows, staff, or service charges before
  2026-10-31.
- Zero-bill delivery (OD-16-10): the delivery modal allows "Deliver &
  Invoice" with no parts and no labour (Rs 0) — legitimate for
  warranty/free-check jobs, or a missing guard? Owner to decide.
