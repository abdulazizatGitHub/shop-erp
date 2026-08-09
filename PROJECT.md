# PROJECT.md — Living Status

> Single source of truth for **where the project is right now**.
> Updated at the end of every session. Read at the start of every session.

**Last updated:** 2026-08-08
**Current phase:** Phase 0 — Foundation & Environment
**Phase status:** NOT STARTED
**Next milestone:** Phase 1 kick-off

---

## 1. Snapshot

| Item            | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| Client          | AC / fridge / oven repair + spare parts shop, Malakand, KP |
| Go-live target  | 2026-08-31 (billing + udhaar only)                         |
| Hardware        | NOT YET PURCHASED — spec issued, awaiting confirmation     |
| Data collection | Templates issued, awaiting rough data from client          |
| Repo            | Not yet initialised                                        |

---

## 2. Phase status

| Phase | Name                         | Status      | Completed |
| ----- | ---------------------------- | ----------- | --------- |
| 0     | Foundation & Environment     | NOT STARTED | —         |
| 1     | Item master + import         | NOT STARTED | —         |
| 2     | Purchases + suppliers        | NOT STARTED | —         |
| 3     | Counter sale + udhaar        | NOT STARTED | —         |
| 4     | Printing + reports           | NOT STARTED | —         |
| 5     | Deploy + parallel run        | NOT STARTED | —         |
| 6     | Repair jobs (two-unit split) | NOT STARTED | —         |
| 7     | Staff, wages, expenses       | NOT STARTED | —         |
| 8     | Bug-fix & hardening          | NOT STARTED | —         |

---

## 3. Known bugs

### BUG-1: `db:migrate` / `db:reset` scripts reference files that don't exist yet — LOW

Found in: Phase 0, 2026-08-09
Description: Root `package.json` scripts `db:migrate` and `db:reset` run `tsx`
against `packages/db/src/migrate.ts` and `packages/db/src/reset.ts`. Neither
file exists (confirmed: `ls` on both returns "No such file or directory").
Impact: `npm run db:migrate` / `npm run db:reset` fail immediately. No
impact on P0-1 through P0-6, which don't call them.
Fix: Create both files as part of P0-7 (migration runner).
Status: UNFIXED — waiting for P0-7.

### BUG-2: `docs/SYSTEM_DESIGN.md` names `apps/desktop`; real directories are `apps/server` and `apps/client` — LOW

Found in: Phase 0, 2026-08-09
Description: `docs/SYSTEM_DESIGN.md` §2 and §5 reference `apps/desktop/src/ipc`
and `apps/desktop/src/preload.ts`. Confirmed on disk: `apps/desktop` does not
exist (`ls` returns "No such file or directory"); the real app workspaces are
`apps/server` (Electron main / backend) and `apps/client` (renderer). Both
`package.json` (`@shop/server`) and `eslint.config.js` already use the real
names consistently — only the design doc is stale.
Impact: Anyone following `SYSTEM_DESIGN.md` literally will look in the
wrong directory for the IPC boundary and preload script.
Fix: Update `SYSTEM_DESIGN.md` §2 and §5 to say `apps/server` /
`apps/client` in place of `apps/desktop`.
Status: UNFIXED — waiting for a documentation cleanup pass (out of scope
for the P0-1–P0-6 subtasks this session).

<!--
### BUG-1: [Title] — [CRITICAL/HIGH/MEDIUM/LOW]
Found in:    Phase [X], [YYYY-MM-DD]
Description:
Impact:
Fix:
Status:      UNFIXED — waiting for [phase / migration / decision]
-->

---

## 4. Open questions (blocking design — do NOT invent answers)

| #   | Question                                                                                   | Blocks              | Asked      | Answer   |
| --- | ------------------------------------------------------------------------------------------ | ------------------- | ---------- | -------- |
| Q1  | Gas sold by whole cylinder, or by weight from a cylinder?                                  | Item UoM conversion | 2026-08-08 | OPEN     |
| Q2  | Empty cylinders returnable / held on deposit? Who owns them?                               | Container tracking  | 2026-08-08 | OPEN     |
| Q3  | Wholesale price: fixed amount / % off retail / negotiated?                                 | Pricing engine      | 2026-08-08 | OPEN     |
| Q4  | Which items genuinely need serial tracking?                                                | Billing speed       | 2026-08-08 | OPEN     |
| Q5  | Fridge warranty work — who pays for parts?                                                 | Payer model         | 2026-08-08 | OPEN     |
| Q6  | Approximate SKU count (300–500 assumed)                                                    | Import effort       | 2026-08-08 | ~300–500 |
| Q7  | Thermal printer model                                                                      | Print driver        | 2026-08-08 | OPEN     |
| Q8  | PC specification                                                                           | Electron perf       | 2026-08-08 | OPEN     |
| Q9  | Should Repair carry a cost of goods for parts consumed (internal transfer price)?          | Unit P&L shape      | 2026-08-09 | OPEN     |
| Q10 | Allocation method per expense category (rent, electricity, bike fuel)                      | Overhead reporting  | 2026-08-09 | OPEN     |
| Q11 | Expected table count after migrations 0001–0003 apply (P0-8 exit criterion needs a number) | P0-8 verification   | 2026-08-09 | OPEN     |

---

## 5. Decisions taken (full ADRs in `docs/decisions/`)

| ADR  | Decision                                                                         | Date       |
| ---- | -------------------------------------------------------------------------------- | ---------- |
| 0001 | TypeScript everywhere; no Python                                                 | 2026-08-08 |
| 0002 | SQLite locally; Postgres reserved for future cloud                               | 2026-08-08 |
| 0003 | Money as INTEGER paisa; quantity as INTEGER milli-units                          | 2026-08-08 |
| 0004 | Stock and ledger are append-only event tables                                    | 2026-08-08 |
| 0005 | Two business units separated by line-level tagging, not internal sales           | 2026-08-08 |
| 0006 | Technician custody modelled as a warehouse; shortages noted, never auto-deducted | 2026-08-08 |
| 0007 | Payer is per line, not per job (Dawlance pays labour, customer pays extra pipe)  | 2026-08-08 |
| 0008 | Flat item list; no product/variant matrix                                        | 2026-08-08 |
| 0009 | Permissions are code, not a metadata engine                                      | 2026-08-08 |
| 0010 | Peer business units + SHARED overhead pool, allocated at report time             | 2026-08-09 |

---

## 6. Risks

| #   | Risk                                                           | Severity | Mitigation                                                                       | Status   |
| --- | -------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- | -------- |
| R1  | Client data entry (300–500 items + stocktake) not done in time | CRITICAL | Templates issued early; named owner + date required                              | OPEN     |
| R2  | Hardware not purchased in time                                 | HIGH     | Spec issued 2026-08-08; chase weekly                                             | OPEN     |
| R3  | Deadline is ~3 weeks, not 1 month                              | HIGH     | Scope cut to billing + udhaar; jobs deferred to Phase 6                          | ACCEPTED |
| R4  | Power cuts causing DB corruption                               | HIGH     | SQLite WAL + `synchronous=FULL`; UPS in hardware spec; pull-plug test in Phase 5 | OPEN     |
| R5  | Thermal printing takes longer than expected                    | MEDIUM   | Full day budgeted in Phase 4; get model early                                    | OPEN     |
| R6  | Non-technical users abandon the system                         | HIGH     | Keyboard-driven UI, Urdu labels, parallel run with register                      | OPEN     |
| R7  | Scope creep back toward the generic platform                   | HIGH     | `CLAUDE.md` §10 forbidden list                                                   | OPEN     |

---

## 7. Session log

See `PROGRESS.md`.
