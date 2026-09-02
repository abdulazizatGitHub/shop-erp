# Phase 5 — Deploy + Parallel Run

**Status:** NOT STARTED
**Started:** —
**Completed:** —
**Branch:** main
**Last commit:** 2813ae3

---

## 1. Goal

The system is installed on the client's real machine, loaded with the
client's real data, and staff can complete a sale unaided. The shop
runs the software and the paper register side by side for at least two
weeks, with every day's totals reconciled, before the paper register
is retired. No new features. No new screens. No new IPC channels. No
new dependencies.

---

## 2. Scope

### In scope

- P5-1 — Install on the shop PC, smoke test, kill test (owner task;
  agent supports)
- P5-2 — Load real items, opening stock, opening customer/supplier
  balances (owner task; agent supports)
- P5-3 — Urdu staff cheat sheet (agent-built deliverable) + staff
  training (owner task; agent observes, fixes only what blocks a real
  transaction)
- P5-4 — Two-week parallel run with daily reconciliation (owner task;
  agent monitors, fixes transaction-blocking bugs within 24h)
- P5-5 — Backup/restore disaster-recovery drill on real hardware
  (owner task; agent supports)

### Explicitly out of scope

- Any new UI screen or component
- Any new IPC channel or handler
- Any schema change or new migration
- Any new npm dependency
- Repair jobs (Phase 6)
- Thermal/ESC-POS printing (no hardware yet — CF pending from Phase 4)
- FBR e-invoicing
- Discounts, returns, or any feature not yet built
- Weighted average cost (Phase 8 — see CF-3)
- Urdu translations inside the app UI itself (unscheduled; the cheat
  sheet is a standalone printable document, not an app change)

---

## 3. Carry-forwards

| ID   | Item                                                                                                                                                                                                     | Status entering Phase 5                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CF-1 | Phase 4.5 UI is the current interface — sidebar, POS two-panel, two-step modals, persisted purchase list, 5 report tabs, Settings, Customers                                                             | Live. Any bug found during parallel run that blocks a real transaction is fixed within 24h; cosmetic issues wait for Phase 8. |
| CF-2 | Shop name is a go-live blocker — Settings still defaults to placeholder "Shop ERP"                                                                                                                       | OPEN. Must be changed to the real business name and confirmed on a printed document before any real customer is billed.       |
| CF-3 | `item.avg_cost` is last-purchase cost, not weighted average                                                                                                                                              | Known, documented, deferred to Phase 8. No report in Phase 5 may present margin figures as accurate.                          |
| CF-4 | P4-0 smoke test was verified on the developer machine only, never the shop PC                                                                                                                            | OPEN. P5-1 must re-run it on the actual shop PC.                                                                              |
| CF-5 | P4-5b kill test: 8/10 runs completed on the actual shop PC, 2026-08-30 (confirmed by the owner to be the same machine as production). Final 2 runs waived by owner decision for Phase 4's own close-out. | OPEN. P5-1d closes the remaining 2 runs on that same machine.                                                                 |
| CF-6 | Repair jobs are Phase 6 — zero repair screens/IPC/schema in Phase 5                                                                                                                                      | Binding. If raised by the owner during the parallel run, log to PROJECT.md and point to Phase 6.                              |
| CF-7 | Feature backlog (discounts, returns, GRN/batch tracking, low-stock alerts, thermal printer, permissions, barcode, loyalty) is logged in PROJECT.md §2                                                    | Live list. Phase 5 adds nothing new to the app; new requests during the parallel run get appended to this list only.          |

---

## 4. Tasks

| ID        | Task                                                                                                                                                                                                                                                                                                          | Owner                       | Verification criteria                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P5-1a     | Install packaged app on the shop's real PC; confirm it launches without error                                                                                                                                                                                                                                 | OWNER (agent supports)      | App window opens on the shop PC; console/log shows no startup error.                                                                                                                                                                                                                                                  |
| P5-1b     | Confirm DB file location and UPS connection/test                                                                                                                                                                                                                                                              | OWNER                       | DB file confirmed present at the path `resolveDbPath()` actually uses when packaged (`%APPDATA%\ShopERP\...` per `main.ts` — verify against the real running app, not assumed from memory). UPS confirmed connected; a manual "unplug wall, PC stays up" check reported by the owner.                                 |
| P5-1c     | Smoke test on real shop PC: create 1 supplier, enter 1 purchase, complete 1 counter sale (CF-4)                                                                                                                                                                                                               | OWNER (agent supports)      | All three actions succeed with no error dialog; the resulting `party`, `purchase`, `sale` rows are confirmed queryable directly against the shop PC's real `.db` file (raw SQL query pasted, not "it looked right in the UI").                                                                                        |
| P5-1d     | Complete the 2 remaining power-cut runs on the shop PC (8/10 already done 2026-08-30 — closes 10/10 total across Phase 4 + Phase 5).                                                                                                                                                                          | OWNER (agent supports)      | 2 runs pasted, each showing `PRAGMA integrity_check` = `ok`. **If either run returns anything other than `ok`, STOP — do not proceed to P5-2, file a CRITICAL bug in PROJECT.md.**                                                                                                                                    |
| P5-2a-pre | **Header-match check (AGENT, do this first).** For each of the 4 import templates generated by the app's `downloadCsv()` calls, compare the template's column headers against the header-matching logic in the corresponding import handler (`packages/core/src/import/csv.ts` + whichever handler calls it). | AGENT                       | Side-by-side comparison pasted for all four templates. Any mismatch is flagged as a bug before any CSV is sent to the client. **P5-2a does not start until this check passes for all four.**                                                                                                                          |
| P5-2a     | Generate the 4 sample CSV templates from the dev app (Items, Opening Stock, Supplier Balances, Customer Balances); owner sends them to the client                                                                                                                                                             | AGENT extracts, OWNER sends | The 4 files exist and were handed to the client (owner confirms).                                                                                                                                                                                                                                                     |
| P5-2b     | Client fills in and returns the 4 completed CSVs                                                                                                                                                                                                                                                              | OWNER / CLIENT              | Owner confirms all 4 files received back from the client. No fixed date — paces everything after it.                                                                                                                                                                                                                  |
| P5-2c     | Import Items (+ opening stock) into the **production DB on the shop PC**; review dry-run reject report with the client                                                                                                                                                                                        | OWNER (agent supports)      | Dry-run reject report pasted. Zero UNRESOLVED rejections before commit (see §5 for what "resolved" means for items specifically). Post-commit query: item count matches the client's real count; `SUM(stock_movement.quantity_milli)` per item matches the client's physical stocktake for a sample the client picks. |
| P5-2d     | Import opening customer balances and supplier balances into the production DB                                                                                                                                                                                                                                 | OWNER (agent supports)      | Dry-run reject report pasted for each. **Zero rejections, period, before either commits** (see §5). `v_party_balance` queried directly, compared line-by-line against the client's paper register opening balances for every party, not a sample.                                                                     |
| P5-2e     | Client reviews imported data on-screen and confirms it looks correct                                                                                                                                                                                                                                          | OWNER                       | Explicit client sign-off recorded in PROJECT.md/PROGRESS.md (date + who confirmed) before P5-2 is marked done.                                                                                                                                                                                                        |
| P5-3a     | Build the Urdu one-page staff cheat sheet (PDF or printable HTML)                                                                                                                                                                                                                                             | AGENT                       | Real Urdu text (not placeholder/lorem), covers the 5 required topics from the spec, fits one side of A4 when printed/rendered, owner confirms the Urdu reads correctly (agent cannot self-verify Urdu fluency).                                                                                                       |
| P5-3b     | Cheat sheet printed and placed at the counter                                                                                                                                                                                                                                                                 | OWNER                       | Owner confirms physically placed.                                                                                                                                                                                                                                                                                     |
| P5-3c     | Staff trained; staff demonstrates one full sale unaided on the real machine                                                                                                                                                                                                                                   | OWNER (agent observes)      | Owner/agent watches a staff member complete counter sale start-to-finish with zero intervention; any blocking issue found is fixed within 24h and logged; cosmetic issues logged for Phase 8 only.                                                                                                                    |
| P5-4a     | Parallel run begins — every transaction entered in the system AND the paper register, ≥2 weeks                                                                                                                                                                                                                | OWNER                       | Daily entries continue for the full window; agent has no independent way to verify this beyond the daily reconciliation in P5-4b.                                                                                                                                                                                     |
| P5-4b     | Daily reconciliation: register total vs. R1 Daily Sales report total                                                                                                                                                                                                                                          | OWNER (agent monitors)      | At least one full day's totals pasted side-by-side (register figure + R1 report figure) and shown to match exactly, before Phase 5 can be considered to have any reconciled day. Mismatches investigated same-day.                                                                                                    |
| P5-4c     | Fix any transaction-blocking bug found during the parallel run                                                                                                                                                                                                                                                | AGENT                       | Bug reproduced, fixed, `npm run verify` still green, fix confirmed against the specific scenario reported — within 24h of being reported. Cosmetic bugs logged to PROJECT.md, not fixed.                                                                                                                              |
| P5-5a     | Create a backup on the shop PC via Settings → Backup                                                                                                                                                                                                                                                          | OWNER (agent supports)      | Backup file exists at the expected path with today's date in the filename (`ShopERP_backup_YYYY-MM-DD.db`).                                                                                                                                                                                                           |
| P5-5b     | Copy backup to USB; restore on a second machine (or after uninstall)                                                                                                                                                                                                                                          | OWNER (agent supports)      | Restore completes without error; a post-restore query on the second machine returns the same row counts / a sample record matching the original.                                                                                                                                                                      |
| CF-2      | Set the real business name in Settings; confirm on a printed receipt/invoice                                                                                                                                                                                                                                  | OWNER                       | A printed (or print-preview) receipt/invoice shows the real business name, not "Shop ERP" — screenshot or physical confirmation.                                                                                                                                                                                      |

---

## 5. Exit criteria

- [ ] P5-1: App installs and launches on the shop PC without error
- [ ] P5-1: Smoke test (1 supplier + 1 purchase + 1 sale) passes on the actual shop PC, rows confirmed by direct query
- [ ] P5-1: Kill test — the 2 remaining power-cut runs complete on the shop PC, `integrity_check` = `ok` both times, closing 10/10 total across Phase 4 + Phase 5
- [ ] P5-2 (Items): zero UNRESOLVED rejections before commit. A rejection is resolved if the client explicitly decides the item will be entered manually and that decision is noted in PROJECT.md. A rejection is not resolved by committing around it silently.
- [ ] P5-2 (Opening stock / customer balances / supplier balances): ZERO rejections, period, before commit. These are structured accounting entries. Any rejection means the template or the source data is wrong and must be fixed. Do not commit any of these three imports with a single rejection outstanding.
- [ ] P5-3: Urdu cheat sheet produced, printed, and placed at the counter
- [ ] P5-3: Staff demonstrated a complete sale unaided on the real machine
- [ ] P5-4: At least one full day of parallel-run totals reconciled (register total = R1 Daily Sales report total)
- [ ] P5-5: Backup created on shop PC, restored on a second machine, data confirmed correct
- [ ] CF-2: Real business name set in Settings and confirmed on a printed document
- [ ] `npm run verify` still exits 0 (294/294 or higher) if any transaction-blocking fix was made during the parallel run

---

## 6. Binding constraints

- No new UI screen, component, IPC channel, handler, schema change, migration, or npm dependency this phase, under any circumstance.
- No repair-job work of any kind (Phase 6), even if requested mid-parallel-run — log and defer.
- Bugs found during the parallel run: fix only if it blocks a real transaction, within 24h. Everything else goes into PROJECT.md's Known Bugs / Future Feature Requests and is not touched.
- The install, real-hardware kill test, real data load, parallel run, and backup drill are owner-performed on the owner's own machine — the agent cannot execute or independently verify any of these steps in this sandbox (this sandbox cannot launch the packaged Electron app on the shop PC). The agent's role is: prepare/explain steps, review output the owner pastes back, build the cheat sheet, and fix transaction-blocking bugs fast.
- "It looks correct" is never sufficient for any exit criterion above — every box needs pasted real output (a query result, a report figure, a screenshot description with real data in it).

---

## 7. Known gaps / open questions

1. Q1–Q5, Q7 in `PROJECT.md` §5 (gas cylinder UoM, empty-cylinder deposits, wholesale pricing model, serial tracking scope, fridge warranty payer, thermal printer model) remain OPEN. None of these block P5-1 through P5-5 directly, but Q1/Q3/Q4 could affect how cleanly the client's real item list imports in P5-2 if their catalogue includes gas cylinders or wholesale-priced items — worth a quick check against the actual import file once it exists, not resolved in the abstract here.
2. No date is set for when the client will return the 4 filled-in CSV templates (P5-2b) — paces P5-2c/d/e and, transitively, P5-4's start.
