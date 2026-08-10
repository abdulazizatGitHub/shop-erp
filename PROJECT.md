# PROJECT.md — Living Status

> Single source of truth for **where the project is right now**.
> Updated at the end of every session. Read at the start of every session.

**Last updated:** 2026-08-10
**Current phase:** Phase 0 — Foundation & Environment
**Phase status:** IN PROGRESS — P0-1 through P0-8 done and verified.
**Next milestone:** P0-9 (Electron shell + IPC)

---

## 1. Snapshot

| Item            | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Client          | AC / fridge / oven repair + spare parts shop, Malakand, KP              |
| Go-live target  | 2026-08-31 (billing + udhaar only)                                      |
| Hardware        | NOT YET PURCHASED — spec issued, awaiting confirmation                  |
| Data collection | Templates issued, awaiting rough data from client                       |
| Repo            | Initialised 2026-08-09. 3 commits on `master`. Not yet pushed anywhere. |

---

## 2. Phase status

| Phase | Name                         | Status      | Completed              |
| ----- | ---------------------------- | ----------- | ---------------------- |
| 0     | Foundation & Environment     | IN PROGRESS | P0-1–P0-8 (2026-08-10) |
| 1     | Item master + import         | NOT STARTED | —                      |
| 2     | Purchases + suppliers        | NOT STARTED | —                      |
| 3     | Counter sale + udhaar        | NOT STARTED | —                      |
| 4     | Printing + reports           | NOT STARTED | —                      |
| 5     | Deploy + parallel run        | NOT STARTED | —                      |
| 6     | Repair jobs (two-unit split) | NOT STARTED | —                      |
| 7     | Staff, wages, expenses       | NOT STARTED | —                      |
| 8     | Bug-fix & hardening          | NOT STARTED | —                      |

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
Status: FIXED — commit (P0-7 session), 2026-08-10. `packages/db/src/migrate.ts`
and `reset.ts` created and verified — see P0-7 exit criteria below.

### BUG-2: Design docs described `apps/desktop`/`apps/renderer`; real code is `apps/client`/`apps/server`/`packages/contracts` — RESOLVED, was CRITICAL

Found in: Phase 0, 2026-08-09. Escalated 2026-08-10. Resolved 2026-08-10.
Description: `docs/SYSTEM_DESIGN.md`, `docs/ARCHITECTURE.md`, and
`docs/CODING_STANDARDS.md` referenced `apps/desktop`/`apps/renderer`; the
owner had authored the scaffold under those names and did not recognise
`apps/client`/`apps/server`/`packages/contracts` as their own work. Raised as
a possible unapproved architecture change (web client/server vs. Electron
main/renderer).
Investigation: raw `ls`, `cat package.json` (×3), `git log --oneline`,
`git log --diff-filter=R --name-status --oneline` (empty — zero renames),
`git show 787c8cd --stat` (the repo's root commit already contained
`apps/client`/`apps/server`/`packages/contracts` as initial content — i.e.
predates `git init` in this session). Then, to determine which architecture
the code actually implements: `grep` across `apps/` and `packages/` for
`BrowserWindow|contextBridge|ipcMain|ipcRenderer` and separately for
`express|fastify|http.createServer|listen(` — both zero matches. Read
`apps/server/package.json` (electron, electron-vite, electron-builder as
devDependencies, `electron-builder --win` package script),
`apps/client/package.json` (react + vite, no HTTP client), and
`packages/contracts/package.json` (zod + `@shop/shared` only, no code files
yet).
Resolution: **the code was correct, the docs were stale.** No HTTP
server/port exists or was ever wired up; `apps/server`'s only plausible role,
given its devDependencies, is the Electron main process, packaged as a
desktop app. Owner confirmed this reading and decided: docs change, code
does not. See ADR-0011.
Fix applied: `docs/SYSTEM_DESIGN.md` §1/§2/§5, `docs/ARCHITECTURE.md`
(layers diagram + module map), `docs/CODING_STANDARDS.md` §7 updated to
`apps/client`/`apps/server`. `CLAUDE.md`, `README.md`, and
`docs/PROJECT_STRUCTURE.md` already used the correct names and needed no
change. `eslint.config.js` boundary rules checked against the real paths —
already correct (`apps/client`, `apps/server`, `packages/core`, no stale
`apps/renderer`/`apps/desktop` patterns); enforcement proven with a
deliberate violating import (`apps/client` importing `@shop/db`), which
`no-restricted-imports` correctly rejected, then removed.
Status: RESOLVED — commits `a77fa18` (docs), ADR-0011 (decision record). No
code, directory, or package was renamed.

### BUG-3: `eslint.config.js` does not ignore the generated `coverage/` directory — LOW

Found in: Phase 0, 2026-08-09
Description: `.gitignore` excludes `coverage/`, but `eslint.config.js`'s
top-level `ignores` array (`['dist', 'out', 'release', 'node_modules',
'**/*.config.js', '**/*.config.ts']`) does not. Confirmed: after running
`npm run test:coverage`, `npm run lint` fails with 3 parsing errors on
vitest's generated `coverage/block-navigation.js`, `coverage/prettify.js`,
`coverage/sorter.js` ("was not found by the project service").
Impact: Any local run of `npm run verify` (or a pre-commit hook) fails if
`coverage/` exists on disk from a prior `test:coverage` run, even though
nothing real is wrong. CI is unaffected today only because its `Lint` step
runs before its `Test` step in `.github/workflows/ci.yml` — this is order
dependent and will break the day that order changes. Worked around this
session by deleting the generated `coverage/` directory before verifying.
Fix: Add `'coverage'` to the `ignores` array in `eslint.config.js`.
Status: FIXED — commit `faebaab`, 2026-08-10. Verified: regenerated
`coverage/` via `npm run test:coverage`, then `npm run lint` exited 0 with
it present on disk.

### BUG-4: No `.gitattributes`; this machine's system-wide Git config (`core.autocrlf=true`) fights Prettier's `endOfLine: "lf"` — MEDIUM

Found in: Phase 0, 2026-08-09
Description: Confirmed via `git config --list --show-origin`: `core.autocrlf=true`
is set at `C:/Program Files/Git/etc/gitconfig` (system-wide, not repo-local).
The repo has no `.gitattributes` to override this per-repo. Result: `git
checkout -- README.md` re-materialised the file with CRLF line endings even
though `git diff` showed no content change against HEAD; `npm run
format:check` then failed on a file nobody had actually edited. Confirmed the
file had literal `\r\n` bytes via a direct Node buffer read.
Impact: On any Windows machine with the common `core.autocrlf=true` default
(this dev machine, and the client's shop PC is Windows per the deployment
target in `docs/SYSTEM_DESIGN.md` §9), a fresh `git clone`, `git checkout`,
or branch switch can silently reintroduce CRLF into every tracked text file,
breaking `format:check`/`lint` for reasons that look unrelated to whatever
the developer actually changed. `git diff` will not show it, which makes it
confusing to debug — as it was here.
Fix: Add a `.gitattributes` file pinning line endings, e.g. `* text=auto
eol=lf`, so the repo's line-ending policy doesn't depend on each
contributor's global Git config.
Status: FIXED — commit `3223b97`, 2026-08-10. `git add --renormalize .`
found nothing to change (blobs were already LF; the risk was checkout-time,
not storage-time). Hook scripts confirmed LF at the byte level. Re-ran the
bad-commit-message test after renormalizing: `pre-commit` and `commit-msg`
both fired exactly as before.

### BUG-5: `eslint.config.js` has no boundary-enforcement block for `packages/db` — LOW

Found in: Phase 0, 2026-08-10, while building the P0-7 migration runner.
Description: `shared`, `contracts`, `core`, `ui`, `apps/client`, and
`apps/server` each have a `no-restricted-imports` block in
`eslint.config.js`. `packages/db` does not — confirmed via
`grep -n "packages/db" eslint.config.js`, zero matches. Per
`docs/PROJECT_STRUCTURE.md` §2, `db` should be forbidden from importing
`core`, `electron`, and `react`.
Impact: Nothing today — the code written in `packages/db` this session
(`migration-runner.ts`, `migrate.ts`, `reset.ts`) only imports `node:*`
builtins and `better-sqlite3`, so the missing rule caught nothing wrong. The
gap is real once `packages/db` code starts importing from other workspace
packages.
Fix: Add a `packages/db` block to `eslint.config.js` mirroring the existing
five, forbidding `@shop/core`, `electron`, `react`.
Status: UNFIXED — found mid-P0-7, documented rather than fixed to keep
moving per this session's explicit instruction (finish Phase 0; don't let
incidental findings become detours).

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

| #   | Question                                                                                   | Blocks              | Asked      | Answer                               |
| --- | ------------------------------------------------------------------------------------------ | ------------------- | ---------- | ------------------------------------ |
| Q1  | Gas sold by whole cylinder, or by weight from a cylinder?                                  | Item UoM conversion | 2026-08-08 | OPEN                                 |
| Q2  | Empty cylinders returnable / held on deposit? Who owns them?                               | Container tracking  | 2026-08-08 | OPEN                                 |
| Q3  | Wholesale price: fixed amount / % off retail / negotiated?                                 | Pricing engine      | 2026-08-08 | OPEN                                 |
| Q4  | Which items genuinely need serial tracking?                                                | Billing speed       | 2026-08-08 | OPEN                                 |
| Q5  | Fridge warranty work — who pays for parts?                                                 | Payer model         | 2026-08-08 | OPEN                                 |
| Q6  | Approximate SKU count (300–500 assumed)                                                    | Import effort       | 2026-08-08 | ~300–500                             |
| Q7  | Thermal printer model                                                                      | Print driver        | 2026-08-08 | OPEN                                 |
| Q8  | PC specification                                                                           | Electron perf       | 2026-08-08 | OPEN                                 |
| Q9  | Should Repair carry a cost of goods for parts consumed (internal transfer price)?          | Unit P&L shape      | 2026-08-09 | OPEN                                 |
| Q10 | Allocation method per expense category (rent, electricity, bike fuel)                      | Overhead reporting  | 2026-08-09 | OPEN                                 |
| Q11 | Expected table count after migrations 0001–0003 apply (P0-8 exit criterion needs a number) | P0-8 verification   | 2026-08-09 | **42 tables, 11 views** (2026-08-10) |

### P0-8 baseline (derived, not assumed)

Applied all three migrations to a fresh SQLite file via
`packages/db/src/migrate.ts`, then queried `sqlite_master` directly:

- **42 tables**: `app_user`, `attendance`, `audit_log`, `brand`,
  `business_unit`, `cash_session`, `category`, `contract_claim`,
  `contract_claim_job`, `custody_reconciliation`, `document_sequence`,
  `expense`, `expense_category`, `internal_transfer`,
  `internal_transfer_line`, `item`, `item_barcode`, `item_price`,
  `item_serial`, `job`, `job_part`, `job_status_history`, `party`,
  `party_ledger`, `payment`, `payment_allocation`, `price_level`, `purchase`,
  `purchase_line`, `sale`, `sale_line`, `schema_migration`,
  `service_charge`, `service_contract`, `setting`, `stock_balance_cache`,
  `stock_movement`, `sync_outbox`, `tenant`, `uom`,
  `user_permission_override`, `warehouse`
- **11 views**: `v_daily_sales`, `v_job_split`, `v_overhead_pool`,
  `v_owner_drawings`, `v_party_balance`, `v_stock_on_hand`,
  `v_technician_custody`, `v_unit_direct_expense`, `v_unit_direct_margin`,
  `v_unit_pl`, `v_unit_revenue`
- All 11 views execute without error on an empty database (asserted in
  `packages/db/src/migration-runner.test.ts`).
- Pragmas confirmed on a real connection via `openDatabase()`:
  `journal_mode=wal`, `foreign_keys=1`, `synchronous=2` (FULL),
  `busy_timeout=5000`.

Matches the owner's independently-derived 42/11 exactly. Codified as a
regression test, not just a one-time manual check — see
`migration-runner.test.ts` "applies exactly 42 tables and 11 views".

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
| 0011 | `client`/`server`/`contracts` naming supersedes `desktop`/`renderer` in docs     | 2026-08-10 |

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
