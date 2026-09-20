# Phase 14 — Jobs Module Redesign (UI/UX)

**Status:** COMPLETE
**Started:** 2026-09-20
**Completed:** 2026-09-20
**Branch:** main
**Last commit:** d5cfe54 (session's own work not yet committed — see PROGRESS.md)

---

## 1. Goal

A repair job can be created in under 30 seconds at intake, its status
reflects what has physically happened rather than a manually-set dropdown,
two technicians can be assigned to one job, a cancelled job closes cleanly
with its parts returned to stock, a delivered job's full history stays
permanently visible, and the job list surfaces overdue work at a glance.

---

## 2. Scope

### In scope

- P14-1 — multi-technician schema migration (`0015_job_technician.sql`),
  `job_technician` table + read, `job:assignTechnician` dual-write,
  `cancellation_reason`/`diagnosed_fault` schema resolution (see §5 —
  `diagnosis` already exists unused; deviation flagged before build).
- P14-2 — job intake redesign: customer search-or-create with phone-based
  dedup, 5-field quick intake, customer-name link to `CustomerDetailPage`.
- P14-3 — status auto-transitions on real actions (first part issued,
  diagnosis saved), manual picker retained for edge cases, manual status
  dropdown removed.
- P14-4 — cancel job: `job:cancelJob` IPC (new, in-scope backend
  exception), reason dropdown + notes, one transaction reversing
  unreturned issued parts to stock.
- P14-5 — multi-technician assignment panel on the job card, reading
  `job_technician`, with legacy `assigned_to` fallback display.
- P14-6 — diagnosed fault field on the job card (renderer), save path
  gated on whether `job:update` exists (it does not — BUG-17).
- P14-7 — job list: new columns, overdue/stale indicators, search,
  print-from-list for delivered jobs.
- P14-8 — unified chronological History panel on the job card.

### Explicitly out of scope

- Commission logic of any kind — Settings — Job Configuration phase (future).
- Credit note / corrected invoice write path.
- Home-visit job type workflow.
- Accessories intake — BUG-17 (already logged).
- Third-party payer UI — BUG-18 (already resolved, Phase 8; not this phase).
- Return of unused parts after delivery — BUG-17 (deferred).
- Settings redesign or any Settings tab changes.
- Any new report, dashboard widget, or print layout change.

---

## 3. Tasks

| ID    | Task                                                       | Status | Commit |
| ----- | ---------------------------------------------------------- | ------ | ------ |
| P14-1 | Multi-technician schema migration (backend)                | DONE   | —      |
| P14-2 | Job intake redesign                                        | DONE   | —      |
| P14-3 | Status auto-transitions                                    | DONE   | —      |
| P14-4 | Cancel job (backend + renderer)                            | DONE   | —      |
| P14-5 | Technician assignment panel                                | DONE   | —      |
| P14-6 | Diagnosed fault field                                      | DONE   | —      |
| P14-7 | Job list improvements                                      | DONE   | —      |
| P14-8 | History panel                                              | DONE   | —      |
| V1    | Brand dropdown fix                                         | DONE   | —      |
| V2    | Status-picker de-emphasis                                  | DONE   | —      |
| V3    | Add Part button visibility                                 | DONE   | —      |
| V4    | Jobs list pagination                                       | DONE   | —      |
| V5    | Card/shadow design consistency                             | DONE   | —      |
| F1    | New Job button — primary variant                           | DONE   | —      |
| F2    | Header/fault/sidebar card+shadow treatment                 | DONE   | —      |
| F3    | Deliver Job drawer→modal, multi-labour, money sanitization | DONE   | —      |
| G1    | Remove manual "Update status →" control                    | DONE   | —      |
| G2    | Remove duplicate STATUS from sidebar                       | DONE   | —      |
| G3    | Move delivered-state info into header card                 | DONE   | —      |
| G4    | Rename "Customer" → "Client" on job screens                | DONE   | —      |
| G5    | Delivery modal width + button colours                      | DONE   | —      |
| G6    | New Job modal — Create Job button colour                   | DONE   | —      |

P14-7's status corrected from "NOT STARTED" to "DONE" while adding this
table's later rows — it was already fully implemented (job list search/
pagination/overdue indicators/print-from-list, per §5's P14-7 decision
entries and PROGRESS.md Session 71) but the table row itself was never
updated when that task closed. Live code and PROGRESS.md are the
source of truth here, not the stale table row.

---

## 4. Exit criteria

- [x] P14-1: `job_technician` table created via migration 0015; two
      technicians assigned to a real job, queried directly, both rows
      pasted; `assigned_to` still holds the first technician's id.
      Verified 2026-09-20 against a real SQLite DB (migrated + seeded,
      not a mock) via a throwaway script, output pasted in this
      session's transcript; script deleted after use.
- [x] P14-2: existing-customer job creation adds zero new `party` rows
      (count pasted before/after); new-customer job creation adds exactly
      one; a 10-digit phone blocks submission. Verified 2026-09-20:
      party count 1→1 for an existing customer, 1→2 for a new one,
      against a real SQLite DB via a throwaway script mirroring
      JobCreateForm's exact decision path (script deleted after use);
      the 10-digit-phone block and the OD-4 exact name+phone dedup were
      also verified — the latter via the same script (found + reused
      the existing party, no new row), the former via a real React
      Testing Library render (`JobCreateForm.test.tsx`, kept as a
      permanent regression test).
- [x] P14-3: issuing a part on a `received` job flips it to `in_progress`
      with no manual click; verified against a real job — `job_status_history`
      shows `null→received`, `received→in_progress`. A guard check confirmed
      issuing a SECOND part on the now-`in_progress` job does not re-trigger
      (`partIssuedTransitionTarget` returns null). The diagnosis→`diagnosed`
      trigger's logic is built and verified the same way (real DB,
      `in_progress→diagnosed` row confirmed) via `diagnosisSavedTransitionTarget`,
      but has no UI call site yet — no diagnosis-save action exists until
      P14-6 builds it (job:update doesn't exist, BUG-17); owner-approved
      2026-09-20 to build the trigger function now and verify it via script,
      deferring the real Save-button wiring to P14-6.
- [x] P14-4: cancelling a job with one issued, unreturned part inserts a
      `job_return`-type `stock_movement` row whose `quantity_milli` is the
      exact negative of the original issue row's — verified 2026-09-20
      against a real DB: issue row `quantity=-1000`, return row
      `quantity=1000`, `-(-1000)=1000`, MATCH confirmed. Also verified:
      same warehouse as the original (technician's, not Shop);
      `job_part` return row correctly `reverses_job_part_id`-linked with
      snapshotted unit_cost/unit_price; `job.notes` append rule (both the
      "existing notes present" and "no existing notes" cases); guard
      against cancelling an already-cancelled job (throws); `job.status`
      column itself never written — only `job_status_history` gets a new
      row, confirming this session's own READ-4 finding held in the real
      write path.
- [x] P14-5: two technicians assigned, one unassigned; `job_technician`
      queried directly shows one row with `unassigned_at` null and one
      with it set — verified 2026-09-20 against a real DB: both rows
      present after unassign (row count 2, append-only confirmed, no
      delete), one `unassigned_at` set and one still `null`; the active
      list (client-side `unassignedAt === null` filter, same logic
      `TechnicianAssignmentPanel.tsx` uses) correctly excludes the
      unassigned technician and includes the still-active one.
- [x] P14-6: owner decided OPTION A (2026-09-20) — a narrow `job:update`
      (`job:updateDiagnosis`) covering exactly `diagnosedFault`/
      `promisedDate` was built this phase, not deferred. Verified against
      a real DB: saving a diagnosis on an `in_progress` job produced the
      expected `in_progress→diagnosed` `job_status_history` row;
      `job.diagnosis` held the saved text; setting `promisedDate` alone
      left `diagnosis` untouched (confirms the omitted-field-vs-null
      semantics); clearing (`diagnosedFault: null`) set the column to
      `NULL`; a reload (`getJob`) returned the persisted
      `diagnosedFault`. `BUG-DIAGNOSED-FAULT` was never logged — no gap
      exists.
- [ ] P14-7: a job with `promised_date` = yesterday shows the red overdue
      dot in the list without opening the job card; a job with no promised
      date and `created_at` 15 days ago shows the amber clock.
- [x] P14-8: a full lifecycle (create → assign two technicians → issue a
      part → save diagnosis → unassign one technician → deliver) produces
      a correctly time-ordered History panel — verified against a real
      DB, all 9 events present in order: Job received, both technicians
      assigned, part issued, status change to In Progress, diagnosis
      recorded, one technician unassigned, status change to Ready, job
      delivered with invoice number.
- [x] `npm run verify` exits 0 with a test count ≥ 602 after every task —
      final count 617/617.

---

## 5. Design decisions made this phase

| Decision                                                                                                                                                                                                                                                                                                        | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                  | ADR?                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Q-A: reuse existing `job.diagnosis` column, mapped to `diagnosedFault` in the DTO layer; no new column                                                                                                                                                                                                          | Column already existed, unused, since 0001_init.sql — adding a second one would be a pure duplicate                                                                                                                                                                                                                                                                                                                        | No                                |
| Q-B: P14-4's cancellation stock reversal credits the **technician's custody warehouse**, not Shop, using `movement_type='job_return'`                                                                                                                                                                           | Matches ADR-0006's Shop→Technician→Job custody chain; crediting Shop directly would silently desync the technician's custody ledger                                                                                                                                                                                                                                                                                        | No — ADR-0006 already covers this |
| Q-C: `JobSummaryDto` (and its repository SELECT) extended with `promisedDate`/`createdAt` — owner-approved narrow exception to Phase 14's renderer-only rule                                                                                                                                                    | P14-7's overdue/stale list indicators need data the summary DTO didn't carry; both columns already exist on `job`, no migration, no new IPC channel                                                                                                                                                                                                                                                                        | No                                |
| P14-1: `job.assigned_to` is set ONCE, on the first technician ever assigned to a job, and left alone after that (not overwritten by a 2nd/3rd technician)                                                                                                                                                       | Keeps `assigned_to` meaning "primary technician" for every pre-existing reader; found and fixed during this task's own verification, before it shipped, when the exit criterion ("assigned_to still holds the first technician's id") didn't match the first implementation's unconditional overwrite                                                                                                                      | No                                |
| P14-2: every job created through the new intake form always carries a real `customerId` (existing, deduped, or newly created) — the old bare `customerNameAdhoc`/`customerPhone`-only walk-in path is no longer reachable from `JobCreateForm.tsx`                                                              | Required for OD-6 (customer-name link needs a real party to link to) and OD-4 (dedup needs a real party to dedupe against); `customerNameAdhoc`/`customerPhone` stay on the job schema and in `CreateJobInput` unchanged — old jobs created before P14-2 keep working, just no longer the path new jobs take                                                                                                               | No                                |
| P14-2/OD-4: exact-duplicate dedup (name+phone both match) is re-checked at submit time (a fresh `customer:search` + client-side phone filter), not only via a `CustomerPicker` dropdown click                                                                                                                   | Staff may type a fresh name+phone that happens to already exist without ever opening the dropdown; checking only at submit (not on every keystroke) avoids a race with the debounced search while still guaranteeing no duplicate party is created                                                                                                                                                                         | No                                |
| P14-2/OD-6: cross-tab navigation (job card → Customers tab, opened to one customer) implemented via `App.tsx`-lifted `pendingCustomerId` state, not a router                                                                                                                                                    | Codebase has no router — every existing tab switch is a plain `useState` in `App.tsx`; `CustomersPage` already unmounts/remounts on every tab visit (conditional render), so a one-shot "initial customer id" prop, cleared on the next tick via `useEffect`, needed no new dependency                                                                                                                                     | No                                |
| P14-3: `ALLOWED_TRANSITIONS` gained two entries beyond a pure extraction — `received→in_progress` and `in_progress→diagnosed`                                                                                                                                                                                   | Required by P14-3's own auto-transition rules; the original `FORWARD_TRANSITIONS` only supported manual moves and had neither, which would have made `canTransition` reject the very auto-transitions this task was asked to build                                                                                                                                                                                         | No                                |
| P14-3: the diagnosis→`diagnosed` auto-transition trigger (`diagnosisSavedTransitionTarget`) is built and verified via a direct script now, with no UI call site — deferred to P14-6, which is where the actual diagnosis-save action (and its `job:update` dependency, BUG-17) gets built                       | P14-3 is renderer-only except P14-1/P14-4; adding `job:update` now to fully wire this would violate that boundary. Owner-approved 2026-09-20 (AskUserQuestion) rather than assumed                                                                                                                                                                                                                                         | No                                |
| P14-4: the cancellation stock reversal's `stock_movement` row uses `source_type='job_part'`/`source_id=<the ORIGINAL issue job_part's id>` — not `source_type='job_cancel'`/`job.id` as this phase's own original brief specified                                                                               | Read `sale.repository.ts`'s `cancelSale` (the codebase's own established cancellation precedent) and `DATABASE_RULES.md` §3 ("same source_type and source_id as the original") — both independently confirm reversal rows reuse the original row's own source identity, never a new one. Also cross-confirmed against an existing real test fixture (`custody.repository.test.ts`) that already encodes this exact pattern | No                                |
| P14-4: `job.status` is never written by `cancelJob` — cancellation is recorded purely as a new `job_status_history` row (`fromStatus`→`'cancelled'`), exactly like `updateJobStatus` already does                                                                                                               | Grepped every `updateTable('job')` call in the repo before writing any code: none ever sets `status`; it's derived from the latest `job_status_history` row everywhere (confirmed in `job.repository.port.ts`'s own doc comments). Deviates from this phase's own original brief, which said "set job.status = 'cancelled'"                                                                                                | No                                |
| P14-4: the `job_return` stock_movement reversal quantity is `-(original issue row's quantity)`, landing positive, credited to the SAME warehouse the original `job_issue` row debited (read from that row directly, not re-derived via `resolveTechnicianWarehouseId`)                                          | `job_part` carries no `technicianPartyId`/`warehouseId` column — the only place that information exists is the original `stock_movement` row itself. Confirmed the sign convention against `v_stock_on_hand`/`getTechnicianCustodyQuery`: both are a bare `SUM(quantity)`, no `movement_type`-based sign multiplier anywhere in the codebase                                                                               | No                                |
| P14-5: `unassignTechnician` is a genuinely minimal write — ONLY `UPDATE job_technician SET unassigned_at = now`, no `audit_log`/`sync_outbox` row, no touch to `job.assigned_to`                                                                                                                                | Owner's explicit scope for this task ("no other writes"); `job.assigned_to` means "the first technician ever assigned" (P14-1 decision), not "currently active," so it is correctly unaffected by an unassign                                                                                                                                                                                                              | No                                |
| P14-5: `unassignTechnician` targets one `job_technician` row by its own `id`, not by `(jobId, technicianPartyId)`                                                                                                                                                                                               | A technician could in principle be assigned/unassigned/reassigned to the same job more than once over time — targeting by row id closes the exact active row, unambiguously, even in that case                                                                                                                                                                                                                             | No                                |
| P14-5: `unassignTechnician` lives on `JobTechnicianRepositoryPort` (alongside the read), while `assignTechnician` stays on `JobRepositoryPort`                                                                                                                                                                  | Assign also dual-writes `job.assigned_to` (a `job` table column), so it stays with the rest of that table's writes; unassign touches only `job_technician`, so it lives with the rest of that table's logic                                                                                                                                                                                                                | No                                |
| P14-6: owner decided OPTION A — a narrow `job:updateDiagnosis` covering exactly `diagnosedFault`/`promisedDate`, built this phase rather than deferred                                                                                                                                                          | The diagnosed-fault field is operationally important and P14-8's History panel depends on it; scope is narrow enough (two nullable columns, no status logic inside the write itself) to build safely without reopening the general `job:update` question (BUG-17 stays open for every OTHER field)                                                                                                                         | No                                |
| P14-6: `JobDetailHeader.tsx` shows `diagnosedFault` as the primary fault line whenever it is set, regardless of job status — not gated to `status === 'delivered'` as the task's own literal wording ("After delivery: diagnosedFault displayed as the primary fault") suggested                                | The stated fallback rule ("if diagnosedFault is null, reportedFault is primary") only makes sense as a status-independent pairing — a diagnosed-but-not-yet-delivered job benefits from showing the technician's actual finding just as much as a delivered one. Flagged as a judgment call, not silently assumed — cheap to gate to delivered-only later if that reading was wrong                                        | No                                |
| P14-7: Technicians column decision — option (b), keep single `assignedTo` display, logged as BUG-TECHLIST-1                                                                                                                                                                                                     | Owner decision, explicit trade-off against option (a)'s added join/aggregation complexity for a display-only gap; full multi-tech detail stays available on the job card                                                                                                                                                                                                                                                   | No                                |
| P14-7: `JobSummaryDto` also gained `saleId` (beyond the originally-approved `promisedDate`/`createdAt`)                                                                                                                                                                                                         | Needed so the list's print icon (delivered jobs) can call `invoice:printSaleInvoice` without an extra `job:getById` round trip per click — same "widen an existing read" category as the Q-C exception, not a new channel                                                                                                                                                                                                  | No                                |
| P14-8: no complete human-readable status label map existed anywhere in the app before this task — every status badge literally rendered the raw enum string. Built `STATUS_LABELS` in `JobDetailHeader.tsx`, extending the only partial precedent (`JobsPage.tsx`'s 4-entry `STATUS_FILTERS`) to all 8 statuses | The task's brief assumed a label map "exists in the status badge component"; reading the live code found only CSS classes keyed by status, no labels. Extending the one real precedent (Title Case) rather than inventing a separate vocabulary satisfies the "do not invent new labels" instruction in spirit                                                                                                             | No                                |
| P14-8: `CANCELLATION_REASON_LABELS` extracted out of `CancelJobModal.tsx` into a standalone `cancellation-reason-labels.ts` with no other imports                                                                                                                                                               | `job-history-events.ts` needed the map but is meant to be pure/React-free (its own doc comment says so, and it's unit-tested without jsdom); importing it from `CancelJobModal.tsx` pulled in `ipc.ts`, which touches `window.api` at module load time and broke the plain unit test. Found by actually running the test, not assumed                                                                                      | No                                |
| P14-8: `job.updatedAt` added to `JobDto`/`JobRecord` (P14-1's `JOB_RECORD_COLUMNS` widened again)                                                                                                                                                                                                               | Needed as the fallback timestamp for the synthesised diagnosis event in the (currently theoretical) edge case where `diagnosedFault` is set but no `'diagnosed'` `job_status_history` row exists                                                                                                                                                                                                                           | No                                |

---

## 6. Bugs found this phase

- BUG-17 (existing) — narrowed, not closed. `job:updateDiagnosis` (P14-6)
  covers exactly `diagnosedFault`/`promisedDate`; every other job field
  (brand, model, serial, estimate) still has no update path.
- BUG-COMMISSION-MULTI (PROJECT.md §4, new) — logged once P14-5 actually
  shipped multi-technician assignment in the UI, per OD-1's original scope
  call. A second technician on a job earns no commission today.
- BUG-DIAGNOSED-FAULT — never logged. Owner chose OPTION A (build
  `job:updateDiagnosis` this phase) over OPTION B (coming-soon stub), so
  the gap this bug would have described does not exist.
- BUG-TECHLIST-1 (PROJECT.md §4, new) — job list's Technicians column
  shows only the primary (first-assigned) technician; owner-approved
  option (b) over the GROUP_CONCAT alternative.
- DEBT-6 (PROJECT.md §4) — RESOLVED same day, before any P14-2 code, per
  explicit owner instruction not to defer it. `job.repository.ts` split
  into four files, all ≤ 300 lines.

---

## 7. Open questions resolved this phase

Q1–Q10 in PROJECT.md remain open and are not touched by this phase.

Q-P15-1 (PROJECT.md §5) was raised and resolved during the G-series
close-out: job clients will live in a new, separate `job_client` table
— not a `party_type='job_client'` row on the existing `party` table.
Owner decision, 2026-09-20.

---

## 8. Notes for the next phase

Pending session kickoff. See this session's plan reply (STEP 5) for the
full task-by-task breakdown and the blocking questions raised before any
code is written.

**2026-09-20, before P14-2:** DEBT-6 resolved — `job.repository.ts` split
into `job.repository.ts` (275 lines) + `job-query.repository.ts` (198) +
`job-shared.ts` (161) + `job-technician.repository.ts` (139), all ≤ 300.
Any future task touching job read/write logic should check these four
files, not assume everything is still in `job.repository.ts`.

**2026-09-20, P14-2 complete.** New: `CustomerPicker.tsx` (name-search
dropdown, phone shown per OD-4), `JobCreateForm.test.tsx`. `App.tsx` now
owns `pendingCustomerId` for the job-card → Customers-tab link (OD-6) —
any future page wanting the same "navigate to a specific record in
another tab" pattern should reuse this shape rather than inventing a new
one. `JobsPage`/`JobDetailPage`/`JobPropertyPanel`/`CustomersPage` all
gained new required props (`onNavigateToCustomer`, `initialCustomerId`) —
P14-3 through P14-8 touch these same files again and must keep threading
them through, not drop them. `CreateJobInput.customerNameAdhoc`/
`customerPhone` are unchanged in the schema/contract but are no longer
written by `JobCreateForm.tsx` — always `null` from here on; do not
remove the fields, older jobs still carry data in them.

**2026-09-20, P14-3 complete.** New: `job-status-machine.ts` (single
source of truth — `ALLOWED_TRANSITIONS`, `canTransition`,
`manualTransitionOptions`, `partIssuedTransitionTarget`,
`diagnosisSavedTransitionTarget`), `JobStatusPicker.tsx` (manual picker,
extracted out of `JobPropertyPanel.tsx`, now 198 lines). **P14-6 must
call `diagnosisSavedTransitionTarget` from its Save-diagnosis handler**
once `job:update` (or a narrower diagnosis-only write) exists — the
function is written, canTransition-gated, and verified against a real DB
already; P14-6 only needs to call it and pass the result to
`job:transitionStatus`, exactly like `JobDetailPage.tsx`'s
`handlePartsChanged` does for the part-issued trigger. Any future task
adding a new place that changes job status must go through
`canTransition`/`ALLOWED_TRANSITIONS`, never a fourth hardcoded list.

**2026-09-20, P14-4 complete.** New backend: `job-cancel.repository.port.ts`
(core), `job-cancel.service.ts` (core), `job-cancel.repository.ts` (db,
215 lines), `job-cancel.handler.ts` (server), migration was already in
place from P14-1 (`job.cancellation_reason`). New frontend:
`CancelJobModal.tsx` (exports `CANCELLATION_REASON_LABELS`, reused by
`JobDetailPage.tsx`'s cancelled-banner display — reuse this map rather
than re-deriving reason labels anywhere else). `JobDto`/`JobRecord` both
gained `cancellationReason` — any future DTO/record read of a job that
manually lists fields (rather than spreading) needs this field added too
(two pre-existing places already needed the fix this session:
`job.service.test.ts`'s fake repository fixture, and
`job-query.repository.ts`'s `getJobQuery` SELECT list, which had not
been touched since before P14-1 added the column). **Load-bearing
correction for any future stock-reversal code in this codebase:**
reversal `stock_movement` rows reuse the ORIGINAL row's own
`source_type`/`source_id` (never a new source type per event), and
`job.status` is never UPDATEd directly — always via a new
`job_status_history` row. Both were verified against live code before
writing P14-4, not assumed from the phase brief, which had gotten both
wrong.

**2026-09-20, P14-5 complete.** New: `TechnicianAssignmentPanel.tsx`
(175 lines) — the multi-technician list, extracted as its own component
from the start (unlike the old single-tech widget, which lived inline in
`JobPropertyPanel.tsx`). `JobPropertyPanel.tsx` shrank 198→137 lines as a
result. New backend: `unassignTechnician` on `JobTechnicianRepositoryPort`/
`KyselyJobTechnicianRepository`, `job:unassignTechnician` channel/handler.
**P14-8's History panel should read `job_technician` directly for
assign/unassign events** — `TechnicianAssignmentPanel.tsx` only ever
shows the ACTIVE list (`unassignedAt === null`); the full assign/unassign
history for a job lives in the same `listTechnicianAssignments` call
(it returns every row, active and unassigned, P14-8 just needs to not
filter it down like the panel does). The legacy-fallback row
("assigned before this update") only renders when `job_technician` is
completely empty for a job AND `job.assignedTo` is set — a job that has
ever gone through the new multi-assign path (even once) never shows it
again, by design (it's a one-time migration display, not a permanent
alternate view).

**2026-09-20, P14-6 complete.** New backend: `job-diagnosis.repository.port.ts`
(core), `job-diagnosis.service.ts` (core), `job-diagnosis.repository.ts`
(db, 79 lines), `job-diagnosis.handler.ts` (server), `job:updateDiagnosis`
channel. New renderer: `DiagnosedFaultSection.tsx` (main body, below
Reported fault), `PromisedDateField.tsx` (sidebar, replaces the old
read-only-only display — the field can now be SET for the first time,
not just displayed once already present). `JobDetailHeader.tsx` gained a
`diagnosedFault` prop — **BUG-17 is now narrower**: `job:update` for
every field OTHER than diagnosedFault/promisedDate is still absent; any
future task editing another job field (brand, model, serial, estimate)
still needs its own decision, same as before. **P14-8's History panel
can now render "Diagnosis saved: [fault text]" events** — read
`job.diagnosis` transitions via the same `job_status_history` rows
already used for the `in_progress→diagnosed`/`received→diagnosed`
auto-transition (P14-3's `diagnosisSavedTransitionTarget`, now actually
wired to a real Save button) rather than needing a new read path;
there's no separate "diagnosis history" table, so P14-8 can only show
the LATEST diagnosis text alongside the status-change event, not a full
diagnosis edit history — flag this as a known limitation if P14-8 needs
more than that.

**2026-09-20, P14-8 complete — Phase 14 COMPLETE.** New: `job-history-events.ts`
(pure, no React — unit-tested directly with 7 tests, no jsdom needed),
`cancellation-reason-labels.ts` (extracted out of `CancelJobModal.tsx` so
the pure module above doesn't import a component that touches
`window.api` at load time — found by actually running the test, not
assumed). `JobActivitySection.tsx` rewritten from a 2-event stub into the
real History panel: fetches `job:listStatusHistory` (new channel) and
`job:listTechnicianAssignments` (existing, P14-1) itself; `job:listJobParts`
and the `job` object are passed down from `JobDetailPage.tsx` (already
fetched there, no duplicate call). `STATUS_LABELS` added to
`JobDetailHeader.tsx` — the first complete (all 8 statuses) human-readable
status label map in the app; every future status display should use it
rather than rendering the raw enum value or inventing another map.
`job.repository.ts` grew to 282 lines (`listStatusHistory` delegator) —
still under 300, but the next task touching this file should check `wc -l`
first (same DEBT-6 lesson, not yet a new debt entry).

**Known limitation carried forward:** the diagnosis History event shows
only the CURRENT `diagnosedFault` text at the timestamp of the (most
recent) `'diagnosed'` status-history row — there is no per-edit diagnosis
history table, so editing an already-diagnosed job's fault text again
does not produce a new History event or preserve the prior text anywhere.
Acceptable for this phase; would need a real schema addition to fix.

All 8 Phase 14 tasks (P14-1 through P14-8) are done and independently
verified against a real SQLite database, not simulated. Final
`npm run verify`: 617/617, exit 0 (baseline was 602 at session start).

**2026-09-20, V1–V5 visual/UX fixup pass (renderer-only, post-P14-8,
pre-commit).**

- **V1** — Brand field on `JobCreateForm.tsx` changed from free-text to a
  dropdown. Confirmed before writing anything: the `brand` table
  (`0001_init.sql`) exists but has zero seeded rows anywhere (grepped
  every migration and `bootstrap.ts`) and no IPC channel exposes it — so
  this used the task's own specified fallback: a hardcoded
  `BRAND_OPTIONS` list (Dawlance, Gree, Haier, PEL, Orient, Waves,
  Samsung, LG, Kenwood, Changhong Ruba, Other), with "Other" revealing a
  free-text input. The job card has no brand _edit_ field anywhere
  (`applianceBrand` is read-only everywhere else — header subtitle, list
  column) — confirmed by grep, so nothing else needed changing.
- **V2** — `JobStatusPicker.tsx`'s collapsed trigger changed from a
  bordered box to a plain muted text link (`text-xs text-gray-400
underline decoration-dotted`), matching the "secondary, not primary"
  ask. Click behaviour (opens the inline `<Select>`) unchanged.
- **V3** — `JobPartsSection.tsx`'s "+ Add part" raw `<button>` (a
  `border-gray-300` Tailwind border that read as invisible) replaced
  with the shared `Button` component's `secondary` variant — the design
  system's own `border-line`/`bg-surface` tokens, not a hardcoded color.
- **V4** — Pagination added to `JobsPage.tsx`, reusing the exact
  `Pagination` component/props (`totalRows`/`rowsPerPage`/`currentPage`/
  `onPageChange`) already used by every report table. **Correction to
  this task's own stated assumption:** grepped `ROWS_PER_PAGE` across
  every `reports/*.tsx` file before picking a value — all 9 use `10`,
  not the `20` the task described; used `10` to actually match the real
  convention. `Pagination` itself returns `null` (renders nothing, no
  "Page 1 of 1" text) when `totalRows <= rowsPerPage` — confirmed by
  reading the component, not assumed.
- **V5** — the exact card className from `CustomersPage.tsx`
  (`rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),
0_4px_16px_rgba(0,0,0,.06)]`) applied to: the jobs list table (status
  filter + search + table + pagination all now live inside one card,
  mirroring how `CustomerListView.tsx`'s search bar lives inside
  `CustomersPage.tsx`'s card), and separately to the Parts & Labour and
  History sections on the job card. Zebra striping was already present
  on the jobs list (`JobsTableRow.tsx`'s own `even:bg-surface-sunken`,
  predating this task) — confirmed, not re-added.

No new IPC channels, migrations, or repository methods — all five were
renderer-only, verified with `npm run build --workspace=@shop/client`
after each (exit 0 every time), plus a real-DB script for V1's brand
value and the existing `JobsPage.test.tsx`/`JobCreateForm.test.tsx`
suites (all still passing, confirming the Brand `<select>` swap and the
card wrapper didn't break existing behaviour). Final `npm run verify`
after all five: 617/617, exit 0 — unchanged from before this pass, since
no new test coverage was required for pure visual changes per the task's
own instruction.

**2026-09-20, F1–F3 fixup pass (renderer-only except a file rename).**

- **F1** — "New Job" button confirmed to be a raw `<button>` with
  hardcoded `bg-blue-600` (not the shared `Button` component). Replaced
  with `<Button variant="primary">`, matching every other primary action
  in the app.
- **F2** — read `JobDetailPage.tsx`/`JobDetailHeader.tsx`/
  `JobPropertyPanel.tsx` in full first, confirmed classNames before
  editing. Top header converted from `sticky top-0 z-10 ... border-b`
  (edge-to-edge) to the same `rounded-2xl ... shadow-[...]` card used by
  Parts & Labour/History — sticky positioning dropped as part of this
  (a card with margin doesn't read correctly pinned to the top edge).
  Reported/Diagnosed Fault (`DiagnosedFaultSection.tsx`) wrapped in the
  same card, previously unwrapped. Sidebar (`JobPropertyPanel.tsx`)
  confirmed to have no shadow class at all — added the same shadow,
  border kept (additive, not a full re-style). Print Invoice button
  found to already use the shared `Button` component (not a raw
  full-width button as the task described) but with `variant="secondary"`
  — changed to `primary`.
- **F3** — the largest sub-task, with real findings that changed the
  work: `DeliverJobInput.labourLines` was **already an array**, and
  `DeliveryLabourLines.tsx` **already fully implemented** the multi-add
  pattern the task asked for (dropdown + Add → line list below with
  Price/Payer/Revenue type/Remove, dropdown resets, Labour total is a
  live `useMemo`, all lines submitted together) — confirmed by reading
  before writing anything, so **no backend change and no UI rebuild were
  needed for multi-labour**, only a label tweak ("Remove" → "×", matching
  the task's own literal spec) and now a permanent test proving it
  (`DeliveryLabourLines.test.tsx`). The real work was: converting
  `JobDeliveryDrawer.tsx` (a fixed right-side panel, already 319 lines —
  over the 300-line convention before this task even touched it) into
  `JobDeliveryModal.tsx`, using the exact `Modal` wrapper
  `CancelJobModal.tsx` uses — `Modal` already renders its own title +
  close (×) button, so the drawer's hand-rolled header was deleted
  outright, not ported. Extracted `DeliveryTotals.tsx` proactively (298
  lines was too close to 300 with more of this task still to land).
  "Technician" label on the issue-part form changed to "Issued to
  (technician)". **Price/amount field validation**: grepped every price
  field in `apps/client/src/pages/sales/` before implementing — found
  **no character-stripping pattern exists there at all**, every field
  relies solely on `Money.fromRupees()`'s parse-time try/catch; the
  task's assumption that one existed to copy didn't match the live code.
  Built a new shared `sanitizeMoneyInput()` (digits + at most one decimal
  point) instead, applied to all four money fields that needed it (Price
  Rs in the issue-part form, both per-line Price fields in
  `DeliveryPartLines.tsx`/`DeliveryLabourLines.tsx`, Amount paid in
  `JobDeliveryPaymentPanel.tsx`), with its own unit tests.

**Verification (real, not "looks correct"):** `JobDeliveryModal.test.tsx`
renders the actual modal with mocked IPC and asserts `role="dialog"`
with `items-center justify-center` on its wrapper (centred, not the old
`fixed right-0` panel), plus adds two real labour charges and asserts
the exact rendered "Labour total" money text changes from Rs 2,300 to
Rs 800 after removing one — the live-update requirement, proven, not
assumed. `DeliveryLabourLines.test.tsx` proves add/add/remove
independently of the modal. `money-input.test.ts` covers the sanitizer.

No new IPC channels or migrations (F3's file rename —
`JobDeliveryDrawer.tsx` → `JobDeliveryModal.tsx` — is the only structural
change, purely a renderer-side reorganization). `npm run build
--workspace=@shop/client` exit 0 after every sub-task. Final
`npm run verify` after F1–F3: **627/627, exit 0** (617 baseline + 10 new
tests: 5 for the sanitizer, 3 for `DeliveryLabourLines`, 2 for
`JobDeliveryModal`).

**2026-09-20, G1–G6 (final polish pass, closes Phase 14).** All six
renderer-only, no backend/IPC/migration in any of them.

- **G1/G2** — owner decision: the manual "Update status →" picker
  (`JobStatusPicker.tsx`) is removed outright, no replacement — auto-
  transitions (P14-3) handle the primary flow; edge cases like
  `awaiting_parts` are deferred to a future settings/workflow phase.
  Deleted the file (confirmed zero remaining importers:
  `grep -rn "JobStatusPicker" apps/` → zero hits) and its call site/
  state in `JobPropertyPanel.tsx`. G2 then removed the sidebar's entire
  STATUS section (label + badge) since it duplicated the status pill
  already shown in the header card (F2) — the sidebar's Client section
  (renamed from Customer, G4) now sits directly above Technicians.
- **G3** — read `JobDetailHeader.tsx` and `JobDetailPage.tsx` before
  editing, as required: the floating "Job delivered — invoice ...."
  text and full-width Print Invoice button lived in `JobDetailPage.tsx`
  (not the header). Moved both into `JobDetailHeader.tsx` — new props
  `invoiceDocNo`/`saleId`/`printing`/`onPrintInvoice` — Print Invoice
  now sits beside the status pill as `variant="secondary"` (a delivered
  job's invoice is already done; printing it again is a secondary
  action, reversing F2's earlier primary choice for this specific
  button), and the invoice number renders as a small muted line under
  the header's subtitle instead of a separate paragraph below the card.
- **G4** — grepped `Customer` across every file in
  `apps/client/src/pages/jobs/` before editing (per instruction). Found
  the job-intake field label doesn't live in `JobCreateForm.tsx` at all
  — it's rendered by `CustomerPicker.tsx` (both its selected- and
  unselected-state labels) — so that's the file actually edited for
  that part of G4, not `JobCreateForm.tsx` directly. Renamed the
  sidebar label, the jobs-list column header, and both `CustomerPicker`
  labels to "Client"; confirmed `JobDetailHeader.tsx` and
  `JobDeliveryModal.tsx` had zero "Customer" display strings by grep,
  so neither needed a change. The Customers tab/`CustomersPage.tsx`/
  ledger were left untouched, exactly as scoped. Final check:
  `grep -rn '"Customer"' apps/client/src/pages/jobs/` → zero hits.
- **G5** — read `JobDeliveryModal.tsx` and `Modal.tsx` before deciding
  anything, per instruction, and found a real discrepancy from the
  task's own assumption: `Modal.tsx` has only two sizes, `'default'`
  (`max-w-md`, 448px) and `'wide'` (`max-w-4xl`, 896px) — no `'sm'`/
  `'md'`/`'lg'` exist. `DeliveryPartLines.tsx` renders a genuine
  6-column table (Item/Qty/Unit Cost/Price/Payer/Revenue type) with
  inline `<Select>` dropdowns in two of those columns; at 448px that
  table would break, not just look tighter. Per the task's own stated
  qualifier ("use the smallest that fits the content comfortably"),
  kept `size="wide"` and documented this finding rather than force a
  narrower width the content can't actually take. "Deliver & Invoice"
  converted from a raw `bg-green-600` button to the shared `Button`
  component (`variant="primary" size="large" fullWidth`, matching its
  previous `px-6 py-3 text-lg` sizing exactly). For Cash/Credit, read
  `PaymentMethodToggle.tsx` (`RecordPaymentModal.tsx`'s equivalent
  control) as instructed: its active/inactive convention — selected =
  `border-brand bg-brand text-white`, unselected = `border-line
bg-surface` (brand = `#1B5E8C`, a dark blue) — turned out to be
  **already exactly** what `JobDeliveryPaymentPanel.tsx`'s Cash/Credit
  toggle implements, contrary to the task's "both dark blue" screenshot
  read; only the selected button is ever brand-coloured. Left
  unchanged — it already matches the equivalent modal's pattern.
- **G6** — read `JobCreateForm.tsx`: "Create Job" was a raw
  `<button className="... bg-blue-600 ...">`, the file's own documented
  DEBT-1 exception (no longer needed — `packages/ui` primitives are not
  off-limits here). One-line functional change to
  `<Button variant="primary" fullWidth>` (wrapped in a bare `mt-2` div,
  since `Button` accepts no `className` prop); nothing else in the file
  touched.

**Verification:** `npm run build --workspace=@shop/client` exit 0 after
each of the six sub-tasks. Full `npm run verify` first failed 311/627
on the recurring `better-sqlite3` NODE_MODULE_VERSION mismatch
(`TypeError: Cannot read properties of undefined (reading 'close')` in
every repository test's `afterEach` — the same documented environmental
issue from Sessions 70/71 and earlier phases, unrelated to this
session's code); fixed with `taskkill /F /IM electron.exe` + `npm
rebuild better-sqlite3`. Re-ran: **627/627 tests, 109/109 test files,
exit 0** — unchanged from the F1–F3 baseline (G1–G6 deleted one
component and updated existing tests/labels in place; no new test
files were needed for this pass).

**Phase 14 is now COMPLETE and closed.** P14-1 through P14-8, the
V1–V5 pass, F1–F3, and G1–G6 are committed together in a single commit
— see PROGRESS.md Session 72 for the entry and the commit hash.
