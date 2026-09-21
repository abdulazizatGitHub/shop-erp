# Phase 15 — Job Client Table + On-site Jobs + Awaiting Parts Flow

**Status:** COMPLETE
**Started:** 2026-09-21
**Completed:** 2026-09-22
**Branch:** main
**Baseline:** 314db89 (Phase 14 close, 627/627 tests)
**Final:** 644/644 tests (uncommitted — see PROGRESS.md Session 73)

---

## 1. Goal

Job clients are stored in their own table, completely separate from the
Spare Parts ledger customers (`party` / `party_type='customer'`). A job
records whether the work happens in the shop or at the client's site;
on-site jobs capture the client's address at intake and auto-fill it when
an existing client is reselected. Staff can mark a job as awaiting parts
with a required reason, and issuing a part to an `awaiting_parts` job
auto-advances it to `in_progress`.

Fixes BUG-JOBCLIENT-1 (job intake's client search was querying the Spare
Parts ledger population). Resolves Q-P15-1 (owner decision: separate
`job_client` table, `party_type='job_client'` explicitly rejected).

---

## 2. Scope

### In scope

- P15-1 — `job_client` table migration (0016) + `job.job_client_id` column.
- P15-2 — `job-client.repository.ts`, contracts, IPC channels
  (`jobClient:search` / `jobClient:create` / `jobClient:getById`).
- P15-3 — link job creation to `job_client` (existing or new-in-transaction),
  denormalize `jobClientName`/`jobClientPhone` onto `JobDto`/`JobSummaryDto`.
- P15-4 — `JobClientPicker.tsx` replaces `CustomerPicker.tsx` on job intake;
  Job Type (in shop / on-site) field; conditional address/area/landmark group.
- P15-5 — job card + jobs list show `jobClientName` instead of the old
  party-linked `customerName`; client popover with full details; awaiting-parts
  reason line under the status badge.
- P15-6 — `awaiting_parts` action button + reason dialog; state-machine wiring
  so `partIssuedTransitionTarget('awaiting_parts')` returns `'in_progress'`.

### Explicitly out of scope

- Job client edit page or dedicated client list screen.
- Linking job clients to `party` records (Q-P15-1, rejected).
- Map/GPS coordinates.
- Client history view beyond the read-only popover.
- On-site job routing or scheduling.
- BUG-COMMISSION-MULTI (deferred, unrelated).
- Any change to the Customers tab, `CustomerDetailPage`, or the party ledger.
- Dropping or renaming `job.customer_id` — stays in place, unused, per
  DATABASE_RULES.md §4 (never edit an applied migration; old column is
  ignored by new code, not removed).

---

## 3. Tasks

| ID    | Task                                                               | Status | Commit        |
| ----- | ------------------------------------------------------------------ | ------ | ------------- |
| P15-1 | `job_client` migration (0016) + `job.job_client_id`                | DONE   | (uncommitted) |
| P15-2 | jobClient repository + contracts + IPC                             | DONE   | (uncommitted) |
| P15-3 | Link job creation to job_client, denormalized read                 | DONE   | (uncommitted) |
| P15-4 | Job intake form redesign (JobClientPicker + on-site fields)        | DONE   | (uncommitted) |
| P15-5 | Job card / list show client info + popover + awaiting-parts reason | DONE   | (uncommitted) |
| P15-6 | Awaiting parts flow (state machine + UI)                           | DONE   | (uncommitted) |

---

## 4. Owner decisions (already made — do not re-ask)

- OD-1 — `job_client` is a separate table, not `party_type='job_client'`.
- OD-2 — `job_client` columns exactly as specified in the kickoff prompt.
- OD-3 — `job.job_client_id` nullable FK; `job.customer_id` never dropped.
- OD-4 — Job Type at intake: In shop (default) / On-site, with a
  conditional Address/Area/Landmark group.
- OD-5 — Client search hits `job_client`, dedup = same name + same phone.
- OD-6 — Explicit "Awaiting parts" action + reason dialog; reason stored
  in `job_status_history.note`.
- OD-7 — Awaiting-parts reason shown on the job card sidebar.

---

## 5. Schema findings (read from live code, 2026-09-21)

- **SQ-1** — `job` table (`packages/db/src/migrations/0001_init.sql:555`)
  has `customer_id TEXT REFERENCES party(id)` — no `job_client_id` column
  exists yet anywhere across migrations 0001–0015 (confirmed by grepping
  every `ALTER TABLE job` statement). `CreateJobInput`/`JobDto` mirror this
  as `customerId` (packages/contracts/src/job/job.ts) — no `clientId` field
  exists in the DTO either. P15-1 adds `job_client_id` net-new; nothing to
  reconcile against a divergent DTO field name.
- **SQ-2** — `job_status_history` (`0001_init.sql:609-618`) already has
  `note TEXT` (nullable, no length constraint). No migration needed for
  OD-6's reason storage — P15-6 only needs to make sure the note actually
  gets written and read, not add the column.
- **SQ-3** — `CustomerPicker.tsx` calls `ipc.customer.search({ query: name.trim() })`,
  which resolves to IPC channel `customer:search`
  (`apps/server/src/ipc/channels.ts:34`), input shape `{ query: string }`
  (`CustomerSearchInput`). It filters `party_type='customer'` — this is
  exactly BUG-JOBCLIENT-1's wrong population. `JobClientPicker.tsx` (P15-4)
  must call a new `jobClient:search` channel instead, same `{ query }` shape.
- **SQ-4** — `CreateJobInput` (packages/contracts/src/job/job.ts:16-32) has
  `customerId: z.string().uuid().nullable()`, plus legacy
  `customerNameAdhoc`/`customerPhone` (both nullable, no longer written by
  `JobCreateForm.tsx` since P14-2 — always `null` from the renderer, per
  `docs/phases/PHASE_14.md` §8 P14-2 note). No `jobClientId`/`newClient`
  fields exist yet — P15-3 adds both net-new, additive to the existing
  schema (existing fields untouched, per the phase's own scope: `customerId`
  stays wired to the old flow, unused going forward, not removed).
- **SQ-5** — `job-status-machine.ts:31` — `ALLOWED_TRANSITIONS.awaiting_parts`
  is **already** `['in_progress', 'cancelled']`. This was added in P14-3,
  ahead of Phase 15 — OD-6's instruction to "add awaiting_parts to
  ALLOWED_TRANSITIONS" is **already satisfied**, no change needed there.
  What is **not** yet done: `partIssuedTransitionTarget()`
  (`job-status-machine.ts:85-89`) only handles `currentStatus === 'received'`
  — calling it with `'awaiting_parts'` currently returns `null` (falls
  through the guard). P15-6 must widen this guard to also accept
  `'awaiting_parts'`, returning `'in_progress'` for both (still routed
  through `canTransition`, which already allows both edges).

### Additional findings folded into the plan

- `JobStatusTransitionInput` (packages/contracts/src/job/job.ts:34-39) and
  `transitionJobStatus`/`updateJobStatus` (packages/core/src/job/job.service.ts:37-41)
  **already** accept and forward a `note` field end-to-end to
  `job_status_history.note` — confirmed by `job.service.test.ts:131-144`.
  P15-6 does **not** need to modify the handler/service/contract for note
  storage; it only needs the renderer to pass `note: reasonText` when
  calling `job:transitionStatus`.
- `JobStatusHistoryRecord`/`JobStatusHistoryDto` (packages/core/src/job/job.repository.port.ts:56-60,
  packages/contracts/src/job/job.ts:98-103) and `listJobStatusHistoryQuery`
  (packages/db/src/repositories/job-query.repository.ts:217-235) currently
  select/expose only `fromStatus`/`toStatus`/`changedAt` — **`note` is not
  read back**. OD-7 requires it, so P15-5 must add a minimal read: widen
  the record/DTO with `note: string | null` and add `'note'` to the
  `.select([...])` list — no new IPC channel, `job:listStatusHistory`
  already exists (P14-8) and `JobActivitySection.tsx` already calls it.
- `job.repository.ts` is at 282 lines (per PHASE_14.md §8 P14-8 note) —
  already close to the 300-line ceiling; P15-2's new `job-client.repository.ts`
  must be its own file, not appended here.
- Current table count is **50** (migration-runner.test.ts:60,
  verified live below), 11 views, migrations 0001–0015 applied. P15-1 is
  migration **0016**.

---

## 6. Verification log

### P15-1 — `job_client` migration (0016), 2026-09-21

Files: new `packages/db/src/migrations/0016_job_client.sql`; updated
`packages/db/src/migration-runner.test.ts` (4 hardcoded `applied`/`skipped`
arrays extended with `0016_job_client.sql`, table-count assertion 50→51,
new test asserting `job_client`'s exact column list/nullability and
`job.job_client_id` + untouched `job.customer_id`).

`npm run verify`: **628/628, exit 0** (baseline 627 — strictly greater,
1 new test added). No ABI mismatch this run.

Direct query against a freshly migrated database (`tsx` script, deleted
after use — not committed):

```
Applied migrations (last 3): [ '0014_purchase_order_grn.sql', '0015_job_technician.sql', '0016_job_client.sql' ]

-- sqlite_master row for job_client table --
[ { type: 'table', name: 'job_client', tbl_name: 'job_client' } ]

-- PRAGMA table_info(job_client) --
id (TEXT, pk=1, notnull=0), tenant_id (TEXT, notnull=1), name (TEXT, notnull=1),
phone (TEXT, notnull=0), phone_2 (TEXT, notnull=0), address (TEXT, notnull=0),
area (TEXT, notnull=0), landmark (TEXT, notnull=0), notes (TEXT, notnull=0),
created_at (TEXT, notnull=1)

-- job.job_client_id / job.customer_id columns --
customer_id (cid=3, TEXT, notnull=0) — unchanged, still present
job_client_id (cid=40, TEXT, notnull=0) — new

-- indexes on job_client --
sqlite_autoindex_job_client_1 (PK), idx_job_client_tenant, idx_job_client_name

-- table/view counts --
{ tableCount: 51, viewCount: 11 }
```

Matches OD-2's column list exactly, OD-3's nullable additive FK exactly,
and `job.customer_id` confirmed untouched. `git status --short` after this
task: only `0016_job_client.sql` (new) and `migration-runner.test.ts`
(modified) — no surprises.

### P15-2a — contracts, 2026-09-21

Files: new `packages/contracts/src/job/job-client.ts` (43 lines —
`CreateJobClientInput`/`SearchJobClientsInput`/`JobClientIdInput`/`JobClientDto`,
exact OD-2 column list); `packages/contracts/src/index.ts` barrel export
added (199 lines).

`npm run typecheck`: clean. `npm run verify`: **628/628, exit 0**
(unchanged — types-only, no new test expected).

### P15-2b — repository, 2026-09-21

Read first, per instruction: `packages/contracts/src/index.ts` (explicit
named-export barrel, confirmed a new contracts file needs its own export
block), `apps/server/src/ipc/handlers/job-diagnosis.handler.ts` (routes
through a `packages/core` service since it carries state-machine logic —
NOT the pattern used here) and `customer.handler.ts` (the actual pattern
followed: handler parses input, opens db, instantiates the Kysely
repository directly, calls its method, closes db in `finally` — no core
service wrapper, since job-client search/create/getById carry no domain
logic beyond Zod validation), `packages/db/src/index.ts` (also an
explicit named-export barrel, confirmed new repositories need their own
line).

Files: `packages/core/src/job/job-client.repository.port.ts` (40 lines —
`NewJobClientInput`/`JobClientRecord`/`JobClientSearchQuery`/
`JobClientRepositoryPort`, mirroring `party.repository.port.ts`'s shape);
`packages/db/src/repositories/job-client.repository.ts` (122 lines —
`KyselyJobClientRepository` implementing the port: `createJobClient`,
`getJobClientById`, `searchJobClients` matching name OR phone per OD-5);
`packages/db/src/repositories/job-client.repository.test.ts` (154 lines,
5 tests — exceeds the "at minimum 3" requirement: search by name, search
by phone, create→getById round-trip with all fields populated,
round-trip with every nullable field null, getById returns null for a
missing id); `packages/db/src/kysely-schema.ts` (+15 lines: `JobTable`
gained `jobClientId`, new `JobClientTable`, registered in `Database`);
barrel exports updated in `packages/core/src/index.ts` (+7) and
`packages/db/src/index.ts` (+1).

**Real bug found and fixed, not routed around:** the first test run
failed all 5 tests with `SqliteError: table job_client has no column
named phone2`. Root cause, confirmed by reading Kysely's own
`CamelCasePlugin` source (`node_modules/kysely/dist/cjs/plugin/camel-case/camel-case.js`):
its snake-case mapper only inserts an underscore before an _uppercase
letter_, never before a digit, unless the `underscoreBeforeDigits` option
is explicitly set (default `false`). `job_client.phone_2` (OD-2's exact
column name) is the first column in this entire schema with a
digit-after-underscore shape — every existing camelCase field name in
`kysely-schema.ts` was grepped for a digit before touching this, and none
exist, so the DB layer had never hit this gap before. Fixed at the root
in `packages/db/src/kysely-db.ts`: `new CamelCasePlugin({
underscoreBeforeDigits: true })` — Kysely's own documented option
(`foo12Bar => foo_12_bar` / `foo_12_bar => foo12Bar`), not a raw-SQL
workaround or a schema rename. This changes plugin behaviour globally
for every query in the app, so the full `npm run verify` was re-run
(not just the new test file) to confirm no other table was affected —
**633/633, exit 0**, no regressions, up from 628 (5 new tests).

`git status --short` after this task: only the expected new/modified
files — no surprises.

### P15-2c — handler + IPC wiring, 2026-09-21

Files: `apps/server/src/ipc/channels.ts` (+5 — `jobClient: { search, create,
getById }`); new `apps/server/src/ipc/handlers/job-client.handler.ts`
(63 lines — same direct-repository pattern as `customer.handler.ts`, no
core service wrapper); `apps/server/src/main.ts` (+2 — import +
`registerJobClientHandlers({ dbPath, tenantId })`, no `deviceCode` needed
since job-client writes carry no doc-number/device-code concern);
`apps/server/src/preload.ts` (+11 — `jobClient: { search, create, getById }`
block, typed exactly like `customer`'s); `apps/client/src/types/electron-api.d.ts`
(+8 — matching `readonly jobClient: {...}` interface block).

`npm run typecheck`: clean. `npm run verify`: **633/633, exit 0**
(unchanged — pure wiring, no new test expected). `npm run build
--workspace=@shop/client`: exit 0. `npm run build --workspace=@shop/server`:
exit 0 (main + preload + renderer bundles all built clean).

Line counts: `job-client.handler.ts` 63 lines (new, well under 300).
`preload.ts`/`electron-api.d.ts`/`channels.ts`/`main.ts` are pre-existing
large wiring files (519/600/158/208 lines) — diffs were +11/+8/+5/+2
lines respectively, no size regression introduced.

`git status --short`: only the expected new/modified files.

**P15-2 (contracts + repository + IPC) is now fully done.**

### P15-3 — link job creation to job_client, 2026-09-21

Read first, per instruction (READ-1/2/3): `job.service.ts` (transaction
boundary lives entirely in the repository, service is a thin field
pass-through, createJob calls exactly one repository method — no party
lookup or second repository call); `job.repository.ts`'s `createJob`
(exact current INSERT column list confirmed, `job_client_id` confirmed
NOT yet written); `CreateJobInput`'s exact post-P15-2 shape (no
`jobClientId`/`newClient` yet). Plan (PLAN-A/B/C) approved unchanged:
transaction extended in place in `KyselyJobRepository.createJob`, not a
new method; `customerId` untouched and independent of the new
`jobClientId`/`newClient` fields; `jobClient` LEFT JOIN added to both
`getJobQuery` and `listJobsQuery`, no alias conflict (confirmed by
reading both queries — neither used a `jobClient` alias before).

**Step 1 — contracts/port extension.** `CreateJobInput` (+`jobClientId`, +`newClient: CreateJobClientInput.nullable()`) and `NewJobInput`
(mirrored) extended; `job.service.ts`'s `createJob` passes both through
unchanged (2-line addition, same thin-pass-through pattern). Fixed 8
existing call sites across 3 files that broke on the new required
fields (`JobCreateForm.tsx`, `job.service.test.ts`, 6× in
`job.repository.test.ts`) — all set `jobClientId: null, newClient: null`
except `job.service.test.ts`'s "maps field-for-field" test, which was
given real values on both sides of its `toEqual` assertion to keep the
test meaningful.
`npm run verify`: **628/628, exit 0** (unchanged — types-only, no new
tests in this sub-step alone).

**Mid-step: `packages/contracts/src/job/job.ts` was already 310 lines
(over the 300-line convention) before this task touched it; the +8 line
addition made it 318.** Flagged to the user rather than silently
absorbed; user chose to split now rather than defer. Split into:
`job.ts` (191 lines — core lifecycle: JobStatus, CreateJobInput,
JobStatusTransitionInput, AssignTechnicianInput, JobIdInput,
TechnicianCustodyInput, JobSearchInput, JobDto, JobStatusHistoryDto,
UpdateJobDiagnosisInput, CancellationReason, CancelJobInput,
TechnicianAssignmentDto, UnassignTechnicianInput, JobSummaryDto),
`job-parts.ts` (44 lines — IssuePartsTo{Technician,Job}{Input,Result}),
`job-delivery.ts` (47 lines — RevenueType, DeliverJob*),
`internal-transfer.ts` (38 lines), `custody.ts` (25 lines — Custody
reconciliation). Barrel (`packages/contracts/src/index.ts`) updated to
export from all five files. `npm run typecheck`: clean — confirms no
code anywhere imports directly from `job/job.js`, bypassing the
`@shop/contracts` barrel. `npm run verify` after the split: **633/633,
exit 0**, unchanged from before splitting.

**Step 2 — createJob transaction extension.** New
`resolveJobClientId(trx, tenantId, jobClientId, newClient)` helper added
to `job-shared.ts` (not `KyselyJobClientRepository`, which opens its own
separate `db.transaction()` — the critical PLAN-A finding, confirmed
correct): when `newClient` is set, INSERTs a `jobClient` row on the
SAME `trx` the `job` INSERT runs on next, so a later failure in the job
INSERT rolls the client row back with it (one shared SQLite transaction,
no separate commit points). `job.repository.ts`'s `createJob` calls it
once, before the `job` INSERT, and writes the resolved id to
`job.job_client_id`.
`npm run typecheck`: clean. `npm run verify`: **633/633, exit 0**.

**Step 3 — LEFT JOIN + denormalized fields.** Added
`jobClientId`/`jobClientName`/`jobClientPhone` to `JobRecord` and
`JobSummaryRecord` (core port) and to `JobDto`/`JobSummaryDto`
(contracts). Since every `JobRecord`-producing function needed to supply
these three fields (TypeScript structural typing), added a second shared
helper, `resolveJobClientDisplay(qb, tenantId, jobClientId)` (same
lookup-after-write pattern as the pre-existing `resolveInvoiceDocNo`),
and wired it into **every** `toJobRecord(...)` call site, not just
`createJob` — found by grepping `toJobRecord(` across the whole `db`
package: `job.repository.ts` (createJob, updateJobStatus),
`job-technician.repository.ts` (assignTechnicianWrite),
`job-cancel.repository.ts`, `job-diagnosis.repository.ts`. The last two
were NOT part of the original plan but were a real bug caught before
shipping: `toJobRecord`'s new 4th parameter has a
`{ name: null, phone: null }` default, so leaving those two call sites
unchanged would have type-checked fine while silently returning
`jobClientName: null`/`jobClientPhone: null` on every cancel/diagnosis-update
response for a job that actually has a linked client. Fixed by adding
the same `resolveJobClientDisplay` call to both. `getJobQuery` and
`listJobsQuery` (`job-query.repository.ts`) instead get the join
directly (`jobClient.name as jobClientName`, `jobClient.phone as
jobClientPhone`) — no extra query needed since the JOIN already carries
the values.

Per instruction: after adding the `job.` prefix to every existing column
in `listJobsQuery` (required once a JOIN is introduced) and the new
join itself, ran `npm run verify` and specifically checked
`JobsPage.test.tsx` — **6/6 pass**, confirmed with actual test output
(Kysely's `as` alias / last-dot-segment result-key behavior held, not
assumed). Also had to fix 8 more pre-existing test fixtures across 4
files that construct `JobRecord`/`JobDto`/`JobSummaryDto`-shaped objects
directly (`job-history-events.test.ts`, `JobDeliveryModal.test.tsx`,
`JobsPage.test.tsx` ×5 via one shared `BASE_JOB` fixture,
`job.service.test.ts`'s `FakeJobRepository.job`) — all given
`jobClientId: null, jobClientName: null, jobClientPhone: null`.
`npm run typecheck`: clean. `npm run verify`: **633/633, exit 0**.

**Step 4 — end-to-end verification**, real SQLite database via a `tsx`
script (deleted after use, not committed):

```
1) createJob with newClient (name, phone, landmark):
   jobClientId: 01a0c522-12eb-761e-a5d6-e17796ad4a9a
   jobClientName: Fazal Rabbi
   jobClientPhone: 03119876543

2) job_client row (direct query):
   { id: '...e4a9a', tenant_id: '...0001', name: 'Fazal Rabbi',
     phone: '03119876543', phone_2: null,
     address: 'House 12, GT Road', area: 'Batkhela',
     landmark: 'next to blue mosque', notes: null,
     created_at: '2026-09-21T18:02:19.755Z' }

3) job row (direct query):
   { id: '...61d683', job_client_id: '...e4a9a', customer_id: null }
   job.job_client_id matches created job_client.id: true

4) job_client count before second job (existing client): 1
   job_client count after second job (existing client):  1
   count unchanged: true
   second job's jobClientId === first job's: true

5) in-shop job, jobClientId: null, newClient: null (direct query):
   { id: '...053210', job_client_id: null }
   job.job_client_id IS NULL: true
```

Every assertion holds against real output — new-client creation writes
both rows in one transaction with the correct link, reusing an existing
client by id never creates a duplicate `job_client` row, and a walk-in
job with no client correctly leaves `job_client_id` NULL.

`git status --short` after Step 4: only the expected new/modified files
— no surprises, scratch verification script deleted before this check.

**Known debt, flagged not fixed:** `job.repository.ts` is now **299/300
lines** — one line under the ceiling, essentially no headroom left.
Whoever builds P15-6 (awaiting-parts status transition) or any future
`createJob`/`updateJobStatus` change to this file should check `wc -l`
FIRST — it will very likely need a split before that work can land.

### P15-4 — job intake form redesign, 2026-09-21

Read first, per instruction (READ-1/2/3): `CustomerPicker.tsx` in full —
important correction found and reported before writing code: the
component itself carries NO name+phone dedup logic (its own doc comment
says so) and does NOT lock the Phone field itself — both live in
`JobCreateForm.tsx` (`findExactDuplicate`, and the separate Phone
`TextInput`'s `disabled={selectedCustomer !== null}`). The "Create new
customer" dropdown row is purely informational (`onMouseDown` just
closes the dropdown, no creation call). `JobCreateForm.tsx` in
full — `jobType` was a hardcoded `'in_shop'` literal, never rendered as
a field anywhere. `JobCreateForm.test.tsx` in full — 3 tests, mock stub
had no `ipc.jobClient.*` entry yet.

**STEP A.** New `JobClientPicker.tsx` (149 lines) — copied from
`CustomerPicker.tsx`, calling `jobClient:search`/`JobClientDto` instead
of `customer:search`/`CustomerDto`; badge text "Using existing client",
"Not this client? Change", "Create new client:". `JobCreateForm.tsx`
swapped to use it: `selectedCustomer`→`selectedClient`,
`findExactDuplicate` now calls `ipc.jobClient.search`, and (since
continuing to write a `job_client.id` into `customerId` would be a real
semantic/FK bug, not just a naming mismatch) the resolution logic was
changed at the same time to build `jobClientId`/`newClient` directly
instead of ever calling `ipc.customer.create` — `customerId` sent as
`null` from this point on, never a stale job-client id. Grepped
`CustomerPicker` across `apps/` before deleting — zero real importers
(only doc-comment mentions and a stale prebuilt `dist/renderer` bundle,
not source) — then deleted `CustomerPicker.tsx`.
`npm run typecheck`: clean. `npm run verify`: **633/633, exit 0.** Noted
(not fixed yet, since STEP C owns the test file): the 3 existing
`JobCreateForm.test.tsx` tests passed despite no `ipc.jobClient.*` stub
in the mock — timing-fragile (debounce never fired within those tests'
execution window), not a real guarantee; fixed properly in STEP C's
mock update.

**STEP B.** Job Type toggle (In shop/On-site, `In shop` default) and a
conditional Address/Area/Landmark group added. `JobCreateForm.tsx`
crossed 300 lines twice while adding this UI (355, then 326 after a
first extraction) — both times caught by `wc -l` before moving on, not
after; fixed by extracting three new presentational components rather
than compressing the markup: `JobAddressFields.tsx` (56 lines),
`JobTypeToggle.tsx` (46 lines, same active/inactive pill pattern as the
existing `PaymentMethodToggle.tsx` — reused the convention, didn't
invent a new one), `JobApplianceFields.tsx` (97 lines — Appliance
type/Brand/Brand-other, previously inline). `JobCreateForm.tsx` settled
at **269 lines**. Address auto-fill (`handleSelectClient`) populates
state unconditionally from the selected client's record regardless of
the current `jobType` value — since the group is simply hidden while
`in_shop`, this is behaviourally identical to a `jobType`-gated effect
without the extra effect; documented inline. Submit shape exactly as
specified: existing client → `jobClientId` set, `newClient: null`; new
client → `jobClientId: null`, `newClient` with address/area/landmark
only when `jobType === 'on_site'` (else `null`); no client → both null.
`customerId` always `null`; the field itself untouched in the Zod
schema. `npm run typecheck`: clean. `npm run verify`: **633/633, exit
0** (unchanged from STEP A — no test changes yet).

**STEP C.** `JobCreateForm.test.tsx` mock gained a real `jobClient: {
search, create }` stub. Existing 3 tests unchanged (still pass). Added
4 new tests: defaults to "In shop" with no address group rendered;
clicking "On-site" reveals Address/Area/Landmark; clicking back to "In
shop" hides them again; selecting an existing client from the
`JobClientPicker` dropdown (real debounced search via the mock,
`fireEvent.mouseDown` on the dropdown row — matches the component's own
`onMouseDown` handler) then switching to on-site shows the
auto-filled Address/Area/Landmark values. Ran the test file in
isolation first (7/7 pass) before the full suite. `npm run typecheck`:
clean. `npm run verify`: **637/637, exit 0** — strictly greater than
STEP B's 633.

**STEP D — end-to-end verification**, real SQLite database via a `tsx`
script (deleted after use, not committed), calling
`KyselyJobRepository.createJob` with the exact input shapes
`JobCreateForm.tsx`'s `handleCreate` now builds for each case:

```
1) On-site job with NEW client, including landmark — job_client row:
   { id: '...53716', tenant_id: '...0001', name: 'Fazal Rabbi',
     phone: '03119876543', phone_2: null,
     address: 'House 12, GT Road', area: 'Batkhela',
     landmark: 'next to blue mosque', notes: null,
     created_at: '2026-09-21T18:18:59.114Z' }

2) job_client count before second job (same client, in-shop): 1
   job_client count after:                                     1
   unchanged: true
   second job's jobClientId matches the first: true

3) Job with no client — job row:
   { id: '...51937', job_client_id: null, customer_id: null }
```

`grep -rn "CustomerPicker" apps/` (source files only, excluding the
stale `dist/` bundle): only 4 historical doc-comment mentions across
`JobClientPicker.tsx`/`JobCreateForm.tsx` — zero component/import
references. `job.repository.ts` confirmed untouched throughout P15-4:
still exactly **299 lines**, same as P15-3 left it (`git diff --stat`
for this file shows only the P15-3-era +13/-2, nothing added in this
task). Final full `npm run verify` re-run after cleanup: **637/637,
exit 0**. `git status --short`: only the expected files.

### P15-5 — CLIENT section, jobs list, awaiting-parts reason, 2026-09-21

Read first (READ-1–4): `JobPropertyPanel.tsx` in full (112 lines) —
correction found before coding: there is no `job.customerName` field on
`JobDto` at all; the CLIENT section actually read
`job.customerNameAdhoc`/`job.customerId` plus a separately-resolved
`customerName` **prop** fetched by `JobDetailPage.tsx`. No
popover/tooltip import existed. Grepped `apps/client/src/` for
"popover"/"tooltip" — found one real hit, `sales/CustomerPopover.tsx`
(a bespoke floating search-and-select widget, not a read-only detail
display; not reusable here) — and no generic `Popover`/`Tooltip`
primitive in `packages/ui` at all, so built the inline-expansion
fallback per instruction, not a new floating pattern. Confirmed
`listJobStatusHistoryQuery` still selects only
`['fromStatus','toStatus','changedAt']` — `note` still absent, unchanged
since P15-2/P15-3. Confirmed `JobStatusHistoryRecord`/`JobStatusHistoryDto`
both `{fromStatus, toStatus, changedAt}`, no `note`. Extra finding not
in the read list but needed for STEP D: the status badge lives in
`JobDetailHeader.tsx` (confirmed — a plain `{status}` span, not routed
through `STATUS_LABELS`), while status-history rows are fetched
independently inside the sibling `JobActivitySection.tsx` — `JobDetailPage.tsx`
holds none of that data itself, so STEP D adds its own small duplicate
fetch there rather than restructuring `JobActivitySection`.

**Two scope questions flagged and confirmed with the user before
coding, not decided unilaterally:**

1. STEP B's CLIENT section reads only `jobClientId` going forward, so
   any job created before this session (customerId set, jobClientId
   null) would show "No client recorded." — confirmed exactly as
   specified is correct (no real shop data exists yet pre-go-live).
2. `onNavigateToCustomer`/`pendingCustomerId` (App.tsx → JobsPage.tsx →
   JobDetailPage.tsx → JobPropertyPanel.tsx) existed solely to serve the
   CLIENT section's retired "click name → jump to Customers tab" link —
   confirmed removing it fully end-to-end, not leaving it wired-but-unused
   (which would have failed this repo's strict `no-unused-vars` lint
   rule at the JobDetailPage layer regardless).

**STEP A.** `note: string | null` added to `JobStatusHistoryRecord`
(core), `JobStatusHistoryDto` (contracts), and
`listJobStatusHistoryQuery`'s SELECT (db) — read-only widening, no write
path touched. Fixed 5 fixtures in `job-history-events.test.ts` missing
the new required field. `npm run typecheck`: clean. `npm run verify`:
**637/637, exit 0.**

**STEP B.** New `JobClientSection.tsx` (105 lines) — lazy-fetches
`jobClient:getById` only on click (not on job-card load), shows Name/
Phone|Phone 2/Address/Area/Landmark/Notes with null fields hidden
entirely, a "Close" link collapses it; "No client recorded." when
`jobClientId` is null. Wired into `JobPropertyPanel.tsx` (112→83 lines).
Removed the now-dead `onNavigateToCustomer`/`pendingCustomerId`/
`customerName` chain end-to-end per the confirmed decision:
`App.tsx` (79 lines, was ~104), `JobsPage.tsx` (props interface),
`JobDetailPage.tsx` (257 lines, was 279 — also dropped the dead
`ipc.customer.get` fetch), `JobsPage.test.tsx` (6 render calls). `npm
run typecheck`: clean. `npm run lint`: clean. `npm run build
--workspace=@shop/client`: exit 0. Full `npm run verify` also run (real
behavioural change, not just refactor): **637/637, exit 0**, no
regressions.

**STEP C.** `JobsTableRow.tsx`'s CLIENT column switched from a
`customerLabel` prop to `job.jobClientName ?? '—'` directly. This let
`JobsPage.tsx` delete its entire `customerNames` state + the
per-row `ipc.customer.get` fetch loop in `loadJobs()` — `jobClientName`
is already denormalized onto `JobSummaryDto` by P15-3, no fetch needed
at all now. `matchesSearch` updated to match `jobClientName` too. `npm
run typecheck`/`lint`: clean. `npm run build --workspace=@shop/client`:
exit 0. Full `npm run verify`: **637/637, exit 0.**

**STEP D.** `JobDetailPage.tsx` gained a small independent
`awaitingPartsReason` fetch (`ipc.job.listStatusHistory(job.id)`,
filtered for the most recent `toStatus==='awaiting_parts' && note!==null`
row, `.at(-1)`), gated on `job.status === 'awaiting_parts'` so it's a
no-op otherwise. Passed to `JobDetailHeader.tsx` as a new prop, rendered
as "Reason: [note]" in small muted text directly below the status pill
(wrapped the pill in its own `<div>` so the reason line sits under just
the badge, not the whole header-right flex row). `npm run typecheck`/
`lint`: clean. `npm run build --workspace=@shop/client`: exit 0.

**Final full verify after all four steps: 637/637, exit 0** (≥637,
satisfied — no new tests were required by this task's steps, all four
were read-only widenings, UI rewiring, or dead-code removal covered by
existing test coverage plus the fresh `npm run build` checks).

Line counts, every touched file, all ≤300: `JobPropertyPanel.tsx` 83,
`JobClientSection.tsx` 105 (new), `JobDetailPage.tsx` 288,
`JobDetailHeader.tsx` 159, `JobsPage.tsx` 263, `JobsTableRow.tsx` 100,
`App.tsx` 79, `job.repository.port.ts` 208, `job.ts` (contracts) 198,
`job-query.repository.ts` 250. **`job.repository.ts` confirmed
untouched throughout P15-5 — still exactly 299 lines**, per your
explicit instruction not to add to it without extracting first.

`git status --short` at every checkpoint: only the expected files, no
surprises.

### P15-6 — awaiting parts flow, 2026-09-22

Grep confirmation requested at session start: `grep -rn "ipc\.customer\.get" apps/client/src/pages/jobs/` — zero
matches, confirmed P15-5's STEP C fully removed that fetch loop.

**Required pre-code check** (per instruction, before writing any code):
read `job-status-machine.ts` in full — `ALLOWED_TRANSITIONS.received`
(`['diagnosed','in_progress','cancelled']`) and `.in_progress`
(`['ready','diagnosed','cancelled']`) did **not** list
`awaiting_parts`; `.diagnosed` already did. Read `job.handler.ts`'s
`transitionStatus` handler → `job.service.ts` → `job.repository.ts`'s
`updateJobStatus`: **no `canTransition`/`ALLOWED_TRANSITIONS` guard
exists anywhere in the write path** — it unconditionally inserts
whatever `fromStatus`/`toStatus` it's given. Stated explicitly before
building: leaving `received`/`in_progress` out of the map would mean
**silent acceptance** of an invalid transition (not rejection), making
the state-machine fix non-optional, not cosmetic.
`partIssuedTransitionTarget('awaiting_parts')` confirmed still returns
`null` (guard only checked `!== 'received'`) — unchanged since P14-3, no
P15-3/4/5 task touched this file.

**STEP B pre-check** (read-only, no code): `JobStatusTransitionInput`
already has `note: z.string().trim().min(1).nullable()`; `job.service.ts`
passes it through to `repo.updateJobStatus`, which writes it directly
into the `job_status_history` INSERT — confirmed still true (P15-3's
bonus finding, unchanged). No handler/service/repository changes needed
for the dialog.

**STEP A.** `ALLOWED_TRANSITIONS.received`/`.in_progress` gained
`'awaiting_parts'`. `partIssuedTransitionTarget` widened to also fire
from `'awaiting_parts'` (returns `'in_progress'`). New
`canMarkAwaitingParts(status)` helper (`received`/`diagnosed`/`in_progress`
only). New `job-status-machine.test.ts` (55 lines, 7 tests — no test
file existed before). `npm run typecheck`: clean. `npm run verify`:
**644/644, exit 0** (>637, up from 637 with 7 new tests).

**STEP C.** New `AwaitingPartsModal.tsx` (94 lines) — same Modal +
Cancel/Confirm pattern as `CancelJobModal.tsx` (read in full first),
required textarea (≥10 chars after trim), calls
`job:transitionStatus({ jobId, toStatus: 'awaiting_parts', note })`.
"Awaiting parts…" button added to `JobDetailHeader.tsx` next to the
status pill (confirmed that's where the badge lives, unchanged since
P15-5), gated on `canMarkAwaitingParts(status)`. **Spec discrepancy
found and flagged, not silently worked around**: `Button` only has
`'default'`/`'large'` sizes (no `'small'`) — used `default`, the
smallest real option, matching G5's established precedent from Phase
14 for handling an incorrect size assumption in a task brief.
`JobDetailPage.tsx` wired the modal's open state + `onConfirmed`
callback, mirroring `CancelJobModal`'s exact wiring shape.
`npm run typecheck`/`lint`: clean (one real lint error fixed along the
way — `@typescript-eslint/restrict-template-expressions` rejected a
`const MIN_REASON_LENGTH = 10` literal-type number interpolated into a
template string; fixed with `.toString()`, not a suppression).
`npm run build --workspace=@shop/client`: exit 0.

**Mid-step: `JobDetailPage.tsx` crossed 300 lines (306) adding the
button/modal wiring.** Caught by `wc -l` immediately, not after moving
on. Fixed by extracting the `awaitingPartsReason` fetch effect (added in
P15-5) into its own hook, `useAwaitingPartsReason.ts` (40 lines) —
`JobDetailPage.tsx` settled at 278 lines. Full `npm run verify` after
the fix: **644/644, exit 0**, no regressions.

**STEP D — end-to-end verification**, real SQLite database via a `tsx`
script (deleted after use, not committed) calling
`KyselyJobRepository.updateJobStatus` with the exact shapes
`AwaitingPartsModal.tsx`/`JobDetailPage.tsx`'s auto-transition now use:

```
job created: status = received

job_status_history after marking awaiting_parts:
  { from_status: null,      to_status: 'received',       note: null }
  { from_status: 'received', to_status: 'awaiting_parts', note: 'Ordered compressor from Lahore, will arrive Friday.' }

job_status_history after simulated part issue (auto-advance):
  { from_status: null,           to_status: 'received',       note: null }
  { from_status: 'received',     to_status: 'awaiting_parts', note: 'Ordered compressor...' }
  { from_status: 'awaiting_parts', to_status: 'in_progress',  note: null }

final derived job.status: in_progress
```

Full received → awaiting_parts (with reason persisted) → in_progress
sequence confirmed against real output, matching OD-6/OD-7 exactly.

**Final full verify after all four steps: 644/644, exit 0** — strictly
greater than 637, as required.

Line counts, every touched/new file, all ≤300: `job-status-machine.ts`
101, `job-status-machine.test.ts` 55 (new), `AwaitingPartsModal.tsx` 94
(new), `useAwaitingPartsReason.ts` 40 (new), `JobDetailHeader.tsx` 168,
`JobDetailPage.tsx` 278. **`job.repository.ts` confirmed untouched
throughout P15-6 — still exactly 299 lines**, per the standing
instruction not to add to it without extracting first.

`git status --short` at every checkpoint: only the expected files, no
surprises.

**Phase 15 is now fully COMPLETE — P15-1 through P15-6, all six tasks
done and independently verified against a real SQLite database, not
simulated.** `PROJECT.md` BUG-JOBCLIENT-1 closed this session.

**Known debt noted, not fixed (out of scope for P15-1):**
`migration-runner.test.ts` is 555 lines, over the 300-line convention —
already well past 300 before this task's edits (pre-existing debt, not
introduced here). Flagged for a future cleanup pass, not refactored now
per "one thing at a time."
