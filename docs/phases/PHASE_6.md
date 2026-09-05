# Phase 6 — Repair Jobs & the Two-Unit Split

**Status:** P6-0 through P6-10 code-complete and verified. EC-1, EC-2,
EC-3, EC-4 all hand-checked and passed with real pasted output —
backend AND the print/report pipeline built on top of them. **UI has
NOT been visually verified through a running Electron window this
session** — see §8's "What is and isn't verified" note before treating
this phase as fully closed. Implementation authorized by explicit owner
sequencing override (Phase 5 remains blocked on `BUG-PACK-1`; the two
phases proceed in parallel by owner decision, converging once the
installer unblocks).
**Started:** 2026-09-04
**Completed:** —
**Branch:** main
**Last commit:** 1dac890 (uncommitted work across three sessions — see
PROGRESS.md; committing was not requested)

---

## 1. Goal

A repair job — intake, technician assignment, parts consumption, delivery
invoice — can run start to finish, and every report that separates Spare
Parts from Repair (`v_job_split`, `v_unit_pl`, `v_unit_direct_margin`,
`v_technician_custody`) produces numbers that are correct by hand
calculation. A shopkeeper can create a job, a technician can draw parts
against it, and on delivery the bill splits automatically into what Spare
Parts earned and what Repair earned — including the case where two
different parties pay for different lines of the same job (Dawlance pays
labour, the customer pays extra pipe). Parts drawn for a job never show up
as a counter sale in any report.

### Why this document exists before any code

Session-start checks (§7 of `CLAUDE.md`) found the project not in the state
the kickoff brief assumed:

1. **`npm run verify` was red** (127/294 failing) — a recurrence of the
   documented `BUG-7` native-module ABI trade-off, made worse by the
   previous session's `BUG-PACK-1` packaging investigation leaving a nested
   `packages/db/node_modules/better-sqlite3` copy Electron-targeted.
   **Fixed this session** via `npm install better-sqlite3 --no-save`;
   `npm run verify` now exits 0, 294/294, typecheck/lint clean. No new bug —
   recovery of the known trade-off, logged in `PROGRESS.md`.
2. **Phase 5 is not complete.** `PROJECT.md` §3 shows Phase 5 status
   IN PROGRESS, blocked on `BUG-PACK-1` (CRITICAL, OPEN) — there is no
   working packaged installer at any commit, and P5-1 (the shop-PC install)
   has not started. Per owner direction this session: **Phase 6 proceeds as
   planning-only.** This document may be written and approved, but no
   implementation code, migration, or IPC handler is built until the owner
   says so — Phase 5's blocker is real and unresolved.
3. **The live schema disagrees with the kickoff brief in three places** —
   see §2. Resolved by direct owner decision this session (§6), not
   invented.

---

## 2. Schema baseline

### What already exists (migrations 0001–0003; nothing since)

`job`, `job_part`, `job_status_history`, `warehouse` (+ `warehouse_kind`,
`custodian_party_id`), `stock_movement` (+ `business_unit_id`),
`custody_reconciliation`, `internal_transfer`, `internal_transfer_line`,
`service_contract`, `contract_claim`, `contract_claim_job`,
`service_charge`, `business_unit`, plus the reporting views `v_job_split`,
`v_technician_custody`, `v_unit_pl`, `v_unit_revenue`,
`v_unit_direct_margin`, `v_daily_sales`. Full DDL and view SQL pasted and
verified in this session's transcript — not reproduced in full here to
keep this document under the file-size convention; see the transcript or
run `sqlite3 <db> ".schema job job_part warehouse stock_movement"`
directly.

**Terminology correction:** the original brief refers to
`stock_movement.reference_type`. That column does not exist. The real
columns are `movement_type` (already includes `job_issue`/`job_return`
among its documented values) and a generic `source_type`/`source_id` pair.
**No `CHECK` constraint exists anywhere in this schema** — confirmed by
grep, zero matches across all 9 migrations. Enums are enforced in
application code only. Phase 6 follows the same convention; not proposing
to add `CHECK` constraints as part of this phase.

### Three real gaps found, now resolved by owner decision (§6)

| #     | Gap                                                                                                                                                    | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-3 | `payer_party_id`/`revenue_type` exist only on `job` (job-level), contradicting ADR-0007's explicit line-level design                                   | One INV, payer **per line**. `sale_line` needs its own `payer_party_id`/`revenue_type` columns — job-level `job.bill_to_party_id`/`job.revenue_type` stay as a default/estimate shown at intake, not the billing source of truth.                                                                                                                                                                                                                                                                                                               |
| GAP-8 | `job_part.is_returned` is a mutable flag (`UPDATE ... SET is_returned = 1`), contradicting the binding constraint that `job_part` rows are INSERT-only | Returns are new rows. Add `job_part.entry_type` (`'issue' \| 'return'`, default `'issue'`) and `job_part.reverses_job_part_id` (nullable FK to `job_part.id`, set **only on the new return row**, never as an UPDATE to the original — same forward-pointing pattern `BUG-14` established for `party_ledger`/`stock_movement`, where `reversed_by_id` exists as a column but is never actually written by any code path). `is_returned` is retired; `v_job_split`'s parts subquery sums by `entry_type` instead of filtering `is_returned = 0`. |
| GAP-7 | `job.accessories_received` is free text; owner wants catalog items with serial tracking, a real scope increase over the schema's current shape         | New table `job_accessory` (see below). Does **not** touch `stock_movement` — accessories are customer property temporarily in the shop's custody, not shop inventory; no stock movement is correct here.                                                                                                                                                                                                                                                                                                                                        |

### Migration `0010_job_additions.sql` — scope (spec only, not written this session)

```
ALTER TABLE sale_line   ADD COLUMN payer_party_id TEXT REFERENCES party(id);
ALTER TABLE sale_line   ADD COLUMN revenue_type   TEXT NOT NULL DEFAULT 'customer_paid';
    -- customer_paid | contract | warranty | internal  (mirrors job.revenue_type's vocabulary)

ALTER TABLE job_part    ADD COLUMN entry_type            TEXT NOT NULL DEFAULT 'issue';  -- issue | return
ALTER TABLE job_part    ADD COLUMN reverses_job_part_id  TEXT REFERENCES job_part(id);
    -- is_returned is retired (left in place, unused, per DATABASE_RULES.md's
    -- "never edit an applied migration" — not dropped, just superseded)

CREATE TABLE job_accessory (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    job_id          TEXT NOT NULL REFERENCES job(id),
    item_id         TEXT REFERENCES item(id),      -- catalog reference, nullable (not shop stock)
    description     TEXT NOT NULL,                 -- 'Remote Control', free text fallback
    serial_no       TEXT,                           -- customer's own device; not item_serial
    condition_notes TEXT,
    returned_at     TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX idx_job_accessory_job ON job_accessory (job_id);

DROP VIEW IF EXISTS v_job_split;
CREATE VIEW v_job_split AS  -- rewritten: entry_type replaces is_returned filter,
                            -- parts_charged/parts_cost now net issue-minus-return
...
```

The exact rewritten `v_job_split` SQL is an implementation task (P6-1), not
finalized in this planning document — the shape above is enough to confirm
the migration is scoped correctly and reviewable.

---

## 3. Module layout

Following `docs/SYSTEM_DESIGN.md` §2/§3 — the `job` module is already
named in the module map (owns "Repair jobs, parts issue, technician
custody, contracts", assigned to Phase 6).

```
packages/core/src/job/
    job.service.ts              -- createJob, assignTechnician, transitionStatus
    job-issue.service.ts        -- issuePartsToTechnician, issuePartsToJob
    job-delivery.service.ts     -- deliverJob (builds sale + sale_line, validates payer/unit per line)
    internal-transfer.service.ts -- createInternalTransfer (unbilled consumption only)
    custody.service.ts          -- reconcileCustody

packages/db/src/repositories/
    job.repository.ts
    job-part.repository.ts
    custody.repository.ts
    internal-transfer.repository.ts

apps/server/src/ipc/handlers/
    job.handler.ts               -- job.create, job.assignTechnician, job.transition
    job-issue.handler.ts         -- job.issueToTechnician, job.issueToJob
    job-delivery.handler.ts      -- job.deliver
    custody.handler.ts           -- job.reconcileCustody

apps/client/src/pages/jobs/
    JobsPage.tsx
    JobCardPage.tsx
    JobDeliveryPage.tsx
    TechnicianCustodyPage.tsx

apps/client/src/pages/reports/
    JobsReportTab.tsx             -- new tab on the existing Reports page
```

Permissions (ADR-0009, code not data): `job.create`, `job.issue`,
`job.deliver`, `job.view`, `job.reconcile` — added to the existing
permissions module (location TBD at implementation time; not inspected
this session since it's out of scope for a planning-only pass).

---

## 4. Task list

| ID    | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status                                                    | Depends on                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| P6-0  | Migration `0010_job_additions.sql` — schema changes from §2, plus `sale_line.service_charge_id` (GAP-2) added on the owner's explicit amendment (not the already-existing `sale_line.job_part_id`, re-add attempt caught and dropped — see PROGRESS.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ✅ DONE 2026-09-05                                        | Owner approval of this document |
| P6-1  | `job.repository.ts` read path + rewritten `v_job_split` (entry_type-aware) — TDD, 10 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅ DONE 2026-09-05                                        | P6-0                            |
| P6-2  | Flow 1: job intake + technician assignment (`job.service.ts`, `job.repository.ts` write methods, `job.handler.ts`, full IPC wiring) — TDD, 9 repo tests + 3 service tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅ DONE 2026-09-05                                        | P6-1                            |
| P6-3  | Flow 2: parts issue Shop → Technician (transfer, not sale) — `job-part.repository.ts`, `job-issue.service.ts`, `job-issue.handler.ts` — TDD, 3 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ✅ DONE 2026-09-05                                        | P6-2                            |
| P6-4  | Flow 3: parts issue Technician → Job (`job_issue`, cost snapshot) — TDD, 4 tests, includes the EC-4 pre-condition check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ✅ DONE 2026-09-05                                        | P6-3                            |
| P6-5  | Flow 4: delivery invoice — `job-delivery.repository.ts`/`job-delivery.service.ts`/`job-delivery.handler.ts`. Per-line `business_unit_id`/`payer_party_id`/`revenue_type`, one transaction across `sale`/`sale_line`/`party_ledger`/`job`/`job_status_history`/`audit_log`/`sync_outbox`. NO `stock_movement` for job-sourced part lines (confirmed correct — P6-4's job_issue movement is the real, final stock reduction). Required two extra migrations found by reading the live DDL: `0011_sale_line_item_optional.sql` (sale_line.item_id was NOT NULL, blocking labour lines — SQLite table-rebuild) and `0012_job_split_v2.sql` (v_job_split rewritten to read sale_line instead of job.labour_charge). Also fixed a real bug found in already-shipped P6-4 code: stock_movement.business_unit_id for job_issue was set to the item's own unit (PARTS) instead of the causing unit (REPAIR), contradicting 0002's own schema comment — corrected, job-part.repository.test.ts updated                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅ DONE 2026-09-05                                        | P6-4                            |
| P6-6  | Flow 5: internal transfer for unbilled consumption only — `internal-transfer.repository.ts`. One `stock_movement` leg only (`transfer_out`, Spare Parts, business_unit_id=REPAIR as the causing unit), `valuation_method='cost'` always. New `IT-NNNN` document sequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ✅ DONE 2026-09-05                                        | P6-5                            |
| P6-7  | Flow 6: custody reconciliation — `custody.repository.ts`. INSERT-only, `action_taken='noted'` always, never touches `party_ledger`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅ DONE 2026-09-05                                        | P6-3                            |
| P6-8  | `apps/client/src/pages/jobs/`: `JobsPage.tsx` (list + status filter + Alt+8 nav tab), `JobCardModal.tsx` (orchestration shell, split into `JobCreateForm.tsx` + `JobDetailsView.tsx` to stay under 300 lines — built as a **modal**, not a page, since it's opened from JobsPage's row actions), `IssuedPartsPanel.tsx` (issued-parts table + issue-to-job form; return-parts UI is a stub, `job.returnPart` doesn't exist — see §8), `JobDeliveryModal.tsx` (split into `DeliveryPartLines.tsx` + `DeliveryLabourLines.tsx`; per-line payer/revenue-type editing, multi-payer paidPaisa=0 enforcement mirrored client-side), `TechnicianCustodyPage.tsx` (own Alt+9 nav tab — a top-level page, not nested under Jobs, so the shortcut instruction ("every new page gets an Alt+N shortcut") is satisfied literally). Required widening `TechnicianCustodyRecord` with `warehouseId` (job.repository.ts's `getTechnicianCustody` query — `reconcileCustody` needs a warehouse id and no other read exposed one) and `JobPartRecord`/`listJobParts` (new read). One smoke-render test added, `JobsPage.test.tsx` — first-ever `apps/client` component-render test in this repo (`@testing-library/react`/`jsdom` promoted from a `packages/ui`-only devDependency to also being one of `apps/client`'s, since the app now imports it directly — no new package installed).                                          | ✅ DONE 2026-09-05                                        | P6-2..P6-7                      |
| P6-9  | Reports "Jobs" tab: `JobSplitReport.tsx` (date-range filter over `job:list` + a `job:getJobSplit` fan-out per job — `getJobSplit` only takes one job id, there is no date-ranged list version, see §8) and `TechnicianCustodySummary.tsx` (distinct-item-count per technician, not a quantity total — different items' units can't be summed meaningfully), combined under `JobsReport.tsx` and wired into `ReportsPage.tsx`'s existing `Tabs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ✅ DONE 2026-09-05                                        | P6-2..P6-7                      |
| P6-10 | Delivery invoice print template extended: job doc no/fault/technician header lines, lines grouped by business unit ("-- Spare Parts --"/"-- Repair --"), only when a sale actually carries business-unit-tagged lines (a plain counter sale still prints flat, unchanged). **A real, blocking bug was found and fixed while doing this**: `receipt.repository.ts`'s `getSaleReceiptData` used `JOIN item ON i.id = sl.item_id`, an INNER join — since P6-5 made `sale_line.item_id` nullable for labour lines, this silently dropped every labour line from any printed receipt/invoice for a job delivery. Changed to `LEFT JOIN` (item and its stock-uom join), added `sl.line_kind`/business-unit-name to the line read. Proven via a real database, not just unit tests: `job-delivery.repository.test.ts` gained a new describe block that runs an actual `deliverJob`, then calls `getSaleReceiptData`/`getSaleInvoiceData`/`buildInvoiceLayout` on the resulting sale and asserts both lines survive and the header/grouping renders correctly. A "Print Invoice" button was added to `JobCardModal.tsx`'s post-delivery confirmation banner (mirrors `SalePage`'s existing pattern) so the extended template is actually reachable, not just built. **Not done**: a live click-through of the running Electron app re-confirming EC-1..EC-4 through the UI, as this task's original wording asked — see §8. | ✅ DONE 2026-09-05 (automated verification only — see §8) | P6-0..P6-9                      |

Each task is gated on `npm run verify` staying green and a hand-calculated
number check for anything touching money/stock, per `CLAUDE.md` §6. Every
task through P6-4 was TDD'd: test written first, run and confirmed failing
for the right reason, then implemented, then confirmed passing — see
PROGRESS.md for the actual pasted output at each step.

**Test count: 294 (Phase 6 start) → 320 (after P6-4) → 340 (after P6-7)
→ 349 (after P6-10)**, `npm run verify` green (typecheck/lint/tests)
throughout. **Build note for this session**: `npm run typecheck`/`lint`/
`test` were run and confirmed green repeatedly; the `@shop/client` and
`@shop/server` _packaged/dev electron builds_ were not separately
re-run this session (no `npm run dev`/`npm run build` invoked) — see §8.

---

## 5. Binding constraints

Copied verbatim from the kickoff brief — non-negotiable:

1. Money: INTEGER paisa. Variables end in `Paisa`. No float. No `/100`
   outside `MoneyDisplay`.
2. Quantity: INTEGER milli-units. Variables end in `Milli`.
3. `job_part` rows are INSERT-only. Reversals are new rows (§2, GAP-8).
4. `stock_movement.movement_type` for job issues (`job_issue`/`job_return`)
   must not be picked up by `v_daily_sales` — satisfied by construction,
   since `v_daily_sales` reads from `sale`, not `stock_movement`, and job
   issue/return never write a `sale` row (only `deliverJob` does).
5. `internal_transfer` is created ONLY for unbilled consumption.
   `deliverJob` must never create one.
6. Technician shortage: INSERT `custody_reconciliation` only. No
   `party_ledger` entry from this flow.
7. Every write operation is one synchronous better-sqlite3 transaction. No
   `await` inside. No I/O inside.
8. All IPC input validated with Zod at the handler boundary.
9. No business logic in SQL. No stored procedures. No new `CHECK`
   constraints (matches existing schema convention — enums are
   application-enforced).
10. Permissions are code (ADR-0009): `job.create`, `job.issue`,
    `job.deliver`, `job.view`, `job.reconcile`.
11. Files under 300 lines. Split if exceeded.
12. `withError` wraps every handler. `withRetry` wraps every write repo
    method (uses the existing retry helper — `packages/db/src/retry.ts`,
    confirmed present and tested, `retry.test.ts` passing).

---

## 6. Open questions resolved this phase (GAP-1 through GAP-8)

Answered by the owner this session, not invented:

| #     | Question                                                                                                                           | Answer                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-1 | Job card document prefix? Delivery invoice reuse INV?                                                                              | `JOB-NNNN` for the job card (new `document_sequence` row); delivery invoice reuses the existing `sale`/`INV-NNNN` numbering, since it is a real `sale` row like any counter sale.                                                                                                                                                                                                                                |
| GAP-2 | Labour lines reference `service_charge.id`, `item_id`, or free text?                                                               | `service_charge.id`. The rate-card table already exists (migration 0002), unused by any code so far — this phase is its first real consumer.                                                                                                                                                                                                                                                                     |
| GAP-3 | One INV with payer per line, or two separate INV documents?                                                                        | One INV, `payer_party_id` per line (§2 migration). The most structurally consequential decision in this phase, per the original brief and ADR-0007.                                                                                                                                                                                                                                                              |
| GAP-4 | Warranty fridge repair — who pays for parts? (Q5, open since Phase 0)                                                              | Decided per job at delivery time — no fixed schema-level rule. Uses the same per-line `payer_party_id`/`revenue_type` mechanism as GAP-3; staff choose the payer per line at Flow 4, same as any other line. **Q5 in `PROJECT.md` §5 stays OPEN as a business policy question** — this only resolves how the schema represents whichever answer staff pick on a given job, not what the shop's actual policy is. |
| GAP-5 | Internal transfer valued at cost only, or owner-settable price?                                                                    | Cost only. `internal_transfer.valuation_method` stays fixed at `'cost'` for Phase 6, matching ADR-0005's stated default. The `'retail'`/`'wholesale'` options already in the column stay unused.                                                                                                                                                                                                                 |
| GAP-6 | Job status machine — exact valid states?                                                                                           | The schema's existing 8 states: `received \| diagnosed \| awaiting_approval \| awaiting_parts \| in_progress \| ready \| delivered \| cancelled` (already the `job.status` column's documented default/comment in 0001_init.sql). The kickoff brief's `draft/approved/...` 6-state list does not match live code and is not used.                                                                                |
| GAP-7 | Accessories at intake — free text or catalog items?                                                                                | Catalog items with serial tracking. New `job_accessory` table (§2) — a real scope increase over the pre-existing free-text `job.accessories_received` column, which stays in place unused/superseded (not dropped, per migration rules).                                                                                                                                                                         |
| GAP-8 | (found during schema inspection, not in the original brief) `job_part.is_returned` mutation vs. the INSERT-only binding constraint | INSERT-only reversal rows (§2). `is_returned` retired; `entry_type`/`reverses_job_part_id` added instead.                                                                                                                                                                                                                                                                                                        |

---

## 7. Exit criteria

From `docs/PHASES.md` §Phase 6, plus the hand-check method for each:

- [x] **EC-1** — An installation job splits correctly: labour → Repair
      unit, pipe → Spare Parts unit. Verified 2026-09-05,
      `job-delivery.repository.test.ts` ("EC-1 hand check" describe
      block, 2 tests). Scenario: 3.05 kg copper pipe (cost Rs 6.50/kg,
      price Rs 8.00/kg) + AC Installation labour (Rs 1,500). Hand-calc
      written before running: parts_charged=2440, parts_cost=1982
      (SQLite integer-truncated, confirmed deliberate — see
      `0012_job_split_v2.sql`'s own comment), parts_margin=458,
      labour_charge=150000, total=152440. `v_job_split` AND `v_unit_pl`
      both queried directly and both matched exactly — pasted in this
      session's transcript.
- [x] **EC-2** — A Dawlance job bills labour to Dawlance and extra pipe to
      the customer on one job. Verified 2026-09-05, same test file ("EC-2
      hand check", 2 tests). One job, one `sale`, two `sale_line` rows
      with different `payer_party_id`. `party_ledger` queried directly
      for both parties: Dawlance shows exactly 120000 paisa, customer
      shows exactly 2440 paisa — neither shows the combined 122440,
      proving the split is real. A second test confirms the multi-payer
      partial-payment guard actually throws when exercised through the
      real service+repository chain (not just the pure function in
      isolation).
- [x] **EC-3** — Technician custody view shows exactly what a technician
      holds. Verified 2026-09-05, `custody.repository.test.ts`. Full
      walkthrough matching this session's brief exactly: issue 500g
      (custody=500,000 milli) → issue 200g to a job (custody=300,000) →
      return 100g (custody=400,000) → actual count reveals 350,000,
      shortage=50,000 milli=0.05 kg=4,200 paisa at Rs 840/kg →
      `recordCustodyReconciliation`. `custody_reconciliation` queried
      directly: one row, `action_taken='noted'`, `shortage_value=4200`.
      `party_ledger` queried for the technician: zero rows — no
      auto-deduction, confirmed by direct query not by the code's own
      claim.
- [x] **EC-4** — both halves now closed. Pre-condition half verified in
      P6-4 (parts issued to a job absent from `v_daily_sales`). Positive
      half verified 2026-09-05 in `job-delivery.repository.test.ts`
      ("EC-4, positive half"): after `deliverJob`, `v_daily_sales` for
      that date shows exactly one row, `invoice_count=1`,
      `total_sales_paisa` matching the delivery's own total exactly
      (152440) — not duplicated, not phantom.
- [x] `npm run verify` exits 0 at every task checkpoint through P6-10, test
      count strictly increasing from the 294 baseline (294→320→340→349).
- [ ] **UI-level re-confirmation of EC-1..EC-4 through a running Electron
      window** — NOT done this session. See §8.

---

## 8. Notes for the next session

- **P6-8/P6-9/P6-10 are now done** — see the §4 task table for exactly
  which files were built and where they diverge from the original
  planned file names (`JobCardPage.tsx`/`JobDeliveryPage.tsx` became
  `JobCardModal.tsx`/`JobDeliveryModal.tsx` — both are modals opened
  from `JobsPage`, not standalone routed pages; `TechnicianCustodyPage.tsx`
  stayed a real page with its own Alt+9 nav tab). Four small, explicitly
  flagged-and-approved IPC/DTO widenings were needed beyond what P6-1..7
  already exposed: `job:getJobSplit`/`job:getTechnicianCustody` wired
  (existed in the repo, never reached preload/electron-api),
  `job:listTechnicians`/`job:listServiceCharges` added (new lookup
  reads, no write logic), `JobSummaryDto`/`JobDto`/`CreateJobInput`
  widened with appliance/estimate fields already in the DB but not yet
  in the DTOs, and `job:listJobParts` added. One more widening was found
  and made **this session, unplanned**: `TechnicianCustodyRecord` gained
  `warehouseId` — `reconcileCustody` requires a warehouse id and no
  existing read exposed the technician's custody warehouse id to the
  client at all; adding it to the existing `getTechnicianCustody` query
  (one extra `w.id AS warehouseId` column) was the minimal fix, not a
  new IPC channel.
- **What was NOT built, by design, per owner's earlier f2 decision**:
  `job.update`, `job.returnPart`, `job.addAccessory`. Each has a visible
  "coming soon" UI affordance (not hidden, not a silently-broken button)
  and a `// TODO(P6-gap)` comment at its call site:
  `JobDetailsView.tsx`'s Accessories section (`job.addAccessory`),
  `IssuedPartsPanel.tsx`'s "Return unused parts" panel (`job.returnPart`).
  `job.update` has no call site at all — the whole job card is read-only
  after creation, by design, since there's nothing to update yet.
- **A new gap found and flagged while building `JobDeliveryModal.tsx`,
  not fixed**: billing a third party (e.g. a manufacturer for warranty
  work, EC-2's Dawlance scenario) needs a payer-party lookup that
  doesn't exist client-side — `customer:search`/`party:search` only
  find `partyType='customer'`/`'supplier'` respectively, and EC-2's own
  test fixture models Dawlance as `partyType='both'`, which neither
  finds. `DeliveryPartLines.tsx`'s payer `<Select>` only offers
  "Customer"/"Walk-in", plus a visibly-disabled third option
  ("Other party (manufacturer/warranty) — coming soon") with a
  `// TODO(P6-gap)` comment, rather than silently omitting the option
  or building an incorrect lookup against the wrong `partyType`. A real
  multi-payer job delivery is therefore only fully reachable from a
  future session that adds a proper any-party lookup.
- **A performance/design gap flagged, not fixed**: `JobSplitReport.tsx`
  (Reports "Jobs" tab) fans out one `job:getJobSplit` call per job in
  the selected date range, because `getJobSplit` only ever took a
  single job id (P6-1's read path) — there is no date-ranged list
  version. `TechnicianCustodySummary.tsx` does the same fan-out, one
  `job:getTechnicianCustody` call per technician. Both are fine at this
  shop's real volume (a handful of technicians, a repair shop's daily
  job count) but are real N+1 patterns, not the shape a bigger client
  would want — flagged rather than silently accepted as ideal.
- **Two migrations landed this session beyond the planned `0011`**:
  `0011_sale_line_item_optional.sql` (sale_line.item_id was `NOT NULL`
  in the live DDL — found by reading it, not assumed — blocking labour
  lines entirely; fixed via a SQLite table-rebuild, since there's no
  `ALTER COLUMN DROP NOT NULL`) and `0012_job_split_v2.sql` (the actual
  view rewrite). Both apply cleanly, table/view counts unchanged at
  44/11. **A real SQLite gotcha was hit and fixed in `0011`**: `ALTER
TABLE ... RENAME TO` auto-rewrites any view that references the
  renamed table — `v_unit_pl`/`v_unit_revenue` (both join `sale_line`)
  were silently repointed at the dropped `sale_line_old` until `0011`
  re-created them at the end. If a future migration ever renames a
  table that any view joins, check for this same failure mode
  (`every view executes without error on an empty database`, in
  `migration-runner.test.ts`, is what catches it — keep that test).
- **A real bug in already-shipped P6-4 code was found and fixed this
  session**: `job-part.repository.ts`'s `issuePartsToJob` set
  `stock_movement.business_unit_id` to the item's own unit (PARTS)
  instead of the unit that _caused_ the movement (REPAIR, since Repair
  consumed the part) — contradicting `0002_business_units.sql`'s own
  comment on that column. Fixed; `job_part.business_unit_id` is
  unchanged (that column means something different — whose billing the
  line belongs to). `internal-transfer.repository.ts` (P6-6) uses the
  same "caused by REPAIR" convention for its `transfer_out` movement.
  Flow 2 (Shop→Technician, P6-3) stays PARTS — that's still internal
  Parts custody logistics, no Repair causation yet.
- **A real, still-open reporting gap found while building P6-6, not
  fixed**: `v_unit_direct_margin`/`v_unit_direct_expense` do NOT surface
  an `internal_transfer`'s cost anywhere — confirmed empirically (a real
  test asserting zero rows, in `internal-transfer.repository.test.ts`),
  not assumed from reading the SQL. Both views only read `expense`/
  `sale_line`; neither reads `internal_transfer_line` or
  `stock_movement`. So today, Repair's "free installation" cost is
  captured correctly in `internal_transfer_line` but invisible in any
  unit P&L report. Not fixed this session — out of scope for P6-6's
  task list, which only asked for the transfer's own write path. Worth
  a P6-8-or-later decision: either a new view/column feeding
  `internal_transfer_line` into `v_unit_direct_expense`-equivalent
  reporting, or an explicit decision that this is acceptable for now.
- **`BUG-ADR9` remains logged in `PROJECT.md`** (no `requirePermission()`
  anywhere) — every P6-5/6/7 handler built this session matches that
  same precedent exactly, zero permission checks, consistent with every
  other handler in the codebase.
- `BUG-PACK-1` (packaged installer, CRITICAL, OPEN) — untouched this
  session, still blocks Phase 5's P5-1 independently of Phase 6's
  progress.
- The `better-sqlite3` ABI fix (`npm install better-sqlite3 --no-save`)
  was still in effect at this session's start — `npm run verify` was
  green on the very first run, no fix needed. Still workstation-local,
  nothing committed.
- Q5 (fridge warranty parts payer) remains genuinely OPEN as a business
  policy question — unrelated to this session's schema/code work.
- No new npm dependency was installed across any of the three Phase 6
  sessions. `@testing-library/react`/`jsdom` were added to
  `apps/client/package.json`'s `devDependencies` this session — both
  packages were already present in `node_modules` (hoisted from
  `packages/ui`'s own devDependency on them); this only formalizes
  direct usage now that `apps/client` has its first component-render
  test, it did not add anything new to disk.

### What is and isn't verified (read before treating this phase as closed)

**Verified this session, with real command output, per `CLAUDE.md` §6:**
`npm run typecheck`/`lint`/`test` all green, 349/349 tests, including 2
new `job-delivery.repository.test.ts` tests that run a real `deliverJob`
against a real SQLite database and then call
`getSaleReceiptData`/`getSaleInvoiceData`/`buildInvoiceLayout` on the
result — proving the P6-10 print-data fix end to end, not just at the
unit level. One `apps/client` component-render smoke test
(`JobsPage.test.tsx`) proves the render pipeline (mocked `ipc`, jsdom,
`@testing-library/react`) actually works for this app for the first
time.

**NOT verified this session — an honest gap, not an oversight:** the
Electron app itself was never launched (no `npm run dev`, no packaged
build). Nobody has visually clicked through `JobsPage` → `JobCardModal`
→ `IssuedPartsPanel` → `JobDeliveryModal` → `TechnicianCustodyPage` →
Reports "Jobs" tab in a real running window. Per `CLAUDE.md` §6, "the
app launched and the screen rendered" is a required verification step
this session did not perform — typecheck/lint/tests passing is real
evidence the code is correct, but it is not the same claim. **Next
session's first task should be `npm run dev --workspace=@shop/server`
and a real click-through of the full job lifecycle** (create → issue
parts → deliver → print → reconcile custody), before P6-10's exit
checkbox above is ticked.
