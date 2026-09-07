# Phase 8 — Bug-Fix & Hardening

**Status:** P8-0 through P8-7 all DONE (P8-1/BUG-ADR9 deferred by owner
decision — see §5). P8-2/P8-3 additionally click-through-verified in a
real running Electron window this session (see §7). Ready to commit.
**Started:** 2026-09-07
**Completed:** 2026-09-07 (P8-1 explicitly deferred, not built)
**Branch:** main
**Last verified commit:** a0877d8 (this session's work pending commit)
**Test baseline:** 417/417 → 422/422 this session (3 new tests in
party.repository.test.ts for searchAnyParty, 2 new tests in
job.repository.test.ts for invoiceDocNo)

---

## 1. Goal

Every known bug in PROJECT.md is either fixed, explicitly deferred with a
written reason, or reclassified. No new features are introduced. When this
phase closes, the codebase is correct and consistent enough to hand to the
UI-redesign phase and then to packaging.

---

## 2. Scope

### In scope

Only the items listed in §3. If something not on this list surfaces during
fixing, it goes into PROJECT.md as a new bug entry and is NOT fixed in the
same session.

### Explicitly out of scope

- Packaging / installer work (BUG-PACK-1) — separate phase
- Phase 5 deploy
- UI redesign — separate phase after Phase 8
- BUG-17 (`job.update` / `job.returnPart` / `job.addAccessory`) — deliberate
  owner-approved stubs, deferred to a future repair-jobs phase
- BUG-16 (purchase form missing bill-reference fields) — LOW usability gap,
  no money/stock correctness impact, deferred
- BUG-15 (SQLITE_BUSY concurrent-write handling) — HIGH, deferred; no
  concurrent write access has caused a real incident; fix is architectural
  (connection-pool or serialised write queue) and belongs to a dedicated
  hardening session, not this phase
- BUG-13 (reversed_by_id contradicts append-only rule in code) — the code
  already follows the correct no-UPDATE pattern; this is a documentation fix
  only (see P8-6 below for the docs fix)
- Anything in CLAUDE.md §10 (the forbidden list)

---

## 3. Work queue — severity order

Work items are executed in this exact order. Do not skip ahead.

| ID   | Bug               | Severity | Type             | Status                                                         |
| ---- | ----------------- | -------- | ---------------- | -------------------------------------------------------------- |
| P8-0 | Repo health check | —        | Prerequisite     | DONE — see §2 of the session reply for pasted output           |
| P8-1 | BUG-ADR9          | HIGH     | Backend + Design | DEFERRED — owner chose Option B (see §5)                       |
| P8-2 | BUG-18            | LOW      | Backend + UI     | DONE — click-through-verified in a real running window, see §7 |
| P8-3 | BUG-P6.5-1        | LOW      | Backend + UI     | DONE — click-through-verified in a real running window, see §7 |
| P8-4 | BUG-20            | LOW      | Docs only        | DONE — Option B (DATABASE_RULES.md note)                       |
| P8-5 | DEBT-2            | LOW DEBT | Decision + code  | DONE — Option A (deleted), zero source hits confirmed          |
| P8-6 | DEBT-3            | LOW DEBT | Decision + code  | DONE — Option A (deleted), zero source hits confirmed          |
| P8-7 | BUG-14            | MEDIUM   | Docs only        | DONE                                                           |

---

## 4. Task definitions

### P8-0 — Repo health check (prerequisite, no code)

Before touching anything:

1. `git log --oneline -10` — confirm HEAD is at or ahead of `a0877d8`.
2. `npm run verify` — must exit 0, must show ≥ 417 tests. Paste the output.
3. Re-read `PROJECT.md` Known Bugs in full. If any bug not listed above is
   found with CRITICAL severity, it takes priority over this entire list.
   Stop and report.
4. Confirm BUG-ADR9 is still genuinely blocked on the identity question
   (see §5 Design Decisions) before starting P8-1.

---

### P8-1 — BUG-ADR9: Permission enforcement (HIGH)

**The blocking design question — answer before writing any code:**

`requirePermission(event, 'sale.create')` needs a caller identity. No login
screen, no session token, and no "current user" object exists anywhere in the
codebase today. Phase 7 created staff records but did not build authentication.

There are two options:

- **Option A (recommended for Phase 8):** Add a minimal `currentRole` singleton
  to the main process — set at app startup (owner opens the app, selects their
  role from a one-screen picker with no password, or always defaults to `owner`
  for the single-user Phase 5 scenario). Store it in memory only; it resets on
  every app launch. This is not real authentication; it is a structural
  placeholder that makes the enforcement infrastructure real without blocking on
  a full login system.

- **Option B (full):** Build a real login screen with PIN or password, session
  token, and role from the `party` table's `staff_role` column. This is a
  feature, not a bug fix — if the owner wants this, it should be its own task
  in a future phase.

**The agent must state which option the owner has chosen and record it as a
decision in §5 before writing any code.**

**Implementation steps (assuming Option A):**

1. Read every file in `apps/server/src/ipc/handlers/` before writing anything.
   Count the handlers. Every one of them needs a `requirePermission()` call.

2. Create `packages/core/src/permissions/permissions.ts`:
   - `StaffRole` type: `'owner' | 'salesman' | 'technician' | 'helper'`
   - `Permission` type: a union of all action strings (see permission map below)
   - `ROLE_PERMISSIONS: Record<StaffRole, Set<Permission>>` — the map
   - `requirePermission(role: StaffRole, permission: Permission): void` — throws
     `PermissionDeniedError` if `!ROLE_PERMISSIONS[role].has(permission)`
   - `PermissionDeniedError extends Error` with a `code: 'PERMISSION_DENIED'`
     field

3. Create `apps/server/src/session/current-session.ts`:
   - `let _role: StaffRole = 'owner'` — defaults to owner (single-user Phase 5)
   - `setCurrentRole(role: StaffRole): void`
   - `getCurrentRole(): StaffRole`

4. Add `PermissionDeniedError` case to `apps/server/src/ipc/middleware/
with-error.ts`'s `toIpcError()`, matching `DbBusyError`'s shape.

5. Add `requirePermission(getCurrentRole(), 'sale.create')` (or the relevant
   permission) as step 2 in every handler, between Zod parse and service call.
   Do this as a single commit touching all handlers at once — partial
   enforcement is worse than none.

6. Tests: at minimum, one test proving `requirePermission` throws for a role
   without the permission, and one proving it passes for a role that has it.
   These are pure unit tests in `packages/core` — no IPC, no database.

**Permission map (starting point — agent must verify against actual handlers):**

| Permission           | owner | salesman | technician | helper |
| -------------------- | ----- | -------- | ---------- | ------ |
| `sale.create`        | ✓     | ✓        | —          | —      |
| `sale.cancel`        | ✓     | —        | —          | —      |
| `sale.view`          | ✓     | ✓        | —          | —      |
| `purchase.create`    | ✓     | —        | —          | —      |
| `purchase.cancel`    | ✓     | —        | —          | —      |
| `purchase.viewCost`  | ✓     | —        | —          | —      |
| `payment.receive`    | ✓     | ✓        | —          | —      |
| `payment.pay`        | ✓     | —        | —          | —      |
| `stock.adjust`       | ✓     | —        | —          | —      |
| `item.create`        | ✓     | —        | —          | —      |
| `item.update`        | ✓     | —        | —          | —      |
| `item.import`        | ✓     | —        | —          | —      |
| `report.view`        | ✓     | —        | —          | —      |
| `backup.create`      | ✓     | —        | —          | —      |
| `backup.restore`     | ✓     | —        | —          | —      |
| `job.create`         | ✓     | ✓        | —          | —      |
| `job.issue`          | ✓     | —        | ✓          | —      |
| `job.deliver`        | ✓     | ✓        | —          | —      |
| `job.view`           | ✓     | ✓        | ✓          | —      |
| `job.reconcile`      | ✓     | —        | —          | —      |
| `staff.view`         | ✓     | —        | —          | —      |
| `attendance.record`  | ✓     | —        | —          | —      |
| `expense.create`     | ✓     | —        | —          | —      |
| `cashSession.manage` | ✓     | —        | —          | —      |

**⚠ This table is a starting point, not a final spec. The agent must grep
every `ipcMain.handle` call in `apps/server/src/ipc/handlers/` and produce
the definitive list before writing the permission map, because new handlers
were added in Phases 6 and 7 that may not be in this table.**

**Verification:**

- `npm run verify` exits 0, count ≥ 417.
- `grep -rn "requirePermission" apps/server/src/ipc/handlers/` — every
  `.ts` file in that directory appears in the output.
- Unit tests for `requirePermission` pass. Paste output.
- `grep -rn "requirePermission" apps/server/src/ipc/handlers/ | wc -l`
  matches the handler count. Paste both numbers.

---

### P8-2 — BUG-18: Delivery UI cannot select non-customer payers (LOW)

**The blocking design question — answer before writing any code:**

Two existing search IPC channels are deliberately narrow:

- `customer:search` — filters `party_type = 'customer'`
- `party:search` (suppliers) — filters `party_type = 'supplier'`

A manufacturer payer (e.g. Dawlance) has `party_type = 'both'`, matched by
neither. The fix needs a search that can find any party by name regardless
of type. Two options — agent must read both handler files and both call sites
before deciding:

- **Option A:** New channel `party:searchAny` — searches name across all
  `party_type` values. Leaves existing channels untouched.
- **Option B:** Add optional `partyTypes?: PartyType[]` parameter to the
  existing `party:search`. Existing callers pass nothing, behaviour unchanged.
  New caller passes `['customer', 'supplier', 'both']`.

State the choice and record it in §5 before writing any code.

**Implementation steps:**

1. Read `apps/server/src/ipc/handlers/` for the party/customer search handlers.
   Read `apps/client/src/pages/jobs/` for `DeliveryPartLines.tsx` and
   `DeliveryLabourLines.tsx` — the two files that need to change.
2. Read `packages/contracts/src/party/` for the existing search input/output
   types. Extend them if using Option B, or create new ones for Option A.
3. Confirm `deliverJob`'s Zod schema in the contracts layer accepts any
   `payerPartyId` (any UUID) — it should already, since the backend is built
   correctly. If so, no backend delivery logic changes.
4. Update both delivery line components to offer a third payer option
   ("Other party…") that opens a party search popover using the new/extended
   channel.
5. Remove the `disabled` placeholder option ("Other party — coming soon").

**Verification:**

- In the delivery drawer, set a labour line's payer to a supplier-type party.
  Confirm the delivery completes. Query `SELECT payer_party_id FROM sale_line
WHERE sale_id = '<id>'` directly. Paste result.
- `npm run verify` exits 0, count ≥ 417.

---

### P8-3 — BUG-P6.5-1: JobDto missing invoiceDocNo (LOW)

**Files to read before touching anything:**

1. `packages/contracts/src/job/job.ts` — current `JobDto` shape
2. `packages/db/src/repositories/job.repository.ts` — `getJobById` query
3. The renderer component that displays the delivered job header
   (likely `JobDetailHeader.tsx` or `JobPropertyPanel.tsx` — confirm by
   reading, not assuming)

**Implementation steps:**

1. In `job.repository.ts`'s `getJobById`, add:
   `LEFT JOIN sale s ON s.id = j.sale_id`
   Select `s.doc_no AS invoice_doc_no` into the result.
2. Add `invoiceDocNo: string | null` to `JobDto`.
3. In the renderer, replace the UUID display with `invoiceDocNo` where the
   delivered-job state is shown.

**Verification:**

- Deliver a test job. Close and reopen the app. Navigate to that job.
  The `INV-NNNN` number appears in the header without printing.
- `npm run verify` exits 0, count ≥ 417.
- If the repository test for `getJobById` exists, confirm it still passes
  and that `invoiceDocNo` is populated in the result.

---

### P8-4 — BUG-20: schema comment vs. actual entry_type value (LOW, docs)

**Owner must choose before the agent does anything:**

- **Option A:** Update the comment on `party_ledger.entry_type` in
  `packages/db/src/migrations/0001_init.sql`. Change `staff_advance` to
  `advance` in the comment text only. This is a source-file comment change —
  it has no effect on any live database, but keeps the source readable.
  The project rule "never edit an applied migration" targets schema/data changes,
  not comment corrections. Owner must explicitly confirm this is acceptable.

- **Option B:** Leave `0001_init.sql` unchanged. Add one sentence to
  `docs/DATABASE_RULES.md` §3 noting that `entry_type` values are canonical
  in application code and Zod schemas, not in migration comments, and that
  the comment may be stale.

**Verification (Option A):**
`grep -n "staff_advance" packages/db/src/migrations/0001_init.sql` — zero hits.

**Verification (Option B):**
`grep -n "canonical in application code" docs/DATABASE_RULES.md` — one hit.

Both: `npm run verify` exits 0, count ≥ 417 (no code changed, just docs).

---

### P8-5 — DEBT-2: `job:issueToTechnician` has no UI entry point (LOW DEBT)

**Owner must choose before the agent does anything:**

- **Option A — Delete:** Remove the IPC channel registration, the handler
  method, and the `electron-api.d.ts` type entry for `ipc.job.issueToTechnician`.
  The "issue part directly to technician" workflow is not supported in the UI.
  Document the removal in PROJECT.md.

- **Option B — Build UI:** Build a minimal form: pick technician, pick item,
  enter quantity. This issues a part from Shop stock to the technician's custody
  warehouse, independent of any job. This is a real daily workflow (pre-stocking
  a technician before a site visit). If chosen, TDD the new UI, and verify via
  a direct `v_technician_custody` query after use.

**⚠ Option B is feature work. It must be explicitly approved by the owner
before the agent writes any code beyond reading the existing handler.**

**Verification (Option A):**
`grep -rn "issueToTechnician" apps/` — zero hits. `npm run verify` exits 0.

**Verification (Option B):**
Issue part to technician via the new UI. Query `SELECT * FROM v_technician_custody
WHERE party_id = '<id>'` directly. Paste result. `npm run verify` exits 0.

---

### P8-6 — DEBT-3: `job:createInternalTransfer` has no UI entry point (LOW DEBT)

Same structure as P8-5. Owner must choose:

- **Option A — Delete:** Remove the channel, handler, and type.
- **Option B — Build UI:** A form to record unbilled internal consumption
  (e.g. a free Dawlance installation where parts are consumed but not billed
  to any customer). This is the ADR-0005 scenario. Posts an internal transfer
  from PARTS to REPAIR at cost. If chosen, TDD and verify via `v_unit_pl`
  direct query.

**⚠ Option B is feature work. Needs explicit owner approval.**

Same verification pattern as P8-5.

---

### P8-7 — BUG-14: DATABASE_RULES.md §3 contradicts itself on reversed_by_id (MEDIUM, docs)

**Read before fixing:**
`docs/DATABASE_RULES.md` §3 "Append-only tables" — the three bullets.

**The fix:** Replace bullet 2 (`"Corrections insert a reversing row and set
reversed_by_id on the original"`) with a correct description of how reversals
actually work in this codebase:

> Corrections insert a reversing row (same `source_type` and `source_id` as
> the original, with the opposite sign). The original row is never touched.
> A reversal is discoverable by querying for all rows sharing the same
> `source_type`/`source_id` — the same aggregation pattern `v_stock_on_hand`
> and `v_party_balance` already use. The `reversed_by_id` column exists in the
> schema but is never written by any application code path.

**Verification:**
`grep -n "reversed_by_id" docs/DATABASE_RULES.md` — the only hit is the
explanatory sentence ("exists in the schema but is never written"), not an
instruction. `npm run verify` exits 0, count ≥ 417.

---

## 5. Design decisions made this phase

| Task | Decision                                                                                    | Reasoning                                                                                                                                                                                                                                                                                                                                                       | ADR? |
| ---- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P8-1 | **Option B — defer entirely.** BUG-ADR9 is NOT fixed this phase.                            | Owner decision, 2026-09-07. Real permission enforcement needs a caller identity; building even a placeholder `currentRole` singleton is infrastructure for a login/session model that does not exist yet, and the owner chose not to build that now. BUG-ADR9 stays open in PROJECT.md, unchanged severity (HIGH), status updated to note the Phase 8 deferral. | No   |
| P8-2 | **Option A — new channel `party:searchAny`.**                                               | Owner decision, 2026-09-07. Leaves `customer:search`/`party:search` untouched, avoids widening an existing channel's contract for a narrow one-screen need.                                                                                                                                                                                                     | No   |
| P8-4 | **Option B — note in `docs/DATABASE_RULES.md` instead.** `0001_init.sql` is left unchanged. | Owner decision, 2026-09-07. Avoids touching an applied migration file even for a comment-only change.                                                                                                                                                                                                                                                           | No   |
| P8-5 | **Option A — delete.** Remove `job:issueToTechnician` channel, handler, and type.           | Owner decision, 2026-09-07. Maintenance, not feature work — no UI ever called it.                                                                                                                                                                                                                                                                               | No   |
| P8-6 | **Option A — delete.** Remove `job:createInternalTransfer` channel, handler, and type.      | Owner decision, 2026-09-07. Same reasoning as P8-6/DEBT-3 above.                                                                                                                                                                                                                                                                                                | No   |

---

## 6. Exit criteria

All must be verified with actual output before the phase closes.

- [x] `npm run verify` exits 0. Count ≥ 417. Output pasted (422/422, this
      session).
- [ ] P8-1: **DEFERRED**, not applicable this phase — owner chose Option B.
      `grep -rn "requirePermission" apps/server/src/ipc/handlers/` still
      returns zero hits, unchanged from before this session. BUG-ADR9 stays
      open in PROJECT.md.
- [x] P8-2: `SELECT payer_party_id FROM sale_line WHERE sale_id = '<id>'`
      run directly against the dev DB after delivering a real job through
      the running Electron UI with its labour line's payer set to "Test
      Supplier" (`party_type='supplier'`) via the new "Other party…"
      picker — returned `01a05377-d010-70d6-996b-86f178398ad6`, the exact
      id of the party picked on screen. See §7 for the full pasted output.
- [x] P8-3: repository-level test hand-verifies `invoiceDocNo` populates
      from `sale.doc_no` once `job.sale_id` is set (`INV-A-000042` in,
      `INV-A-000042` out — see job.repository.test.ts). Additionally
      click-through-verified: reopened `JOB-0001` (delivered in an earlier
      session) in the running app and the header read "Job delivered —
      invoice INV-0012." — see §7.
- [x] P8-4: Option B chosen. `grep -n "canonical in application code"
    docs/DATABASE_RULES.md` — one hit (the new heading).
- [x] P8-5: Option A chosen. `grep -rn "issueToTechnician" apps/ --include=*.ts
    --include=*.tsx` — zero hits (stale `apps/server/dist/` build output
      still contains the old string; not source, not shipped from this
      session).
- [x] P8-6: Option A chosen. Same verification pattern and same dist-only
      caveat as P8-5, for `createInternalTransfer`.
- [x] P8-7: `reversed_by_id` no longer implies an UPDATE in the docs — see
      the corrected paragraph in `docs/DATABASE_RULES.md` §3, copied into
      this file's P8-7 task description above.
- [ ] Every fixed bug has `Status: FIXED — [date], commit [hash]` in
      PROJECT.md — dates added this session; **commit hash pending**, since
      nothing from this session has been committed yet.
- [x] No new unresolved bugs introduced by this phase's changes (see §7 for
      the one verification gap flagged, which is not a new bug).
- [x] PROJECT.md and PROGRESS.md updated (this session).

---

## 7. Bugs found this phase

No new bugs found this phase.

**P8-2/P8-3 UI click-through — performed, follow-up to the initial pass.**
The initial pass through this queue left both items verified only at the
repository/unit-test level, not in a real running window. Per the owner's
explicit instruction, that gap was closed in the same session rather than
deferred:

1. Built the app: `npm run build --workspace=@shop/server` (electron-vite
   build of main/preload/renderer — includes every change this session).
2. Rebuilt `better-sqlite3` for Electron's ABI: `npm run rebuild:electron`
   — succeeded cleanly on the first attempt (no duplicate-module-name
   quirk this time; see the note added to BUG-7 in PROJECT.md).
3. Installed `playwright-core --no-save` (same technique as PROGRESS.md
   Session 36) and drove the real Electron process with its `_electron`
   launcher against `apps/server/dist/main/main.cjs` and the existing dev
   database (`data/shop-dev.db`).
4. **P8-3 check:** navigated to Jobs, opened `JOB-0001` — delivered in an
   earlier session (2026-09-06), so `deliveredNotice` is null and the
   fallback path (`job.invoiceDocNo`) is genuinely exercised, not the
   just-delivered in-memory path. Screenshot and `textContent()` both
   confirmed:
   ```
   Job delivered — invoice INV-0012.
   ```
5. **P8-2 check:** created a new job (`JOB-0004`) through the actual "New
   Job" form, opened it, clicked "Deliver & Invoice", added an "AC
   Installation" labour line, set its payer `<select>` to "Other party…",
   typed "Test Supplier" into the new `OtherPartyPicker`'s search box
   (debounced live search against `party:searchAny`), clicked the result,
   and submitted. The UI confirmed:
   ```
   Job delivered — invoice INV-0014.
   ```
6. Queried the real database directly afterward (`ELECTRON_RUN_AS_NODE=1
electron.exe script.mjs`, since the DB file was Electron-ABI-compiled
   for the running app):
   ```
   job: { id: '01a07b07-a8f5-71fa-807a-8f54121d64b0', doc_no: 'JOB-0004',
          sale_id: '01a07b07-b833-769d-8de6-f36f14170426' }
   sale_line rows: [{
     id: '01a07b07-b834-767b-8a58-2534635277bb',
     description: 'AC Installation',
     payer_party_id: '01a05377-d010-70d6-996b-86f178398ad6',
     line_kind: 'labour'
   }]
   Test Supplier party: { id: '01a05377-d010-70d6-996b-86f178398ad6',
                           name: 'Test Supplier', party_type: 'supplier' }
   MATCH: true
   ```
   `payer_party_id` matches the picked party's id exactly — this is
   PHASE_8.md's own literal P8-2 exit criterion, satisfied with a
   supplier-type party (not customer, not walk-in), exactly as specified.
7. Cleanup: restored `better-sqlite3` to the system-Node ABI
   (`npm install better-sqlite3 --no-save`), re-ran `npm run verify` —
   422/422, clean. Deleted the temporary driver script and screenshots
   (`.verify-p8.mjs`, `.verify-p8-query.mjs`, `.verify-p8-shots/`) —
   session-scoped, never committed, same as Session 36's own cleanup.

Both P8-2 and P8-3 are now FIXED (not just code-complete) in PROJECT.md.

---

## 8. Notes for the next phase (UI redesign)

- BUG-ADR9 was **deferred entirely** (Option B) — no `currentRole`
  singleton, no permission enforcement infrastructure exists yet. Every
  handler still runs unconditionally for any caller. This stays open and
  HIGH; a future phase must build real identity/session before permission
  enforcement can exist at all.
- DEBT-2/DEBT-3 were **deleted** (Option A both) — `job:issueToTechnician`
  and `job:createInternalTransfer` no longer exist as IPC channels,
  handlers, or preload/electron-api.d.ts types. The underlying
  `issuePartsToTechnician`/`createInternalTransfer` core functions and
  repository methods were deliberately left intact (still tested directly
  in `job-part.repository.test.ts`/`custody.repository.test.ts`/
  `internal-transfer.repository.test.ts`) — only the IPC-layer wiring was
  removed. The UI redesign phase must not re-introduce either entry point
  without a fresh backend decision.
- BUG-18's new party-search channel is `party:searchAny` (Option A —
  additive, `customer:search`/`party:search` untouched). Must be included
  in the API surface review at the start of the UI redesign phase.
- P8-2/P8-3's UI-level exit criteria were click-through-verified in a real
  running window this session (see §7) — no follow-up needed.
